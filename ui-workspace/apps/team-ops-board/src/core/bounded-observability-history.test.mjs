import assert from "node:assert/strict";
import test from "node:test";

import {
  BOUNDED_HISTORY_APPEND_OUTCOMES,
  BOUNDED_HISTORY_DEFAULT_LIMIT,
  BOUNDED_HISTORY_MAX_LIMIT,
  BOUNDED_HISTORY_PRESENCE,
  BOUNDED_HISTORY_PRESERVED_REASON,
  BOUNDED_HISTORY_STATES,
  classifyBoundedHistory,
  planBoundedHistoryAppend,
} from "./bounded-observability-history.mjs";

const SCHEMA = "soulforge.test_bounded_history.v1";
const isEntry = (value) => value !== null
  && typeof value === "object"
  && !Array.isArray(value)
  && typeof value.observed_at === "string"
  && typeof value.code === "string";

const entry = (index) => ({ observed_at: `2026-08-1${index % 10}T00:00:00.000Z`, code: `code_${index}` });
const stored = (entries) => ({ schema_version: SCHEMA, entries });

function classify(presence, value) {
  return classifyBoundedHistory({ presence, value, schemaVersion: SCHEMA, isEntry });
}

function plan(classified, next, limit = 3) {
  return planBoundedHistoryAppend({ classified, entry: next, schemaVersion: SCHEMA, limit, isEntry });
}

test("the contract vocabulary is fixed", () => {
  assert.deepEqual([...BOUNDED_HISTORY_PRESENCE], ["missing", "present", "unreadable"]);
  assert.deepEqual([...BOUNDED_HISTORY_STATES], ["missing", "valid", "invalid"]);
  assert.deepEqual([...BOUNDED_HISTORY_APPEND_OUTCOMES], ["created", "appended", "preserved"]);
  assert.equal(BOUNDED_HISTORY_PRESERVED_REASON, "history_present_invalid");
  assert.equal(BOUNDED_HISTORY_DEFAULT_LIMIT, 50);
  assert.equal(BOUNDED_HISTORY_MAX_LIMIT, 500);
});

test("a missing history is a safe first write, distinct from a present one", () => {
  const classified = classify("missing", null);
  assert.deepEqual(classified, { state: "missing", entries: [] });
  const result = plan(classified, entry(1));
  assert.equal(result.outcome, "created");
  assert.equal(result.reason, null);
  assert.deepEqual(result.record, stored([entry(1)]));
});

test("a valid history appends and evicts newest-N", () => {
  let record = null;
  let outcomes = [];
  for (let index = 0; index < 5; index += 1) {
    const classified = record === null ? classify("missing", null) : classify("present", record);
    const result = plan(classified, entry(index));
    outcomes.push(result.outcome);
    record = result.record;
  }
  assert.deepEqual(outcomes, ["created", "appended", "appended", "appended", "appended"]);
  assert.deepEqual(Object.keys(record).sort(), ["entries", "schema_version"]);
  assert.deepEqual(record.entries.map((row) => row.code), ["code_2", "code_3", "code_4"]);
});

test("a present-but-invalid history is preserved, never filtered or restarted", () => {
  const corrupt = [
    stored([entry(1), { nope: true }, entry(2)]),
    stored([entry(1), null]),
    { schema_version: "soulforge.other.v1", entries: [entry(1)] },
    { schema_version: SCHEMA, entries: "not-an-array" },
    { schema_version: SCHEMA, entries: [entry(1)], extra: "unexpected" },
    { schema_version: SCHEMA },
    42,
    "text",
    [],
    null,
  ];
  for (const value of corrupt) {
    const classified = classify("present", value);
    assert.equal(classified.state, "invalid");
    assert.deepEqual(classified.entries, []);
    const result = plan(classified, entry(9));
    // record stays null precisely so a caller cannot write over the evidence.
    assert.deepEqual(result, { outcome: "preserved", record: null, reason: BOUNDED_HISTORY_PRESERVED_REASON });
  }
});

test("one invalid row invalidates the whole stored history rather than salvaging the rest", () => {
  const classified = classify("present", stored([entry(1), { nope: true }, entry(2)]));
  assert.equal(classified.state, "invalid");
  assert.deepEqual(classified.entries, [], "no partial row set is ever exposed");
  assert.equal(plan(classified, entry(3)).record, null);
});

test("an unreadable present file is invalid, not missing", () => {
  // Oversized, symlinked, non-regular, IO-failed, and unparsable all arrive here.
  const classified = classify("unreadable", null);
  assert.equal(classified.state, "invalid");
  assert.deepEqual(plan(classified, entry(4)), {
    outcome: "preserved",
    record: null,
    reason: BOUNDED_HISTORY_PRESERVED_REASON,
  });
});

test("a stored history longer than the current limit truncates to the newest rows on append", () => {
  const classified = classify("present", stored([entry(1), entry(2), entry(3), entry(4)]));
  assert.equal(classified.state, "valid");
  assert.deepEqual(plan(classified, entry(5), 2).record.entries.map((row) => row.code), ["code_4", "code_5"]);
});

test("limit, schema, presence, state, and entry contracts fail closed", () => {
  const valid = classify("missing", null);
  assert.throws(() => plan(valid, entry(0), 0), /bounded_history_limit_invalid/u);
  assert.throws(() => plan(valid, entry(0), BOUNDED_HISTORY_MAX_LIMIT + 1), /bounded_history_limit_invalid/u);
  assert.throws(() => plan(valid, { nope: true }), /bounded_history_entry_invalid/u);
  assert.throws(
    () => planBoundedHistoryAppend({ classified: valid, entry: entry(0), schemaVersion: "", isEntry }),
    /bounded_history_schema_invalid/u,
  );
  assert.throws(
    () => planBoundedHistoryAppend({ classified: { state: "guess" }, entry: entry(0), schemaVersion: SCHEMA, isEntry }),
    /bounded_history_state_invalid/u,
  );
  assert.throws(() => classify("maybe", null), /bounded_history_presence_invalid/u);
  assert.throws(
    () => classifyBoundedHistory({ presence: "present", value: null, schemaVersion: "" }),
    /bounded_history_schema_invalid/u,
  );
});
