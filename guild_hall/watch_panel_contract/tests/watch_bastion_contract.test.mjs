import test from "node:test";
import assert from "node:assert/strict";

import {
  ACTION_KINDS,
  PANEL_DOMAINS,
  PANEL_STATES,
  WATCH_PANEL_SCHEMA,
  assertNoWriterSurface,
  buildPanel,
  buildSafePointer,
  createWatchActionRequests,
  findForbiddenPanelFields,
} from "../src/watch_panel_contract.mjs";
import {
  BASTION_ACTION_SCHEMA,
  REFUSALS,
  createBastionActionGate,
  receiptCarriesNoHealthClaim,
} from "../../bastion_action/src/bastion_action_gate.mjs";

const NOW = "2026-08-30T12:00:00Z";
const POINTER = { owner_system: "buzz.relay", record_kind: "channel", record_ref: "channel.aadb2b5e" };

function syntheticExecutor() {
  const calls = [];
  return {
    calls,
    execute: async (packet) => {
      calls.push(packet);
      return { receipt_ref: `bastion.exec:${calls.length}`, executor_ref: "executor.synthetic" };
    },
  };
}

function policyFor(target, actions, extra = {}) {
  return { policy_ref: "policy.ops.v1", allowed_targets: [target], allowed_actions: actions, ...extra };
}

test("panel freshness semantics: missing evidence is unknown, stale evidence degrades, hold survives", () => {
  assert.equal(PANEL_STATES.length, 6);
  assert.equal(PANEL_DOMAINS.includes("backup_restore_readiness"), true);
  const base = { domain: "buzz_stack", freshness_window_seconds: 600, owner_pointer: POINTER, now: NOW };

  const noEvidence = buildPanel({ ...base, asserted_state: "healthy", evidence_at: null });
  assert.deepEqual([noEvidence.state, noEvidence.reason], ["unknown", "no_evidence"]);

  const fresh = buildPanel({ ...base, asserted_state: "healthy", evidence_at: "2026-08-30T11:55:00Z" });
  assert.deepEqual([fresh.state, fresh.reason, fresh.schema], ["healthy", "as_asserted", WATCH_PANEL_SCHEMA]);

  const stale = buildPanel({ ...base, asserted_state: "healthy", evidence_at: "2026-08-30T09:00:00Z" });
  assert.deepEqual([stale.state, stale.reason, stale.asserted_state], ["stale", "freshness_window_exceeded", "healthy"]);
  const staleDegraded = buildPanel({ ...base, asserted_state: "degraded", evidence_at: "2026-08-30T09:00:00Z" });
  assert.deepEqual([staleDegraded.state, staleDegraded.asserted_state], ["stale", "degraded"], "the last asserted state stays visible");

  const heldNoEvidence = buildPanel({ ...base, asserted_state: "hold", evidence_at: null });
  assert.equal(heldNoEvidence.state, "hold");
  const unavailableOld = buildPanel({ ...base, asserted_state: "unavailable", evidence_at: "2026-08-30T09:00:00Z" });
  assert.equal(unavailableOld.state, "unavailable", "worse-than-stale assertions are preserved");

  assert.throws(() => buildPanel({ ...base, asserted_state: "healthy", evidence_at: "2026-08-30T13:00:00Z" }),
    (error) => error.code === "evidence_in_future");
  assert.throws(() => buildPanel({ ...base, domain: "shell_access", asserted_state: "healthy", evidence_at: null }),
    (error) => error.code === "domain_unknown");
});

test("panels and pointers structurally exclude deep-record and secret vocabulary", () => {
  assert.deepEqual(findForbiddenPanelFields({ nested: { raw_message: "x" } }), ["nested.raw_message"]);
  assert.deepEqual(findForbiddenPanelFields({ counts: { runs: 3 } }), []);
  assert.throws(() => buildPanel({
    domain: "hermes_runtime", asserted_state: "unknown", evidence_at: null,
    freshness_window_seconds: 60, owner_pointer: POINTER, now: NOW,
    extra_fields: { last_transcript: "..." },
  }), (error) => error.code === "panel_forbidden_field");
  const pointer = buildSafePointer(POINTER);
  assert.deepEqual(Object.keys(pointer).sort(), ["owner_system", "record_kind", "record_ref"]);
  assert.throws(() => { pointer.record_ref = "tampered"; }, TypeError);
});

test("a Watch surface files requests and provably owns no writer verbs", () => {
  const watch = createWatchActionRequests();
  const request = watch.fileActionRequest({
    request_id: "request.buzz.restart.1", action_kind: "restart",
    target_ref: "service.buzz_relay", policy_ref: "policy.ops.v1",
    requested_by: "human.operator_1", expires_at: "2026-08-30T13:00:00Z",
  });
  assert.equal(request.state, "filed");
  assert.equal(ACTION_KINDS.includes("restore"), true);
  assert.throws(() => watch.fileActionRequest({
    request_id: "request.buzz.restart.1", action_kind: "restart",
    target_ref: "service.buzz_relay", policy_ref: "policy.ops.v1",
    requested_by: "human.operator_1", expires_at: "2026-08-30T13:00:00Z",
  }), (error) => error.code === "request_duplicate");
  assert.deepEqual(assertNoWriterSurface(watch), { ok: true, problems: [] });
  const impostor = { getPanel: () => null, execute_restart: () => null };
  assert.equal(assertNoWriterSurface(impostor).ok, false);
});

test("a filed request executes nothing until Bastion validates approval, policy, target, and expiry", async () => {
  const watch = createWatchActionRequests();
  const executor = syntheticExecutor();
  const gate = createBastionActionGate({ executor });
  const request = watch.fileActionRequest({
    request_id: "request.buzz.restart.1", action_kind: "restart",
    target_ref: "service.buzz_relay", policy_ref: "policy.ops.v1",
    requested_by: "human.operator_1", expires_at: "2026-08-30T13:00:00Z",
  });
  assert.equal(executor.calls.length, 0, "filing alone never executes");

  const missingApproval = await gate.validateAndExecute(request, {
    now: NOW, policy: policyFor("service.buzz_relay", ["restart"]),
  });
  assert.deepEqual([missingApproval.outcome, missingApproval.refusal_code], ["refused", REFUSALS.APPROVAL_MISSING]);
  assert.equal(executor.calls.length, 0);

  // a refusal is terminal for that request id: even a now-valid context replays it
  const replayAfterRefusal = await gate.validateAndExecute(request, {
    now: NOW,
    approval: { approval_ref: "approval.1", authority_ref: "human.ops_lead", request_id: request.request_id },
    policy: policyFor("service.buzz_relay", ["restart"]),
  });
  assert.equal(replayAfterRefusal.replay, true);
  assert.equal(replayAfterRefusal.refusal_code, REFUSALS.APPROVAL_MISSING);
  assert.equal(executor.calls.length, 0);
});

test("wrong approval binding, foreign target, unlisted action, and expiry all refuse without execution", async () => {
  const executor = syntheticExecutor();
  const gate = createBastionActionGate({ executor });
  const base = {
    action_kind: "restart", target_ref: "service.buzz_relay",
    policy_ref: "policy.ops.v1", expires_at: "2026-08-30T13:00:00Z",
  };
  const approvalFor = (id) => ({ approval_ref: "approval.1", authority_ref: "human.ops_lead", request_id: id });

  const wrongApproval = await gate.validateAndExecute({ ...base, request_id: "request.a" }, {
    now: NOW, approval: approvalFor("request.other"), policy: policyFor("service.buzz_relay", ["restart"]),
  });
  assert.equal(wrongApproval.refusal_code, REFUSALS.APPROVAL_MISMATCH);

  const foreignTarget = await gate.validateAndExecute({ ...base, request_id: "request.b", target_ref: "service.other_host" }, {
    now: NOW, approval: approvalFor("request.b"), policy: policyFor("service.buzz_relay", ["restart"]),
  });
  assert.equal(foreignTarget.refusal_code, REFUSALS.TARGET_MISMATCH);

  const unlistedAction = await gate.validateAndExecute({ ...base, request_id: "request.c", action_kind: "isolate" }, {
    now: NOW, approval: approvalFor("request.c"), policy: policyFor("service.buzz_relay", ["restart"]),
  });
  assert.equal(unlistedAction.refusal_code, REFUSALS.POLICY_MISMATCH);

  const expired = await gate.validateAndExecute({ ...base, request_id: "request.d", expires_at: "2026-08-30T11:00:00Z" }, {
    now: NOW, approval: approvalFor("request.d"), policy: policyFor("service.buzz_relay", ["restart"]),
  });
  assert.equal(expired.refusal_code, REFUSALS.EXPIRED);

  const badKind = await gate.validateAndExecute({ ...base, request_id: "request.e", action_kind: "format_disk" }, {
    now: NOW, approval: approvalFor("request.e"), policy: policyFor("service.buzz_relay", ["restart"]),
  });
  assert.equal(badKind.refusal_code, REFUSALS.ACTION_KIND_INVALID);

  assert.equal(executor.calls.length, 0, "no refusal path may reach the executor");
});

test("maintenance lease and backup-generation proof gate restart/restore appropriately", async () => {
  const executor = syntheticExecutor();
  const gate = createBastionActionGate({ executor });
  const approvalFor = (id) => ({ approval_ref: "approval.1", authority_ref: "human.ops_lead", request_id: id });

  const leasePolicy = policyFor("service.buzz_relay", ["restart"], { requires_maintenance_lease: true });
  const noLease = await gate.validateAndExecute({
    request_id: "request.lease", action_kind: "restart", target_ref: "service.buzz_relay",
    policy_ref: "policy.ops.v1", expires_at: "2026-08-30T13:00:00Z",
  }, { now: NOW, approval: approvalFor("request.lease"), policy: leasePolicy });
  assert.equal(noLease.refusal_code, REFUSALS.LEASE_MISSING);

  const restoreNoGeneration = await gate.validateAndExecute({
    request_id: "request.restore.1", action_kind: "restore", target_ref: "store.erp_db",
    policy_ref: "policy.ops.v1", expires_at: "2026-08-30T13:00:00Z",
  }, { now: NOW, approval: approvalFor("request.restore.1"), policy: policyFor("store.erp_db", ["restore"]) });
  assert.equal(restoreNoGeneration.refusal_code, REFUSALS.BACKUP_GENERATION_MISSING);

  const restoreNoProof = await gate.validateAndExecute({
    request_id: "request.restore.2", action_kind: "restore", target_ref: "store.erp_db",
    policy_ref: "policy.ops.v1", expires_at: "2026-08-30T13:00:00Z",
  }, {
    now: NOW, approval: approvalFor("request.restore.2"),
    policy: policyFor("store.erp_db", ["restore"]),
    backup_generation: { generation_ref: "backup.gen:20260829" },
  });
  assert.equal(restoreNoProof.refusal_code, REFUSALS.RESTORE_PROOF_MISSING);

  const restored = await gate.validateAndExecute({
    request_id: "request.restore.3", action_kind: "restore", target_ref: "store.erp_db",
    policy_ref: "policy.ops.v1", expires_at: "2026-08-30T13:00:00Z",
  }, {
    now: NOW, approval: approvalFor("request.restore.3"),
    policy: policyFor("store.erp_db", ["restore"]),
    backup_generation: { generation_ref: "backup.gen:20260829", isolated_restore_proof_ref: "receipt.restore_test:20260829" },
  });
  assert.equal(restored.outcome, "executed");
  assert.equal(executor.calls.length, 1);
  assert.equal(executor.calls[0].backup_generation_ref, "backup.gen:20260829");
});

test("a throwing or malformed executor yields a terminal failed receipt and never re-executes", async () => {
  let calls = 0;
  const gate = createBastionActionGate({ executor: { execute: async () => { calls += 1; throw new Error("boom"); } } });
  const request = {
    request_id: "request.fail.1", action_kind: "restart", target_ref: "service.buzz_relay",
    policy_ref: "policy.ops.v1", expires_at: "2026-08-30T13:00:00Z",
  };
  const context = {
    now: NOW,
    approval: { approval_ref: "approval.1", authority_ref: "human.ops_lead", request_id: "request.fail.1" },
    policy: policyFor("service.buzz_relay", ["restart"]),
  };
  const failed = await gate.validateAndExecute(request, context);
  assert.deepEqual([failed.outcome, failed.refusal_code], ["failed", REFUSALS.EXECUTOR_FAILURE]);
  const replay = await gate.validateAndExecute(request, context);
  assert.equal(replay.replay, true);
  assert.equal(replay.outcome, "failed");
  assert.equal(calls, 1, "the port is never touched twice for one request id");

  const malformed = createBastionActionGate({ executor: { execute: async () => ({ receipt_ref: "BAD REF" }) } });
  const malReceipt = await malformed.validateAndExecute({ ...request, request_id: "request.fail.2" }, {
    ...context, approval: { ...context.approval, request_id: "request.fail.2" },
  });
  assert.deepEqual([malReceipt.outcome, malReceipt.refusal_code], ["failed", REFUSALS.EXECUTOR_FAILURE]);

  const badLease = createBastionActionGate({ executor: { execute: async () => ({}) } });
  await assert.rejects(badLease.validateAndExecute({ ...request, request_id: "request.fail.3" }, {
    ...context, approval: { ...context.approval, request_id: "request.fail.3" },
    policy: policyFor("service.buzz_relay", ["restart"], { requires_maintenance_lease: "true" }),
  }), (error) => error.code === "policy_shape_invalid", "a malformed lease flag is never fail-open");
});

test("receipts are terminal, idempotent, and can never impersonate health evidence", async () => {
  const executor = syntheticExecutor();
  const gate = createBastionActionGate({ executor });
  const request = {
    request_id: "request.exec.1", action_kind: "restart", target_ref: "service.buzz_relay",
    policy_ref: "policy.ops.v1", expires_at: "2026-08-30T13:00:00Z",
  };
  const context = {
    now: NOW,
    approval: { approval_ref: "approval.1", authority_ref: "human.ops_lead", request_id: "request.exec.1" },
    policy: policyFor("service.buzz_relay", ["restart"]),
  };
  const receipt = await gate.validateAndExecute(request, context);
  assert.deepEqual([receipt.outcome, receipt.schema], ["executed", BASTION_ACTION_SCHEMA]);
  const replay = await gate.validateAndExecute(request, context);
  assert.equal(replay.replay, true);
  assert.equal(executor.calls.length, 1, "terminal receipts never re-execute");

  assert.deepEqual(receiptCarriesNoHealthClaim(receipt), { ok: true, offending: [] });
  assert.equal(receiptCarriesNoHealthClaim({ receipt_ref: "r", state: "healthy" }).ok, false);

  // the receipt feeds Watch only as evidence-less metadata: a panel built
  // right after execution still reports unknown until fresh evidence arrives
  const panel = buildPanel({
    domain: "buzz_stack", asserted_state: "healthy", evidence_at: null,
    freshness_window_seconds: 600, owner_pointer: POINTER, now: NOW,
  });
  assert.equal(panel.state, "unknown", "a receipt is not health evidence");
});
