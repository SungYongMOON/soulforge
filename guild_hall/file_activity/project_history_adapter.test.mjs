import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  FILE_HISTORY_ADAPTER_CHECKPOINT_SCHEMA_VERSION,
  FILE_HISTORY_ADAPTER_COVERAGE_SCHEMA_VERSION,
  FILE_HISTORY_ADAPTER_EVENT_SCHEMA_VERSION,
  FILE_HISTORY_ADAPTER_REQUEST_SCHEMA_VERSION,
  FILE_HISTORY_ADAPTER_STATE_SCHEMA_VERSION,
  FILE_HISTORY_NATIVE_BINDING_CANDIDATES,
  adaptFileHistoryReferences,
  validateFileHistoryAdapterState,
} from "./project_history_adapter.mjs";

const START = "2026-07-23T00:00:00.000Z";
const END = "2026-07-24T00:00:00.000Z";
const RECORDED = "2026-07-23T00:01:00.000Z";
const KNOWN = "2026-07-23T00:02:00.000Z";

function digest(character) {
  return `sha256:${character.repeat(64)}`;
}

function typedRef(entityType, ownerSurface, entityId) {
  return {
    entity_type: entityType,
    owner_surface: ownerSurface,
    entity_id: entityId,
  };
}

function scope(ownerSurface = "file_activity") {
  return {
    source_owner_ref: typedRef(
      "source_owner",
      ownerSurface,
      `${ownerSurface}:history_candidate_v1`,
    ),
    project_ref: typedRef("project", "synthetic_project_registry", "project:p01"),
  };
}

function eventInput({
  ownerSurface = "file_activity",
  nativeType = "file_observation",
  id = "001",
  sequence = 1,
  knownAt = KNOWN,
} = {}) {
  const projectRef = scope(ownerSurface).project_ref;
  return {
    schema_version: FILE_HISTORY_ADAPTER_EVENT_SCHEMA_VERSION,
    sequence,
    native_occurrence_ref: typedRef(nativeType, ownerSurface, `${nativeType}:${id}`),
    event_ref: typedRef("event", ownerSurface, `file_event:${id}`),
    source_revision_ref: typedRef("source_revision", ownerSurface, `revision:${id}`),
    content_ref: typedRef("content", ownerSurface, digest("a")),
    event_at: "2026-07-23T00:00:30.000Z",
    valid_at: "2026-07-23T00:00:30.000Z",
    observed_at: "2026-07-23T00:00:45.000Z",
    known_at: knownAt,
    recorded_at: RECORDED,
    classification_before: null,
    classification_after: {
      state: "classified",
      project_ref: projectRef,
    },
    supersedes_event_ref: null,
  };
}

function checkpointInput({
  ownerSurface = "file_activity",
  id = "001",
  throughSequence = 1,
  checkpointDigest = digest("b"),
} = {}) {
  return {
    schema_version: FILE_HISTORY_ADAPTER_CHECKPOINT_SCHEMA_VERSION,
    checkpoint_ref: typedRef(
      "file_revision_checkpoint",
      ownerSurface,
      `checkpoint:${id}`,
    ),
    checkpoint_digest: checkpointDigest,
    through_sequence: throughSequence,
  };
}

function coverageInput(state, {
  gapCodes = [],
  applicabilityRef = null,
} = {}) {
  return {
    schema_version: FILE_HISTORY_ADAPTER_COVERAGE_SCHEMA_VERSION,
    window_start: START,
    window_end: END,
    state,
    gap_codes: gapCodes,
    applicability_ref: applicabilityRef,
  };
}

function request({
  ownerSurface = "file_activity",
  featureEnabled = false,
  priorState = null,
  events = [eventInput({ ownerSurface })],
  checkpoint = checkpointInput({ ownerSurface }),
  coverage = coverageInput("complete_with_events"),
} = {}) {
  return {
    schema_version: FILE_HISTORY_ADAPTER_REQUEST_SCHEMA_VERSION,
    feature_enabled: featureEnabled,
    ...scope(ownerSurface),
    prior_state: priorState,
    checkpoint,
    events,
    coverage,
  };
}

function assertCode(callback, code) {
  assert.throws(callback, (error) => {
    assert.equal(error?.code, code);
    return true;
  });
}

test("feature-OFF adapter accepts exact caller-supplied immutable refs without mutating input", () => {
  const input = request();
  const snapshot = structuredClone(input);
  const result = adaptFileHistoryReferences(input);

  assert.deepEqual(input, snapshot);
  assert.equal(result.feature_enabled, false);
  assert.equal(result.envelopes.length, 1);
  assert.equal(result.envelopes[0].lane, "file");
  assert.equal(result.envelopes[0].native_occurrence_ref.entity_type, "file_observation");
  assert.equal(result.envelopes[0].source_revision_ref.entity_type, "source_revision");
  assert.equal(result.envelopes[0].raw_payload_copied, false);
  assert.equal(result.coverage_receipt.state, "complete_with_events");
  assert.equal(result.coverage_receipt.event_count, 1);
  assert.equal(result.actions[0].outcome, "applied");
  assert.equal(result.checkpoint_action, "applied");
  assert.equal(result.state.last_contiguous_sequence, 1);
  assert.match(result.metadata_digest, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(result.state.schema_version, FILE_HISTORY_ADAPTER_STATE_SCHEMA_VERSION);
  assert.equal(validateFileHistoryAdapterState(result.state), result.state);
});

test("adapter stays disabled and exact-key validation rejects extra payload fields", () => {
  assertCode(
    () => adaptFileHistoryReferences(request({ featureEnabled: true })),
    "feature_must_remain_off",
  );

  const extraTop = request();
  extraTop.raw_body = "synthetic";
  assertCode(() => adaptFileHistoryReferences(extraTop), "extra_field");

  const extraEvent = request();
  extraEvent.events[0].file_bytes = "synthetic";
  assertCode(() => adaptFileHistoryReferences(extraEvent), "extra_field");
});

test("candidate binding is exact by native type and owner and never promotes lineage refs", () => {
  assert.deepEqual(FILE_HISTORY_NATIVE_BINDING_CANDIDATES, {
    file_observation: ["file_activity"],
    file_reconciliation_event: ["file_activity"],
    erp_upload_event: ["dev_erp"],
  });

  const reconciliation = request({
    events: [eventInput({ nativeType: "file_reconciliation_event" })],
  });
  assert.equal(
    adaptFileHistoryReferences(reconciliation).envelopes[0].native_occurrence_ref.entity_type,
    "file_reconciliation_event",
  );

  const upload = request({
    ownerSurface: "dev_erp",
    events: [eventInput({ ownerSurface: "dev_erp", nativeType: "erp_upload_event" })],
    checkpoint: checkpointInput({ ownerSurface: "dev_erp" }),
  });
  assert.equal(
    adaptFileHistoryReferences(upload).envelopes[0].native_occurrence_ref.owner_surface,
    "dev_erp",
  );

  const lineage = request();
  lineage.events[0].native_occurrence_ref.entity_type = "logical_file_id";
  assertCode(
    () => adaptFileHistoryReferences(lineage),
    "native_occurrence_binding_not_candidate",
  );

  const wrongOwner = request();
  wrongOwner.events[0].native_occurrence_ref.owner_surface = "dev_erp";
  assertCode(
    () => adaptFileHistoryReferences(wrongOwner),
    "native_occurrence_binding_not_candidate",
  );
});

test("exact replay is a no-op with stable event, checkpoint, and state digests", () => {
  const first = adaptFileHistoryReferences(request());
  const replay = adaptFileHistoryReferences(request({
    priorState: first.state,
  }));

  assert.equal(replay.actions.length, 1);
  assert.equal(replay.actions[0].outcome, "replay_noop");
  assert.deepEqual(replay.actions[0].receipt_ref, first.actions[0].receipt_ref);
  assert.equal(replay.checkpoint_action, "replay_noop");
  assert.equal(replay.envelopes[0].metadata_digest, first.envelopes[0].metadata_digest);
  assert.equal(replay.state.metadata_digest, first.state.metadata_digest);
  assert.equal(replay.state.event_receipts.length, 1);
  assert.equal(replay.state.checkpoint_receipts.length, 1);
});

test("same event or checkpoint ref with a different immutable digest fails closed", () => {
  const first = adaptFileHistoryReferences(request());
  const changedEvent = eventInput({ knownAt: "2026-07-23T00:03:00.000Z" });
  assertCode(
    () => adaptFileHistoryReferences(request({
      priorState: first.state,
      events: [changedEvent],
    })),
    "event_ref_digest_conflict",
  );

  assertCode(
    () => adaptFileHistoryReferences(request({
      priorState: first.state,
      events: [],
      checkpoint: checkpointInput({
        throughSequence: 1,
        checkpointDigest: digest("c"),
      }),
      coverage: coverageInput("complete_no_events"),
    })),
    "checkpoint_ref_digest_conflict",
  );
});

test("sequence gaps produce immutable receipts, hold mutation, and require partial coverage", () => {
  const gapRequest = request({
    events: [eventInput({ id: "002", sequence: 2 })],
    checkpoint: checkpointInput({ id: "gap", throughSequence: 0 }),
    coverage: coverageInput("partial", {
      gapCodes: ["synthetic_sequence_gap"],
    }),
  });
  const first = adaptFileHistoryReferences(gapRequest);

  assert.equal(first.actions[0].outcome, "sequence_gap_held");
  assert.equal(first.actions[0].receipt_ref, null);
  assert.equal(first.gap_receipts.length, 1);
  assert.equal(first.gap_receipts[0].expected_sequence, 1);
  assert.equal(first.gap_receipts[0].observed_sequence, 2);
  assert.equal(first.state.last_contiguous_sequence, 0);
  assert.equal(first.state.event_receipts.length, 0);
  assert.equal(first.coverage_receipt.state, "partial");
  assert.equal(first.coverage_receipt.event_count, 1);

  const replay = adaptFileHistoryReferences({
    ...gapRequest,
    prior_state: first.state,
  });
  assert.deepEqual(replay.gap_receipts[0].gap_ref, first.gap_receipts[0].gap_ref);
  assert.equal(replay.checkpoint_action, "replay_noop");

  assertCode(
    () => adaptFileHistoryReferences({
      ...gapRequest,
      coverage: coverageInput("complete_with_events"),
    }),
    "sequence_gap_requires_partial_coverage",
  );
});

test("all six H00 coverage states preserve exact count/null/gap semantics", () => {
  const ruleRef = typedRef(
    "rule_revision",
    "synthetic_coverage_policy",
    "rule:file_not_applicable_v1",
  );
  const cases = [
    {
      state: "complete_with_events",
      events: [eventInput()],
      checkpoint: checkpointInput(),
      options: {},
      count: 1,
    },
    {
      state: "complete_no_events",
      events: [],
      checkpoint: checkpointInput({ id: "empty", throughSequence: 0 }),
      options: {},
      count: 0,
    },
    {
      state: "partial",
      events: [eventInput()],
      checkpoint: checkpointInput(),
      options: { gapCodes: ["synthetic_projection_truncated"] },
      count: 1,
    },
    {
      state: "partial",
      events: [],
      checkpoint: checkpointInput({ id: "partial-empty", throughSequence: 0 }),
      options: { gapCodes: ["synthetic_source_gap"] },
      count: 0,
    },
    {
      state: "failed",
      events: [],
      checkpoint: null,
      options: { gapCodes: ["synthetic_collection_failed"] },
      count: null,
    },
    {
      state: "not_collected",
      events: [],
      checkpoint: null,
      options: { gapCodes: ["synthetic_not_collected"] },
      count: null,
    },
    {
      state: "not_applicable",
      events: [],
      checkpoint: null,
      options: { applicabilityRef: ruleRef },
      count: null,
    },
  ];

  for (const entry of cases) {
    const result = adaptFileHistoryReferences(request({
      events: entry.events,
      checkpoint: entry.checkpoint,
      coverage: coverageInput(entry.state, entry.options),
    }));
    assert.equal(result.coverage_receipt.state, entry.state);
    assert.equal(result.coverage_receipt.event_count, entry.count);
  }

  assertCode(
    () => adaptFileHistoryReferences(request({
      events: [],
      checkpoint: null,
      coverage: coverageInput("partial", {
        gapCodes: ["synthetic_gap"],
      }),
    })),
    "checkpoint_required_for_counted_coverage",
  );
  assertCode(
    () => adaptFileHistoryReferences(request({
      events: [],
      checkpoint: checkpointInput({ throughSequence: 0 }),
      coverage: coverageInput("failed", {
        gapCodes: ["synthetic_collection_failed"],
      }),
    })),
    "checkpoint_forbidden_for_null_count_coverage",
  );
});

test("raw, transcript, file-byte, secret, absolute, UNC, and locator sentinels fail in allowed strings", () => {
  const mutations = [
    (value) => { value.events[0].event_ref.entity_id = "body:sentinel"; },
    (value) => { value.events[0].event_ref.entity_id = "raw_transcript:sentinel"; },
    (value) => { value.events[0].event_ref.entity_id = "file_bytes:sentinel"; },
    (value) => { value.events[0].event_ref.entity_id = "secret:sentinel"; },
    (value) => { value.events[0].event_ref.entity_id = "token:sentinel"; },
    (value) => { value.events[0].event_ref.entity_id = "C:private"; },
    (value) => { value.events[0].event_ref.entity_id = "\\\\server\\share"; },
    (value) => { value.events[0].event_ref.entity_id = "workspace/project/file"; },
    (value) => { value.events[0].event_ref.entity_id = "report.pdf"; },
    (value) => { value.coverage.gap_codes = ["stage_log"]; },
  ];

  for (const mutate of mutations) {
    const value = request();
    mutate(value);
    assert.throws(
      () => adaptFileHistoryReferences(value),
      (error) => ["raw_secret_sentinel_forbidden", "locator_or_path_forbidden"].includes(error?.code),
    );
  }
});

test("adapter source has no filesystem, scanner, CLI, network, or project-path dependency", async () => {
  const source = await readFile(
    new URL("./project_history_adapter.mjs", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /from\s+["']node:fs|scanWorkspace\s*\(|readdir\s*\(|readFile\s*\(|writeFile\s*\(|fetch\s*\(/u,
  );
  assert.match(source, /feature_enabled !== false/u);
});

test("tampered retained state and noncanonical producer order fail before mutation", () => {
  const first = adaptFileHistoryReferences(request());
  const tampered = structuredClone(first.state);
  tampered.event_receipts[0].event_digest = digest("f");
  assertCode(
    () => validateFileHistoryAdapterState(tampered),
    "event_receipt_ref_mismatch",
  );

  const outOfOrder = request({
    events: [
      eventInput({ id: "002", sequence: 2 }),
      eventInput({ id: "001", sequence: 1 }),
    ],
    checkpoint: checkpointInput({ throughSequence: 0 }),
    coverage: coverageInput("partial", {
      gapCodes: ["synthetic_sequence_gap"],
    }),
  });
  assertCode(
    () => adaptFileHistoryReferences(outOfOrder),
    "request_sequence_order_invalid",
  );
});
