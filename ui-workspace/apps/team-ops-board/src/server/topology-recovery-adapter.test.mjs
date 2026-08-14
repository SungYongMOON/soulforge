import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  TOPOLOGY_RECOVERY_CYCLE_SCHEMA,
  readTopologyRecoveryProjection,
  validateTopologyRecoveryCycle,
} from "./topology-recovery-adapter.mjs";

const NOW = Date.parse("2026-08-14T08:10:00.000Z");

function cycle() {
  return {
    schema_version: TOPOLOGY_RECOVERY_CYCLE_SCHEMA,
    attempted_at: "2026-08-14T08:02:32.666Z",
    completed_at: "2026-08-14T08:03:01.936Z",
    mode: "safe-repair",
    status: "attention",
    evidence: {},
    recovery: [{
      node_id: "usage_codex_collector",
      reason: "processing_failed",
      repairability: "allowlisted",
      repair_action: "restart_owned_task",
      attempt: "denied",
      verification: "failed",
      escalation: "watchtower_operator",
    }],
  };
}

test("recovery projection exposes only the sanitized action outcome", () => {
  const projected = validateTopologyRecoveryCycle(cycle(), { now: NOW });
  assert.deepEqual(Object.keys(projected), [
    "schema_version", "attempted_at", "completed_at", "mode", "status", "recovery",
  ]);
  assert.equal(projected.recovery[0].node_id, "usage_codex_collector");
  assert.equal(projected.recovery[0].attempt, "denied");
  assert.equal(Object.hasOwn(projected, "evidence"), false);
});

test("unsafe, duplicate, malformed, and future recovery rows fail closed", () => {
  const unsafe = cycle();
  unsafe.recovery[0].escalation = "operator@example.invalid";
  assert.throws(() => validateTopologyRecoveryCycle(unsafe, { now: NOW }), /topology_recovery_row_invalid/u);

  const duplicate = cycle();
  duplicate.recovery.push({ ...duplicate.recovery[0] });
  assert.throws(() => validateTopologyRecoveryCycle(duplicate, { now: NOW }), /topology_recovery_row_invalid/u);

  const extra = cycle();
  extra.raw_detail = "not allowed";
  assert.throws(() => validateTopologyRecoveryCycle(extra, { now: NOW }), /topology_recovery_cycle_invalid/u);

  const future = cycle();
  future.completed_at = "2026-08-14T08:11:00.000Z";
  assert.throws(() => validateTopologyRecoveryCycle(future, { now: NOW }), /topology_recovery_time_invalid/u);
});

test("reader classifies fresh, stale, and unavailable local receipts", async () => {
  const ownerRoot = path.join(tmpdir(), `topology-recovery-${process.pid}-${Date.now()}`);
  const receiptDirectory = path.join(
    ownerRoot, "guild_hall", "state", "operations", "watchtower", "external_evidence",
  );
  await mkdir(receiptDirectory, { recursive: true });
  await writeFile(path.join(receiptDirectory, "recovery_cycle.json"), JSON.stringify(cycle()), "utf8");

  const ready = await readTopologyRecoveryProjection({ ownerRoot, now: () => NOW });
  assert.equal(ready.state, "ready");
  assert.equal(ready.cycle.recovery.length, 1);

  const stale = await readTopologyRecoveryProjection({ ownerRoot, now: () => NOW + 20 * 60 * 1_000 });
  assert.equal(stale.state, "stale");

  const unavailable = await readTopologyRecoveryProjection({ ownerRoot: "relative", now: () => NOW });
  assert.equal(unavailable.state, "unavailable");
  assert.equal(unavailable.cycle, null);
});
