import test from "node:test";
import assert from "node:assert/strict";

import {
  acknowledgeLiveThread,
  createLiveThreadProjectionRequest,
  groupLiveThreadsByOrganization,
  isLiveThreadAcknowledged,
  liveThreadAcknowledgementKey,
  restoreLiveThread,
  selectOwnerAttentionThreads,
  selectLiveThreadView
} from "./live-thread-board.mjs";
import { LIVE_THREAD_PROJECTION_SCHEMA } from "./live-thread-projection.mjs";

const AT = "2026-08-04T01:02:03.000Z";

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
}

function thread(thread_id, overrides = {}) {
  return {
    thread_id,
    parent_thread_id: null,
    organization_group_id: "org-development1",
    route_id: null,
    work_id: null,
    thread_kind: "task",
    display_label: "Board TASK",
    relationship: "primary",
    lifecycle: "current",
    status: "not_loaded_unknown",
    result_state: "none",
    attention_target: "none",
    child_result_count: 0,
    updated_at: AT,
    observed: true,
    stop_observed_at: null,
    organization_route_state: "hold",
    execution_ready: false,
    ...overrides
  };
}

function projection(threads, history = []) {
  return {
    schema_version: LIVE_THREAD_PROJECTION_SCHEMA,
    generated_at: AT,
    adapter: { health: "ready", coverage: "partial", transport: "loopback_local", last_refresh_at: AT },
    scope: {
      enrollment_health: "available",
      result_gate_health: "available",
      lifecycle_source_health: "missing",
      lifecycle_exact_identity_count: 0,
      lifecycle_matched_enrolled_count: 0,
      included_count: threads.length,
      excluded_unregistered_count: 2,
      unseen_enrolled_count: 0,
      binding_coverage: "hold"
    },
    threads,
    history
  };
}

test("only an explicit Owner-targeted result can be locally acknowledged", () => {
  const storage = new MemoryStorage();
  const active = thread("thread-active", { status: "active" });
  const waiting = thread("thread-waiting", { status: "waiting" });
  const error = thread("thread-error", { status: "error" });
  const result = thread("thread-result", { status: "owner_attention", result_state: "owner_attention", attention_target: "owner" });
  const unknown = thread("thread-unknown", { status: "not_loaded_unknown" });
  const manager = thread("thread-manager", { thread_kind: "manager", status: "owner_attention", result_state: "owner_attention", attention_target: "owner" });
  assert.equal(acknowledgeLiveThread(storage, active), false);
  assert.equal(acknowledgeLiveThread(storage, waiting), false);
  assert.equal(acknowledgeLiveThread(storage, error), false);
  assert.equal(acknowledgeLiveThread(storage, result), true);
  assert.equal(acknowledgeLiveThread(storage, unknown), false);
  assert.equal(acknowledgeLiveThread(storage, manager), true);
  assert.equal(isLiveThreadAcknowledged(storage, result), true);
  assert.match(liveThreadAcknowledgementKey(result), /thread-result:2026-08-04T01:02:03\.000Z$/u);
});

test("an acknowledgement hides the current card, remains in history, reappears after updated_at changes, and can be restored", () => {
  const storage = new MemoryStorage();
  const result = thread("thread-result", { status: "owner_attention", result_state: "owner_attention", attention_target: "owner" });
  const source = projection([result]);
  assert.equal(acknowledgeLiveThread(storage, result), true);
  assert.deepEqual(selectLiveThreadView(source, storage, "active").threads, []);
  assert.equal(selectLiveThreadView(source, storage, "history").threads[0].thread_id, "thread-result");

  const updated = thread("thread-result", { updated_at: "2026-08-04T01:12:03.000Z" });
  assert.equal(selectLiveThreadView(projection([updated]), storage, "active").threads.length, 1);
  assert.equal(restoreLiveThread(storage, result), true);
  assert.equal(selectLiveThreadView(source, storage, "active").threads.length, 1);
});

test("grouping uses owner-provided organization group metadata only", () => {
  const groups = groupLiveThreadsByOrganization([
    thread("thread-b", { organization_group_id: "org-system" }),
    thread("thread-a", { organization_group_id: "org-development1" })
  ]);
  assert.deepEqual(groups.map((group) => group.organization_group_id), ["org-development1", "org-system"]);
});

test("Owner default excludes roots and internal child results unless an explicit gate targets Owner", () => {
  const ownerTarget = thread("thread-owner-target", {
    parent_thread_id: "thread-root",
    status: "owner_attention",
    result_state: "owner_attention",
    attention_target: "owner"
  });
  const source = projection([
    thread("thread-root", { status: "active" }),
    thread("thread-child", { parent_thread_id: "thread-root", status: "parent_result_ready", result_state: "delivered_to_parent", attention_target: "parent" }),
    ownerTarget
  ]);
  assert.deepEqual(selectOwnerAttentionThreads(source, new MemoryStorage()).threads.map((item) => item.thread_id), ["thread-owner-target"]);
});

test("live projection request normalizes network data and uses a force refresh endpoint", async () => {
  const calls = [];
  const payload = projection([thread("thread-request")]);
  const request = createLiveThreadProjectionRequest(async (path) => {
    calls.push(path);
    return { ok: true, json: async () => payload };
  });
  const first = await request.load();
  const second = await request.load({ force: true });
  assert.equal(first.threads[0].thread_id, "thread-request");
  assert.equal(second.threads[0].thread_id, "thread-request");
  assert.deepEqual(calls, ["/codex-threads.snapshot.json", "/codex-threads.snapshot.json?refresh=1"]);
});
