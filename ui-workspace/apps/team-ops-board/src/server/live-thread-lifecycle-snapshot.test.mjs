import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createLifecycleReceipt,
  createLifecycleSnapshot
} from "../../../../../guild_hall/ai_usage_meter/lifecycle_receipt.mjs";
import {
  defaultLifecycleDisableControlPath,
  defaultLifecycleSnapshotPath,
  projectLifecycleSnapshotRuntime,
  readLifecycleSnapshotSource
} from "./live-thread-lifecycle-snapshot.mjs";

function receipt(event, sessionId, turnId, observedAt, { reason = null } = {}) {
  return createLifecycleReceipt({
    hook_event_name: event,
    session_id: sessionId,
    turn_id: turnId,
    agent_id: null,
    agent_type: null,
    reason,
    permission_mode: null,
    stop_hook_active: null
  }, { observedAt });
}

async function writeSnapshot(stateRoot, snapshot) {
  const target = defaultLifecycleSnapshotPath(stateRoot);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(snapshot)}\n`, "utf8");
}

function availableLifecycleSource(receipts, generatedAt) {
  return {
    status: "available",
    snapshot: createLifecycleSnapshot(receipts, { generatedAt, includeIdentities: true })
  };
}

test("lifecycle source rejects missing, corrupt, raw, duplicate, and disabled contracts without exposing payload", async () => {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), "team-ops-lifecycle-source-"));
  try {
    assert.equal((await readLifecycleSnapshotSource({ stateRoot })).status, "missing");

    const snapshotPath = defaultLifecycleSnapshotPath(stateRoot);
    await mkdir(path.dirname(snapshotPath), { recursive: true });
    await writeFile(snapshotPath, "{not-json", "utf8");
    assert.equal((await readLifecycleSnapshotSource({ stateRoot })).status, "invalid");

    const snapshot = createLifecycleSnapshot([
      receipt("SessionStart", "thread-source", null, "2026-08-04T01:00:00.000Z")
    ], { generatedAt: "2026-08-04T01:00:01.000Z", includeIdentities: true });
    await writeSnapshot(stateRoot, { ...snapshot, raw_preview: "RAW_LIFECYCLE_SOURCE_MUST_NOT_PROJECT" });
    const raw = await readLifecycleSnapshotSource({ stateRoot, now: () => Date.parse("2026-08-04T01:00:02.000Z") });
    assert.equal(raw.status, "invalid");
    assert.equal(JSON.stringify(raw).includes("RAW_LIFECYCLE_SOURCE"), false);

    const duplicate = {
      ...snapshot,
      latest_identity_count: snapshot.latest_identity_count + 1,
      identities: [...snapshot.identities, { ...snapshot.identities[0] }]
    };
    await writeSnapshot(stateRoot, duplicate);
    assert.equal((await readLifecycleSnapshotSource({ stateRoot, now: () => Date.parse("2026-08-04T01:00:02.000Z") })).status, "invalid");

    await writeSnapshot(stateRoot, snapshot);
    const controlPath = defaultLifecycleDisableControlPath(stateRoot);
    await mkdir(path.dirname(controlPath), { recursive: true });
    await writeFile(controlPath, JSON.stringify({
      schema_version: "soulforge.ai_usage_meter_emergency_disable.v1",
      disabled: true,
      updated_at: "2026-08-04T01:00:02.000Z"
    }), "utf8");
    assert.equal((await readLifecycleSnapshotSource({ stateRoot })).status, "disabled");
  } finally {
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test("lifecycle source selects the latest exact identity, treats input as non-running, and becomes stale fail-closed", async () => {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), "team-ops-lifecycle-latest-"));
  try {
    const snapshot = createLifecycleSnapshot([
      receipt("SessionStart", "thread-latest", "turn-one", "2026-08-04T01:00:00.000Z"),
      receipt("Stop", "thread-latest", "turn-two", "2026-08-04T01:00:02.000Z"),
      receipt("UserPromptSubmit", "thread-input-only", "turn-input", "2026-08-04T01:00:03.000Z")
    ], { generatedAt: "2026-08-04T01:00:04.000Z", includeIdentities: true });
    await writeSnapshot(stateRoot, snapshot);
    const source = await readLifecycleSnapshotSource({
      stateRoot,
      now: () => Date.parse("2026-08-04T01:00:05.000Z")
    });
    const runtime = projectLifecycleSnapshotRuntime({
      source,
      enrolledThreadIds: new Set(["thread-latest", "thread-input-only"]),
      now: () => Date.parse("2026-08-04T01:00:05.000Z")
    });
    assert.equal(source.status, "available");
    assert.equal(runtime.matched_enrolled_count, 2);
    assert.deepEqual(runtime.runtime_threads, [{
      thread_id: "thread-latest",
      status: "stopped",
      updated_at: "2026-08-04T01:00:02.000Z",
      stop_observed_at: "2026-08-04T01:00:02.000Z"
    }]);

    const stale = await readLifecycleSnapshotSource({
      stateRoot,
      now: () => Date.parse("2026-08-04T01:10:00.000Z"),
      maxAgeMs: 1
    });
    assert.equal(stale.status, "stale");
    assert.deepEqual(projectLifecycleSnapshotRuntime({
      source: stale,
      enrolledThreadIds: new Set(["thread-latest"])
    }), { runtime_threads: [], matched_enrolled_count: 0 });
  } finally {
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test("lifecycle positives require a fresh turn lease while terminal evidence remains projectable", () => {
  const now = () => Date.parse("2026-08-04T01:10:00.000Z");
  const enrolledThreadIds = new Set([
    "thread-active",
    "thread-waiting",
    "thread-expired",
    "thread-future",
    "thread-missing-turn",
    "thread-invalid-turn",
    "thread-terminal",
    "thread-turn-order"
  ]);

  const active = projectLifecycleSnapshotRuntime({
    source: availableLifecycleSource([
      receipt("SessionStart", "thread-active", "turn-active", "2026-08-04T01:09:59.000Z", {
        reason: "jsonl_metadata_active_20260804010959000"
      })
    ], "2026-08-04T01:10:00.000Z"),
    enrolledThreadIds,
    now
  });
  assert.deepEqual(active.runtime_threads, [{
    thread_id: "thread-active",
    status: "active",
    updated_at: "2026-08-04T01:09:59.000Z",
    stop_observed_at: null
  }]);

  const waiting = projectLifecycleSnapshotRuntime({
    source: availableLifecycleSource([
      receipt("PermissionRequest", "thread-waiting", "turn-waiting", "2026-08-04T01:09:59.000Z")
    ], "2026-08-04T01:10:00.000Z"),
    enrolledThreadIds,
    now
  });
  assert.equal(waiting.runtime_threads[0]?.status, "waiting");

  const expired = projectLifecycleSnapshotRuntime({
    // A fresh snapshot generation cannot renew an old JSONL-derived activity
    // receipt: the exact activity timestamp remains the lease anchor.
    source: availableLifecycleSource([
      receipt("SessionStart", "thread-expired", "turn-expired", "2026-08-04T01:00:00.000Z", {
        reason: "jsonl_metadata_active_20260804010000000"
      })
    ], "2026-08-04T01:10:00.000Z"),
    enrolledThreadIds,
    now
  });
  assert.deepEqual(expired.runtime_threads, []);

  const future = projectLifecycleSnapshotRuntime({
    source: availableLifecycleSource([
      receipt("SessionStart", "thread-future", "turn-future", "2026-08-04T01:10:01.000Z")
    ], "2026-08-04T01:10:00.000Z"),
    enrolledThreadIds,
    now
  });
  assert.deepEqual(future.runtime_threads, []);

  const missingTurn = projectLifecycleSnapshotRuntime({
    source: availableLifecycleSource([
      receipt("SessionStart", "thread-missing-turn", null, "2026-08-04T01:09:59.000Z")
    ], "2026-08-04T01:10:00.000Z"),
    enrolledThreadIds,
    now
  });
  assert.deepEqual(missingTurn.runtime_threads, []);

  const invalidTurn = projectLifecycleSnapshotRuntime({
    source: {
      status: "available",
      snapshot: {
        identities: [{
          session_id: "thread-invalid-turn",
          turn_id: "invalid turn id",
          agent_id: null,
          agent_type: null,
          lifecycle_state: "started",
          result_state: "result_pending",
          observed_at: "2026-08-04T01:09:59.000Z",
          source_event: "SessionStart"
        }]
      }
    },
    enrolledThreadIds,
    now
  });
  assert.deepEqual(invalidTurn.runtime_threads, []);

  const terminal = projectLifecycleSnapshotRuntime({
    source: availableLifecycleSource([
      receipt("SessionEnd", "thread-terminal", null, "2026-08-04T01:00:00.000Z")
    ], "2026-08-04T01:10:00.000Z"),
    enrolledThreadIds,
    now
  });
  assert.deepEqual(terminal.runtime_threads, [{
    thread_id: "thread-terminal",
    status: "stopped",
    updated_at: "2026-08-04T01:00:00.000Z",
    stop_observed_at: null
  }]);

  const terminalAtSameTime = projectLifecycleSnapshotRuntime({
    source: availableLifecycleSource([
      receipt("SessionStart", "thread-turn-order", "turn-one", "2026-08-04T01:09:58.000Z"),
      receipt("Stop", "thread-turn-order", "turn-two", "2026-08-04T01:09:58.000Z")
    ], "2026-08-04T01:10:00.000Z"),
    enrolledThreadIds,
    now
  });
  assert.equal(terminalAtSameTime.runtime_threads[0]?.status, "stopped");

  const laterTurn = projectLifecycleSnapshotRuntime({
    source: availableLifecycleSource([
      receipt("Stop", "thread-turn-order", "turn-two", "2026-08-04T01:09:58.000Z"),
      receipt("SessionStart", "thread-turn-order", "turn-three", "2026-08-04T01:09:59.000Z")
    ], "2026-08-04T01:10:00.000Z"),
    enrolledThreadIds,
    now
  });
  assert.equal(laterTurn.runtime_threads[0]?.status, "active");

  const completedLongTurn = projectLifecycleSnapshotRuntime({
    source: availableLifecycleSource([
      receipt("SessionStart", "thread-long-turn", "turn-long", "2026-08-04T01:09:59.000Z", {
        reason: "jsonl_metadata_active_20260804010959000"
      }),
      receipt("Stop", "thread-long-turn", "turn-long", "2026-08-04T01:10:00.000Z", {
        reason: "jsonl_metadata"
      })
    ], "2026-08-04T01:10:00.000Z"),
    enrolledThreadIds: new Set(["thread-long-turn"]),
    now
  });
  assert.deepEqual(completedLongTurn.runtime_threads, [{
    thread_id: "thread-long-turn",
    status: "stopped",
    updated_at: "2026-08-04T01:10:00.000Z",
    stop_observed_at: "2026-08-04T01:10:00.000Z"
  }]);

  const serialized = JSON.stringify({ active, waiting, terminal, laterTurn, completedLongTurn });
  assert.equal(serialized.includes("turn_id"), false);
  assert.equal(serialized.includes("RAW_LIFECYCLE"), false);
});

test("an unenrolled child agent receipt never falls back to its enrolled parent session", () => {
  const source = availableLifecycleSource([createLifecycleReceipt({
    hook_event_name: "SubagentStart",
    session_id: "thread-enrolled-parent",
    turn_id: "turn-child",
    agent_id: "agent-unenrolled-child",
    agent_type: "worker",
    reason: null,
    permission_mode: null,
    stop_hook_active: null
  }, { observedAt: "2026-08-04T01:10:00.000Z" })], "2026-08-04T01:10:00.000Z");

  const runtime = projectLifecycleSnapshotRuntime({
    source,
    enrolledThreadIds: new Set(["thread-enrolled-parent"]),
    now: () => Date.parse("2026-08-04T01:10:00.000Z")
  });

  assert.deepEqual(runtime, { runtime_threads: [], matched_enrolled_count: 0 });
  assert.equal(JSON.stringify(runtime).includes("turn_id"), false);
});
