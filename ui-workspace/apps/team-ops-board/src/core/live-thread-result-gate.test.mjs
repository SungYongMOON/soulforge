import test from "node:test";
import assert from "node:assert/strict";

import {
  appendThreadResultGateEvent,
  buildLiveThreadProjection,
  createEmptyThreadResultGateRegistry,
  deriveThreadResultGateState,
  isAcknowledgeableLiveThread,
  normalizeThreadResultGateRegistry,
  normalizeThreadEnrollmentRegistry,
  setThreadResultGateDisabled
} from "./live-thread-projection.mjs";
import { selectOwnerAttentionThreads } from "./live-thread-board.mjs";
import {
  OWNER_LIFECYCLE_CANARY_AT as AT,
  ownerLifecycleEnrollmentEntry as enrollmentEntry,
  ownerLifecycleEvent as lifecycleEvent,
  ownerLifecycleGateRegistry as gateRegistry,
  ownerLifecycleRegistry as enrollmentRegistry
} from "./owner-lifecycle-canary.fixture.mjs";

const ADAPTER = { health: "ready", coverage: "partial", transport: "loopback_local", last_refresh_at: AT };

function canaryEntries() {
  return [
    enrollmentEntry("thread-manager", { display_label: "Synthetic manager" }),
    enrollmentEntry("thread-child-1", { thread_kind: "task", display_label: "Synthetic child 1", relationship: "child", parent_thread_id: "thread-manager" }),
    enrollmentEntry("thread-child-2", { thread_kind: "task", display_label: "Synthetic child 2", relationship: "child", parent_thread_id: "thread-manager" }),
    enrollmentEntry("thread-child-3", { thread_kind: "verifier", display_label: "Synthetic child 3", relationship: "review", parent_thread_id: "thread-manager" }),
    enrollmentEntry("thread-owner-escalation", { thread_kind: "task", display_label: "Synthetic Owner escalation", relationship: "child", parent_thread_id: "thread-manager" })
  ];
}

function startedAndResult(threadId, target, targetThreadId, suffix) {
  return [
    lifecycleEvent(`event-${suffix}-started`, threadId, "started", "none", null, "2026-08-04T03:00:01.000Z"),
    lifecycleEvent(`event-${suffix}-result`, threadId, "result_ready", target, targetThreadId, "2026-08-04T03:00:02.000Z")
  ];
}

test("synthetic lifecycle canary rolls three child results to the exact parent and only explicit Owner targeting reaches Owner", () => {
  const events = [
    ...startedAndResult("thread-child-1", "parent", "thread-manager", "child-1"),
    ...startedAndResult("thread-child-2", "parent", "thread-manager", "child-2"),
    ...startedAndResult("thread-child-3", "parent", "thread-manager", "child-3"),
    ...startedAndResult("thread-owner-escalation", "owner", null, "owner")
  ];
  const projection = buildLiveThreadProjection({
    enrollmentRegistry: enrollmentRegistry(canaryEntries()),
    resultGateRegistry: gateRegistry(events),
    runtimeThreads: [
      { id: "thread-manager", status: { type: "idle" }, updatedAt: AT },
      { id: "thread-child-1", status: { type: "idle" }, updatedAt: AT }
    ],
    adapter: ADAPTER,
    generatedAt: AT
  });
  const manager = projection.threads.find((thread) => thread.thread_id === "thread-manager");
  const child = projection.threads.find((thread) => thread.thread_id === "thread-child-1");
  const escalation = projection.threads.find((thread) => thread.thread_id === "thread-owner-escalation");
  assert.equal(projection.scope.result_gate_health, "available");
  assert.equal(manager.status, "parent_result_ready");
  assert.equal(manager.child_result_count, 3);
  assert.equal(child.parent_thread_id, "thread-manager");
  assert.equal(child.result_state, "delivered_to_parent");
  assert.equal(escalation.status, "owner_attention");
  assert.equal(isAcknowledgeableLiveThread(escalation), true);
  assert.equal(isAcknowledgeableLiveThread(manager), false);

  const ownerView = selectOwnerAttentionThreads(projection, null);
  assert.deepEqual(ownerView.threads.map((thread) => thread.thread_id), ["thread-owner-escalation"]);
  assert.equal(ownerView.threads.some((thread) => thread.thread_id === "thread-child-1"), false);
});

test("accepted child leaves active work, remains preserved in history, and stops contributing to the parent roll-up", () => {
  const events = [
    ...startedAndResult("thread-child-1", "parent", "thread-manager", "child-1"),
    lifecycleEvent("event-child-1-accepted", "thread-child-1", "accepted", "parent", "thread-manager", "2026-08-04T03:00:03.000Z")
  ];
  const projection = buildLiveThreadProjection({
    enrollmentRegistry: enrollmentRegistry(canaryEntries()),
    resultGateRegistry: gateRegistry(events),
    runtimeThreads: [],
    adapter: ADAPTER,
    generatedAt: AT
  });
  assert.equal(projection.threads.some((thread) => thread.thread_id === "thread-child-1"), false);
  const accepted = projection.history.find((thread) => thread.thread_id === "thread-child-1");
  assert.equal(accepted.status, "accepted_closed");
  assert.equal(accepted.result_state, "accepted");
  assert.equal(projection.threads.find((thread) => thread.thread_id === "thread-manager").child_result_count, 0);
});

test("missing start, invalid parent target, disabled gate, and raw idle all fail closed without Owner attention", () => {
  const entries = enrollmentRegistry(canaryEntries());
  const noStart = gateRegistry([
    lifecycleEvent("event-no-start", "thread-owner-escalation", "result_ready", "owner", null)
  ]);
  assert.equal(deriveThreadResultGateState({ enrollmentRegistry: entries, resultGateRegistry: noStart }).health, "invalid");
  const invalidProjection = buildLiveThreadProjection({
    enrollmentRegistry: entries,
    resultGateRegistry: noStart,
    runtimeThreads: [{ id: "thread-owner-escalation", status: { type: "idle" }, updatedAt: AT }],
    adapter: ADAPTER,
    generatedAt: AT
  });
  assert.equal(invalidProjection.scope.result_gate_health, "invalid");
  assert.equal(invalidProjection.threads.find((thread) => thread.thread_id === "thread-owner-escalation").status, "not_loaded_unknown");

  const disabledProjection = buildLiveThreadProjection({
    enrollmentRegistry: entries,
    resultGateRegistry: gateRegistry(startedAndResult("thread-owner-escalation", "owner", null, "disabled"), { disabled: true }),
    runtimeThreads: [{ id: "thread-owner-escalation", status: { type: "idle" }, updatedAt: AT }],
    adapter: ADAPTER,
    generatedAt: AT
  });
  assert.equal(disabledProjection.scope.result_gate_health, "disabled");
  assert.equal(disabledProjection.threads.find((thread) => thread.thread_id === "thread-owner-escalation").status, "not_loaded_unknown");
});

test("lifecycle events are exact-ID idempotent, reject conflicts, and keep raw fields out of the contract", () => {
  const event = lifecycleEvent("event-idempotent", "thread-manager", "started", "none", null);
  const empty = createEmptyThreadResultGateRegistry({ now: AT });
  const first = appendThreadResultGateEvent(empty, event, { now: AT, env: {} });
  const repeated = appendThreadResultGateEvent(first.registry, event, { now: AT, env: {} });
  const conflict = appendThreadResultGateEvent(first.registry, { ...event, occurred_at: "2026-08-04T03:00:04.000Z" }, { now: AT, env: {} });
  assert.equal(first.changed, true);
  assert.equal(repeated.changed, false);
  assert.equal(conflict.error, "result_gate_event_conflict");
  assert.equal(normalizeThreadResultGateRegistry({
    ...first.registry,
    events: [{ ...event, raw_preview: true }]
  }), null);
  const disabled = setThreadResultGateDisabled(first.registry, true, { now: AT, env: {} });
  assert.equal(disabled.changed, true);
  assert.equal(disabled.registry.disabled, true);
});

test("orphaned and cyclic exact parent lineage fail closed before projection", () => {
  const orphan = enrollmentRegistry([
    enrollmentEntry("thread-orphan", { parent_thread_id: "thread-missing" })
  ]);
  const cycle = enrollmentRegistry([
    enrollmentEntry("thread-a", { parent_thread_id: "thread-b" }),
    enrollmentEntry("thread-b", { parent_thread_id: "thread-a" })
  ]);
  assert.equal(normalizeThreadEnrollmentRegistry(orphan), null);
  assert.equal(normalizeThreadEnrollmentRegistry(cycle), null);
  assert.equal(buildLiveThreadProjection({ enrollmentRegistry: orphan, adapter: ADAPTER, generatedAt: AT }).adapter.health, "error");
});
