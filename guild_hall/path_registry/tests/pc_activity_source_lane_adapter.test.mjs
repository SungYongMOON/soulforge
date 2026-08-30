import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FILE_HISTORY_ADAPTER_CHECKPOINT_SCHEMA_VERSION,
  FILE_HISTORY_ADAPTER_COVERAGE_SCHEMA_VERSION,
  FILE_HISTORY_ADAPTER_EVENT_SCHEMA_VERSION,
  FILE_HISTORY_ADAPTER_REQUEST_SCHEMA_VERSION,
  adaptFileHistoryReferences,
} from "../../file_activity/project_history_adapter.mjs";
import { sha256Canonical } from "../../shared/project_history_envelope.mjs";
import { seedRows } from "../data/registry_seed_v0.mjs";
import { createPathRegistry, registrySnapshot } from "../src/path_registry_core.mjs";
import { adaptAcceptedPcActivityCoverageToLaneRecord } from "../src/pc_activity_source_lane_adapter.mjs";
import { assembleSourceLaneEvidence } from "../src/source_lane_index.mjs";
import { buildStorageMap } from "../src/storage_map_projection.mjs";

const START = "2026-08-31T01:00:00.000Z";
const END = "2026-08-31T02:00:00.000Z";

function digest(character) {
  return `sha256:${character.repeat(64)}`;
}

function ref(entityType, ownerSurface, entityId) {
  return { entity_type: entityType, owner_surface: ownerSurface, entity_id: entityId };
}

const SOURCE_OWNER = Object.freeze(ref(
  "source_owner", "file_activity", "file_activity:history_candidate_v1",
));
const PROJECT = Object.freeze(ref(
  "project", "project_registry", "project:p01-001",
));

function event(id = "001", sequence = 1) {
  return {
    schema_version: FILE_HISTORY_ADAPTER_EVENT_SCHEMA_VERSION,
    sequence,
    native_occurrence_ref: ref("file_observation", "file_activity", `file_observation:${id}`),
    event_ref: ref("event", "file_activity", `file_event:${id}`),
    source_revision_ref: ref("source_revision", "file_activity", `revision:${id}`),
    content_ref: ref("content", "file_activity", digest("a")),
    event_at: "2026-08-31T01:00:30.000Z",
    valid_at: "2026-08-31T01:00:30.000Z",
    observed_at: "2026-08-31T01:00:45.000Z",
    known_at: "2026-08-31T01:02:00.000Z",
    recorded_at: "2026-08-31T01:01:00.000Z",
    classification_before: null,
    classification_after: { state: "classified", project_ref: PROJECT },
    supersedes_event_ref: null,
  };
}

function nativeResult({ coverageState = "complete_with_events", events = [event()] } = {}) {
  return adaptFileHistoryReferences({
    schema_version: FILE_HISTORY_ADAPTER_REQUEST_SCHEMA_VERSION,
    feature_enabled: false,
    source_owner_ref: SOURCE_OWNER,
    project_ref: PROJECT,
    prior_state: null,
    checkpoint: {
      schema_version: FILE_HISTORY_ADAPTER_CHECKPOINT_SCHEMA_VERSION,
      checkpoint_ref: ref(
        "file_revision_checkpoint", "file_activity", "checkpoint:pc-activity-001",
      ),
      checkpoint_digest: digest("b"),
      through_sequence: events.length,
    },
    events,
    coverage: {
      schema_version: FILE_HISTORY_ADAPTER_COVERAGE_SCHEMA_VERSION,
      window_start: START,
      window_end: END,
      state: coverageState,
      gap_codes: coverageState === "partial" ? ["bounded_capture"] : [],
      applicability_ref: null,
    },
  });
}

const NATIVE = nativeResult();
const ARGS = Object.freeze({
  source_ref: "source.pc_activity",
  expected_source_owner_ref: SOURCE_OWNER,
  expected_project_ref: PROJECT,
  generation_seq: 12,
  coverage_receipt: NATIVE.coverage_receipt,
  coverage_receipt_digest: sha256Canonical(NATIVE.coverage_receipt),
  envelopes: NATIVE.envelopes,
  evaluation_time: "2026-08-31T02:10:00.000Z",
  max_receipt_age_seconds: 3600,
});

function adapt(overrides = {}) {
  const args = { ...ARGS, ...overrides };
  if (overrides.coverage_receipt !== undefined
      && overrides.coverage_receipt_digest === undefined) {
    args.coverage_receipt_digest = sha256Canonical(overrides.coverage_receipt);
  }
  return adaptAcceptedPcActivityCoverageToLaneRecord(args);
}

function operationalPcActivitySnapshot() {
  const rows = seedRows()
    .filter((row) => row.logical_path_id === "source.pc_activity")
    .map((row) => ({
      ...row,
      current_state: "current",
      module_owner_ref: "guild_hall.path_registry",
      owner_refs: {
        logical: "owner.logical",
        byte: "owner.byte",
        revision: "owner.revision",
        acceptance: "owner.acceptance",
        backup_restore: "owner.backup_restore",
      },
      acl_policy_ref: "policy.acl.v0",
      retention_policy_ref: "policy.retention.v0",
    }));
  return registrySnapshot(createPathRegistry({
    authority: {
      registry_schema_owner: "owner.registry_schema",
      private_binding_writer: "writer.binding_svc",
      resolver_runtime_owner: "owner.resolver_runtime",
      write_policy_owner: "owner.write_policy",
    },
    rows,
  }));
}

test("native complete file-activity coverage adapts to one refs-only PC activity generation", () => {
  const record = adapt();
  assert.deepEqual(record, {
    record_kind: "capture_generation",
    source_ref: "source.pc_activity",
    generation_seq: 12,
    capture_ref: `receipt.pc-activity.coverage.${ARGS.coverage_receipt_digest.slice(7)}`,
    manifest_ref: `manifest.pc-activity.event-set.${NATIVE.coverage_receipt.ordered_event_digest.slice(7)}`,
    item_count: 1,
    content_digest: NATIVE.coverage_receipt.ordered_event_digest,
    captured_at: END,
    immutable: true,
  });
  assert.equal(Object.isFrozen(record), true);
  for (const invented of [
    "backup_generation_ref", "restore_test_ref", "human_acceptance_state",
    "retention_policy_ref", "rpo_policy_ref", "payload", "body",
  ]) assert.equal(invented in record, false, invented);

  const empty = nativeResult({ coverageState: "complete_no_events", events: [] });
  const emptyRecord = adapt({
    generation_seq: 13,
    coverage_receipt: empty.coverage_receipt,
    coverage_receipt_digest: sha256Canonical(empty.coverage_receipt),
    envelopes: empty.envelopes,
  });
  assert.equal(emptyRecord.item_count, 0);
  assert.equal(emptyRecord.content_digest, empty.coverage_receipt.ordered_event_digest);
});

test("capture-only PC activity evidence is degraded, never healthy", () => {
  const assembled = assembleSourceLaneEvidence({
    source_ref: "source.pc_activity",
    records: [adapt()],
    binding_state: "bound",
    evaluation_time: "2026-08-31T02:10:00Z",
    freshness_horizon_seconds: 3600,
  });
  assert.equal(assembled.status, "assembled");
  assert.equal(assembled.evidence.backup_generation_ref, undefined);
  assert.equal(assembled.evidence.restore_test_ref, undefined);
  assert.equal(assembled.evidence.human_acceptance_state, undefined);

  const map = buildStorageMap({
    registry_snapshot: operationalPcActivitySnapshot(),
    evidence: { "source.pc_activity": assembled.evidence },
  });
  assert.equal(map.rows[0].watch_state, "degraded");
  assert.notEqual(map.rows[0].watch_state, "healthy");
});

test("native project/source scope is exact and cannot widen", () => {
  assert.throws(() => adapt({ source_ref: "source.team_files" }), /foreign_pc_activity_source/);
  assert.throws(
    () => adapt({ expected_project_ref: ref("project", "project_registry", "project:other") }),
    /foreign_pc_activity_coverage_scope/,
  );
  assert.throws(
    () => adapt({ coverage_receipt: {
      ...NATIVE.coverage_receipt,
      source_owner_ref: ref("source_owner", "dev_erp", "dev_erp:history"),
    } }),
    /pc_activity_coverage_receipt_not_accepted|foreign_pc_activity_coverage_scope/,
  );
  assert.throws(
    () => adapt({
      expected_source_owner_ref: ref(
        "source_owner", "file_activity", "file_activity:other_candidate",
      ),
    }),
    /foreign_pc_activity_coverage_scope/,
  );
});

test("forged digest, detached envelopes, partial coverage, and stale/future clocks reject", () => {
  assert.throws(
    () => adapt({ coverage_receipt_digest: `sha256:${"f".repeat(64)}` }),
    /pc_activity_coverage_receipt_digest_mismatch/,
  );
  assert.throws(
    () => adapt({ envelopes: [] }),
    /pc_activity_coverage_receipt_not_accepted/,
  );
  const partial = nativeResult({ coverageState: "partial" });
  assert.throws(
    () => adapt({
      coverage_receipt: partial.coverage_receipt,
      coverage_receipt_digest: sha256Canonical(partial.coverage_receipt),
      envelopes: partial.envelopes,
    }),
    /pc_activity_coverage_not_complete/,
  );
  assert.throws(
    () => adapt({ evaluation_time: "2026-08-31T04:00:01.000Z" }),
    /pc_activity_coverage_receipt_stale/,
  );
  assert.throws(
    () => adapt({ evaluation_time: "2026-08-31T01:59:59.000Z" }),
    /pc_activity_coverage_clock_in_future/,
  );
});

test("raw/path/secret/accessor/prototype values fail with fixed redacted errors", () => {
  for (const coverage of [
    { ...NATIVE.coverage_receipt, raw_payload: "withheld" },
    { ...NATIVE.coverage_receipt, local_path: ["C:", "private"].join("/") },
    { ...NATIVE.coverage_receipt, secret_ref: "secret.withheld" },
  ]) {
    assert.throws(
      () => adapt({ coverage_receipt: coverage }),
      (error) => error?.code === "pc_activity_coverage_receipt_not_accepted"
        && error.message === "pc_activity_coverage_receipt_not_accepted",
    );
  }

  const accessor = { ...NATIVE.coverage_receipt };
  Object.defineProperty(accessor, "event_count", { enumerable: true, get: () => 1 });
  assert.throws(
    () => adapt({ coverage_receipt: accessor, coverage_receipt_digest: ARGS.coverage_receipt_digest }),
    /pc_activity_coverage_receipt_value_invalid/,
  );
  assert.throws(
    () => adapt({
      coverage_receipt: Object.assign(Object.create({}), NATIVE.coverage_receipt),
      coverage_receipt_digest: ARGS.coverage_receipt_digest,
    }),
    /pc_activity_coverage_receipt_value_invalid/,
  );
});
