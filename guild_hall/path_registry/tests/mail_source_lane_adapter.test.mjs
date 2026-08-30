import assert from "node:assert/strict";
import { test } from "node:test";

import { sha256Canonical } from "../../shared/project_history_envelope.mjs";
import { seedRows } from "../data/registry_seed_v0.mjs";
import { createPathRegistry, registrySnapshot } from "../src/path_registry_core.mjs";
import { adaptAcceptedMailCaptureToLaneRecord } from "../src/mail_source_lane_adapter.mjs";
import { assembleSourceLaneEvidence } from "../src/source_lane_index.mjs";
import { buildStorageMap } from "../src/storage_map_projection.mjs";

const CAPTURE = Object.freeze({
  schema_version: "soulforge.ingress.continuous_run_receipt.v2",
  run_id: "20260831T010000Z_hpp-main_00000042",
  status: "ok",
  node_id: "hpp-main",
  lease_epoch: 42,
  writer_authority_epoch: 9,
  writer_authority_digest: "1".repeat(64),
  writer_authority_node_id: "hpp-main",
  writer_authority_mode: "primary",
  started_at: "2026-08-31T01:00:00Z",
  completed_at: "2026-08-31T01:01:00Z",
  mail: {
    schema_version: "soulforge.ingress.mail_bridge_result.v1",
    status: "ok",
    spawned: true,
    exit_code: 0,
    partial: false,
    write_count_known: true,
    mailboxes_total: 2,
    mailboxes_enabled: 2,
    mailboxes_run: 2,
    mailboxes_skipped: 0,
    total_events: 13,
    total_new_events: 3,
    total_duplicates: 10,
    credential_files_checked: 2,
    error_codes: [],
  },
  voice: { status: "disabled" },
  queues: [],
  errors: [],
  writes_performed: 3,
  writes_performed_lower_bound: 3,
  writes_performed_exact: true,
  source_deleted: false,
  source_overwritten: false,
  erp_written: false,
  mcp_written: false,
  project_promoted: false,
  mail_fetched: true,
  continuous_scheduler_enabled: true,
});

const STORE = Object.freeze({
  schema_version: "soulforge.ingress.store_validity.v1",
  lane: "store_mail_events",
  validation_scope: "mail_event_tail_set_validity",
  status: "ok",
  attempted_at: "2026-08-31T01:00:00Z",
  completed_at: "2026-08-31T01:01:00Z",
  last_success_at: "2026-08-31T01:01:00Z",
  error_codes: [],
  activity_changed: true,
  validation_digest: "2".repeat(64),
  validated_count: 6,
});

const ARGS = Object.freeze({
  source_ref: "source.mail",
  project_scope_ref: "scope.company_mail",
  expected_project_scope_ref: "scope.company_mail",
  generation_seq: 42,
  capture_receipt: CAPTURE,
  capture_receipt_digest: sha256Canonical(CAPTURE),
  store_receipt: STORE,
  store_receipt_digest: sha256Canonical(STORE),
  evaluation_time: "2026-08-31T01:10:00Z",
  max_receipt_age_seconds: 3600,
});

function adapt(overrides = {}) {
  const args = { ...ARGS, ...overrides };
  if (overrides.capture_receipt !== undefined
      && overrides.capture_receipt_digest === undefined) {
    args.capture_receipt_digest = sha256Canonical(overrides.capture_receipt);
  }
  if (overrides.store_receipt !== undefined
      && overrides.store_receipt_digest === undefined) {
    args.store_receipt_digest = sha256Canonical(overrides.store_receipt);
  }
  return adaptAcceptedMailCaptureToLaneRecord(args);
}

function operationalMailSnapshot() {
  const rows = seedRows()
    .filter((row) => row.logical_path_id === "source.mail")
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

test("accepted mail capture and matching store receipt adapt to one refs-only generation", () => {
  const record = adapt();
  assert.deepEqual(record, {
    record_kind: "capture_generation",
    source_ref: "source.mail",
    generation_seq: 42,
    capture_ref: `receipt.mail.capture.${ARGS.capture_receipt_digest.slice(7)}`,
    manifest_ref: `receipt.mail.store.${ARGS.store_receipt_digest.slice(7)}`,
    item_count: 6,
    content_digest: `sha256:${"2".repeat(64)}`,
    captured_at: "2026-08-31T01:01:00Z",
    immutable: true,
  });
  assert.equal(Object.isFrozen(record), true);
  for (const invented of [
    "backup_generation_ref", "restore_test_ref", "human_acceptance_state",
    "retention_policy_ref", "rpo_policy_ref", "payload", "body",
  ]) assert.equal(invented in record, false, invented);
});

test("capture-only adapter evidence is degraded, never healthy", () => {
  const record = adapt();
  const assembled = assembleSourceLaneEvidence({
    source_ref: "source.mail",
    records: [record],
    binding_state: "bound",
    evaluation_time: "2026-08-31T01:10:00Z",
    freshness_horizon_seconds: 3600,
  });
  assert.equal(assembled.status, "assembled");
  assert.equal(assembled.evidence.backup_generation_ref, undefined);
  assert.equal(assembled.evidence.restore_test_ref, undefined);
  assert.equal(assembled.evidence.human_acceptance_state, undefined);

  const map = buildStorageMap({
    registry_snapshot: operationalMailSnapshot(),
    evidence: { "source.mail": assembled.evidence },
  });
  assert.equal(map.rows[0].watch_state, "degraded");
  assert.notEqual(map.rows[0].watch_state, "healthy");
});

test("raw bodies, paths, secret-like fields, and unknown top-level fields reject", () => {
  assert.throws(
    () => adapt({ capture_receipt: { ...CAPTURE, mail_body: "raw message" } }),
    /mail_receipt_forbidden_field/,
  );
  assert.throws(
    () => adapt({ capture_receipt: { ...CAPTURE, voice: { local_path: ["C:", "mail"].join("/") } } }),
    /mail_receipt_forbidden_field|mail_receipt_absolute_path_forbidden/,
  );
  assert.throws(
    () => adapt({ capture_receipt: { ...CAPTURE, secret_ref: "secret.mail" } }),
    /mail_receipt_forbidden_field/,
  );
  assert.throws(
    () => adapt({ capture_receipt: { ...CAPTURE, voice: { rawMessage: "nested raw" } } }),
    /mail_receipt_forbidden_field/,
  );
  assert.throws(
    () => adapt({ capture_receipt: { ...CAPTURE, voice: { accessToken: "not-safe" } } }),
    /mail_receipt_forbidden_field/,
  );
  assert.throws(
    () => adapt({ capture_receipt: { ...CAPTURE, subject: "metadata but not in receipt contract" } }),
    /mail_capture_receipt_unknown_field/,
  );
  assert.throws(
    () => adapt({ store_receipt: { ...STORE, body: "raw" } }),
    /mail_receipt_forbidden_field/,
  );
});

test("caller-owned secret/path key names and source values never echo in errors", () => {
  const pathShapedKey = ["C:", "private", "mail"].join("\\");
  const secretKey = ["secret", "token", "value"].join("_");
  for (const [candidate, expectedCode] of [
    [{ capture_receipt: { ...CAPTURE, [secretKey]: "withheld" } }, "mail_receipt_forbidden_field"],
    [{ capture_receipt: { ...CAPTURE, [pathShapedKey]: "withheld" } }, "mail_capture_receipt_unknown_field"],
    [{ source_ref: ["secret", "mail-private"].join(":") }, "foreign_mail_source"],
    [{ source_ref: ["C:", "private", "mail"].join("/") }, "foreign_mail_source"],
  ]) {
    assert.throws(
      () => adapt(candidate),
      (error) => error?.code === expectedCode
        && error.message === expectedCode
        && !error.message.includes(secretKey)
        && !error.message.includes(pathShapedKey),
    );
  }
});

test("source and project scope are exact and cannot widen", () => {
  assert.throws(() => adapt({ source_ref: "source.slack" }), /foreign_mail_source/);
  assert.throws(
    () => adapt({ project_scope_ref: "project.other" }),
    /foreign_mail_project_scope/,
  );
  assert.throws(
    () => adapt({ project_scope_ref: ["C:", "project"].join("/") }),
    /foreign_mail_project_scope/,
  );
});

test("forged digests and capture/store receipt drift reject", () => {
  assert.throws(
    () => adapt({ capture_receipt_digest: `sha256:${"f".repeat(64)}` }),
    /mail_receipt_digest_mismatch/,
  );
  assert.throws(
    () => adapt({ store_receipt_digest: `sha256:${"f".repeat(64)}` }),
    /mail_receipt_digest_mismatch/,
  );
  assert.throws(
    () => adapt({
      store_receipt: {
        ...STORE,
        attempted_at: "2026-08-31T01:00:01Z",
      },
    }),
    /mail_capture_store_receipt_unbound/,
  );
});

test("stale, future, partial, failed, and inconsistent receipts reject", () => {
  assert.throws(
    () => adapt({ evaluation_time: "2026-08-31T03:00:00Z" }),
    /mail_capture_receipt_stale/,
  );
  assert.throws(
    () => adapt({ evaluation_time: "2026-08-31T00:59:59Z" }),
    /mail_capture_receipt_clock_in_future/,
  );
  assert.throws(
    () => adapt({ capture_receipt: {
      ...CAPTURE,
      mail: { ...CAPTURE.mail, status: "partial", partial: true },
    } }),
    /mail_capture_not_accepted/,
  );
  assert.throws(
    () => adapt({ store_receipt: { ...STORE, status: "error" } }),
    /mail_store_receipt_not_accepted/,
  );
  assert.throws(
    () => adapt({ capture_receipt: {
      ...CAPTURE,
      mail: { ...CAPTURE.mail, total_duplicates: 9 },
    } }),
    /mail_capture_result_inconsistent/,
  );
  assert.throws(
    () => adapt({ store_receipt: { ...STORE, validation_digest: "not-a-digest" } }),
    /mail_store_receipt_not_accepted/,
  );
});
