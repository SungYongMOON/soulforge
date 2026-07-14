import assert from "node:assert/strict";
import test from "node:test";

import {
  PROJECT_HISTORY_COVERAGE_RECEIPT_SCHEMA_VERSION,
  PROJECT_HISTORY_ENVELOPE_SCHEMA_VERSION,
  PROJECT_HISTORY_LANES,
  ProjectHistoryEnvelopeError,
  canonicalJson,
  computeMetadataDigest,
  createProjectHistoryCoverageReceipt,
  createProjectHistoryEnvelope,
  deriveOccurrenceId,
  sha256Canonical,
  sortProjectHistoryEnvelopes,
  validateProjectHistoryCoverageReceipt,
  validateProjectHistoryEnvelope,
  validateProjectHistoryEnvelopeCollection,
  validateTypedRef,
} from "./project_history_envelope.mjs";

const WINDOW_START = "2026-07-15T00:00:00.000Z";
const WINDOW_END = "2026-07-16T00:00:00.000Z";
const PROJECT = ref("project", "project:p01", "synthetic_project_registry");
const PROJECT_2 = ref("project", "project:p02", "synthetic_project_registry");
const NATIVE_TYPE_BY_LANE = Object.freeze({
  mail: "mail_message",
  voice: "voice_session",
  structured_pc_work: "structured_work_record",
  file: "file_observation",
  run_log: "run_log_entry",
});

function ref(entityType, entityId, ownerSurface = `synthetic_${entityType}_registry`) {
  return {
    entity_type: entityType,
    owner_surface: ownerSurface,
    entity_id: entityId,
  };
}

function clone(value) {
  return structuredClone(value);
}

function assertCode(fn, code) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof ProjectHistoryEnvelopeError);
    assert.equal(error.code, code);
    return true;
  });
}

function classification(projectRef) {
  return projectRef === null
    ? { state: "unclassified", project_ref: null }
    : { state: "classified", project_ref: projectRef };
}

function sourceOwner(lane) {
  return ref("source_owner", `source:${lane}`, "synthetic_source_registry");
}

function envelopeInput(lane = "mail", suffix = "001", overrides = {}) {
  const projectRef = Object.hasOwn(overrides, "project_ref") ? overrides.project_ref : PROJECT;
  return {
    lane,
    source_owner_ref: sourceOwner(lane),
    native_occurrence_ref: ref(NATIVE_TYPE_BY_LANE[lane], `native:${lane}:${suffix}`, `synthetic_${lane}`),
    event_ref: ref("event", `event:${lane}:${suffix}`, "synthetic_event_registry"),
    source_revision_ref: ref("source_revision", `revision:${lane}:${suffix}`, "synthetic_source_registry"),
    content_ref: ref("content", sha256Canonical({ lane, suffix }), "synthetic_content_registry"),
    project_ref: projectRef,
    event_at: "unknown",
    valid_at: "unknown",
    observed_at: "2026-07-15T00:05:00.000Z",
    known_at: "2026-07-15T00:04:00.000Z",
    recorded_at: "2026-07-15T00:03:00.000Z",
    classification_before: { state: "unclassified", project_ref: null },
    classification_after: classification(projectRef),
    supersedes_event_ref: null,
    ...overrides,
  };
}

function makeEnvelope(lane = "mail", suffix = "001", overrides = {}) {
  return createProjectHistoryEnvelope(envelopeInput(lane, suffix, overrides));
}

function resealEnvelope(envelope) {
  envelope.metadata_digest = computeMetadataDigest(envelope);
  return envelope;
}

function coverageInput(state, envelopes = [], overrides = {}) {
  const first = envelopes[0];
  const defaults = {
    lane: first?.lane ?? "mail",
    source_owner_ref: first?.source_owner_ref ?? sourceOwner("mail"),
    project_ref: first ? first.project_ref : PROJECT,
    window_start: WINDOW_START,
    window_end: WINDOW_END,
    state,
    gap_codes: state === "partial" || state === "failed" || state === "not_collected"
      ? ["synthetic_gap"]
      : [],
    applicability_ref: state === "not_applicable"
      ? ref("rule_revision", "rule:history-applicability:v1", "synthetic_rule_registry")
      : null,
  };
  return { ...defaults, ...overrides };
}

function makeCoverage(state, envelopes = [], overrides = {}) {
  return createProjectHistoryCoverageReceipt(coverageInput(state, envelopes, overrides), envelopes);
}

function resealCoverage(receipt) {
  receipt.metadata_digest = computeMetadataDigest(receipt);
  return receipt;
}

test("all five lanes create public-safe classified envelopes", () => {
  assert.deepEqual(PROJECT_HISTORY_LANES, ["mail", "voice", "structured_pc_work", "file", "run_log"]);
  for (const [index, lane] of PROJECT_HISTORY_LANES.entries()) {
    const envelope = makeEnvelope(lane, String(index + 1));
    assert.equal(envelope.schema_version, PROJECT_HISTORY_ENVELOPE_SCHEMA_VERSION);
    assert.equal(envelope.lane, lane);
    assert.equal(envelope.classification_before.state, "unclassified");
    assert.equal(envelope.classification_after.state, "classified");
    assert.deepEqual(envelope.classification_after.project_ref, envelope.project_ref);
    assert.equal(envelope.raw_payload_copied, false);
    assert.match(envelope.metadata_digest, /^sha256:[0-9a-f]{64}$/u);
    assert.equal(validateProjectHistoryEnvelope(envelope), envelope);
  }
});

test("all five lanes can bind complete coverage receipts", () => {
  for (const [index, lane] of PROJECT_HISTORY_LANES.entries()) {
    const envelope = makeEnvelope(lane, `coverage-${index}`);
    const receipt = makeCoverage("complete_with_events", [envelope]);
    assert.equal(receipt.lane, lane);
    assert.equal(receipt.event_count, 1);
    assert.equal(validateProjectHistoryCoverageReceipt(receipt, [envelope]), receipt);
  }

  const unclassified = makeEnvelope("mail", "coverage-unclassified", {
    project_ref: null,
    classification_after: classification(null),
  });
  const unclassifiedReceipt = makeCoverage("complete_with_events", [unclassified]);
  assert.equal(unclassifiedReceipt.project_ref, null);
  assert.equal(validateProjectHistoryCoverageReceipt(unclassifiedReceipt, [unclassified]), unclassifiedReceipt);
});

test("schema, missing fields, top-level extras, and nested extras are rejected", () => {
  const envelope = makeEnvelope();

  const badSchema = clone(envelope);
  badSchema.schema_version = "soulforge.project_history_envelope.v0";
  assertCode(() => validateProjectHistoryEnvelope(badSchema), "envelope_schema_version_invalid");

  const missing = clone(envelope);
  delete missing.valid_at;
  assertCode(() => validateProjectHistoryEnvelope(missing), "missing_field");

  const extra = clone(envelope);
  extra.payload = "synthetic";
  assertCode(() => validateProjectHistoryEnvelope(extra), "extra_field");

  const nestedExtra = clone(envelope);
  nestedExtra.event_ref.label = "synthetic";
  assertCode(() => validateProjectHistoryEnvelope(nestedExtra), "extra_field");

  const nestedMissing = clone(envelope);
  delete nestedMissing.source_owner_ref.owner_surface;
  assertCode(() => validateProjectHistoryEnvelope(nestedMissing), "missing_field");

  const classificationExtra = clone(envelope);
  classificationExtra.classification_after.confidence = 1;
  assertCode(() => validateProjectHistoryEnvelope(classificationExtra), "extra_field");
});

test("typed refs reject bare, wrong-type, unsafe, fuzzy, non-NFC, locator, and malformed content values", () => {
  assertCode(() => validateTypedRef("event:001", "event"), "plain_object_required");
  assertCode(() => validateTypedRef(ref("project", "project:p01"), "event"), "entity_type_mismatch");
  assert.equal(validateTypedRef(ref("mail_message", "mail:001"), null).entity_type, "mail_message");

  for (const unsafeId of [
    "event id",
    "event\u0001id",
    "folder/event",
    "folder\\event",
    "../event",
    ["C:", "synthetic", "event"].join("\\"),
    ["", "", "synthetic-server", "event"].join("\\"),
    "https://example.invalid/event",
    "urn:example:event",
    "event:*",
    "event:<unknown>",
    "event...maybe",
    "unknown",
    "e\u0301vent",
  ]) {
    assert.throws(() => validateTypedRef(ref("event", unsafeId), "event"), ProjectHistoryEnvelopeError);
  }

  const extra = ref("event", "event:001");
  extra.kind = "synthetic";
  assertCode(() => validateTypedRef(extra, "event"), "extra_field");
  assertCode(
    () => validateTypedRef(ref("content", `sha256:${"A".repeat(64)}`), "content"),
    "content_id_invalid",
  );
  assert.equal(validateTypedRef(ref("content", `sha256:${"a".repeat(64)}`), "content").entity_type, "content");
  assertCode(() => validateTypedRef(ref(`a${"b".repeat(64)}`, "event:001")), "safe_token_too_long");
  assertCode(() => validateTypedRef(ref("Mail_Message", "event:001")), "entity_type_invalid");
  assertCode(
    () => validateTypedRef(ref("event", "event:001", `o${"x".repeat(256)}`)),
    "safe_token_too_long",
  );
  assertCode(
    () => validateTypedRef(ref("event", `e${"x".repeat(256)}`)),
    "safe_token_too_long",
  );
});

test("canonical JSON is strict, NFC-only, recursively sorted, and compact", () => {
  assert.equal(
    canonicalJson({ z: 1, a: { y: true, b: null }, list: [3, "é"] }),
    "{\"a\":{\"b\":null,\"y\":true},\"list\":[3,\"é\"],\"z\":1}",
  );
  assert.equal(canonicalJson(Number.MAX_SAFE_INTEGER), String(Number.MAX_SAFE_INTEGER));
  assert.equal(canonicalJson({ a: 1 }).includes("\n"), false);
  const integerKeysA = { 2: "two", 10: "ten" };
  const integerKeysB = {};
  integerKeysB[10] = "ten";
  integerKeysB[2] = "two";
  assert.equal(canonicalJson(integerKeysA), '{"10":"ten","2":"two"}');
  assert.equal(canonicalJson(integerKeysA), canonicalJson(integerKeysB));

  for (const unsupported of [
    -0,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    new Date("2026-07-15T00:00:00.000Z"),
    undefined,
    1n,
    () => {},
    Symbol("synthetic"),
  ]) {
    assert.throws(() => canonicalJson(unsupported), ProjectHistoryEnvelopeError);
  }
  assertCode(() => canonicalJson("e\u0301"), "canonical_string_not_nfc");
  assertCode(() => canonicalJson("\ud800"), "canonical_string_not_well_formed");

  const surrogateKey = {};
  Object.defineProperty(surrogateKey, "\ud801", { enumerable: true, value: 1 });
  assertCode(() => canonicalJson(surrogateKey), "canonical_key_not_well_formed");

  const sparse = [];
  sparse.length = 1;
  assertCode(() => canonicalJson(sparse), "sparse_array_not_allowed");

  const accessor = {};
  Object.defineProperty(accessor, "value", { enumerable: true, get: () => 1 });
  assertCode(() => canonicalJson(accessor), "data_property_required");

  const symbolKey = { ok: true };
  symbolKey[Symbol("hidden")] = true;
  assertCode(() => canonicalJson(symbolKey), "symbol_key_not_allowed");

  const circular = {};
  circular.self = circular;
  assertCode(() => canonicalJson(circular), "canonical_cycle");
  assertCode(() => canonicalJson(Object.assign(Object.create(null), { safe: true })), "plain_object_required");

  const protoKey = JSON.parse('{"__proto__":{"x":1},"a":2}');
  assert.equal(canonicalJson(protoKey), '{"__proto__":{"x":1},"a":2}');
  assert.notEqual(canonicalJson(protoKey), canonicalJson({ a: 2 }));
  assert.notEqual(computeMetadataDigest(protoKey), computeMetadataDigest({ a: 2 }));
});

test("metadata digest excludes only the top-level metadata_digest", () => {
  const first = {
    value: 1,
    nested: { metadata_digest: "nested:a" },
    metadata_digest: "top:a",
  };
  const topChanged = { ...first, metadata_digest: "top:b" };
  const nestedChanged = { ...first, nested: { metadata_digest: "nested:b" } };
  assert.equal(computeMetadataDigest(first), computeMetadataDigest(topChanged));
  assert.notEqual(computeMetadataDigest(first), computeMetadataDigest(nestedChanged));
  assert.match(computeMetadataDigest(first), /^sha256:[0-9a-f]{64}$/u);
});

test("occurrence identity depends only on lane and native occurrence, not project", () => {
  const nativeRef = ref("event", "native:mail:project-independent", "synthetic_mail");
  const first = makeEnvelope("mail", "project-a", {
    native_occurrence_ref: nativeRef,
    project_ref: PROJECT,
    classification_after: classification(PROJECT),
  });
  const second = makeEnvelope("mail", "project-b", {
    native_occurrence_ref: clone(nativeRef),
    project_ref: PROJECT_2,
    classification_after: classification(PROJECT_2),
  });
  assert.equal(first.occurrence_id, second.occurrence_id);
  assert.equal(first.occurrence_id, deriveOccurrenceId("mail", nativeRef));
  assert.notEqual(first.metadata_digest, second.metadata_digest);
  assert.notEqual(deriveOccurrenceId("voice", nativeRef), first.occurrence_id);

  const forged = clone(first);
  forged.occurrence_id = `ph-occ:${"0".repeat(64)}`;
  forged.metadata_digest = computeMetadataDigest(forged);
  assertCode(() => validateProjectHistoryEnvelope(forged), "occurrence_id_mismatch");
});

test("clock contract accepts nullable observed_at, unknown only where allowed, and only the universal ordering", () => {
  const nonUniversalOrder = makeEnvelope("mail", "clock-flex", {
    event_at: "2099-01-01T00:00:00.000Z",
    valid_at: "2000-01-01T00:00:00.000Z",
    observed_at: "2098-01-01T00:00:00.000Z",
    recorded_at: "2026-07-15T00:04:00.000Z",
    known_at: "2026-07-15T00:04:00.000Z",
  });
  assert.equal(validateProjectHistoryEnvelope(nonUniversalOrder), nonUniversalOrder);

  const unobserved = makeEnvelope("mail", "clock-unobserved", { observed_at: null });
  assert.equal(unobserved.observed_at, null);
  assert.equal(validateProjectHistoryEnvelope(unobserved), unobserved);

  const recordedLate = clone(nonUniversalOrder);
  recordedLate.recorded_at = "2026-07-15T00:04:00.001Z";
  resealEnvelope(recordedLate);
  assertCode(() => validateProjectHistoryEnvelope(recordedLate), "recorded_after_known");

  for (const field of ["observed_at", "known_at", "recorded_at"]) {
    const bad = clone(nonUniversalOrder);
    bad[field] = "unknown";
    resealEnvelope(bad);
    assertCode(() => validateProjectHistoryEnvelope(bad), "timestamp_not_canonical_utc");
  }

  for (const field of ["event_at", "valid_at", "known_at", "recorded_at"]) {
    const bad = clone(nonUniversalOrder);
    bad[field] = null;
    resealEnvelope(bad);
    assertCode(() => validateProjectHistoryEnvelope(bad), "timestamp_not_canonical_utc");
  }

  const noMilliseconds = clone(nonUniversalOrder);
  noMilliseconds.event_at = "2026-07-15T00:00:00Z";
  resealEnvelope(noMilliseconds);
  assertCode(() => validateProjectHistoryEnvelope(noMilliseconds), "timestamp_not_canonical_utc");
});

test("classification is valid for every lane and after must equal top-level project", () => {
  for (const [index, lane] of PROJECT_HISTORY_LANES.entries()) {
    const unclassified = makeEnvelope(lane, `unclassified-${index}`, {
      project_ref: null,
      classification_before: classification(PROJECT),
      classification_after: classification(null),
    });
    assert.equal(unclassified.project_ref, null);
    assert.equal(unclassified.classification_after.state, "unclassified");
  }

  const mismatch = clone(makeEnvelope());
  mismatch.classification_after = classification(PROJECT_2);
  resealEnvelope(mismatch);
  assertCode(() => validateProjectHistoryEnvelope(mismatch), "classification_after_project_mismatch");

  const malformed = clone(makeEnvelope());
  malformed.classification_before = { state: "unclassified", project_ref: PROJECT };
  resealEnvelope(malformed);
  assertCode(() => validateProjectHistoryEnvelope(malformed), "unclassified_project_must_be_null");
});

test("source revision and content refs are an all-or-null pair", () => {
  const withPair = makeEnvelope();
  assert.ok(withPair.source_revision_ref);
  assert.ok(withPair.content_ref);

  const withoutPair = makeEnvelope("mail", "no-source", {
    source_revision_ref: null,
    content_ref: null,
  });
  assert.equal(withoutPair.source_revision_ref, null);
  assert.equal(withoutPair.content_ref, null);

  assertCode(
    () => makeEnvelope("mail", "revision-only", { content_ref: null }),
    "revision_content_pair_required",
  );
  assertCode(
    () => makeEnvelope("mail", "content-only", { source_revision_ref: null }),
    "revision_content_pair_required",
  );
});

test("same-occurrence append-only chains are allowed while self, cross-occurrence, cycles, and duplicate event refs reject", () => {
  const selfRef = ref("event", "event:mail:self", "synthetic_event_registry");
  assertCode(
    () => makeEnvelope("mail", "self", { event_ref: selfRef, supersedes_event_ref: clone(selfRef) }),
    "event_self_supersede",
  );

  const eventA = ref("event", "event:mail:cycle-a", "synthetic_event_registry");
  const eventB = ref("event", "event:mail:cycle-b", "synthetic_event_registry");
  const cycleNative = ref("mail_message", "native:mail:cycle", "synthetic_mail");
  const cycleA = makeEnvelope("mail", "cycle-a", {
    native_occurrence_ref: cycleNative,
    event_ref: eventA,
    project_ref: null,
    classification_before: null,
    classification_after: null,
    supersedes_event_ref: eventB,
  });
  const cycleB = makeEnvelope("mail", "cycle-b", {
    native_occurrence_ref: clone(cycleNative),
    event_ref: eventB,
    project_ref: null,
    classification_before: null,
    classification_after: null,
    supersedes_event_ref: eventA,
  });
  assertCode(() => validateProjectHistoryEnvelopeCollection([cycleA, cycleB]), "supersession_cycle");

  const first = makeEnvelope("mail", "same-occurrence-a");
  const reclassified = makeEnvelope("mail", "same-occurrence-b", {
    native_occurrence_ref: clone(first.native_occurrence_ref),
    project_ref: PROJECT_2,
    classification_before: classification(PROJECT),
    classification_after: classification(PROJECT_2),
    supersedes_event_ref: clone(first.event_ref),
  });
  assert.equal(first.occurrence_id, reclassified.occurrence_id);
  assert.equal(validateProjectHistoryEnvelopeCollection([first, reclassified]).length, 2);

  const mismatchedClassification = makeEnvelope("mail", "mismatched-classification", {
    native_occurrence_ref: clone(first.native_occurrence_ref),
    project_ref: PROJECT_2,
    classification_before: classification(PROJECT_2),
    classification_after: classification(PROJECT_2),
    supersedes_event_ref: clone(first.event_ref),
  });
  assertCode(
    () => validateProjectHistoryEnvelopeCollection([first, mismatchedClassification]),
    "classification_supersession_mismatch",
  );

  const missingBeforeClassification = makeEnvelope("mail", "missing-before-classification", {
    native_occurrence_ref: clone(first.native_occurrence_ref),
    project_ref: PROJECT_2,
    classification_before: null,
    classification_after: classification(PROJECT_2),
    supersedes_event_ref: clone(first.event_ref),
  });
  assertCode(
    () => validateProjectHistoryEnvelopeCollection([first, missingBeforeClassification]),
    "classification_supersession_mismatch",
  );

  const crossOccurrence = makeEnvelope("mail", "cross-occurrence", {
    supersedes_event_ref: clone(first.event_ref),
  });
  assertCode(
    () => validateProjectHistoryEnvelopeCollection([first, crossOccurrence]),
    "supersession_occurrence_mismatch",
  );

  const duplicateEvent = makeEnvelope("mail", "different-native", { event_ref: clone(first.event_ref) });
  assertCode(() => validateProjectHistoryEnvelopeCollection([first, duplicateEvent]), "duplicate_event_ref");

  const externalTarget = makeEnvelope("mail", "external-target", {
    supersedes_event_ref: ref("event", "event:mail:outside-window", "synthetic_event_registry"),
  });
  assert.equal(validateProjectHistoryEnvelopeCollection([externalTarget]).length, 1);
});

test("sort order is deterministic, non-mutating, lane-ranked, and null-project-first", () => {
  const common = {
    known_at: "2026-07-15T12:00:00.000Z",
    recorded_at: "2026-07-15T11:00:00.000Z",
  };
  const byLane = PROJECT_HISTORY_LANES.map((lane, index) => makeEnvelope(lane, `sort-${index}`, common));
  const mailProject = makeEnvelope("mail", "sort-project", common);
  const mailNull = makeEnvelope("mail", "sort-null", {
    ...common,
    project_ref: null,
    classification_after: classification(null),
  });
  const earlierRecorded = makeEnvelope("run_log", "sort-recorded", {
    ...common,
    recorded_at: "2026-07-15T10:00:00.000Z",
  });
  const earlierKnown = makeEnvelope("run_log", "sort-known", {
    ...common,
    known_at: "2026-07-15T11:59:59.999Z",
  });

  const input = [byLane[4], mailProject, byLane[2], earlierRecorded, mailNull, byLane[1], earlierKnown, byLane[3]];
  const snapshot = [...input];
  const sorted = sortProjectHistoryEnvelopes(input);
  assert.deepEqual(input, snapshot);
  assert.equal(sorted[0].event_ref.entity_id, earlierKnown.event_ref.entity_id);
  assert.equal(sorted[1].event_ref.entity_id, earlierRecorded.event_ref.entity_id);

  const tied = sorted.slice(2);
  const laneSequence = tied.map((event) => event.lane);
  assert.deepEqual(laneSequence, ["mail", "mail", "voice", "structured_pc_work", "file", "run_log"]);
  assert.equal(tied[0].project_ref, null);
  assert.deepEqual(sortProjectHistoryEnvelopes([...input].reverse()), sorted);
});

test("all six coverage states implement the exact count/gap/applicability matrix", () => {
  const event = makeEnvelope("mail", "coverage-matrix");
  const complete = makeCoverage("complete_with_events", [event]);
  const empty = makeCoverage("complete_no_events");
  const partial = makeCoverage("partial", [event], { gap_codes: ["z_gap", "a_gap"] });
  const partialZero = makeCoverage("partial");
  const failed = makeCoverage("failed");
  const notCollected = makeCoverage("not_collected");
  const notApplicable = makeCoverage("not_applicable");

  assert.equal(complete.event_count, 1);
  assert.equal(empty.event_count, 0);
  assert.equal(partial.event_count, 1);
  assert.deepEqual(partial.gap_codes, ["a_gap", "z_gap"]);
  assert.equal(partialZero.event_count, 0);
  assert.equal(failed.event_count, null);
  assert.equal(notCollected.event_count, null);
  assert.equal(notApplicable.event_count, null);
  assert.equal(notApplicable.applicability_ref.entity_type, "rule_revision");
  assert.equal(complete.applicability_ref, null);

  validateProjectHistoryCoverageReceipt(complete, [event]);
  for (const receipt of [empty, partialZero, failed, notCollected, notApplicable]) {
    validateProjectHistoryCoverageReceipt(receipt, []);
  }
  validateProjectHistoryCoverageReceipt(partial, [event]);
});

test("invalid coverage matrix combinations and noncanonical gaps are rejected", () => {
  const event = makeEnvelope("mail", "coverage-invalid");

  const cases = [
    [makeCoverage("complete_with_events", [event]), (value) => { value.gap_codes = ["gap"]; }],
    [makeCoverage("complete_no_events"), (value) => { value.event_count = 1; }],
    [makeCoverage("partial", [event]), (value) => { value.gap_codes = []; }],
    [makeCoverage("partial", [event]), (value) => { value.event_count = null; }],
    [makeCoverage("failed"), (value) => { value.event_count = 0; }],
    [makeCoverage("failed"), (value) => { value.gap_codes = []; }],
    [makeCoverage("not_collected"), (value) => { value.gap_codes = []; }],
    [makeCoverage("not_applicable"), (value) => { value.applicability_ref = null; }],
    [makeCoverage("not_applicable"), (value) => { value.gap_codes = ["gap"]; }],
    [makeCoverage("complete_no_events"), (value) => {
      value.applicability_ref = ref("rule_revision", "rule:unexpected", "synthetic_rule_registry");
    }],
  ];
  for (const [receipt, mutate] of cases) {
    const invalid = clone(receipt);
    mutate(invalid);
    resealCoverage(invalid);
    assertCode(() => validateProjectHistoryCoverageReceipt(invalid, invalid.event_count === 1 ? [event] : []), "coverage_matrix_invalid");
  }

  assertCode(
    () => makeCoverage("partial", [], { gap_codes: ["same_gap", "same_gap"] }),
    "duplicate_gap_code",
  );
  assertCode(
    () => makeCoverage("partial", [], { gap_codes: ["Uppercase_gap"] }),
    "gap_code_invalid",
  );
  assertCode(
    () => makeCoverage("partial", [], { gap_codes: [`g${"x".repeat(128)}`] }),
    "gap_code_invalid",
  );
  const unsorted = clone(makeCoverage("partial", [], { gap_codes: ["a_gap", "z_gap"] }));
  unsorted.gap_codes = ["z_gap", "a_gap"];
  resealCoverage(unsorted);
  assertCode(() => validateProjectHistoryCoverageReceipt(unsorted, []), "gap_codes_not_canonical_order");
});

test("coverage binding enforces exact scope, count, half-open known_at window, and digest", () => {
  const event = makeEnvelope("mail", "binding");
  const receipt = makeCoverage("complete_with_events", [event]);

  const wrongLane = makeEnvelope("voice", "binding-lane");
  assertCode(
    () => createProjectHistoryCoverageReceipt(coverageInput("complete_with_events", [event]), [wrongLane]),
    "coverage_lane_mismatch",
  );

  const wrongOwner = makeEnvelope("mail", "binding-owner", {
    source_owner_ref: ref("source_owner", "source:other", "synthetic_source_registry"),
  });
  assertCode(
    () => createProjectHistoryCoverageReceipt(coverageInput("complete_with_events", [event]), [wrongOwner]),
    "coverage_source_owner_mismatch",
  );

  const wrongProject = makeEnvelope("mail", "binding-project", {
    project_ref: PROJECT_2,
    classification_after: classification(PROJECT_2),
  });
  assertCode(
    () => createProjectHistoryCoverageReceipt(coverageInput("complete_with_events", [event]), [wrongProject]),
    "coverage_project_mismatch",
  );

  const atStart = makeEnvelope("mail", "at-start", {
    recorded_at: WINDOW_START,
    known_at: WINDOW_START,
  });
  assert.equal(makeCoverage("complete_with_events", [atStart]).event_count, 1);

  const atEnd = makeEnvelope("mail", "at-end", {
    recorded_at: "2026-07-15T23:59:59.999Z",
    known_at: WINDOW_END,
  });
  assertCode(() => makeCoverage("complete_with_events", [atEnd]), "coverage_known_at_outside_window");

  const countMismatch = clone(receipt);
  countMismatch.event_count = 2;
  resealCoverage(countMismatch);
  assertCode(() => validateProjectHistoryCoverageReceipt(countMismatch, [event]), "coverage_event_count_mismatch");

  const digestMismatch = clone(receipt);
  digestMismatch.ordered_event_digest = `sha256:${"f".repeat(64)}`;
  resealCoverage(digestMismatch);
  assertCode(() => validateProjectHistoryCoverageReceipt(digestMismatch, [event]), "ordered_event_digest_mismatch");

  const duplicate = makeCoverage("complete_with_events", [event]);
  assert.throws(() => validateProjectHistoryCoverageReceipt(duplicate, [event, event]), ProjectHistoryEnvelopeError);
});

test("coverage windows require canonical UTC and start before end", () => {
  assertCode(
    () => makeCoverage("complete_no_events", [], { window_start: WINDOW_END, window_end: WINDOW_START }),
    "coverage_window_invalid",
  );
  assertCode(
    () => makeCoverage("complete_no_events", [], { window_start: WINDOW_START, window_end: WINDOW_START }),
    "coverage_window_invalid",
  );
  assertCode(
    () => makeCoverage("complete_no_events", [], { window_start: "2026-07-15T00:00:00Z" }),
    "timestamp_not_canonical_utc",
  );
});

test("zero/null-event receipts never accept envelopes and use the empty ordered digest", () => {
  const event = makeEnvelope("mail", "zero-event");
  const receipts = [
    makeCoverage("complete_no_events"),
    makeCoverage("partial"),
    makeCoverage("failed"),
    makeCoverage("not_collected"),
    makeCoverage("not_applicable"),
  ];
  const emptyDigest = sha256Canonical([]);
  for (const receipt of receipts) {
    assert.equal(receipt.ordered_event_digest, emptyDigest);
  }
  for (const receipt of receipts) {
    assert.throws(() => validateProjectHistoryCoverageReceipt(receipt, [event]), ProjectHistoryEnvelopeError);
  }
  assert.equal(receipts[0].event_count, 0);
  assert.equal(receipts[0].raw_payload_copied, false);
});

test("deterministic creation, replay, sorting, and ordered event digest are stable", () => {
  const input = envelopeInput("mail", "replay");
  const first = createProjectHistoryEnvelope(clone(input));
  const second = createProjectHistoryEnvelope(clone(input));
  assert.deepEqual(first, second);

  const later = makeEnvelope("mail", "replay-later", {
    recorded_at: "2026-07-15T00:06:00.000Z",
    known_at: "2026-07-15T00:07:00.000Z",
  });
  const receiptA = makeCoverage("partial", [later, first], { gap_codes: ["z_gap", "a_gap"] });
  const receiptB = makeCoverage("partial", [first, later], { gap_codes: ["a_gap", "z_gap"] });
  assert.deepEqual(receiptA, receiptB);

  const sorted = sortProjectHistoryEnvelopes([later, first]);
  assert.equal(
    receiptA.ordered_event_digest,
    sha256Canonical(sorted.map((envelope) => envelope.metadata_digest)),
  );

  const replay = createProjectHistoryCoverageReceipt(
    {
      ...coverageInput("partial", [first, later], { gap_codes: ["a_gap", "z_gap"] }),
      schema_version: receiptA.schema_version,
      event_count: receiptA.event_count,
      ordered_event_digest: receiptA.ordered_event_digest,
      metadata_digest: receiptA.metadata_digest,
      raw_payload_copied: false,
    },
    [later, first],
  );
  assert.deepEqual(replay, receiptA);
  assert.equal(replay.schema_version, PROJECT_HISTORY_COVERAGE_RECEIPT_SCHEMA_VERSION);
});

test("raw-like payload fields are unknown and the false sentinel is mandatory", () => {
  const rawLikeFields = [
    "raw",
    "subject",
    "body",
    "audio",
    "transcript",
    "file",
    "log",
    "conversation",
    "screen",
    "keystroke",
    "secret",
  ];
  const envelope = makeEnvelope("mail", "raw-reject");
  const receipt = makeCoverage("complete_with_events", [envelope]);

  for (const field of rawLikeFields) {
    const envelopeWithPayload = clone(envelope);
    envelopeWithPayload[field] = "synthetic-only";
    assertCode(() => validateProjectHistoryEnvelope(envelopeWithPayload), "extra_field");

    const receiptWithPayload = clone(receipt);
    receiptWithPayload[field] = "synthetic-only";
    assertCode(() => validateProjectHistoryCoverageReceipt(receiptWithPayload, [envelope]), "extra_field");
  }

  for (const sentinel of [true, null, 0, "false"]) {
    const badEnvelope = clone(envelope);
    badEnvelope.raw_payload_copied = sentinel;
    resealEnvelope(badEnvelope);
    assertCode(() => validateProjectHistoryEnvelope(badEnvelope), "raw_payload_copied_must_be_false");

    const badReceipt = clone(receipt);
    badReceipt.raw_payload_copied = sentinel;
    resealCoverage(badReceipt);
    assertCode(
      () => validateProjectHistoryCoverageReceipt(badReceipt, [envelope]),
      "raw_payload_copied_must_be_false",
    );
  }
});

test("coverage receipt exact fields and applicability ref type are enforced", () => {
  const receipt = makeCoverage("complete_no_events");
  const badSchema = clone(receipt);
  badSchema.schema_version = "soulforge.project_history_coverage_receipt.v0";
  assertCode(() => validateProjectHistoryCoverageReceipt(badSchema, []), "coverage_schema_version_invalid");

  const missing = clone(receipt);
  delete missing.window_end;
  assertCode(() => validateProjectHistoryCoverageReceipt(missing, []), "missing_field");

  const extraNested = clone(receipt);
  extraNested.source_owner_ref.display = "synthetic";
  assertCode(() => validateProjectHistoryCoverageReceipt(extraNested, []), "extra_field");

  const wrongApplicability = clone(makeCoverage("not_applicable"));
  wrongApplicability.applicability_ref = ref("event", "event:not-applicable-rule", "synthetic_event_registry");
  resealCoverage(wrongApplicability);
  assertCode(
    () => validateProjectHistoryCoverageReceipt(wrongApplicability, []),
    "entity_type_mismatch",
  );
});
