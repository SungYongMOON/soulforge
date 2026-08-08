// antigravity-usage.test.mjs — Antigravity 크레딧 protobuf 디코딩·스냅샷·뷰모델 순수 계층 검증.

import test from "node:test";
import assert from "node:assert/strict";

import {
  ANTIGRAVITY_USAGE_SCHEMA_VERSION,
  ANTIGRAVITY_USAGE_STALE_THRESHOLD_MS,
  buildAntigravityUsageSnapshot,
  buildAntigravityUsageViewModel,
  decodeModelCredits,
  decodeVarint,
  isSnapshotStale,
  parseProtoFields,
} from "./antigravity-usage.mjs";

const ENCODER = new TextEncoder();
const HOUR_MS = 60 * 60 * 1000;

function varintBytes(value) {
  const bytes = [];
  let remaining = value;
  do {
    let byte = remaining % 128;
    remaining = Math.floor(remaining / 128);
    if (remaining > 0) byte |= 0x80;
    bytes.push(byte);
  } while (remaining > 0);
  return bytes;
}

function varintFieldBytes(field, value) {
  return [(field << 3) | 0, ...varintBytes(value)];
}

function lengthDelimitedBytes(field, payload) {
  return [(field << 3) | 2, ...varintBytes(payload.length), ...payload];
}

function base64FromBytes(byteList) {
  return btoa(String.fromCharCode(...byteList));
}

// inner protobuf: field 2 varint = 크레딧 정수값 → base64 문자열
function innerValueBase64(creditValue) {
  return base64FromBytes(varintFieldBytes(2, creditValue));
}

// outer map entry: field1 { field1: name, field2 { field1: inner base64 } }
function entryBytes(name, innerBase64Text) {
  const nameBytes = [...ENCODER.encode(name)];
  const innerBase64Bytes = [...ENCODER.encode(innerBase64Text)];
  const valueMessage = lengthDelimitedBytes(1, innerBase64Bytes);
  const entryPayload = [
    ...lengthDelimitedBytes(1, nameBytes),
    ...lengthDelimitedBytes(2, valueMessage),
  ];
  return lengthDelimitedBytes(1, entryPayload);
}

function modelCreditsBase64(entries) {
  return base64FromBytes(entries.flat());
}

function sampleSnapshot() {
  return {
    schema_version: ANTIGRAVITY_USAGE_SCHEMA_VERSION,
    observed_at: "2026-08-08T01:00:00.000Z",
    stale: false,
    credits: { available: 13500, minimum_per_use: 25 },
  };
}

test("decodeVarint decodes single-byte and multi-byte values", () => {
  assert.deepEqual(decodeVarint(Uint8Array.from([0x00]), 0), { value: 0, next: 1 });
  assert.deepEqual(decodeVarint(Uint8Array.from([0x7f]), 0), { value: 127, next: 1 });
  // 300 = 0b1_0010_1100 → [0xac, 0x02]
  assert.deepEqual(decodeVarint(Uint8Array.from([0xac, 0x02]), 0), { value: 300, next: 2 });
  // offset 기준 디코딩
  assert.deepEqual(decodeVarint(Uint8Array.from([0xff, 0xac, 0x02]), 1), { value: 300, next: 3 });
  // 5바이트 varint (2^32 근처)
  assert.deepEqual(
    decodeVarint(Uint8Array.from([0x80, 0x80, 0x80, 0x80, 0x10]), 0),
    { value: 2 ** 32, next: 5 },
  );
});

test("decodeVarint fails closed on malformed input", () => {
  assert.equal(decodeVarint(Uint8Array.from([0x80]), 0), null, "unterminated continuation bit");
  assert.equal(decodeVarint(Uint8Array.from([0x01]), 1), null, "offset out of range");
  assert.equal(decodeVarint(Uint8Array.from([0x01]), -1), null, "negative offset");
  assert.equal(decodeVarint(Uint8Array.from([]), 0), null, "empty bytes");
  assert.equal(decodeVarint([0x01], 0), null, "not a Uint8Array");
  const elevenByteVarint = Uint8Array.from([...Array.from({ length: 10 }, () => 0x80), 0x01]);
  assert.equal(decodeVarint(elevenByteVarint, 0), null, "varint longer than 10 bytes");
});

test("parseProtoFields walks varint and length-delimited fields", () => {
  const bytes = Uint8Array.from([
    ...varintFieldBytes(2, 300),
    ...lengthDelimitedBytes(1, [...ENCODER.encode("ab")]),
  ]);
  const fields = parseProtoFields(bytes);
  assert.equal(fields.length, 2);
  assert.equal(fields[0].field, 2);
  assert.equal(fields[0].wireType, 0);
  assert.equal(fields[0].value, 300);
  assert.equal(fields[1].field, 1);
  assert.equal(fields[1].wireType, 2);
  assert.deepEqual([...fields[1].value], [...ENCODER.encode("ab")]);
  assert.deepEqual(parseProtoFields(Uint8Array.from([])), []);
});

test("parseProtoFields skips fixed-width fields and fails closed on malformed bytes", () => {
  // fixed64(field 3) + fixed32(field 4)는 결과에 넣지 않고 건너뛴다.
  const skippable = Uint8Array.from([
    (3 << 3) | 1, 1, 2, 3, 4, 5, 6, 7, 8,
    (4 << 3) | 5, 1, 2, 3, 4,
    ...varintFieldBytes(2, 7),
  ]);
  assert.deepEqual(parseProtoFields(skippable), [{ field: 2, wireType: 0, value: 7 }]);

  assert.equal(parseProtoFields(null), null, "not a Uint8Array");
  assert.equal(parseProtoFields(Uint8Array.from([(1 << 3) | 3])), null, "group wire type");
  assert.equal(parseProtoFields(Uint8Array.from([(1 << 3) | 2, 5, 0x61])), null, "length overrun");
  assert.equal(parseProtoFields(Uint8Array.from([(1 << 3) | 0])), null, "truncated varint");
  assert.equal(parseProtoFields(Uint8Array.from([(0 << 3) | 0, 1])), null, "field number 0");
  assert.equal(parseProtoFields(Uint8Array.from([(1 << 3) | 1, 1, 2])), null, "truncated fixed64");
});

test("decodeModelCredits decodes both credit entries from nested base64 protobuf", () => {
  const base64 = modelCreditsBase64([
    entryBytes("availableCreditsSentinelKey", innerValueBase64(13500)),
    entryBytes("minimumCreditAmountForUsageKey", innerValueBase64(25)),
  ]);
  assert.deepEqual(decodeModelCredits(base64), {
    available_credits: 13500,
    minimum_credit_per_use: 25,
  });
});

test("decodeModelCredits handles zero, multi-byte varints, and unknown entries", () => {
  const base64 = modelCreditsBase64([
    entryBytes("someUnrelatedKey", innerValueBase64(999)),
    entryBytes("availableCreditsSentinelKey", innerValueBase64(0)),
  ]);
  assert.deepEqual(decodeModelCredits(base64), {
    available_credits: 0,
    minimum_credit_per_use: null,
  });

  const bigValue = modelCreditsBase64([
    entryBytes("minimumCreditAmountForUsageKey", innerValueBase64(1_048_576)),
  ]);
  assert.deepEqual(decodeModelCredits(bigValue), {
    available_credits: null,
    minimum_credit_per_use: 1_048_576,
  });
});

test("decodeModelCredits fails closed on malformed payloads", () => {
  assert.equal(decodeModelCredits(null), null, "not a string");
  assert.equal(decodeModelCredits("!!!not-base64!!!"), null, "invalid base64 characters");
  assert.equal(decodeModelCredits("AAB"), null, "invalid base64 length");
  // 유효 base64지만 protobuf로 깨진 바이트 → null
  assert.equal(decodeModelCredits(base64FromBytes([(1 << 3) | 2, 99, 0x00])), null);
  // 엔트리의 inner base64가 깨진 경우 → 해당 필드만 null로 남긴다.
  const brokenInner = modelCreditsBase64([
    entryBytes("availableCreditsSentinelKey", "%%%%"),
    entryBytes("minimumCreditAmountForUsageKey", innerValueBase64(25)),
  ]);
  assert.deepEqual(decodeModelCredits(brokenInner), {
    available_credits: null,
    minimum_credit_per_use: 25,
  });
  // inner protobuf에 field 2 varint가 없으면 값을 지어내지 않는다.
  const missingField2 = modelCreditsBase64([
    entryBytes("availableCreditsSentinelKey", base64FromBytes(varintFieldBytes(1, 5))),
  ]);
  assert.deepEqual(decodeModelCredits(missingField2), {
    available_credits: null,
    minimum_credit_per_use: null,
  });
});

test("isSnapshotStale flags snapshots older than 24h and fails closed", () => {
  const nowMs = Date.parse("2026-08-08T12:00:00.000Z");
  assert.equal(isSnapshotStale(nowMs - 23 * HOUR_MS, nowMs), false, "23h old → fresh");
  assert.equal(isSnapshotStale(nowMs - 25 * HOUR_MS, nowMs), true, "25h old → stale");
  assert.equal(isSnapshotStale(nowMs - ANTIGRAVITY_USAGE_STALE_THRESHOLD_MS, nowMs), false, "exactly 24h → fresh");
  assert.equal(isSnapshotStale(Number.NaN, nowMs), true, "NaN mtime → stale");
  assert.equal(isSnapshotStale(nowMs, Number.NaN), true, "NaN now → stale");
});

test("buildAntigravityUsageSnapshot builds observed_at and stale from db mtime", () => {
  const nowMs = Date.parse("2026-08-08T12:00:00.000Z");
  const freshMtime = nowMs - HOUR_MS;
  const snapshot = buildAntigravityUsageSnapshot({
    mtimeMs: freshMtime,
    credits: { available_credits: 13500, minimum_credit_per_use: 25 },
    nowMs,
  });
  assert.deepEqual(snapshot, {
    schema_version: ANTIGRAVITY_USAGE_SCHEMA_VERSION,
    observed_at: new Date(freshMtime).toISOString(),
    stale: false,
    credits: { available: 13500, minimum_per_use: 25 },
  });

  const staleSnapshot = buildAntigravityUsageSnapshot({
    mtimeMs: nowMs - 48 * HOUR_MS,
    credits: { available_credits: null, minimum_credit_per_use: null },
    nowMs,
  });
  assert.equal(staleSnapshot.stale, true);
  assert.deepEqual(staleSnapshot.credits, { available: null, minimum_per_use: null });

  assert.equal(buildAntigravityUsageSnapshot({ mtimeMs: Number.NaN, credits: {}, nowMs }), null);
  assert.equal(buildAntigravityUsageSnapshot({ mtimeMs: nowMs, credits: null, nowMs }), null);
  assert.equal(buildAntigravityUsageSnapshot(), null);
});

test("buildAntigravityUsageViewModel renders cells for a valid snapshot", () => {
  const viewModel = buildAntigravityUsageViewModel(sampleSnapshot());
  assert.equal(viewModel.available, true);
  assert.equal(viewModel.observedAt, "2026-08-08T01:00:00.000Z");
  assert.equal(viewModel.stale, false);
  assert.deepEqual(viewModel.cells, [
    { key: "antigravity_credits", label: "AG CREDITS", value: "13,500" },
    { key: "antigravity_min_per_use", label: "AG MIN/USE", value: "25" },
  ]);
});

test("buildAntigravityUsageViewModel passes through stale flag and omits null min cell", () => {
  const snapshot = { ...sampleSnapshot(), stale: true };
  snapshot.credits = { available: 0, minimum_per_use: null };
  const viewModel = buildAntigravityUsageViewModel(snapshot);
  assert.equal(viewModel.available, true);
  assert.equal(viewModel.stale, true);
  assert.deepEqual(viewModel.cells, [
    { key: "antigravity_credits", label: "AG CREDITS", value: "0" },
  ]);
});

test("buildAntigravityUsageViewModel fails closed on invalid snapshots", () => {
  const failClosed = { available: false, cells: [], observedAt: null, stale: false };
  assert.deepEqual(buildAntigravityUsageViewModel(null), failClosed);
  assert.deepEqual(buildAntigravityUsageViewModel(undefined), failClosed);
  assert.deepEqual(buildAntigravityUsageViewModel([]), failClosed);
  assert.deepEqual(
    buildAntigravityUsageViewModel({ ...sampleSnapshot(), schema_version: "other.v9" }),
    failClosed,
    "wrong schema version",
  );
  assert.deepEqual(
    buildAntigravityUsageViewModel({ ...sampleSnapshot(), extra: 1 }),
    failClosed,
    "unknown top-level key",
  );
  const badObservedAt = { ...sampleSnapshot(), observed_at: "not-a-date" };
  assert.deepEqual(buildAntigravityUsageViewModel(badObservedAt), failClosed);
  const badStale = { ...sampleSnapshot(), stale: "yes" };
  assert.deepEqual(buildAntigravityUsageViewModel(badStale), failClosed);
  const negativeCredits = { ...sampleSnapshot(), credits: { available: -1, minimum_per_use: 25 } };
  assert.deepEqual(buildAntigravityUsageViewModel(negativeCredits), failClosed);
  const fractionCredits = { ...sampleSnapshot(), credits: { available: 1.5, minimum_per_use: 25 } };
  assert.deepEqual(buildAntigravityUsageViewModel(fractionCredits), failClosed);
  const nullAvailable = { ...sampleSnapshot(), credits: { available: null, minimum_per_use: 25 } };
  assert.deepEqual(buildAntigravityUsageViewModel(nullAvailable), failClosed, "null available → fail closed");
  const extraCreditsKey = {
    ...sampleSnapshot(),
    credits: { available: 1, minimum_per_use: 2, bonus: 3 },
  };
  assert.deepEqual(buildAntigravityUsageViewModel(extraCreditsKey), failClosed);
});
