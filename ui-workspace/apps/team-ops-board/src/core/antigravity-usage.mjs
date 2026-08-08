// antigravity-usage.mjs — Antigravity IDE 잔여 크레딧 protobuf 디코딩과 Board 셀 뷰모델을
// 담당하는 순수 정규화 계층. fs·sqlite 비종속(node:test 검증 대상), 실패 시 fail-closed.

export const ANTIGRAVITY_USAGE_SCHEMA_VERSION = "soulforge.team_ops_board_antigravity_usage.v1";
export const ANTIGRAVITY_USAGE_STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

const AVAILABLE_CREDITS_ENTRY_NAME = "availableCreditsSentinelKey";
const MINIMUM_CREDIT_ENTRY_NAME = "minimumCreditAmountForUsageKey";

const WIRE_TYPE_VARINT = 0;
const WIRE_TYPE_FIXED64 = 1;
const WIRE_TYPE_LENGTH_DELIMITED = 2;
const WIRE_TYPE_FIXED32 = 5;
const MAX_VARINT_BYTES = 10;

const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/u;
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

const SNAPSHOT_ALLOWED_KEYS = new Set(["schema_version", "observed_at", "stale", "credits"]);
const CREDITS_ALLOWED_KEYS = new Set(["available", "minimum_per_use"]);

function isByteArray(value) {
  return value instanceof Uint8Array;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value, allowedKeys) {
  if (!isPlainObject(value)) return false;
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function isCreditAmount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function decodeVarint(bytes, offset) {
  if (!isByteArray(bytes) || !Number.isInteger(offset) || offset < 0 || offset >= bytes.length) {
    return null;
  }
  let value = 0;
  let factor = 1;
  for (let i = 0; i < MAX_VARINT_BYTES; i += 1) {
    const index = offset + i;
    if (index >= bytes.length) return null;
    const byte = bytes[index];
    value += (byte & 0x7f) * factor;
    if ((byte & 0x80) === 0) {
      if (!Number.isSafeInteger(value)) return null;
      return { value, next: index + 1 };
    }
    factor *= 128;
  }
  return null;
}

export function parseProtoFields(bytes) {
  if (!isByteArray(bytes)) return null;
  const fields = [];
  let offset = 0;
  while (offset < bytes.length) {
    const tag = decodeVarint(bytes, offset);
    if (tag === null) return null;
    const field = Math.floor(tag.value / 8);
    const wireType = tag.value % 8;
    if (field === 0) return null;
    offset = tag.next;
    if (wireType === WIRE_TYPE_VARINT) {
      const varint = decodeVarint(bytes, offset);
      if (varint === null) return null;
      fields.push({ field, wireType, value: varint.value });
      offset = varint.next;
    } else if (wireType === WIRE_TYPE_LENGTH_DELIMITED) {
      const length = decodeVarint(bytes, offset);
      if (length === null) return null;
      const end = length.next + length.value;
      if (end > bytes.length) return null;
      fields.push({ field, wireType, value: bytes.subarray(length.next, end) });
      offset = end;
    } else if (wireType === WIRE_TYPE_FIXED64 || wireType === WIRE_TYPE_FIXED32) {
      // 관심 없는 고정 길이 필드는 안전하게 건너뛴다.
      const skip = wireType === WIRE_TYPE_FIXED64 ? 8 : 4;
      if (offset + skip > bytes.length) return null;
      offset += skip;
    } else {
      return null;
    }
  }
  return fields;
}

function decodeBase64(text) {
  if (typeof text !== "string" || text.length % 4 !== 0 || !BASE64_PATTERN.test(text)) {
    return null;
  }
  let binary;
  try {
    binary = atob(text);
  } catch {
    return null;
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeUtf8(bytes) {
  try {
    return UTF8_DECODER.decode(bytes);
  } catch {
    return null;
  }
}

function findField(fields, field, wireType) {
  const match = fields.find((entry) => entry.field === field && entry.wireType === wireType);
  return match === undefined ? null : match;
}

function decodeEntryCreditValue(valueMessageBytes) {
  const valueFields = parseProtoFields(valueMessageBytes);
  if (valueFields === null) return null;
  const innerBase64Field = findField(valueFields, 1, WIRE_TYPE_LENGTH_DELIMITED);
  if (innerBase64Field === null) return null;
  const innerBase64 = decodeUtf8(innerBase64Field.value);
  if (innerBase64 === null) return null;
  const innerBytes = decodeBase64(innerBase64);
  if (innerBytes === null) return null;
  const innerFields = parseProtoFields(innerBytes);
  if (innerFields === null) return null;
  const creditField = findField(innerFields, 2, WIRE_TYPE_VARINT);
  if (creditField === null || !isCreditAmount(creditField.value)) return null;
  return creditField.value;
}

export function decodeModelCredits(base64String) {
  const outerBytes = decodeBase64(base64String);
  if (outerBytes === null) return null;
  const outerFields = parseProtoFields(outerBytes);
  if (outerFields === null) return null;
  const result = { available_credits: null, minimum_credit_per_use: null };
  for (const entry of outerFields) {
    if (entry.field !== 1 || entry.wireType !== WIRE_TYPE_LENGTH_DELIMITED) continue;
    const entryFields = parseProtoFields(entry.value);
    if (entryFields === null) continue;
    const nameField = findField(entryFields, 1, WIRE_TYPE_LENGTH_DELIMITED);
    const valueField = findField(entryFields, 2, WIRE_TYPE_LENGTH_DELIMITED);
    if (nameField === null || valueField === null) continue;
    const name = decodeUtf8(nameField.value);
    if (name !== AVAILABLE_CREDITS_ENTRY_NAME && name !== MINIMUM_CREDIT_ENTRY_NAME) continue;
    const creditValue = decodeEntryCreditValue(valueField.value);
    if (creditValue === null) continue;
    if (name === AVAILABLE_CREDITS_ENTRY_NAME) result.available_credits = creditValue;
    else result.minimum_credit_per_use = creditValue;
  }
  return result;
}

export function isSnapshotStale(observedAtMs, nowMs) {
  if (!Number.isFinite(observedAtMs) || !Number.isFinite(nowMs)) return true;
  return nowMs - observedAtMs > ANTIGRAVITY_USAGE_STALE_THRESHOLD_MS;
}

export function buildAntigravityUsageSnapshot({ mtimeMs, credits, nowMs } = {}) {
  if (!Number.isFinite(mtimeMs) || mtimeMs < 0 || !Number.isFinite(nowMs) || !isPlainObject(credits)) {
    return null;
  }
  return {
    schema_version: ANTIGRAVITY_USAGE_SCHEMA_VERSION,
    observed_at: new Date(mtimeMs).toISOString(),
    stale: isSnapshotStale(mtimeMs, nowMs),
    credits: {
      available: isCreditAmount(credits.available_credits) ? credits.available_credits : null,
      minimum_per_use: isCreditAmount(credits.minimum_credit_per_use)
        ? credits.minimum_credit_per_use
        : null,
    },
  };
}

function isValidSnapshot(snapshot) {
  return hasOnlyKeys(snapshot, SNAPSHOT_ALLOWED_KEYS)
    && snapshot.schema_version === ANTIGRAVITY_USAGE_SCHEMA_VERSION
    && typeof snapshot.observed_at === "string"
    && !Number.isNaN(Date.parse(snapshot.observed_at))
    && typeof snapshot.stale === "boolean"
    && hasOnlyKeys(snapshot.credits, CREDITS_ALLOWED_KEYS)
    && (snapshot.credits.available === null || isCreditAmount(snapshot.credits.available))
    && (snapshot.credits.minimum_per_use === null || isCreditAmount(snapshot.credits.minimum_per_use));
}

function formatCreditAmount(value) {
  return value.toLocaleString("en-US");
}

export function buildAntigravityUsageViewModel(snapshot) {
  if (!isValidSnapshot(snapshot) || snapshot.credits.available === null) {
    return { available: false, cells: [], observedAt: null, stale: false };
  }
  const cells = [
    {
      key: "antigravity_credits",
      label: "AG CREDITS",
      value: formatCreditAmount(snapshot.credits.available),
    },
  ];
  if (snapshot.credits.minimum_per_use !== null) {
    cells.push({
      key: "antigravity_min_per_use",
      label: "AG MIN/USE",
      value: formatCreditAmount(snapshot.credits.minimum_per_use),
    });
  }
  return {
    available: true,
    cells,
    observedAt: snapshot.observed_at,
    stale: snapshot.stale,
  };
}
