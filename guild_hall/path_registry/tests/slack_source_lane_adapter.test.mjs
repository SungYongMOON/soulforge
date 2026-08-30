import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createSlackCoverageReceipt,
} from "../../slack_history/slack_history.mjs";
import { sha256Canonical } from "../../shared/project_history_envelope.mjs";
import { seedRows } from "../data/registry_seed_v0.mjs";
import { createPathRegistry, registrySnapshot } from "../src/path_registry_core.mjs";
import { adaptAcceptedSlackCaptureToLaneRecord } from "../src/slack_source_lane_adapter.mjs";
import { assembleSourceLaneEvidence } from "../src/source_lane_index.mjs";
import { buildStorageMap } from "../src/storage_map_projection.mjs";

const COVERAGE = Object.freeze(createSlackCoverageReceipt({
  workspace_id: "T00000001",
  channel_id: "C00000001",
  binding_id: "binding:slack:project-01",
  project_code: "P01-001",
  window_start: "2026-08-31T00:00:00.000Z",
  window_end: "2026-08-31T01:00:00.000Z",
  state: "complete_with_events",
  event_count: 2,
  gap_codes: [],
  applicability_ref: null,
  revision_refs: ["slack-rev:0001", "slack-rev:0002"],
}));

const CUSTODY = Object.freeze([
  Object.freeze({
    raw_digest: `sha256:${"1".repeat(64)}`,
    raw_ref: `slack-raw:${"1".repeat(64)}`,
    source_refs: Object.freeze(["slack-event:Ev00000001"]),
  }),
  Object.freeze({
    raw_digest: `sha256:${"2".repeat(64)}`,
    raw_ref: `slack-raw:${"2".repeat(64)}`,
    source_refs: Object.freeze(["slack-event:Ev00000002"]),
  }),
]);

const CURSOR = Object.freeze({
  schema_version: "soulforge.slack_history.cursor.v1",
  workspace_id: "T00000001",
  channel_id: "C00000001",
  binding_id: "binding:slack:project-01",
  window_start: "2026-08-31T00:00:00.000Z",
  window_end: "2026-08-31T01:00:00.000Z",
  sequence: 1,
  provider_cursor_digest: null,
  accepted_pages: Object.freeze([Object.freeze({
    page_id: "page-0001",
    page_digest: `sha256:${"3".repeat(64)}`,
  })]),
  delivery_evidence: Object.freeze([
    Object.freeze({
      event_id: "Ev00000001",
      revision_ref: "slack-rev:0001",
      attempts: Object.freeze([Object.freeze({
        retry_num: 0,
        retry_reason: null,
        received_at: "2026-08-31T00:10:00.000Z",
      })]),
    }),
    Object.freeze({
      event_id: "Ev00000002",
      revision_ref: "slack-rev:0002",
      attempts: Object.freeze([Object.freeze({
        retry_num: 0,
        retry_reason: null,
        received_at: "2026-08-31T00:20:00.000Z",
      })]),
    }),
  ]),
  generation_digest: sha256Canonical(["slack-rev:0001", "slack-rev:0002"]),
});

const ARGS = Object.freeze({
  source_ref: "source.slack",
  project_scope_ref: "project.p01-001",
  expected_project_scope_ref: "project.p01-001",
  expected_project_code: "P01-001",
  expected_workspace_id: "T00000001",
  expected_channel_id: "C00000001",
  expected_binding_id: "binding:slack:project-01",
  generation_seq: 7,
  capture_cursor: CURSOR,
  capture_cursor_digest: sha256Canonical(CURSOR),
  coverage_receipt: COVERAGE,
  coverage_receipt_digest: sha256Canonical(COVERAGE),
  custody_receipts: CUSTODY,
  custody_manifest_digest: sha256Canonical(CUSTODY),
  evaluation_time: "2026-08-31T01:05:00.000Z",
  max_receipt_age_seconds: 3600,
});

function adapt(overrides = {}) {
  const args = { ...ARGS, ...overrides };
  if (overrides.coverage_receipt !== undefined
      && overrides.coverage_receipt_digest === undefined) {
    args.coverage_receipt_digest = sha256Canonical(overrides.coverage_receipt);
  }
  if (overrides.capture_cursor !== undefined
      && overrides.capture_cursor_digest === undefined) {
    args.capture_cursor_digest = sha256Canonical(overrides.capture_cursor);
  }
  if (overrides.custody_receipts !== undefined
      && overrides.custody_manifest_digest === undefined) {
    args.custody_manifest_digest = sha256Canonical(overrides.custody_receipts);
  }
  return adaptAcceptedSlackCaptureToLaneRecord(args);
}

function operationalSlackSnapshot() {
  const rows = seedRows()
    .filter((row) => row.logical_path_id === "source.slack")
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

test("canonical Slack coverage and native custody receipts emit one capture generation", () => {
  const record = adapt();
  const custodyDigest = sha256Canonical(CUSTODY);
  assert.deepEqual(record, {
    record_kind: "capture_generation",
    source_ref: "source.slack",
    generation_seq: 7,
    capture_ref: `receipt.slack.coverage.${ARGS.coverage_receipt_digest.slice(7)}`,
    manifest_ref: `receipt.slack.custody.${custodyDigest.slice(7)}`,
    item_count: 2,
    content_digest: sha256Canonical({
      binding_id: COVERAGE.binding_id,
      channel_id: COVERAGE.channel_id,
      coverage_metadata_digest: COVERAGE.metadata_digest,
      cursor_digest: ARGS.capture_cursor_digest,
      cursor_generation_digest: CURSOR.generation_digest,
      custody_manifest_digest: custodyDigest,
      event_count: COVERAGE.event_count,
      ordered_revision_digest: COVERAGE.ordered_revision_digest,
      project_code: COVERAGE.project_code,
      window_end: COVERAGE.window_end,
      workspace_id: COVERAGE.workspace_id,
    }),
    captured_at: COVERAGE.window_end,
    immutable: true,
  });
  assert.equal(Object.isFrozen(record), true);
  for (const invented of [
    "backup_generation_ref", "restore_test_ref", "human_acceptance_state",
    "retention_policy_ref", "rpo_policy_ref", "payload", "body",
  ]) assert.equal(invented in record, false, invented);
});

test("capture-only Slack evidence renders degraded and never healthy", () => {
  const assembled = assembleSourceLaneEvidence({
    source_ref: "source.slack",
    records: [adapt()],
    binding_state: "bound",
    evaluation_time: "2026-08-31T01:05:00.000Z",
    freshness_horizon_seconds: 3600,
  });
  assert.equal(assembled.status, "assembled");
  assert.equal(assembled.evidence.backup_generation_ref, undefined);
  assert.equal(assembled.evidence.restore_test_ref, undefined);
  assert.equal(assembled.evidence.human_acceptance_state, undefined);

  const map = buildStorageMap({
    registry_snapshot: operationalSlackSnapshot(),
    evidence: { "source.slack": assembled.evidence },
  });
  assert.equal(map.rows[0].watch_state, "degraded");
  assert.notEqual(map.rows[0].watch_state, "healthy");
});

test("a canonical no-events coverage receipt remains an honest zero-item capture", () => {
  const coverage = createSlackCoverageReceipt({
    workspace_id: "T00000001",
    channel_id: "C00000001",
    binding_id: "binding:slack:project-01",
    project_code: "P01-001",
    window_start: "2026-08-31T00:00:00.000Z",
    window_end: "2026-08-31T01:00:00.000Z",
    state: "complete_no_events",
    event_count: 0,
    gap_codes: [],
    applicability_ref: null,
    revision_refs: [],
  });
  const cursor = {
    schema_version: "soulforge.slack_history.cursor.v1",
    workspace_id: COVERAGE.workspace_id,
    channel_id: COVERAGE.channel_id,
    binding_id: COVERAGE.binding_id,
    window_start: COVERAGE.window_start,
    window_end: COVERAGE.window_end,
    sequence: 0,
    provider_cursor_digest: null,
    accepted_pages: [],
    delivery_evidence: [],
    generation_digest: sha256Canonical([]),
  };
  const record = adapt({
    coverage_receipt: coverage,
    capture_cursor: cursor,
    custody_receipts: [],
  });
  assert.equal(record.item_count, 0);
  assert.equal(record.captured_at, coverage.window_end);
});

test("body, path, secret, accessor, and unsupported raw fields fail with fixed errors", () => {
  assert.throws(
    () => adapt({ coverage_receipt: { ...COVERAGE, message_body: "private text" } }),
    (error) => error?.message === "slack_receipt_forbidden_field",
  );
  assert.throws(
    () => adapt({ custody_receipts: [{ ...CUSTODY[0], local_path: ["C:", "private"].join("\\") }, CUSTODY[1]] }),
    (error) => error?.message === "slack_receipt_forbidden_field",
  );
  assert.throws(
    () => adapt({ custody_receipts: [{ ...CUSTODY[0], secret_token: "withheld" }, CUSTODY[1]] }),
    (error) => error?.message === "slack_receipt_forbidden_field",
  );
  assert.throws(
    () => adapt({ custody_receipts: [{ ...CUSTODY[0], raw_body: "private text" }, CUSTODY[1]] }),
    (error) => error?.message === "slack_receipt_forbidden_field",
  );
  assert.throws(
    () => adapt({ custody_receipts: [{
      ...CUSTODY[0],
      source_refs: ["xoxb-1234567890-abcdefghij"],
    }, CUSTODY[1]] }),
    (error) => error?.message === "slack_receipt_secret_value_forbidden",
  );
  const accessor = { ...COVERAGE };
  Object.defineProperty(accessor, "workspace_id", { enumerable: true, get() { return "T00000001"; } });
  assert.throws(
    () => adapt({
      coverage_receipt: accessor,
      coverage_receipt_digest: ARGS.coverage_receipt_digest,
    }),
    (error) => error?.message === "slack_receipt_descriptor_forbidden",
  );
});

test("caller-owned hostile keys and source values never echo in errors", () => {
  const privatePath = ["C:", "private", "slack"].join("\\");
  const secretKey = ["access", "token", "private"].join("_");
  for (const invoke of [
    () => adapt({ source_ref: privatePath }),
    () => adapt({ source_ref: ["secret", "slack-private"].join(":") }),
    () => adapt({ custody_receipts: [{ ...CUSTODY[0], [secretKey]: "withheld" }, CUSTODY[1]] }),
    () => adapt({ custody_receipts: [{ ...CUSTODY[0], [privatePath]: "withheld" }, CUSTODY[1]] }),
  ]) {
    assert.throws(invoke, (error) => typeof error?.code === "string"
      && error.message === error.code
      && !error.message.includes(privatePath)
      && !error.message.includes(secretKey)
      && !error.message.includes("slack-private"));
  }
});

test("source, project, workspace, channel, and binding scopes are exact", () => {
  for (const overrides of [
    { source_ref: "source.mail" },
    { project_scope_ref: "project.other" },
    { expected_project_code: "P99-999" },
    { expected_workspace_id: "T99999999" },
    { expected_channel_id: "C99999999" },
    { expected_binding_id: "binding:slack:other" },
  ]) assert.throws(() => adapt(overrides), /foreign_slack/);
});

test("forged digests, malformed refs, count drift, duplicates, and noncanonical custody reject", () => {
  assert.throws(
    () => adapt({ coverage_receipt_digest: `sha256:${"f".repeat(64)}` }),
    /slack_coverage_receipt_digest_mismatch/,
  );
  assert.throws(
    () => adapt({ capture_cursor_digest: `sha256:${"f".repeat(64)}` }),
    /slack_capture_cursor_digest_mismatch/,
  );
  assert.throws(
    () => adapt({ custody_manifest_digest: `sha256:${"f".repeat(64)}` }),
    /slack_custody_manifest_digest_mismatch/,
  );
  assert.throws(
    () => adapt({ custody_receipts: [CUSTODY[0]] }),
    /slack_custody_count_mismatch/,
  );
  assert.throws(
    () => adapt({ custody_receipts: [CUSTODY[0], CUSTODY[0]] }),
    /slack_custody_receipt_duplicate/,
  );
  assert.throws(
    () => adapt({ custody_receipts: [...CUSTODY].reverse() }),
    /slack_custody_manifest_not_canonical/,
  );
  assert.throws(
    () => adapt({ custody_receipts: [{
      ...CUSTODY[0], raw_ref: `slack-raw:${"9".repeat(64)}`,
    }, CUSTODY[1]] }),
    /slack_custody_receipt_not_accepted/,
  );
  assert.throws(
    () => adapt({ custody_receipts: [{
      ...CUSTODY[0], source_refs: ["slack-event:Ev99999999"],
    }, CUSTODY[1]] }),
    /slack_custody_delivery_binding_invalid/,
  );
  assert.throws(
    () => adapt({ capture_cursor: {
      ...CURSOR,
      delivery_evidence: CURSOR.delivery_evidence.map((evidence, index) => (
        index === 0 ? { ...evidence, revision_ref: "slack-rev:9999" } : evidence
      )),
      generation_digest: sha256Canonical(["slack-rev:0002", "slack-rev:9999"]),
    } }),
    /slack_capture_cursor_coverage_unbound/,
  );
});

test("each native custody receipt must bind exactly one accepted Slack event", () => {
  const uneven = [
    { ...CUSTODY[0], source_refs: ["slack-event:Ev00000001", "slack-event:Ev00000002"] },
    { ...CUSTODY[1], source_refs: [] },
  ];
  assert.throws(
    () => adapt({ custody_receipts: uneven }),
    /slack_custody_delivery_binding_invalid/,
  );
});

test("stale, future, partial, failed, and noncanonical coverage receipts reject", () => {
  assert.throws(
    () => adapt({ evaluation_time: "2026-08-31T03:00:00.000Z" }),
    /slack_capture_receipt_stale/,
  );
  assert.throws(
    () => adapt({ evaluation_time: "2026-08-31T00:59:59.000Z" }),
    /slack_capture_receipt_clock_in_future/,
  );
  for (const [state, eventCount, gapCodes, revisionRefs] of [
    ["partial", 2, ["history_gap"], COVERAGE.revision_refs],
    ["failed", null, ["provider_failed"], []],
  ]) {
    const coverage = createSlackCoverageReceipt({
      workspace_id: COVERAGE.workspace_id,
      channel_id: COVERAGE.channel_id,
      binding_id: COVERAGE.binding_id,
      project_code: COVERAGE.project_code,
      window_start: COVERAGE.window_start,
      window_end: COVERAGE.window_end,
      state,
      event_count: eventCount,
      gap_codes: gapCodes,
      applicability_ref: null,
      revision_refs: revisionRefs,
    });
    assert.throws(
      () => adapt({ coverage_receipt: coverage }),
      /slack_coverage_receipt_not_accepted/,
    );
  }
  assert.throws(
    () => adapt({ coverage_receipt: { ...COVERAGE, raw_payload_copied: true } }),
    /slack_coverage_receipt_not_accepted/,
  );
});
