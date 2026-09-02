import assert from "node:assert/strict";
import { test } from "node:test";

import { seedRows } from "../data/registry_seed_v0.mjs";
import { sha256Canonical } from "../../shared/project_history_envelope.mjs";
import { adaptAcceptedBuzzCaptureToLaneRecord } from "../src/buzz_source_lane_adapter.mjs";
import { createPathRegistry, registrySnapshot } from "../src/path_registry_core.mjs";
import { assembleSourceLaneEvidence } from "../src/source_lane_index.mjs";
import { buildStorageMap } from "../src/storage_map_projection.mjs";

const COMMUNITY_ONE = "11111111-1111-4111-8111-111111111111";
const COMMUNITY_TWO = "11111111-1111-4111-8111-111111111112";

function counts(observed, created) {
  return { observed, created, unchanged: observed - created };
}

const CURSOR_BEFORE = Object.freeze({
  schema_version: "soulforge.buzz_collect.cursor.v1",
  received_watermark: "2026-09-01T01:00:00.000000Z",
  deleted_watermark: null,
  audit_seq_max: { [COMMUNITY_ONE]: 40, [COMMUNITY_TWO]: 12 },
  generation_seq: 6,
});

const RECEIPT = Object.freeze({
  schema_version: "soulforge.buzz_collect.run_receipt.v1",
  lane_id: "hpp-buzz-collect",
  run_id: "run-0007",
  generation_seq: 7,
  mode: "apply",
  status: "ok",
  writer_authority_id: "hpp-buzz-collect-writer",
  writer_epoch: 1,
  binding_sha256: `sha256:${"1".repeat(64)}`,
  relay_key: "relay-main",
  community_count: 2,
  started_at: "2026-09-01T02:00:00.000Z",
  completed_at: "2026-09-01T02:00:03.000Z",
  duration_ms: 3000,
  window: {
    received_since: "2026-09-01T01:00:00.000000Z",
    deleted_since: null,
    audit_seq_min: 13,
    phase: "delta",
  },
  cursor_before: CURSOR_BEFORE,
  cursor_after: {
    schema_version: "soulforge.buzz_collect.cursor.v1",
    received_watermark: "2026-09-01T01:59:12.004311Z",
    deleted_watermark: "2026-09-01T01:40:00.000000Z",
    audit_seq_max: { [COMMUNITY_ONE]: 44, [COMMUNITY_TWO]: 12 },
    generation_seq: 7,
  },
  read_calls: {
    total: 2,
    by_operation: { "buzz.read.liveness": 1, "buzz.read.export": 1 },
  },
  process_calls: 1,
  objects: {
    events: counts(18, 12),
    tombstones: counts(3, 1),
    audit: counts(1, 1),
    snapshots: counts(1, 0),
  },
  export_digests: {
    events: `sha256:${"3".repeat(64)}`,
    tombstones: `sha256:${"4".repeat(64)}`,
    audit: `sha256:${"5".repeat(64)}`,
    snapshot: `sha256:${"6".repeat(64)}`,
  },
  custody_manifest_digest: `sha256:${"2".repeat(64)}`,
  coverage_gaps: ["polling_cannot_prove_hard_deletes"],
  error_codes: [],
  repository_writes: 0,
  private_writes: 21,
  network_used: false,
});

const ARGS = Object.freeze({
  source_ref: "source.buzz",
  expected_lane_id: "hpp-buzz-collect",
  expected_relay_key: "relay-main",
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
  return adaptAcceptedBuzzCaptureToLaneRecord(args);
}

function operationalBuzzSnapshot() {
  const rows = seedRows()
    .filter((row) => row.logical_path_id === "source.buzz")
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
  assert.equal(rows.length, 1);
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

test("an accepted Buzz run receipt emits one refs-only capture generation", () => {
  const record = adapt();
  assert.deepEqual(record, {
    record_kind: "capture_generation",
    source_ref: "source.buzz",
    generation_seq: 7,
    capture_ref: `receipt.buzz.run.${ARGS.run_receipt_digest.slice(7)}`,
    manifest_ref: `receipt.buzz.custody.${"2".repeat(64)}`,
    // Events, tombstones and the audit bundle count; the rolled-up per-run
    // relay snapshot does not.
    item_count: 22,
    content_digest: RECEIPT.custody_manifest_digest,
    captured_at: RECEIPT.completed_at,
    immutable: true,
  });
  assert.equal(Object.isFrozen(record), true);
  for (const invented of [
    "backup_generation_ref", "restore_test_ref", "human_acceptance_state",
    "retention_policy_ref", "rpo_policy_ref", "payload", "body",
  ]) assert.equal(invented in record, false, invented);
});

test("capture-only Buzz evidence renders degraded and never healthy", () => {
  const assembled = assembleSourceLaneEvidence({
    source_ref: "source.buzz",
    records: [adapt()],
    binding_state: "bound",
    evaluation_time: "2026-09-01T02:05:00.000Z",
    freshness_horizon_seconds: 3600,
  });
  assert.equal(assembled.status, "assembled");
  assert.equal(assembled.evidence.freshness_state, "fresh");
  // Collection is not backup: the lane can never claim a backup generation or
  // a restore test from a capture receipt alone.
  assert.equal(assembled.evidence.backup_generation_ref, undefined);
  assert.equal(assembled.evidence.restore_test_ref, undefined);
  const map = buildStorageMap({
    registry_snapshot: operationalBuzzSnapshot(),
    evidence: { "source.buzz": assembled.evidence },
  });
  assert.equal(map.rows[0].watch_state, "degraded");
  assert.notEqual(map.rows[0].watch_state, "healthy");
});

test("source, lane, relay and generation scopes are exact", () => {
  assert.throws(() => adapt({ source_ref: "source.linear" }), /foreign_buzz_source/u);
  assert.throws(() => adapt({ expected_lane_id: "other-lane" }), /foreign_buzz_lane/u);
  assert.throws(() => adapt({ expected_relay_key: "relay-other" }), /foreign_buzz_relay/u);
  assert.throws(() => adapt({ generation_seq: 8 }), /buzz_capture_generation_seq_mismatch/u);
  assert.throws(() => adapt({ generation_seq: 0 }), /buzz_capture_generation_seq_invalid/u);
  assert.throws(() => adapt({ expected_relay_key: "Relay Main" }), /buzz_expected_scope_invalid/u);
});

test("error, preflight, forged-digest, stale, future and body-bearing receipts reject with fixed codes", () => {
  assert.throws(
    () => adapt({ run_receipt: { ...RECEIPT, status: "error", error_codes: ["relay_liveness_unavailable"] } }),
    /buzz_run_receipt_not_accepted/u,
  );
  assert.throws(() => adapt({ run_receipt: { ...RECEIPT, mode: "preflight" } }), /buzz_run_receipt_not_accepted/u);
  assert.throws(() => adapt({ run_receipt_digest: `sha256:${"f".repeat(64)}` }), /buzz_run_receipt_digest_mismatch/u);
  assert.throws(() => adapt({ run_receipt_digest: "not-a-digest" }), /buzz_run_receipt_digest_invalid/u);
  assert.throws(() => adapt({ evaluation_time: "2026-09-01T04:00:00.000Z" }), /buzz_capture_receipt_stale/u);
  assert.throws(() => adapt({ evaluation_time: "2026-09-01T01:59:00.000Z" }), /buzz_capture_receipt_clock_in_future/u);
  // A receipt that carried relay bytes, an event pubkey, or a host path is not
  // a receipt this adapter will accept.
  assert.throws(
    () => adapt({ run_receipt: { ...RECEIPT, event_content: "leaked relay message" } }),
    /buzz_run_receipt_not_accepted/u,
  );
  assert.throws(
    () => adapt({ run_receipt: { ...RECEIPT, actor_pubkey: "aa".repeat(32) } }),
    /buzz_run_receipt_not_accepted/u,
  );
  assert.throws(
    () => adapt({ run_receipt: { ...RECEIPT, coverage_gaps: [["C:", "private"].join("\\")] } }),
    /buzz_run_receipt_not_accepted/u,
  );
  assert.throws(
    () => adapt({ run_receipt: { ...RECEIPT, repository_writes: 1 } }),
    /buzz_run_receipt_not_accepted/u,
  );
  // The relay is reached over loopback through a local process; a receipt
  // claiming network use is not this lane's.
  assert.throws(
    () => adapt({ run_receipt: { ...RECEIPT, network_used: true } }),
    /buzz_run_receipt_not_accepted/u,
  );
});

test("caller-owned hostile values never echo in errors", () => {
  const privatePath = ["D:", "private", "buzz"].join("\\");
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
