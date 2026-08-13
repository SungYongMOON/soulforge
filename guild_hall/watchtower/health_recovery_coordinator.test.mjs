import assert from "node:assert/strict";
import test from "node:test";

import { HealthRecoveryCoordinator, reconcile } from "./health_recovery_coordinator.mjs";

const checkedAt = "2026-08-13T00:00:00.000Z";
const nextCheck = "2026-08-13T00:05:00.000Z";

test("healthy idle is green without attempting repair", async () => {
  const result = await reconcile({
    mode: "observe",
    nodes: [{
      nodeId: "mail_forwarder",
      owner: "gateway",
      liveness: "alive",
      connection: "connected",
      outcome: "idle",
      backlog: "clear",
      lastCheck: checkedAt,
      nextCheck,
    }],
  });

  assert.equal(result.status, "healthy");
  assert.deepEqual(result.receipts[0], {
    node_id: "mail_forwarder",
    owner: "gateway",
    reason: "healthy_idle",
    last_check: checkedAt,
    next_check: nextCheck,
    dimensions: {
      liveness: "alive",
      connection: "connected",
      outcome: "idle",
      backlog: "clear",
    },
    repairability: "not_needed",
    repair_action: "none",
    attempt: "not_attempted",
    verification: "not_run",
    escalation: "gateway",
  });
});

test("proven stopped task uses an allowlisted executor and independent verifier", async () => {
  const calls = [];
  const coordinator = new HealthRecoveryCoordinator({
    allowlist: ["watchtower_self:restart_owned_task"],
    executor: async (request) => {
      calls.push(["execute", request]);
      return { ok: true, privateDetail: "ignored" };
    },
    verifier: async (request) => {
      calls.push(["verify", request]);
      return true;
    },
  });

  const result = await coordinator.reconcile({
    mode: "safe-repair",
    nodes: [{
      nodeId: "watchtower_self",
      owner: "watchtower_owner",
      escalationOwner: "operations",
      liveness: { status: "stopped" },
      connection: "unknown",
      outcome: "unknown",
      backlog: "unknown",
      repairAction: "restart_owned_task",
      rawCredential: "must-not-reach-dependencies",
    }],
  });

  assert.equal(result.receipts[0].reason, "process_stopped");
  assert.equal(result.receipts[0].attempt, "succeeded");
  assert.equal(result.receipts[0].verification, "passed");
  assert.deepEqual(calls, [
    ["verify", { action: "restart_owned_task", nodeId: "watchtower_self" }],
    ["execute", { action: "restart_owned_task", nodeId: "watchtower_self" }],
    ["verify", { action: "restart_owned_task", nodeId: "watchtower_self" }],
  ]);
});

test("forbidden repair stays denied even if an injected allowlist names it", async () => {
  let executed = false;
  const result = await reconcile({
    mode: "safe-repair",
    nodes: [{
      nodeId: "mail_forwarder",
      owner: "gateway",
      liveness: "alive",
      connection: "connected",
      outcome: "failed",
      backlog: "held",
      repairAction: "delete_source_message",
    }],
  }, {
    allowlist: ["delete_source_message"],
    executor: async () => {
      executed = true;
      return true;
    },
    verifier: async () => true,
  });

  assert.equal(executed, false);
  assert.equal(result.receipts[0].repairability, "forbidden");
  assert.equal(result.receipts[0].repair_action, "forbidden");
  assert.equal(result.receipts[0].attempt, "denied");
  assert.equal(result.receipts[0].verification, "not_run");
});

test("failed independent verification remains visible for escalation", async () => {
  let executed = false;
  const result = await reconcile({
    mode: "safe-repair",
    nodes: [{
      nodeId: "mail_forwarder",
      owner: "gateway",
      escalationOwner: "mail_owner",
      liveness: "alive",
      connection: "connected",
      outcome: "partial",
      backlog: "held",
      repairAction: "bounded_retry",
      lastCheck: checkedAt,
      nextCheck,
    }],
  }, {
    allowlist: new Set(["bounded_retry"]),
    executor: async () => {
      executed = true;
      return true;
    },
    verifier: async () => false,
  });

  const receipt = result.receipts[0];
  assert.equal(result.status, "attention");
  assert.equal(receipt.reason, "backlog_held");
  assert.equal(receipt.repairability, "allowlisted");
  assert.equal(executed, false);
  assert.equal(receipt.attempt, "denied");
  assert.equal(receipt.verification, "failed");
  assert.equal(receipt.escalation, "mail_owner");
});

test("path-like identifiers are reduced to a fixed safe fallback", async () => {
  const result = await reconcile({
    mode: "observe",
    nodes: [{
      nodeId: "private/path/node",
      owner: "owner/path",
      liveness: "unknown",
      connection: "unknown",
      outcome: "unknown",
      backlog: "unknown",
    }],
  });

  assert.equal(result.receipts[0].node_id, "unknown");
  assert.equal(result.receipts[0].owner, "unknown");
  assert.doesNotMatch(JSON.stringify(result), /private|owner\/path/u);
});

test("email-shaped receipt owners are reduced to a fixed safe fallback", async () => {
  const result = await reconcile({
    mode: "observe",
    nodes: [{
      nodeId: "mail_forwarder",
      owner: "operator@example.invalid",
      escalationOwner: "alerts@example.invalid",
      liveness: "unknown",
      connection: "unknown",
      outcome: "unknown",
      backlog: "unknown",
    }],
  });

  assert.equal(result.receipts[0].owner, "unknown");
  assert.equal(result.receipts[0].escalation, "unknown");
  assert.doesNotMatch(JSON.stringify(result), /@/u);
});

test("invalid node identity cannot become an executable fallback subject", async () => {
  let executed = false;
  const result = await reconcile({
    mode: "safe-repair",
    nodes: [{
      nodeId: "private/path/node",
      owner: "gateway",
      liveness: "alive",
      connection: "connected",
      outcome: "partial",
      backlog: "held",
      repairAction: "bounded_retry",
    }],
  }, {
    allowlist: ["bounded_retry"],
    executor: async () => {
      executed = true;
      return true;
    },
    verifier: async () => true,
  });

  assert.equal(executed, false);
  assert.equal(result.receipts[0].node_id, "unknown");
  assert.equal(result.receipts[0].repairability, "not_available");
  assert.equal(result.receipts[0].attempt, "denied");
});

test("invalid node identity cannot produce a healthy diagnosis", async () => {
  const result = await reconcile({
    mode: "observe",
    nodes: [{
      nodeId: "private/path/node",
      owner: "gateway",
      liveness: "alive",
      connection: "connected",
      outcome: "ok",
      backlog: "clear",
    }],
  });

  assert.equal(result.status, "attention");
  assert.equal(result.receipts[0].node_id, "unknown");
  assert.equal(result.receipts[0].reason, "invalid_subject");
});

test("repair is denied before execution when an independent verifier is absent", async () => {
  let executed = false;
  const base = {
    mode: "safe-repair",
    nodes: [{
      nodeId: "mail_forwarder",
      owner: "gateway",
      liveness: "alive",
      connection: "connected",
      outcome: "partial",
      backlog: "held",
      repairAction: "bounded_retry",
    }],
  };
  const withoutVerifier = await reconcile(base, {
    allowlist: ["bounded_retry"],
    executor: async () => {
      executed = true;
      return true;
    },
  });
  assert.equal(executed, false);
  assert.equal(withoutVerifier.receipts[0].repairability, "not_available");
  assert.equal(withoutVerifier.receipts[0].attempt, "denied");

  const sameFunction = async () => {
    executed = true;
    return true;
  };
  const nonIndependent = await reconcile(base, {
    allowlist: ["bounded_retry"],
    executor: sameFunction,
    verifier: sameFunction,
  });
  assert.equal(executed, false);
  assert.equal(nonIndependent.receipts[0].repairability, "not_available");
  assert.equal(nonIndependent.receipts[0].verification, "not_run");
});

test("missing, non-array, and empty node observations fail closed", async () => {
  for (const input of (
    [
      { mode: "observe" },
      { mode: "observe", nodes: {} },
      { mode: "observe", nodes: [] },
    ]
  )) {
    await assert.rejects(() => reconcile(input), /invalid_reconcile_nodes/u);
  }
});
