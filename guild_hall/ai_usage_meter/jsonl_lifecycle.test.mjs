import assert from "node:assert/strict";
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  JSONL_LIFECYCLE_SOURCE,
  defaultJsonlLifecycleSnapshotPath,
  evaluateJsonlLifecycleStaleness,
  jsonlLifecycleReceiptInputs,
  reconcileJsonlLifecycle,
} from "./jsonl_lifecycle.mjs";
import { loadLifecycleReceipts } from "./lifecycle_receipt.mjs";
import { runCli } from "./cli.mjs";

const ACTUAL_CANARY_IDS = Object.freeze([
  "019fcb7b-4df2-7cf0-9d07-90fb1a7774fa",
  "019fcb7b-c8a4-7ee3-bb91-52e723512e29",
  "019fcb7d-8df2-76d1-92fe-8e453199bbec",
]);

function row(timestamp, type, payload) {
  return JSON.stringify({ timestamp, type, payload });
}

function sessionMeta(id, { parent = null, timestamp = "2026-08-04T00:00:00.000Z" } = {}) {
  return row(timestamp, "session_meta", {
    id,
    session_id: id,
    parent_thread_id: parent,
    timestamp,
    cwd: "private/worktree/never-persisted",
    agent_path: "/private/agent-path/never-persisted",
    source: parent ? { subagent: { thread_spawn: { depth: 1 } } } : {},
  });
}

function taskStarted(turnId, timestamp = "2026-08-04T00:00:01.000Z") {
  return row(timestamp, "event_msg", {
    type: "task_started",
    turn_id: turnId,
    started_at: timestamp,
  });
}

function taskComplete(turnId, timestamp = "2026-08-04T00:00:05.000Z") {
  return row(timestamp, "event_msg", {
    type: "task_complete",
    turn_id: turnId,
    completed_at: timestamp,
    duration_ms: 4_000,
    last_agent_message: "RAW_COMPLETION_MESSAGE_MUST_NOT_PERSIST",
  });
}

function childActivity(agentThreadId, timestamp = "2026-08-04T00:00:02.000Z") {
  return row(timestamp, "event_msg", {
    type: "sub_agent_activity",
    agent_thread_id: agentThreadId,
    prompt: "RAW_CHILD_ACTIVITY_MUST_NOT_PERSIST",
  });
}

async function writeSession(root, name, lines) {
  await mkdir(root, { recursive: true });
  const file = path.join(root, `rollout-${name}.jsonl`);
  await writeFile(file, `${lines.join("\n")}\n`, "utf8");
  return file;
}

function turn(snapshot, threadId, turnId) {
  return snapshot.identities.find((identity) => (
    identity.identity_kind === "turn"
    && identity.thread_id === threadId
    && identity.turn_id === turnId
  ));
}

test("JSONL lifecycle reconciler projects active and stopped task metadata without result authority", async () => {
  const sessions = await mkdtemp(path.join(os.tmpdir(), "sf-jsonl-lifecycle-basic-"));
  try {
    await writeSession(sessions, "active-root", [
      sessionMeta("active-root"),
      taskStarted("active-turn"),
    ]);
    await writeSession(sessions, "complete-root", [
      sessionMeta("complete-root"),
      taskStarted("complete-turn"),
      taskComplete("complete-turn"),
    ]);
    const snapshot = await reconcileJsonlLifecycle({
      sessionsRoot: sessions,
      threadIds: ["active-root", "complete-root"],
      generatedAt: "2026-08-04T00:01:00.000Z",
    });
    assert.equal(snapshot.source, JSONL_LIFECYCLE_SOURCE);
    assert.equal(snapshot.coverage.scope, "exact_threads");
    assert.equal(snapshot.coverage.complete, true);
    assert.equal(snapshot.health.status, "available");
    assert.deepEqual(turn(snapshot, "active-root", "active-turn"), {
      identity_kind: "turn",
      thread_id: "active-root",
      turn_id: "active-turn",
      agent_id: null,
      parent_thread_id: null,
      lifecycle_state: "active",
      result_state: "result_pending",
      observed_at: "2026-08-04T00:00:01.000Z",
      source: "jsonl_metadata",
      source_event: "task_started",
    });
    const completed = turn(snapshot, "complete-root", "complete-turn");
    assert.equal(completed.lifecycle_state, "stopped");
    assert.equal(completed.result_state, "result_pending");
    assert.equal(completed.source_event, "task_complete");
    assert.equal(evaluateJsonlLifecycleStaleness(snapshot, {
      now: Date.parse("2026-08-04T00:10:00.000Z"),
      maxAgeMs: 1,
    }).health.staleness, "stale");
    assert.doesNotMatch(JSON.stringify(snapshot), /RAW_|private|worktree|agent-path|rollout-/u);
  } finally {
    await rm(sessions, { recursive: true, force: true });
  }
});

test("JSONL lifecycle reconciler confirms child lineage only from session_meta plus sub_agent_activity", async () => {
  const sessions = await mkdtemp(path.join(os.tmpdir(), "sf-jsonl-lifecycle-lineage-"));
  try {
    await writeSession(sessions, "lineage-parent", [
      sessionMeta("lineage-parent"),
      childActivity("lineage-child"),
      taskStarted("parent-turn"),
      taskComplete("parent-turn"),
    ]);
    await writeSession(sessions, "lineage-child", [
      sessionMeta("lineage-child", { parent: "lineage-parent", timestamp: "2026-08-04T00:00:02.500Z" }),
      taskStarted("child-turn", "2026-08-04T00:00:03.000Z"),
      taskComplete("child-turn", "2026-08-04T00:00:06.000Z"),
    ]);
    const snapshot = await reconcileJsonlLifecycle({
      sessionsRoot: sessions,
      threadIds: ["lineage-parent", "lineage-child"],
    });
    const child = turn(snapshot, "lineage-child", "child-turn");
    assert.equal(child.lifecycle_state, "stopped");
    assert.equal(child.agent_id, "lineage-child");
    assert.equal(child.parent_thread_id, "lineage-parent");
    const link = snapshot.identities.find((identity) => identity.identity_kind === "agent_link");
    assert.deepEqual(link, {
      identity_kind: "agent_link",
      thread_id: "lineage-child",
      turn_id: null,
      agent_id: "lineage-child",
      parent_thread_id: "lineage-parent",
      lifecycle_state: "linked",
      result_state: "result_pending",
      observed_at: "2026-08-04T00:00:00.000Z",
      source: "jsonl_metadata",
      source_event: "sub_agent_activity",
    });
    const receiptInputs = jsonlLifecycleReceiptInputs(snapshot);
    const childReceipt = receiptInputs.find((input) => input.agent_id === "lineage-child");
    assert.equal(childReceipt.hook_event_name, "SubagentStop");
    assert.equal(childReceipt.reason, "jsonl_metadata");
  } finally {
    await rm(sessions, { recursive: true, force: true });
  }
});

test("JSONL lifecycle reconciler collapses duplicate continuation metadata and fails safe around malformed raw rows", async () => {
  const sessions = await mkdtemp(path.join(os.tmpdir(), "sf-jsonl-lifecycle-duplicate-"));
  try {
    const duplicate = [sessionMeta("duplicate-root"), taskStarted("duplicate-turn")];
    await writeSession(sessions, "one-duplicate-root", duplicate);
    await writeSession(sessions, "two-duplicate-root", duplicate);
    await writeFile(path.join(sessions, "rollout-malformed-root.jsonl"), [
      "{\"timestamp\":\"2026-08-04T00:00:00.000Z\",\"type\":\"session_meta\",\"payload\":{\"id\":\"malformed-root\",\"prompt\":\"RAW_JSONL_SECRET",
    ].join("\n"), "utf8");
    const snapshot = await reconcileJsonlLifecycle({
      sessionsRoot: sessions,
      maxSessionCount: 10,
    });
    assert.equal(snapshot.coverage.duplicate_projection_count, 1);
    assert.equal(snapshot.coverage.projection_count, 1);
    assert.equal(snapshot.coverage.malformed_session_count, 1);
    assert.equal(snapshot.health.status, "hold");
    assert.equal(snapshot.health.reason_code, "jsonl_session_parse_failed");
    assert.doesNotMatch(JSON.stringify(snapshot), /RAW_JSONL_SECRET|private|rollout-/u);
  } finally {
    await rm(sessions, { recursive: true, force: true });
  }
});

test("JSONL lifecycle reconciler bounds UUID-native session sweeps and returns a safe incremental cursor", async () => {
  const sessions = await mkdtemp(path.join(os.tmpdir(), "sf-jsonl-lifecycle-bounded-"));
  const ids = [
    "10000000-0000-4000-8000-000000000001",
    "10000000-0000-4000-8000-000000000002",
    "10000000-0000-4000-8000-000000000003",
  ];
  try {
    for (const [index, threadId] of ids.entries()) {
      await writeSession(sessions, `2026-08-04T00-00-0${index}-${threadId}`, [
        sessionMeta(threadId),
        taskStarted(`bounded-turn-${index}`),
      ]);
    }
    const first = await reconcileJsonlLifecycle({ sessionsRoot: sessions, maxSessionCount: 2 });
    assert.equal(first.coverage.scope, "bounded_sessions");
    assert.equal(first.coverage.complete, false);
    assert.equal(first.coverage.selected_session_count, 2);
    assert.equal(first.coverage.next_after_thread_id, ids[1]);
    assert.equal(first.identities.some((identity) => identity.thread_id === ids[2]), false);

    const second = await reconcileJsonlLifecycle({
      sessionsRoot: sessions,
      maxSessionCount: 2,
      afterThreadId: first.coverage.next_after_thread_id,
    });
    assert.equal(second.coverage.scope, "bounded_sessions");
    assert.equal(second.coverage.selected_session_count, 1);
    assert.equal(second.identities.some((identity) => identity.thread_id === ids[2]), true);
    await assert.rejects(
      reconcileJsonlLifecycle({ sessionsRoot: sessions, threadIds: ids, maxSessionCount: 2 }),
      { code: "jsonl_lifecycle_exact_scope_exceeds_max_sessions" },
    );
  } finally {
    await rm(sessions, { recursive: true, force: true });
  }
});

test("JSONL lifecycle reconcile applies incrementally, replays without duplicate receipts, and honors emergency disable", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sf-jsonl-lifecycle-apply-"));
  const sessions = path.join(root, "sessions");
  const state = path.join(root, "state");
  try {
    const file = await writeSession(sessions, "incremental-root", [
      sessionMeta("incremental-root"),
      taskStarted("incremental-turn"),
    ]);
    const first = await runCli([
      "lifecycle-reconcile", "--sessions-root", sessions, "--thread-id", "incremental-root", "--state-root", state, "--apply",
    ]);
    assert.equal(first.snapshot.health.status, "available");
    assert.equal(first.persistence.lifecycle_receipts.created_count, 1);
    assert.equal((await loadLifecycleReceipts(state)).length, 1);

    await appendFile(file, `${taskComplete("incremental-turn")}\n`, "utf8");
    const second = await runCli([
      "lifecycle-reconcile", "--sessions-root", sessions, "--thread-id", "incremental-root", "--state-root", state, "--apply",
    ]);
    assert.equal(turn(second.snapshot, "incremental-root", "incremental-turn").lifecycle_state, "stopped");
    assert.equal(second.persistence.lifecycle_receipts.created_count, 1);
    assert.equal((await loadLifecycleReceipts(state)).length, 2);

    const replay = await runCli([
      "lifecycle-reconcile", "--sessions-root", sessions, "--thread-id", "incremental-root", "--state-root", state, "--apply",
    ]);
    assert.equal(replay.persistence.jsonl_snapshot.status, "replayed");
    assert.equal(replay.persistence.lifecycle_receipts.created_count, 0);
    assert.equal(replay.persistence.lifecycle_receipts.replayed_count, 1);
    assert.equal((await loadLifecycleReceipts(state)).length, 2);
    assert.equal(JSON.parse(await readFile(defaultJsonlLifecycleSnapshotPath(state), "utf8")).source, "jsonl_metadata");

    await runCli(["disable", "--state-root", state]);
    const disabled = await runCli([
      "lifecycle-reconcile", "--sessions-root", sessions, "--thread-id", "incremental-root", "--state-root", state, "--apply",
    ]);
    assert.equal(disabled.producer_status, "disabled");
    assert.equal(disabled.snapshot, null);
    assert.equal((await loadLifecycleReceipts(state)).length, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("actual managed-worktree lifecycle canary is detected from JSONL metadata without raw projection", async (context) => {
  const codexRoot = path.resolve(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"));
  const snapshot = await reconcileJsonlLifecycle({
    sessionsRoot: path.join(codexRoot, "sessions"),
    threadIds: ACTUAL_CANARY_IDS,
  });
  const detected = new Set(snapshot.identities
    .filter((identity) => identity.identity_kind === "turn")
    .map((identity) => identity.thread_id));
  if (!ACTUAL_CANARY_IDS.every((threadId) => detected.has(threadId))) {
    context.skip("actual managed-worktree canary JSONL is unavailable in this environment");
    return;
  }
  for (const threadId of ACTUAL_CANARY_IDS) {
    const identity = snapshot.identities.find((item) => item.identity_kind === "turn" && item.thread_id === threadId);
    assert.equal(identity.lifecycle_state, "stopped");
    assert.equal(identity.result_state, "result_pending");
    assert.equal(identity.source, "jsonl_metadata");
  }
  const childOne = snapshot.identities.find((identity) => (
    identity.identity_kind === "turn" && identity.thread_id === ACTUAL_CANARY_IDS[1]
  ));
  const childTwo = snapshot.identities.find((identity) => (
    identity.identity_kind === "turn" && identity.thread_id === ACTUAL_CANARY_IDS[2]
  ));
  assert.equal(childOne.parent_thread_id, ACTUAL_CANARY_IDS[0]);
  assert.equal(childTwo.parent_thread_id, ACTUAL_CANARY_IDS[0]);
  assert.doesNotMatch(JSON.stringify(snapshot), /rollout-|\\|\/sessions\/|cwd|prompt|reasoning|tool/i);
});
