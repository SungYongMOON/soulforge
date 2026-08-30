import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { linearLb1AttachmentAllowlistContentId } from "./linear_lb1_actual_reader.mjs";
import {
  LINEAR_LB1_CODEX_READ_CAPABILITIES,
  LINEAR_LB1_CONNECTOR_EFFECT_SCHEMA_VERSION,
  LINEAR_LB1_PHYSICAL_CAPTURE_SCHEMA_VERSION,
  LINEAR_LB1_PHYSICAL_CONFIG_SCHEMA_VERSION,
  LinearLb1PhysicalError,
  beginLinearLb1PhysicalSession,
  linearLb1ClaimStoreContentId,
  linearLb1ConnectorBindingContentId,
  linearLb1ConnectorCapabilitySetSha256,
  linearLb1GenerationTargetContentId,
  linearLb1PhysicalBindingContentId,
  linearLb1PhysicalPageBundleSha256,
} from "./linear_lb1_physical_one_shot.mjs";
import { LINEAR_LB1_V2_DIMENSIONS } from "./linear_lb1_v2.mjs";
import {
  LINEAR_LB1_OWNER_GATE_V2_PACKET_SCHEMA_VERSION,
  evaluateLinearLb1OwnerGateV2,
} from "./linear_lb1_owner_gate_v2.mjs";

const NOW = "2026-08-31T01:00:00.000Z";
const CUTOFF = "2026-08-31T00:59:00.000Z";

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function digest(value) { return `sha256:${createHash("sha256").update(stable(value), "utf8").digest("hex")}`; }
function textDigest(value) { return createHash("sha256").update(value, "utf8").digest("hex"); }
function ref(seed, contentId = null) {
  const h = textDigest(seed);
  return {
    entity_id: `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`,
    revision_id: `${h.slice(32, 40)}-${h.slice(40, 44)}-4${h.slice(45, 48)}-9${h.slice(49, 52)}-${h.slice(52, 64)}`,
    content_id: contentId ?? `sha256:${h}`,
    content_hash_alg: "sha256",
  };
}

function page(workspaceRef) {
  const description = ["password: source-body", ["C:", "private", "note.txt"].join("\\")].join("\n");
  return {
    schema_version: "soulforge.backup_controller.linear_lb1.actual_provider_page.v0",
    workspace_id: workspaceRef.entity_id,
    cutoff_at: CUTOFF,
    cursor: null,
    next_cursor: null,
    has_more: false,
    catalog: {
      teams: [{ id: "team-1", name: "Engineering", key: "ENG", updated_at: CUTOFF }],
      projects: [],
      users: [{ id: "user-1", name: "Owner", email: "owner@example.invalid", updated_at: CUTOFF }],
      statuses: [{ id: "status-1", name: "Todo", type: "unstarted", team_id: "team-1" }],
      labels: [],
    },
    coverage: {
      deletion_tombstones: "missing",
      description_revisions: "current_only",
      comment_revisions: "current_only",
      state_history: "missing",
      assignee_history: "missing",
      project_history: "missing",
      due_history: "missing",
      waiting_info: "missing",
      completion_record: "missing",
      approved_attachments: "missing",
    },
    issues: [{
      id: "issue-1", identifier: "ENG-1", title: "Physical one-shot", priority: 3,
      team_id: "team-1", project_id: null, assignee_id: "user-1", status_id: "status-1",
      parent_id: null, label_ids: [], created_at: CUTOFF, updated_at: CUTOFF,
      started_at: null, completed_at: null, canceled_at: null, archived_at: null,
      due_at: null, deletion: null, relations: [],
      description: {
        revision_id: "description-1", body: description, content_sha256: textDigest(description),
        updated_at: CUTOFF, author_id: "user-1", deletion: null,
      },
      comments: [], state_history: [], assignee_history: [], project_history: [], due_history: [],
      waiting_info: [], completion_records: [], evidence_refs: [], attachments: [],
    }],
  };
}

function buildPacket({ workspaceRef, credentialRef, readerRef, storageRef, claimRef, tokenRef, policyRef, targetRef, authorityRef }) {
  return {
    schema_version: LINEAR_LB1_OWNER_GATE_V2_PACKET_SCHEMA_VERSION,
    feature_state: "off",
    owner_decision: {
      state: "approved", decision_ref: ref("physical-owner-decision"),
      approved_at_utc: "2026-08-31T00:00:00.000Z", expires_at_utc: "2026-09-01T00:00:00.000Z",
    },
    writer_identity: { writer_id: "physical-test-writer", hostname: "test-host", platform: process.platform, epoch: 1 },
    source: {
      provider: "linear", scope_mode: "entire_workspace", workspace_ref: workspaceRef,
      team_ids: [], project_ids: [], credential_ref: credentialRef, credential_scope: "read_only",
      dimensions: [...LINEAR_LB1_V2_DIMENSIONS],
    },
    target: {
      kind: "private_data_root_generation", target_ref: targetRef,
      display_label: "Private Linear generation root", storage_write_authority_ref: authorityRef,
      create_only: true, overwrite_allowed: false, public_share_allowed: false,
    },
    claim_store: { claim_store_ref: claimRef, single_use_token_ref: tokenRef },
    adapters: {
      linear_reader_adapter_ref: readerRef, storage_adapter_ref: storageRef,
      attachment_policy_ref: policyRef, attachment_allowlist_sha256: policyRef.content_id,
    },
    artifact_layout: {
      snapshot_schema_version: "soulforge.backup_controller.linear_lb1.snapshot.v2",
      manifest_schema_version: "soulforge.backup_controller.linear_lb1.manifest.v2",
      revision_schema_version: "soulforge.backup_controller.linear_lb1.revision.v2",
      layout_kind: "canonical_sealed_envelope_v2",
    },
    resource_limits: { max_issues: 1000, max_total_bytes: 10_000_000, max_runtime_ms: 600_000 },
    retention: { daily_generations: 30, monthly_generations: 12, rpo_hours: 24 },
    failure_policy: {
      partial_result: "HOLD", retry_policy: "fresh_owner_gate_required",
      target_cleanup_allowed: false, source_mutation_allowed: false,
    },
    restore_acceptance: {
      human_reviewer_ref: ref("physical-human-reviewer"), required_dimensions: [...LINEAR_LB1_V2_DIMENSIONS],
      restore_check_required: true, tabular_only_accepted: false,
    },
    capture_consistency: {
      mode: "owner_accepted_non_quiesced", decision_ref: ref("physical-nonquiesced-decision"),
      cutoff_required: true, cursor_ledger_required: true, drift_policy: "partial_hold_on_incompatible_drift",
    },
    one_shot: {
      run_limit: 1, writer_kind: "append_only_revision", linear_mutation: false,
      webhook_registration: false, scheduler_activation: false,
    },
  };
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "linear-physical-"));
  const controlRoot = join(root, "control", "backup-controller");
  const dataRoot = join(root, "data");
  const recoveryParent = join(root, "recovery");
  const recoveryRoot = join(recoveryParent, "backup-controller");
  await mkdir(controlRoot, { recursive: true });
  await mkdir(dataRoot, { recursive: true });
  await mkdir(recoveryRoot, { recursive: true });
  const workspaceRef = ref("physical-workspace");
  const credentialRef = ref("physical-credential-binding");
  const readerRef = ref("physical-reader");
  const claimRoot = join(controlRoot, "linear-claims");
  const generationRoot = join(dataRoot, "60_BACKUP_GENERATIONS", "linear");
  const writerIdentities = ["physical-test-writer"];
  const limits = { max_pages: 10, max_issues: 1000, max_total_bytes: 10_000_000, max_runtime_ms: 600_000 };
  const claimRef = ref("physical-claim-store", linearLb1ClaimStoreContentId(controlRoot, claimRoot, writerIdentities));
  const physicalBindingContentId = linearLb1PhysicalBindingContentId({
    control_root: controlRoot, claim_root: claimRoot, data_root: dataRoot, generation_root: generationRoot,
    approved_recovery_parent: recoveryParent, recovery_root: recoveryRoot,
    writer_identities: writerIdentities, reader_resource_limits: limits,
  });
  const storageRef = ref("physical-storage", physicalBindingContentId);
  const tokenRef = ref("physical-single-use-token");
  const policyRef = ref("physical-empty-attachment-policy", linearLb1AttachmentAllowlistContentId([]));
  const connectorBindingRef = ref("physical-connector-binding", linearLb1ConnectorBindingContentId(workspaceRef));
  const targetRef = ref("physical-generation-target", linearLb1GenerationTargetContentId(dataRoot, generationRoot));
  const authorityRef = ref("physical-storage-authority", physicalBindingContentId);
  const packet = buildPacket({
    workspaceRef, credentialRef, readerRef, storageRef, claimRef, tokenRef, policyRef, targetRef, authorityRef,
  });
  const packetSha256 = evaluateLinearLb1OwnerGateV2(packet, null).receipt.packet_sha256;
  const pin = {
    schema_version: "soulforge.backup_controller.linear_lb1.owner_gate_pin.v2",
    gate_ref: ref("physical-owner-pin", packetSha256), expected_packet_sha256: packetSha256,
    valid_at: "2026-08-31T00:00:00.000Z", known_at: "2026-08-31T00:00:01.000Z",
    expires_at: "2026-09-01T00:00:00.000Z",
  };
  return {
    root,
    config: {
      schema_version: LINEAR_LB1_PHYSICAL_CONFIG_SCHEMA_VERSION,
      owner_packet: packet, trusted_pin: pin, run_key: "linear-physical-run-001",
      control_root: controlRoot, claim_root: claimRoot,
      data_root: dataRoot, generation_root: generationRoot,
      approved_recovery_parent: recoveryParent, recovery_root: recoveryRoot,
      writer_identities: writerIdentities, claim_store_ref: claimRef,
      single_use_token_ref: tokenRef, storage_adapter_ref: storageRef,
      connector_binding_ref: connectorBindingRef,
      reader_binding: {
        adapter_ref: readerRef, workspace_ref: workspaceRef, credential_ref: credentialRef,
        attachment_policy_ref: policyRef, approved_attachment_ids: [],
        resource_limits: limits,
      },
    },
  };
}

function captureInput(config, readyReceipt, { errorCallIndex = null } = {}) {
  const pages = [page(config.reader_binding.workspace_ref)];
  const callLedger = LINEAR_LB1_CODEX_READ_CAPABILITIES.map((capability, index) => ({
    sequence: index + 1, capability, input_sha256: digest({ capability }),
    output_sha256: digest({ capability, observed: true }), is_error: false,
  }));
  if (errorCallIndex !== null) {
    const capability = LINEAR_LB1_CODEX_READ_CAPABILITIES[errorCallIndex];
    callLedger.push({
      sequence: callLedger.length + 1, capability, input_sha256: digest({ capability, retry: true }),
      output_sha256: digest({ capability, observed_error: true }), is_error: true,
    });
  }
  const counts = Object.fromEntries(LINEAR_LB1_CODEX_READ_CAPABILITIES.map((name) => [
    name, callLedger.filter((row) => row.capability === name).length,
  ]));
  return {
    schema_version: LINEAR_LB1_PHYSICAL_CAPTURE_SCHEMA_VERSION,
    pages,
    effect_receipt: {
      schema_version: LINEAR_LB1_CONNECTOR_EFFECT_SCHEMA_VERSION,
      binding_ref: config.connector_binding_ref, workspace_ref: config.reader_binding.workspace_ref,
      claim_receipt_ref: readyReceipt.claim_receipt_ref, session_ref: readyReceipt.session_ref,
      evidence_state: "CALLER_OBSERVED_SESSION_BOUND", producer_kind: "codex_runtime_tool_orchestrator",
      capability_set_sha256: linearLb1ConnectorCapabilitySetSha256(), capability_counts: counts,
      network_calls: callLedger.length, linear_mutations: 0, call_ledger: callLedger,
      call_ledger_sha256: digest({
        schema_version: "soulforge.backup_controller.linear_lb1.connector_call_ledger.v0", calls: callLedger,
      }),
      page_bundle_sha256: linearLb1PhysicalPageBundleSha256(pages),
      started_at: NOW, ended_at: NOW, body_free: true,
    },
  };
}

test("physical Linear one-shot exposes a closed read-only connector capability set", () => {
  assert.equal(LINEAR_LB1_CODEX_READ_CAPABILITIES.length, 10);
  assert.equal(LINEAR_LB1_CODEX_READ_CAPABILITIES.some((name) => /create|update|delete|save|write|mutate/u.test(name)), false);
});

test("durable claim precedes a create-only generation, exact-byte readback, and isolated partial restore", async (t) => {
  const { root, config } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const clock = { nowIso: () => NOW, nowMs: () => Date.parse(NOW) };
  const session = await beginLinearLb1PhysicalSession(JSON.parse(JSON.stringify(config)), { clock, aclProbe: async () => true });
  assert.equal(session.ready_receipt.status, "CLAIM_READY");
  const result = await session.complete(captureInput(config, session.ready_receipt));
  assert.equal(result.status, "PARTIAL_TECHNICAL_RESTORE_CANDIDATE");
  assert.equal(result.generation.exact_byte_readback, true);
  assert.equal(result.generation.overwrite_allowed, false);
  assert.equal(result.restore.exact_byte_readback, true);
  assert.equal(result.restore.human_acceptance, false);
  assert.equal(result.connector_effects.linear_mutations_observed, 0);
  assert.equal(result.connector_effects.evidence_state, "CALLER_OBSERVED_SESSION_BOUND");
  const publicResult = JSON.stringify(result);
  assert.equal(publicResult.includes(config.control_root), false);
  assert.equal(publicResult.includes(config.data_root), false);
  assert.equal(publicResult.includes(config.recovery_root), false);
  assert.equal(publicResult.includes(config.single_use_token_ref.content_id), false);
  assert.equal(publicResult.includes("password: source-body"), false);
  const stored = await readFile(join(config.generation_root, config.run_key, "run.json"));
  const restored = await readFile(join(config.recovery_root, config.run_key, "run.json"));
  assert.deepEqual(restored, stored);
  assert.equal(existsSync(join(config.claim_root, `${config.single_use_token_ref.content_id.slice(7)}.claim.json`)), true);
  await assert.rejects(
    () => beginLinearLb1PhysicalSession(JSON.parse(JSON.stringify(config)), { clock, aclProbe: async () => true }),
    (error) => error instanceof LinearLb1PhysicalError && error.code === "linear_lb1_physical_recovery_root_not_empty",
  );
});

test("path scope rejects alternate streams and recovery escape before filesystem effects", async (t) => {
  const { root, config } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const ads = JSON.parse(JSON.stringify(config));
  ads.claim_root = `${ads.control_root}:claim-stream`;
  await assert.rejects(
    () => beginLinearLb1PhysicalSession(ads, {
      clock: { nowIso: () => NOW, nowMs: () => Date.parse(NOW) }, aclProbe: async () => true,
    }),
    (error) => error instanceof LinearLb1PhysicalError && error.code === "linear_lb1_physical_claim_root_invalid",
  );
  const escaped = JSON.parse(JSON.stringify(config));
  escaped.recovery_root = join(root, "foreign-recovery");
  await mkdir(escaped.recovery_root);
  await assert.rejects(
    () => beginLinearLb1PhysicalSession(escaped, {
      clock: { nowIso: () => NOW, nowMs: () => Date.parse(NOW) }, aclProbe: async () => true,
    }),
    (error) => error instanceof LinearLb1PhysicalError && error.code === "linear_lb1_physical_path_scope_invalid",
  );
  assert.equal(existsSync(config.claim_root), false);
  assert.equal(existsSync(config.generation_root), false);
});

test("pairwise isolation and forward-slash UNC inputs are rejected before effects", async (t) => {
  const { root, config } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const overlap = JSON.parse(JSON.stringify(config));
  overlap.approved_recovery_parent = overlap.control_root;
  overlap.recovery_root = overlap.claim_root;
  await assert.rejects(
    () => beginLinearLb1PhysicalSession(overlap, {
      clock: { nowIso: () => NOW, nowMs: () => Date.parse(NOW) }, aclProbe: async () => true,
    }),
    (error) => error instanceof LinearLb1PhysicalError && error.code === "linear_lb1_physical_path_scope_invalid",
  );
  if (process.platform === "win32") {
    const unc = JSON.parse(JSON.stringify(config));
    unc.control_root = "//server/share/control";
    await assert.rejects(
      () => beginLinearLb1PhysicalSession(unc, {
        clock: { nowIso: () => NOW, nowMs: () => Date.parse(NOW) }, aclProbe: async () => true,
      }),
      (error) => error instanceof LinearLb1PhysicalError && error.code === "linear_lb1_physical_control_root_invalid",
    );
  }
});

test("Owner-bound physical roots and finite reader limits cannot drift", async (t) => {
  const { root, config } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const badLimits = JSON.parse(JSON.stringify(config));
  badLimits.reader_binding.resource_limits = {};
  await assert.rejects(
    () => beginLinearLb1PhysicalSession(badLimits, {
      clock: { nowIso: () => NOW, nowMs: () => Date.parse(NOW) }, aclProbe: async () => true,
    }),
    (error) => error instanceof LinearLb1PhysicalError && error.code === "linear_lb1_physical_resource_limits_invalid",
  );
  const otherData = join(root, "other-data");
  await mkdir(otherData);
  const drifted = JSON.parse(JSON.stringify(config));
  drifted.data_root = otherData;
  drifted.generation_root = join(otherData, "60_BACKUP_GENERATIONS", "linear");
  await assert.rejects(
    () => beginLinearLb1PhysicalSession(drifted, {
      clock: { nowIso: () => NOW, nowMs: () => Date.parse(NOW) }, aclProbe: async () => true,
    }),
    (error) => error instanceof LinearLb1PhysicalError && error.code === "linear_lb1_physical_owner_binding_mismatch",
  );
  assert.equal(existsSync(drifted.generation_root), false);
});

test("broad writer names and well-known SIDs cannot enter the Owner-bound ACL allowlist", async (t) => {
  const { root, config } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const broadIdentity of ["Everyone", "BUILTIN\\Users", "S-1-1-0", "*S-1-1-0", "S-1-5-11", "S-1-5-32-545"]) {
    const candidate = JSON.parse(JSON.stringify(config));
    candidate.writer_identities = [broadIdentity];
    await assert.rejects(
      () => beginLinearLb1PhysicalSession(candidate, {
        clock: { nowIso: () => NOW, nowMs: () => Date.parse(NOW) }, aclProbe: async () => true,
      }),
      (error) => error instanceof LinearLb1PhysicalError && error.code === "linear_lb1_physical_writer_identity_invalid",
    );
  }
});

test("ACL failure holds before claim or generation directories are created", async (t) => {
  const { root, config } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(
    () => beginLinearLb1PhysicalSession(JSON.parse(JSON.stringify(config)), {
      clock: { nowIso: () => NOW, nowMs: () => Date.parse(NOW) },
      aclProbe: async (path) => path !== config.recovery_root,
    }),
    (error) => error instanceof LinearLb1PhysicalError && error.code === "linear_lb1_physical_acl_not_writer_exclusive",
  );
  assert.equal(existsSync(config.claim_root), false);
  assert.equal(existsSync(config.generation_root), false);
});

test("effect receipt rejects mutation evidence before generation", async (t) => {
  const { root, config } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const session = await beginLinearLb1PhysicalSession(JSON.parse(JSON.stringify(config)), {
    clock: { nowIso: () => NOW, nowMs: () => Date.parse(NOW) }, aclProbe: async () => true,
  });
  const capture = captureInput(config, session.ready_receipt);
  capture.effect_receipt.linear_mutations = 1;
  await assert.rejects(
    () => session.complete(capture),
    (error) => error instanceof LinearLb1PhysicalError && error.code === "linear_lb1_physical_effect_receipt_invalid",
  );
  assert.equal(existsSync(join(config.generation_root, config.run_key)), false);
  await assert.rejects(
    () => beginLinearLb1PhysicalSession(JSON.parse(JSON.stringify(config)), {
      clock: { nowIso: () => NOW, nowMs: () => Date.parse(NOW) }, aclProbe: async () => true,
      processProbe: () => false,
    }),
    (error) => error instanceof LinearLb1PhysicalError && error.code === "linear_lb1_physical_claim_reconciliation_required",
  );
});

test("read-only connector errors remain body-free and counted without blocking a later valid page bundle", async (t) => {
  const { root, config } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const session = await beginLinearLb1PhysicalSession(JSON.parse(JSON.stringify(config)), {
    clock: { nowIso: () => NOW, nowMs: () => Date.parse(NOW) }, aclProbe: async () => true,
  });
  const result = await session.complete(captureInput(config, session.ready_receipt, { errorCallIndex: 3 }));
  assert.equal(result.status, "PARTIAL_TECHNICAL_RESTORE_CANDIDATE");
  assert.equal(result.connector_effects.connector_error_calls_observed, 1);
  assert.equal(result.generation.connector_error_calls_observed, 1);
});

test("an error-only read ledger cannot support a valid provider page bundle", async (t) => {
  const { root, config } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const session = await beginLinearLb1PhysicalSession(JSON.parse(JSON.stringify(config)), {
    clock: { nowIso: () => NOW, nowMs: () => Date.parse(NOW) }, aclProbe: async () => true,
  });
  const capture = captureInput(config, session.ready_receipt);
  for (const row of capture.effect_receipt.call_ledger) row.is_error = true;
  capture.effect_receipt.call_ledger_sha256 = digest({
    schema_version: "soulforge.backup_controller.linear_lb1.connector_call_ledger.v0",
    calls: capture.effect_receipt.call_ledger,
  });
  await assert.rejects(
    () => session.complete(capture),
    (error) => error instanceof LinearLb1PhysicalError && error.code === "linear_lb1_physical_effect_receipt_invalid",
  );
});

test("pre-claim effect timestamps are rejected and durably require reconciliation", async (t) => {
  const { root, config } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const session = await beginLinearLb1PhysicalSession(JSON.parse(JSON.stringify(config)), {
    clock: { nowIso: () => NOW, nowMs: () => Date.parse(NOW) }, aclProbe: async () => true,
  });
  const capture = captureInput(config, session.ready_receipt);
  capture.effect_receipt.started_at = "2026-08-30T01:00:00.000Z";
  capture.effect_receipt.ended_at = "2026-08-30T01:01:00.000Z";
  await assert.rejects(
    () => session.complete(capture),
    (error) => error instanceof LinearLb1PhysicalError && error.code === "linear_lb1_physical_effect_receipt_invalid",
  );
  await assert.rejects(
    () => beginLinearLb1PhysicalSession(JSON.parse(JSON.stringify(config)), {
      clock: { nowIso: () => NOW, nowMs: () => Date.parse(NOW) }, aclProbe: async () => true,
      processProbe: () => false,
    }),
    (error) => error instanceof LinearLb1PhysicalError && error.code === "linear_lb1_physical_claim_reconciliation_required",
  );
});

test("a crash after synced claim resumes the exact claim before capture", async (t) => {
  const { root, config } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const runtime = {
    clock: { nowIso: () => NOW, nowMs: () => Date.parse(NOW) },
    aclProbe: async () => true,
    processProbe: () => false,
  };
  await assert.rejects(
    () => beginLinearLb1PhysicalSession(JSON.parse(JSON.stringify(config)), {
      ...runtime, testOnly: true, faultAt: "after_claim_sync",
    }),
    (error) => error instanceof LinearLb1PhysicalError && error.code === "linear_lb1_physical_fault_injected",
  );
  assert.equal(existsSync(join(config.claim_root, `${config.single_use_token_ref.content_id.slice(7)}.claim.json`)), true);
  const resumed = await beginLinearLb1PhysicalSession(JSON.parse(JSON.stringify(config)), runtime);
  assert.equal(resumed.ready_receipt.status, "CLAIM_RESUME_READY");
  assert.equal(resumed.ready_receipt.resumed, true);
  const result = await resumed.complete(captureInput(config, resumed.ready_receipt));
  assert.equal(result.status, "PARTIAL_TECHNICAL_RESTORE_CANDIDATE");
});

test("a live session blocks a second begin on the same durable claim", async (t) => {
  const { root, config } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const runtime = { clock: { nowIso: () => NOW, nowMs: () => Date.parse(NOW) }, aclProbe: async () => true };
  const first = await beginLinearLb1PhysicalSession(JSON.parse(JSON.stringify(config)), runtime);
  assert.equal(first.ready_receipt.status, "CLAIM_READY");
  await assert.rejects(
    () => beginLinearLb1PhysicalSession(JSON.parse(JSON.stringify(config)), runtime),
    (error) => error instanceof LinearLb1PhysicalError && error.code === "linear_lb1_physical_concurrent_session",
  );
});

test("simultaneous begins have exactly one atomic claim/session winner", async () => {
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const { root, config } = await fixture();
    try {
      const runtime = { clock: { nowIso: () => NOW, nowMs: () => Date.parse(NOW) }, aclProbe: async () => true };
      const outcomes = await Promise.allSettled([
        beginLinearLb1PhysicalSession(JSON.parse(JSON.stringify(config)), runtime),
        beginLinearLb1PhysicalSession(JSON.parse(JSON.stringify(config)), runtime),
      ]);
      assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
      const rejected = outcomes.find((outcome) => outcome.status === "rejected");
      assert.equal(rejected.reason instanceof LinearLb1PhysicalError, true);
      assert.equal(rejected.reason.code, "linear_lb1_physical_concurrent_session");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("Owner and trusted-pin expiry are rechecked before capture completion effects", async (t) => {
  const { root, config } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  let current = NOW;
  const clock = { nowIso: () => current, nowMs: () => Date.parse(current) };
  const session = await beginLinearLb1PhysicalSession(JSON.parse(JSON.stringify(config)), {
    clock, aclProbe: async () => true,
  });
  current = "2026-09-01T00:00:00.000Z";
  await assert.rejects(
    () => session.complete(captureInput(config, session.ready_receipt)),
    (error) => error instanceof LinearLb1PhysicalError && error.code === "linear_lb1_physical_owner_gate_expired",
  );
  assert.equal(existsSync(join(config.generation_root, config.run_key)), false);
});
