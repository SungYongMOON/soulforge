import assert from "node:assert/strict";
import { appendFile, mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  JSONL_LIFECYCLE_SOURCE,
  defaultJsonlLifecycleSnapshotPath,
  evaluateJsonlLifecycleStaleness,
  jsonlLifecycleCompleteness,
  jsonlLifecycleReceiptInputs,
  planPendingJsonlReconcile,
  reconcileJsonlLifecycle,
  validateJsonlLifecycleSnapshot,
} from "./jsonl_lifecycle.mjs";
import {
  createLifecycleReceipt,
  loadLifecycleReceipts,
  persistLifecycleReceipts,
} from "./lifecycle_receipt.mjs";
import { runCli } from "./cli.mjs";

test("Phase B pending JSONL plan is deterministic and holds all writes on divergent identity", () => {
  const identity = (index) => ({ thread_id: `thread-${index}`, turn_id: `turn-${index}` });
  const canonical = Array.from({ length: 31 }, (_, index) => ({ identity: identity(index), payload: { state: "stopped" } }));
  const identical = planPendingJsonlReconcile({ canonical, pending: canonical });
  assert.equal(identical.status, "ready");
  assert.equal(identical.actions.every((action) => action.action === "noop"), true);
  const divergent = canonical.map((item, index) => index === 30 ? { ...item, payload: { state: "active" } } : item);
  const conflict = planPendingJsonlReconcile({ canonical, pending: divergent });
  assert.equal(conflict.status, "hold");
  assert.equal(conflict.conflict_count, 1);
  assert.equal(conflict.malformed_excluded_count, 0);
  assert.equal(conflict.write_allowed, false);
  assert.deepEqual(conflict, planPendingJsonlReconcile({ canonical, pending: divergent }));
});

test("Phase B pending flush and restart reconcile exactly once while malformed input is excluded", () => {
  const observation = { identity: { thread_id: "flush-thread", turn_id: "flush-turn" }, payload: { state: "stopped" } };
  const flushRace = planPendingJsonlReconcile({ canonical: [], pending: [observation, observation] });
  assert.deepEqual(flushRace.actions.map((action) => action.action), ["create", "noop"]);
  assert.equal(flushRace.write_allowed, true);

  const restart = planPendingJsonlReconcile({ canonical: [observation], pending: [observation] });
  assert.deepEqual(restart.actions.map((action) => action.action), ["noop"]);
  assert.equal(restart.conflict_count, 0);

  const malformed = planPendingJsonlReconcile({
    canonical: [null],
    pending: [{ identity: {}, payload: {} }, observation],
  });
  assert.equal(malformed.malformed_excluded_count, 2);
  assert.deepEqual(malformed.actions.map((action) => action.action), ["create"]);
});

test("Phase B completeness stays unknown without Stop and subagent coverage stays partial", async () => {
  const sessions = await mkdtemp(path.join(os.tmpdir(), "sf-jsonl-phase-b-active-"));
  try {
    await writeSession(sessions, "active-child", [
      sessionMeta("active-child", { parent: "parent-thread" }),
      taskStarted("active-turn"),
    ]);
    const snapshot = await reconcileJsonlLifecycle({ sessionsRoot: sessions, threadIds: ["active-child"] });
    assert.deepEqual(jsonlLifecycleCompleteness(snapshot), {
      completeness: "unknown",
      coverage: "coverage_partial",
    });
  } finally {
    await rm(sessions, { recursive: true, force: true });
  }
});

test("Phase B completeness stays unknown for empty and link-only snapshots", async () => {
  const sessions = await mkdtemp(path.join(os.tmpdir(), "sf-jsonl-phase-b-no-stop-"));
  try {
    const empty = await reconcileJsonlLifecycle({ sessionsRoot: sessions });
    assert.equal(jsonlLifecycleCompleteness(empty).completeness, "unknown");

    await writeSession(sessions, "link-only-child", [
      sessionMeta("link-only-child", { parent: "link-only-parent" }),
    ]);
    const linkOnly = await reconcileJsonlLifecycle({
      sessionsRoot: sessions,
      threadIds: ["link-only-child"],
    });
    assert.equal(jsonlLifecycleCompleteness(linkOnly).completeness, "unknown");
  } finally {
    await rm(sessions, { recursive: true, force: true });
  }
});

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

async function writeSession(root, name, lines, { modifiedAt = null } = {}) {
  await mkdir(root, { recursive: true });
  const file = path.join(root, `rollout-${name}.jsonl`);
  await writeFile(file, `${lines.join("\n")}\n`, "utf8");
  if (modifiedAt !== null) {
    await utimes(file, new Date(modifiedAt), new Date(modifiedAt));
  }
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
    ], { modifiedAt: "2026-08-04T00:00:01.000Z" });
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
      activity_observed_at: "2026-08-04T00:00:01.000Z",
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

test("JSONL activity renews only an exact active turn and does not use snapshot generation as a heartbeat", async () => {
  const sessions = await mkdtemp(path.join(os.tmpdir(), "sf-jsonl-lifecycle-heartbeat-"));
  const state = path.join(sessions, "state");
  try {
    const file = await writeSession(sessions, "heartbeat-root", [
      sessionMeta("heartbeat-root", { timestamp: "2026-08-04T00:00:00.000Z" }),
      taskStarted("heartbeat-turn", "2026-08-04T00:00:01.000Z"),
      childActivity("heartbeat-child", "2026-08-04T00:09:59.000Z"),
    ], { modifiedAt: "2026-08-04T00:09:59.000Z" });

    const active = await reconcileJsonlLifecycle({
      sessionsRoot: sessions,
      threadIds: ["heartbeat-root"],
      generatedAt: "2026-08-04T00:10:00.000Z",
    });
    const activeIdentity = turn(active, "heartbeat-root", "heartbeat-turn");
    const activeReceipt = jsonlLifecycleReceiptInputs(active).find((input) => input.turn_id === "heartbeat-turn");

    assert.equal(activeIdentity.lifecycle_state, "active");
    assert.equal(activeIdentity.observed_at, "2026-08-04T00:00:01.000Z");
    assert.equal(activeIdentity.activity_observed_at, "2026-08-04T00:09:59.000Z");
    assert.equal(activeReceipt.hook_event_name, "SessionStart");
    assert.equal(activeReceipt.observed_at, "2026-08-04T00:09:59.000Z");
    assert.equal(activeReceipt.reason, "jsonl_metadata_active_20260804000959000");

    const activePersistence = await persistLifecycleReceipts(state, [
      createLifecycleReceipt(activeReceipt, { observedAt: activeReceipt.observed_at }),
    ]);
    assert.equal(activePersistence.created_count, 1);
    const firstCurrent = JSON.parse(await readFile(path.join(state, "lifecycle", "current.json"), "utf8"));
    assert.equal(firstCurrent.identities[0].observed_at, "2026-08-04T00:09:59.000Z");

    const regenerated = await reconcileJsonlLifecycle({
      sessionsRoot: sessions,
      threadIds: ["heartbeat-root"],
      generatedAt: "2026-08-04T00:14:00.000Z",
    });
    assert.deepEqual(jsonlLifecycleReceiptInputs(regenerated), jsonlLifecycleReceiptInputs(active));
    const replayed = await persistLifecycleReceipts(state, [
      createLifecycleReceipt(activeReceipt, { observedAt: activeReceipt.observed_at }),
    ]);
    assert.equal(replayed.created_count, 0);
    assert.equal(replayed.replayed_count, 1);
    const regeneratedCurrent = JSON.parse(await readFile(path.join(state, "lifecycle", "current.json"), "utf8"));
    assert.equal(regeneratedCurrent.identities[0].observed_at, "2026-08-04T00:09:59.000Z");

    await appendFile(file, `${taskComplete("heartbeat-turn", "2026-08-04T00:10:01.000Z")}\n`, "utf8");
    await utimes(file, new Date("2026-08-04T00:10:01.000Z"), new Date("2026-08-04T00:10:01.000Z"));
    const completed = await reconcileJsonlLifecycle({
      sessionsRoot: sessions,
      threadIds: ["heartbeat-root"],
      generatedAt: "2026-08-04T00:10:02.000Z",
    });
    const completedIdentity = turn(completed, "heartbeat-root", "heartbeat-turn");
    const completedReceipt = jsonlLifecycleReceiptInputs(completed).find((input) => input.turn_id === "heartbeat-turn");

    assert.equal(completedIdentity.lifecycle_state, "stopped");
    assert.equal(completedIdentity.activity_observed_at, null);
    assert.equal(completedReceipt.hook_event_name, "Stop");
    assert.equal(completedReceipt.reason, "jsonl_metadata");
    assert.equal(completedReceipt.observed_at, "2026-08-04T00:10:01.000Z");
    const completedPersistence = await persistLifecycleReceipts(state, [
      createLifecycleReceipt(completedReceipt, { observedAt: completedReceipt.observed_at }),
    ]);
    assert.equal(completedPersistence.created_count, 1);
    const terminalCurrent = JSON.parse(await readFile(path.join(state, "lifecycle", "current.json"), "utf8"));
    assert.equal(terminalCurrent.identities[0].lifecycle_state, "observed_at_stop");
    assert.equal(terminalCurrent.identities[0].observed_at, "2026-08-04T00:10:01.000Z");
    assert.equal(completed.raw_content_fields_stored, 0);
    assert.equal(completed.raw_flag_fields_stored, 0);
    assert.doesNotMatch(JSON.stringify({ active, regenerated, completed }), /RAW_|private|worktree|agent-path|prompt|reasoning|tool/u);
  } finally {
    await rm(sessions, { recursive: true, force: true });
  }
});

test("activity-free legacy JSONL lifecycle snapshots remain readable but cannot self-renew", async () => {
  const sessions = await mkdtemp(path.join(os.tmpdir(), "sf-jsonl-lifecycle-legacy-"));
  try {
    await writeSession(sessions, "legacy-root", [
      sessionMeta("legacy-root"),
      taskStarted("legacy-turn"),
    ], { modifiedAt: "2026-08-04T00:00:01.000Z" });
    const current = await reconcileJsonlLifecycle({
      sessionsRoot: sessions,
      threadIds: ["legacy-root"],
      generatedAt: "2026-08-04T00:10:00.000Z",
    });
    const legacy = {
      ...current,
      identities: current.identities.map(({ activity_observed_at: ignored, ...identity }) => identity),
    };
    const accepted = validateJsonlLifecycleSnapshot(legacy);
    const receipt = jsonlLifecycleReceiptInputs(accepted)[0];

    assert.equal(receipt.observed_at, "2026-08-04T00:00:01.000Z");
    assert.equal(receipt.reason, "jsonl_metadata_active_20260804000001000");
    assert.doesNotMatch(JSON.stringify(accepted), /RAW_|private|worktree|agent-path/u);
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
      activity_observed_at: null,
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

test("exact lifecycle scope ignores unregistered descendant activity without creating a false lineage conflict", async () => {
  const sessions = await mkdtemp(path.join(os.tmpdir(), "sf-jsonl-lifecycle-exact-boundary-"));
  try {
    for (const parentId of ["exact-parent-a", "exact-parent-b"]) {
      await writeSession(sessions, parentId, [
        sessionMeta(parentId),
        childActivity("unregistered-descendant"),
        taskStarted(`${parentId}-turn`),
      ]);
    }

    const snapshot = await reconcileJsonlLifecycle({
      sessionsRoot: sessions,
      threadIds: ["exact-parent-a", "exact-parent-b"],
    });

    assert.equal(snapshot.health.status, "available");
    assert.equal(snapshot.health.reason_code, null);
    assert.equal(snapshot.coverage.confirmed_agent_link_count, 0);
    assert.equal(snapshot.identities.some((identity) => identity.thread_id === "unregistered-descendant"), false);
  } finally {
    await rm(sessions, { recursive: true, force: true });
  }
});

test("exact lifecycle scope retains every matching Codex continuation from one bounded session index", async () => {
  const sessions = await mkdtemp(path.join(os.tmpdir(), "sf-jsonl-lifecycle-exact-index-"));
  const firstId = "exact-index-first";
  const secondId = "exact-index-second";
  try {
    await writeSession(sessions, `first-${firstId}`, [
      sessionMeta(firstId),
      taskStarted("first-turn"),
    ]);
    await writeSession(sessions, `continued-${firstId}`, [
      sessionMeta(firstId),
      taskStarted("continued-turn", "2026-08-04T00:00:02.000Z"),
    ]);
    await writeSession(sessions, `only-${secondId}`, [
      sessionMeta(secondId),
      taskStarted("second-turn"),
    ]);
    await writeSession(sessions, "unregistered-other", [
      sessionMeta("unregistered-other"),
      taskStarted("unregistered-turn"),
    ]);

    const snapshot = await reconcileJsonlLifecycle({
      sessionsRoot: sessions,
      threadIds: [firstId, secondId, "exact-index-missing"],
    });

    assert.equal(snapshot.health.status, "partial");
    assert.equal(snapshot.coverage.scope, "exact_threads");
    assert.equal(snapshot.coverage.candidate_session_count, 3);
    assert.equal(snapshot.coverage.selected_session_count, 3);
    assert.equal(snapshot.coverage.parsed_session_count, 3);
    assert.equal(snapshot.coverage.missing_exact_thread_count, 1);
    assert.equal(turn(snapshot, firstId, "first-turn")?.lifecycle_state, "active");
    assert.equal(turn(snapshot, firstId, "continued-turn")?.lifecycle_state, "active");
    assert.equal(turn(snapshot, secondId, "second-turn")?.lifecycle_state, "active");
    assert.equal(snapshot.identities.some((identity) => identity.thread_id === "unregistered-other"), false);
  } finally {
    await rm(sessions, { recursive: true, force: true });
  }
});

test("a missing exact session stays a coverage gap without downgrading successful collector health", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sf-jsonl-lifecycle-partial-health-"));
  const sessions = path.join(root, "sessions");
  const state = path.join(root, "state");
  try {
    await writeSession(sessions, "present-root", [
      sessionMeta("present-root"),
      taskStarted("present-turn"),
    ]);

    const result = await runCli([
      "lifecycle-reconcile", "--sessions-root", sessions,
      "--thread-id", "present-root", "--thread-id", "missing-root",
      "--state-root", state, "--apply",
    ]);
    const health = JSON.parse(await readFile(path.join(state, "health", "latest.json"), "utf8"));

    assert.equal(result.snapshot.health.status, "partial");
    assert.equal(result.snapshot.health.reason_code, "jsonl_exact_thread_not_found");
    assert.equal(result.snapshot.coverage.missing_exact_thread_count, 1);
    assert.equal(health.status, "ok");
    assert.equal(health.detail, "jsonl_exact_thread_not_found");
  } finally {
    await rm(root, { recursive: true, force: true });
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
