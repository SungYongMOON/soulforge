import assert from "node:assert/strict";
import { test } from "node:test";

import { seedRows } from "../data/registry_seed_v0.mjs";
import { sha256Canonical } from "../../shared/project_history_envelope.mjs";
import { adaptAcceptedLinearCaptureToLaneRecord } from "../src/linear_source_lane_adapter.mjs";
import { createPathRegistry, registrySnapshot } from "../src/path_registry_core.mjs";
import { assembleSourceLaneEvidence } from "../src/source_lane_index.mjs";
import { buildStorageMap } from "../src/storage_map_projection.mjs";

const OPERATIONS = [
  "linear.read.viewer_organization",
  "linear.read.teams",
  "linear.read.users",
  "linear.read.projects",
  "linear.read.issue_labels",
  "linear.read.workflow_states",
  "linear.read.cycles",
  "linear.read.issues_window",
  "linear.read.comments_window",
];

function counts(observed, created) {
  return { observed, created, unchanged: observed - created };
}

const CURSOR_BEFORE = Object.freeze({
  schema_version: "soulforge.linear_collect.cursor.v1",
  watermark: null,
  backfill: null,
  generation_seq: 6,
});

const RECEIPT = Object.freeze({
  schema_version: "soulforge.linear_collect.run_receipt.v1",
  lane_id: "hpp-linear-collect",
  run_id: "run-0007",
  generation_seq: 7,
  mode: "apply",
  status: "ok",
  writer_authority_id: "hpp-linear-collect-writer",
  writer_epoch: 1,
  binding_sha256: `sha256:${"1".repeat(64)}`,
  workspace_url_key: "synthetic-forge",
  organization_id: "8f0a2c1e-4b6d-4c2a-9e3f-1a2b3c4d5e6f",
  started_at: "2026-09-01T02:00:00.000Z",
  completed_at: "2026-09-01T02:00:03.000Z",
  duration_ms: 3000,
  window: {
    lower: "1970-01-01T00:00:00.000Z",
    upper: "2026-09-01T02:00:00.000Z",
    phase: "delta",
    order_observed: "descending",
  },
  cursor_before: CURSOR_BEFORE,
  cursor_after: {
    schema_version: "soulforge.linear_collect.cursor.v1",
    watermark: "2026-09-01T02:00:00.000Z",
    backfill: null,
    generation_seq: 7,
  },
  read_calls: {
    total: 13,
    by_operation: Object.fromEntries(OPERATIONS.map((operation, index) => [operation, index < 7 ? 1 : 3])),
  },
  objects: {
    workspace: counts(1, 1),
    teams: counts(2, 2),
    users: counts(3, 3),
    projects: counts(3, 3),
    labels: counts(2, 2),
    states: counts(4, 4),
    cycles: counts(1, 1),
    issues: counts(6, 6),
    comments: counts(5, 5),
    read_evidence: counts(6, 6),
  },
  custody_manifest_digest: `sha256:${"2".repeat(64)}`,
  coverage_gaps: ["polling_cannot_prove_hard_deletes"],
  error_codes: [],
  repository_writes: 0,
  private_writes: 36,
  network_used: true,
});

const ARGS = Object.freeze({
  source_ref: "source.linear",
  expected_lane_id: "hpp-linear-collect",
  expected_workspace_url_key: "synthetic-forge",
  generation_seq: 7,
  run_receipt: RECEIPT,
  run_receipt_digest: sha256Canonical(RECEIPT),
  evaluation_time: "2026-09-01T02:05:00.000Z",
  max_receipt_age_seconds: 3600,
});

function adapt(overrides = {}) {
  const args = { ...ARGS, ...overrides };
  if (overrides.run_receipt !== undefined && overrides.run_receipt_digest === undefined) {
    args.run_receipt_digest = sha256Canonical(overrides.run_receipt);
  }
  return adaptAcceptedLinearCaptureToLaneRecord(args);
}

function operationalLinearSnapshot() {
  const rows = seedRows()
    .filter((row) => row.logical_path_id === "source.linear")
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

test("an accepted Linear run receipt emits one refs-only capture generation", () => {
  const record = adapt();
  assert.deepEqual(record, {
    record_kind: "capture_generation",
    source_ref: "source.linear",
    generation_seq: 7,
    capture_ref: `receipt.linear.run.${ARGS.run_receipt_digest.slice(7)}`,
    manifest_ref: `receipt.linear.custody.${"2".repeat(64)}`,
    item_count: 27,
    content_digest: RECEIPT.custody_manifest_digest,
    captured_at: RECEIPT.window.upper,
    immutable: true,
  });
  assert.equal(Object.isFrozen(record), true);
  for (const invented of [
    "backup_generation_ref", "restore_test_ref", "human_acceptance_state",
    "retention_policy_ref", "rpo_policy_ref", "payload", "body",
  ]) assert.equal(invented in record, false, invented);
});

test("capture-only Linear evidence renders degraded and never healthy", () => {
  const assembled = assembleSourceLaneEvidence({
    source_ref: "source.linear",
    records: [adapt()],
    binding_state: "bound",
    evaluation_time: "2026-09-01T02:05:00.000Z",
    freshness_horizon_seconds: 3600,
  });
  assert.equal(assembled.status, "assembled");
  assert.equal(assembled.evidence.freshness_state, "fresh");
  assert.equal(assembled.evidence.backup_generation_ref, undefined);
  assert.equal(assembled.evidence.restore_test_ref, undefined);
  const map = buildStorageMap({
    registry_snapshot: operationalLinearSnapshot(),
    evidence: { "source.linear": assembled.evidence },
  });
  assert.equal(map.rows[0].watch_state, "degraded");
  assert.notEqual(map.rows[0].watch_state, "healthy");
});

test("source, lane, workspace and generation scopes are exact", () => {
  assert.throws(() => adapt({ source_ref: "source.slack" }), /foreign_linear_source/u);
  assert.throws(() => adapt({ expected_lane_id: "other-lane" }), /foreign_linear_lane/u);
  assert.throws(() => adapt({ expected_workspace_url_key: "other-workspace" }), /foreign_linear_workspace/u);
  assert.throws(() => adapt({ generation_seq: 8 }), /linear_capture_generation_seq_mismatch/u);
  assert.throws(() => adapt({ generation_seq: 0 }), /linear_capture_generation_seq_invalid/u);
});

test("error, preflight, forged-digest, stale, future and body-bearing receipts reject with fixed codes", () => {
  assert.throws(
    () => adapt({ run_receipt: { ...RECEIPT, status: "error", error_codes: ["workspace_mismatch"] } }),
    /linear_run_receipt_not_accepted/u,
  );
  assert.throws(() => adapt({ run_receipt: { ...RECEIPT, mode: "preflight" } }), /linear_run_receipt_not_accepted/u);
  assert.throws(() => adapt({ run_receipt_digest: `sha256:${"f".repeat(64)}` }), /linear_run_receipt_digest_mismatch/u);
  assert.throws(() => adapt({ run_receipt_digest: "not-a-digest" }), /linear_run_receipt_digest_invalid/u);
  assert.throws(() => adapt({ evaluation_time: "2026-09-01T04:00:00.000Z" }), /linear_capture_receipt_stale/u);
  assert.throws(() => adapt({ evaluation_time: "2026-09-01T01:59:00.000Z" }), /linear_capture_receipt_clock_in_future/u);
  assert.throws(
    () => adapt({ run_receipt: { ...RECEIPT, issue_title: "leaked synthetic title" } }),
    /linear_run_receipt_not_accepted/u,
  );
  assert.throws(
    () => adapt({ run_receipt: { ...RECEIPT, coverage_gaps: [["C:", "private"].join("\\")] } }),
    /linear_run_receipt_not_accepted/u,
  );
  assert.throws(
    () => adapt({ run_receipt: { ...RECEIPT, repository_writes: 1 } }),
    /linear_run_receipt_not_accepted/u,
  );
});

test("caller-owned hostile values never echo in errors", () => {
  const privatePath = ["D:", "private", "linear"].join("\\");
  for (const invoke of [
    () => adapt({ source_ref: privatePath }),
    () => adapt({ expected_lane_id: privatePath }),
    () => adapt({ run_receipt: { ...RECEIPT, lane_id: privatePath } }),
  ]) {
    assert.throws(invoke, (error) => typeof error?.code === "string"
      && error.message === error.code
      && !error.message.includes(privatePath));
  }
});
