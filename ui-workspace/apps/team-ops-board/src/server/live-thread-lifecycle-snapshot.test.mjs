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

function receipt(event, sessionId, turnId, observedAt) {
  return createLifecycleReceipt({
    hook_event_name: event,
    session_id: sessionId,
    turn_id: turnId,
    agent_id: null,
    agent_type: null,
    reason: null,
    permission_mode: null,
    stop_hook_active: null
  }, { observedAt });
}

async function writeSnapshot(stateRoot, snapshot) {
  const target = defaultLifecycleSnapshotPath(stateRoot);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(snapshot)}\n`, "utf8");
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
      enrolledThreadIds: new Set(["thread-latest", "thread-input-only"])
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
