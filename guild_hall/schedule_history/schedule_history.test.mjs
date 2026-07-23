import assert from "node:assert/strict";
import test from "node:test";

import {
  ScheduleHistoryError,
  SCHEDULE_HISTORY_COVERAGE_STATES,
  appendScheduleRevision,
  createScheduleCoverageReceipt,
  createScheduleRevision,
  createScheduleSourceBinding,
  deriveScopedScheduleRowRef,
  validateScheduleAppendReceipt,
  validateScheduleCoverageReceipt,
  validateScheduleRevision,
  validateScheduleRevisionCollection,
  validateScheduleSourceBinding,
} from "./schedule_history.mjs";
import {
  ProjectHistoryEnvelopeError,
  computeMetadataDigest,
  sha256Canonical,
} from "../shared/project_history_envelope.mjs";

function ref(entityType, entityId, ownerSurface) {
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
    assert.ok(
      error instanceof ScheduleHistoryError
      || error instanceof ProjectHistoryEnvelopeError,
    );
    assert.equal(error.code, code);
    return true;
  });
}

const OWNER = "synthetic_schedule_authority";
const PROJECT = ref("project", "project:p01", "synthetic_project_registry");
const ADAPTER_REVISION = ref(
  "adapter_revision",
  "schedule-history-adapter:v1",
  "schedule_history",
);

function bindingInput(overrides = {}) {
  return {
    schedule_owner_ref: ref("source_owner", "owner:engineering-schedule", OWNER),
    schedule_ref: ref("schedule", "schedule:alpha", OWNER),
    writer_ref: ref(
      "schedule_writer",
      "writer:single-authority",
      "synthetic_schedule_writer",
    ),
    project_ref: PROJECT,
    adapter_revision_ref: ADAPTER_REVISION,
    source_mode: "synthetic_only",
    activation: false,
    live_authority: false,
    ...overrides,
  };
}

function binding(overrides = {}) {
  return createScheduleSourceBinding(bindingInput(overrides));
}

function rowRef(id = "row-id:001") {
  return ref("schedule_source_row", id, OWNER);
}

function revisionInput(sourceBinding, suffix = "1", overrides = {}) {
  return {
    source_binding_ref: sourceBinding.binding_ref,
    source_row_ref: rowRef(),
    revision_ref: ref("source_revision", `revision:${suffix}`, OWNER),
    event_ref: ref("event", `event:${suffix}`, OWNER),
    previous_revision_ref: null,
    supersedes_event_ref: null,
    expected_current_revision_ref: null,
    canonical_record_ref: ref(
      "content",
      sha256Canonical({ synthetic_due_day: Number(suffix) }),
      OWNER,
    ),
    source_sequence: Number(suffix),
    observed_at: `2026-07-23T00:0${suffix}:00.000Z`,
    known_at: `2026-07-23T00:0${suffix}:00.000Z`,
    recorded_at: `2026-07-23T00:0${suffix}:00.000Z`,
    ...overrides,
  };
}

function revision(sourceBinding, suffix = "1", overrides = {}) {
  return createScheduleRevision(revisionInput(sourceBinding, suffix, overrides), sourceBinding);
}

function linkedRevision(sourceBinding, previous, suffix = "2", overrides = {}) {
  return revision(sourceBinding, suffix, {
    previous_revision_ref: previous.revision_ref,
    supersedes_event_ref: previous.event_ref,
    expected_current_revision_ref: previous.revision_ref,
    ...overrides,
  });
}

function coverageInput(sourceBinding, state, overrides = {}) {
  return {
    source_binding_ref: sourceBinding.binding_ref,
    window_start: "2026-07-23T00:00:00.000Z",
    window_end: "2026-07-24T00:00:00.000Z",
    state,
    gap_codes:
      state === "partial" || state === "failed" || state === "not_collected"
        ? ["synthetic_revision_gap"]
        : [],
    applicability_ref:
      state === "not_applicable"
        ? ref(
          "rule_revision",
          "rule:schedule-applicability:v1",
          "synthetic_schedule_policy",
        )
        : null,
    ...overrides,
  };
}

function resealBinding(value) {
  value.metadata_digest = computeMetadataDigest(value);
  return value;
}

function resealRevision(value) {
  const projection = { ...value };
  delete projection.record_digest;
  value.record_digest = sha256Canonical(projection);
  return value;
}

function resealCoverage(value) {
  value.metadata_digest = computeMetadataDigest(value);
  return value;
}

function resealAppendReceipt(value) {
  value.metadata_digest = computeMetadataDigest(value);
  return value;
}

test("explicit binding is synthetic-only, feature-OFF, and digest sealed", () => {
  const value = binding();
  assert.equal(value.source_mode, "synthetic_only");
  assert.equal(value.activation, false);
  assert.equal(value.live_authority, false);
  assert.equal(value.raw_payload_copied, false);
  assert.match(value.binding_ref.entity_id, /^schedule-binding:[0-9a-f]{64}$/u);
  assert.equal(validateScheduleSourceBinding(value), value);
});

test("missing, unknown, unresolved, live, provider, and activation bindings fail closed", () => {
  const missing = bindingInput();
  delete missing.writer_ref;
  assertCode(() => createScheduleSourceBinding(missing), "missing_field");

  assertCode(
    () => createScheduleSourceBinding({ ...bindingInput(), current_path: "schedule.csv" }),
    "extra_field",
  );
  assertCode(
    () => binding({
      schedule_owner_ref: ref("source_owner", "TBD", OWNER),
    }),
    "fuzzy_token",
  );
  assertCode(
    () => binding({
      schedule_owner_ref: ref(
        "source_owner",
        "owner:engineering-schedule",
        "synthetic_smartsheet_authority",
      ),
      schedule_ref: ref(
        "schedule",
        "schedule:alpha",
        "synthetic_smartsheet_authority",
      ),
    }),
    "raw_secret_or_live_sentinel",
  );
  assertCode(() => binding({ activation: true }), "activation_forbidden");
  assertCode(() => binding({ live_authority: true }), "live_authority_forbidden");
  assertCode(() => binding({ source_mode: "live" }), "source_mode_forbidden");
});

test("scoped row identity is stable and separates schedules with the same source row", () => {
  const firstBinding = binding();
  const sameRow = rowRef("row-id:shared");
  const first = deriveScopedScheduleRowRef(firstBinding, sameRow);
  const replay = deriveScopedScheduleRowRef(firstBinding, clone(sameRow));
  const secondBinding = binding({
    schedule_ref: ref("schedule", "schedule:beta", OWNER),
  });
  const second = deriveScopedScheduleRowRef(secondBinding, sameRow);

  assert.deepEqual(first, replay);
  assert.notDeepEqual(first, second);
  assert.match(first.entity_id, /^schedule-row:[0-9a-f]{64}$/u);
});

test("labels, names, time, paths, and task fields cannot supply row identity", () => {
  const sourceBinding = binding();
  for (const [field, value] of [
    ["row_label", "Design review"],
    ["row_name", "Milestone A"],
    ["row_time", "2026-07-23"],
    ["row_path", "folder/row"],
    ["task_discovery", true],
  ]) {
    assertCode(
      () => createScheduleRevision(
        { ...revisionInput(sourceBinding), [field]: value },
        sourceBinding,
      ),
      "extra_field",
    );
  }
});

test("revision uses immutable typed refs and a canonical full-record digest", () => {
  const sourceBinding = binding();
  const value = revision(sourceBinding);
  assert.equal(value.raw_payload_copied, false);
  assert.equal(value.scoped_row_ref.entity_type, "schedule_row");
  assert.equal(validateScheduleRevision(value, sourceBinding), value);
  assert.match(value.record_digest, /^sha256:[0-9a-f]{64}$/u);

  const changed = clone(value);
  changed.known_at = "2026-07-23T00:02:00.000Z";
  assertCode(
    () => validateScheduleRevision(changed, sourceBinding),
    "record_digest_mismatch",
  );
});

test("canonical-equivalent synthetic record input has one content digest", () => {
  const left = sha256Canonical({
    planned_day: 3,
    dependency_refs: ["row-id:001"],
  });
  const right = sha256Canonical({
    dependency_refs: ["row-id:001"],
    planned_day: 3,
  });
  const changed = sha256Canonical({
    dependency_refs: ["row-id:001"],
    planned_day: 4,
  });
  assert.equal(left, right);
  assert.notEqual(left, changed);
});

test("append accepts v1 to v2, identical replay is a no-op, and history digest is stable", () => {
  const sourceBinding = binding();
  const first = revision(sourceBinding);
  const firstAppend = appendScheduleRevision([], first, sourceBinding);
  assert.equal(firstAppend.receipt.result, "accepted");
  assert.equal(firstAppend.records.length, 1);

  const second = linkedRevision(sourceBinding, first);
  const secondAppend = appendScheduleRevision(firstAppend.records, second, sourceBinding);
  assert.equal(secondAppend.receipt.result, "accepted");
  assert.equal(secondAppend.records.length, 2);

  const replay = appendScheduleRevision(secondAppend.records, clone(second), sourceBinding);
  assert.equal(replay.receipt.result, "identical_replay");
  assert.deepEqual(replay.records, secondAppend.records);
  assert.equal(
    replay.receipt.ordered_history_digest,
    secondAppend.receipt.ordered_history_digest,
  );
});

test("stale expected revision and immutable event or revision conflicts reject", () => {
  const sourceBinding = binding();
  const first = revision(sourceBinding);
  const accepted = appendScheduleRevision([], first, sourceBinding);
  const second = linkedRevision(sourceBinding, first);
  const acceptedSecond = appendScheduleRevision(accepted.records, second, sourceBinding);

  const stale = revision(sourceBinding, "3", {
    previous_revision_ref: first.revision_ref,
    supersedes_event_ref: second.event_ref,
    expected_current_revision_ref: first.revision_ref,
  });
  assertCode(
    () => appendScheduleRevision(acceptedSecond.records, stale, sourceBinding),
    "stale_expected_revision",
  );

  const eventConflict = clone(second);
  eventConflict.canonical_record_ref = ref(
    "content",
    sha256Canonical({ synthetic_due_day: 99 }),
    OWNER,
  );
  resealRevision(eventConflict);
  assertCode(
    () => appendScheduleRevision(acceptedSecond.records, eventConflict, sourceBinding),
    "event_ref_conflict",
  );

  const revisionConflict = clone(second);
  revisionConflict.event_ref = ref("event", "event:other", OWNER);
  resealRevision(revisionConflict);
  assertCode(
    () => appendScheduleRevision(acceptedSecond.records, revisionConflict, sourceBinding),
    "revision_ref_conflict",
  );
});

test("canonical-equivalent new refs reject instead of inventing a revision", () => {
  const sourceBinding = binding();
  const first = revision(sourceBinding);
  const accepted = appendScheduleRevision([], first, sourceBinding);
  const noSemanticChange = linkedRevision(sourceBinding, first, "2", {
    canonical_record_ref: first.canonical_record_ref,
  });
  assertCode(
    () => appendScheduleRevision(accepted.records, noSemanticChange, sourceBinding),
    "canonical_record_unchanged",
  );
});

test("forward sequence gaps are accepted only with an exact ordered gap receipt", () => {
  const sourceBinding = binding();
  const first = revision(sourceBinding);
  const accepted = appendScheduleRevision([], first, sourceBinding);
  const fourth = linkedRevision(sourceBinding, first, "4");
  const gap = appendScheduleRevision(accepted.records, fourth, sourceBinding);

  assert.equal(gap.receipt.result, "accepted_with_gap");
  assert.equal(gap.receipt.expected_sequence, 2);
  assert.equal(gap.receipt.observed_sequence, 4);
  assert.equal(gap.receipt.gap_start_sequence, 2);
  assert.equal(gap.receipt.gap_end_sequence, 3);
  assert.equal(gap.records.length, 2);
  assert.equal(validateScheduleRevisionCollection(gap.records, sourceBinding), gap.records);
});

test("append receipt sequence fields remain bound to result semantics and the immutable record", () => {
  const sourceBinding = binding();
  const first = revision(sourceBinding);
  const accepted = appendScheduleRevision([], first, sourceBinding);

  const falseNonGap = clone(accepted.receipt);
  falseNonGap.observed_sequence = 4;
  resealAppendReceipt(falseNonGap);
  assertCode(
    () => validateScheduleAppendReceipt(falseNonGap, accepted.records),
    "append_non_gap_sequence_mismatch",
  );

  const falseRecordSequence = clone(accepted.receipt);
  falseRecordSequence.expected_sequence = 4;
  falseRecordSequence.observed_sequence = 4;
  resealAppendReceipt(falseRecordSequence);
  assertCode(
    () => validateScheduleAppendReceipt(falseRecordSequence, accepted.records),
    "append_record_sequence_mismatch",
  );
});

test("raw, secret, token, absolute, UNC, workspace, and arbitrary log sentinels reject", () => {
  const sourceBinding = binding();
  const extras = [
    ["raw_body", "payload"],
    ["transcript", "text"],
    ["token", "not-a-real-value"],
    ["stage_log", "log"],
    ["runs_recursive", true],
  ];
  for (const [field, value] of extras) {
    assertCode(
      () => createScheduleRevision(
        { ...revisionInput(sourceBinding), [field]: value },
        sourceBinding,
      ),
      "extra_field",
    );
  }

  for (const id of [
    "secret:placeholder",
    "raw:payload",
    ["C:", "private", "row"].join("\\"),
    ["", "", "server", "share"].join("\\"),
    "/workspace/row",
    "_workspaces/project/row",
  ]) {
    assertCode(
      () => createScheduleRevision(
        {
          ...revisionInput(sourceBinding),
          source_row_ref: ref("schedule_source_row", id, OWNER),
        },
        sourceBinding,
      ),
      id.includes("\\") || id.includes("/") ? "unsafe_token" : "raw_secret_or_live_sentinel",
    );
  }
});

test("coverage implements the shared six-state count, null, gap, applicability matrix", () => {
  const sourceBinding = binding();
  const one = revision(sourceBinding);
  const accepted = appendScheduleRevision([], one, sourceBinding).records;
  assert.deepEqual(SCHEDULE_HISTORY_COVERAGE_STATES, [
    "complete_with_events",
    "complete_no_events",
    "partial",
    "failed",
    "not_collected",
    "not_applicable",
  ]);

  const withEvents = createScheduleCoverageReceipt(
    coverageInput(sourceBinding, "complete_with_events"),
    accepted,
    sourceBinding,
  );
  assert.equal(withEvents.event_count, 1);
  assert.deepEqual(withEvents.gap_codes, []);

  const noEvents = createScheduleCoverageReceipt(
    coverageInput(sourceBinding, "complete_no_events"),
    [],
    sourceBinding,
  );
  assert.equal(noEvents.event_count, 0);

  const partial = createScheduleCoverageReceipt(
    coverageInput(sourceBinding, "partial"),
    accepted,
    sourceBinding,
  );
  assert.equal(partial.event_count, 1);
  assert.deepEqual(partial.gap_codes, ["synthetic_revision_gap"]);

  for (const state of ["failed", "not_collected"]) {
    const receipt = createScheduleCoverageReceipt(
      coverageInput(sourceBinding, state),
      [],
      sourceBinding,
    );
    assert.equal(receipt.event_count, null);
    assert.equal(receipt.gap_codes.length, 1);
  }

  const notApplicable = createScheduleCoverageReceipt(
    coverageInput(sourceBinding, "not_applicable"),
    [],
    sourceBinding,
  );
  assert.equal(notApplicable.event_count, null);
  assert.equal(notApplicable.gap_codes.length, 0);
  assert.equal(notApplicable.applicability_ref.entity_type, "rule_revision");
});

test("coverage is exact-scope, deterministic, and uses known_at half-open windows", () => {
  const sourceBinding = binding();
  const first = revision(sourceBinding, "1", {
    known_at: "2026-07-23T00:01:00.000Z",
    recorded_at: "2026-07-23T00:01:00.000Z",
  });
  const second = linkedRevision(sourceBinding, first, "2", {
    known_at: "2026-07-23T00:02:00.000Z",
    recorded_at: "2026-07-23T00:02:00.000Z",
  });
  const accepted = appendScheduleRevision(
    appendScheduleRevision([], first, sourceBinding).records,
    second,
    sourceBinding,
  ).records;
  const forward = createScheduleCoverageReceipt(
    coverageInput(sourceBinding, "complete_with_events"),
    accepted,
    sourceBinding,
  );
  const reverse = createScheduleCoverageReceipt(
    coverageInput(sourceBinding, "complete_with_events"),
    [...accepted].reverse(),
    sourceBinding,
  );
  assert.equal(forward.ordered_event_digest, reverse.ordered_event_digest);
  assert.equal(validateScheduleCoverageReceipt(forward, accepted, sourceBinding), forward);

  assertCode(
    () => createScheduleCoverageReceipt(
      coverageInput(sourceBinding, "complete_with_events", {
        window_end: first.known_at,
      }),
      [first],
      sourceBinding,
    ),
    "coverage_known_at_outside_window",
  );

  const otherBinding = binding({
    schedule_ref: ref("schedule", "schedule:beta", OWNER),
  });
  const scopeConflict = clone(forward);
  scopeConflict.schedule_ref = otherBinding.schedule_ref;
  resealCoverage(scopeConflict);
  assertCode(
    () => validateScheduleCoverageReceipt(scopeConflict, accepted, sourceBinding),
    "coverage_scope_mismatch",
  );
});

test("coverage cannot hide HOLD as zero events or invent a non-synthetic D25 gap", () => {
  const sourceBinding = binding();
  const record = revision(sourceBinding);
  assertCode(
    () => createScheduleCoverageReceipt(
      coverageInput(sourceBinding, "complete_no_events"),
      [record],
      sourceBinding,
    ),
    "coverage_events_forbidden",
  );
  assertCode(
    () => createScheduleCoverageReceipt(
      coverageInput(sourceBinding, "partial", {
        gap_codes: ["schedule_live_gap"],
      }),
      [record],
      sourceBinding,
    ),
    "synthetic_gap_code_invalid",
  );
  assertCode(
    () => createScheduleCoverageReceipt(
      coverageInput(sourceBinding, "partial", {
        gap_codes: ["synthetic_secret"],
      }),
      [record],
      sourceBinding,
    ),
    "raw_secret_or_live_sentinel",
  );
});

test("binding and record exact schemas reject digest-preserving unknown keys", () => {
  const sourceBinding = binding();
  const extraBinding = clone(sourceBinding);
  extraBinding.raw_schedule_payload = null;
  resealBinding(extraBinding);
  assertCode(() => validateScheduleSourceBinding(extraBinding), "extra_field");

  const record = revision(sourceBinding);
  const extraRecord = clone(record);
  extraRecord.schedule_name = "Synthetic schedule";
  resealRevision(extraRecord);
  assertCode(
    () => validateScheduleRevision(extraRecord, sourceBinding),
    "extra_field",
  );
});
