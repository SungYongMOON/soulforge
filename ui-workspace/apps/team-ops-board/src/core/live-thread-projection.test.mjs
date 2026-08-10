import test from "node:test";
import assert from "node:assert/strict";

import {
  EXACT_THREAD_BINDING_SCHEMA,
  THREAD_ENROLLMENT_SCHEMA,
  buildLiveThreadProjection,
  createUnavailableLiveThreadProjection,
  isAcknowledgeableLiveThread,
  normalizeLiveThreadProjection,
  organizationGroupLabel,
  projectRuntimeThread
} from "./live-thread-projection.mjs";

const AT = "2026-08-04T01:02:03.000Z";

function enrollmentEntry(threadId, overrides = {}) {
  return {
    thread_id: threadId,
    organization_group_id: "org-development1",
    route_id: null,
    work_id: null,
    thread_kind: "task",
    display_label: "Board TASK",
    relationship: "primary",
    lifecycle: "current",
    parent_thread_id: null,
    prior_thread_history_pointer: null,
    metadata_only: true,
    raw_preview: false,
    raw_turns: false,
    raw_messages: false,
    raw_reasoning: false,
    raw_tool_io: false,
    raw_cwd: false,
    enrolled_at: AT,
    updated_at: AT,
    ...overrides
  };
}

function registry(entries) {
  return {
    schema_version: THREAD_ENROLLMENT_SCHEMA,
    registry_revision: 3,
    updated_at: AT,
    disabled: false,
    entries
  };
}

test("live projection includes only exact enrolled IDs and never leaks protocol-only fields", () => {
  const projection = buildLiveThreadProjection({
    enrollmentRegistry: registry([enrollmentEntry("thread-enrolled")]),
    runtimeThreads: [
      {
        id: "thread-enrolled",
        status: { type: "active", activeFlags: [] },
        updatedAt: 1_786_000_000,
        name: "[SYSTEM] / TASK LEAK_SENTINEL_TITLE",
        title: "LEAK_SENTINEL_RUNTIME_TITLE",
        cwd: "<LEAK_SENTINEL_CWD>",
        preview: "LEAK_SENTINEL_PREVIEW",
        turns: ["LEAK_SENTINEL_TURNS"],
        gitInfo: { branch: "LEAK_SENTINEL_GIT" },
        messages: ["LEAK_SENTINEL_MESSAGES"],
        prompt: "LEAK_SENTINEL_PROMPT",
        reasoning: "LEAK_SENTINEL_REASONING",
        toolIo: "LEAK_SENTINEL_TOOL_IO",
        description: "LEAK_SENTINEL_DESCRIPTION"
      },
      {
        id: "thread-unregistered",
        status: { type: "idle" },
        updatedAt: 1_786_000_001,
        name: "[SYSTEM] / TASK LEAK_SENTINEL_SAME_TITLE",
        cwd: "<LEAK_SENTINEL_CWD>"
      }
    ],
    adapter: { health: "ready", coverage: "partial", transport: "loopback_local", last_refresh_at: AT },
    generatedAt: AT
  });

  assert.equal(projection.threads.length, 1);
  assert.equal(projection.threads[0].thread_id, "thread-enrolled");
  assert.equal(projection.threads[0].display_label, "Board TASK");
  assert.equal(projection.threads[0].status, "active");
  assert.equal(projection.scope.excluded_unregistered_count, 1);
  const serialized = JSON.stringify(projection);
  for (const sentinel of ["TITLE", "RUNTIME_TITLE", "CWD", "PREVIEW", "TURNS", "GIT", "MESSAGES", "PROMPT", "REASONING", "TOOL_IO", "DESCRIPTION"]) {
    assert.equal(serialized.includes(`LEAK_SENTINEL_${sentinel}`), false);
  }
  assert.deepEqual(Object.keys(projection.threads[0]).sort(), [
    "display_label",
    "execution_ready",
    "lifecycle",
    "observed",
    "organization_group_id",
    "organization_route_state",
    "relationship",
    "route_id",
    "status",
    "thread_id",
    "thread_kind",
    "updated_at",
    "work_id"
  ]);
});

test("matching text alone never bypasses exact enrollment and missing bindings stay HOLD", () => {
  const projection = buildLiveThreadProjection({
    enrollmentRegistry: registry([enrollmentEntry("thread-exact")]),
    runtimeThreads: [
      { id: "thread-similar", status: { type: "active" }, updatedAt: AT, name: "thread-exact" }
    ],
    adapter: { health: "ready", coverage: "partial", transport: "loopback_local", last_refresh_at: AT },
    generatedAt: AT
  });
  assert.equal(projection.threads.length, 1);
  assert.equal(projection.threads[0].thread_id, "thread-exact");
  assert.equal(projection.threads[0].observed, false);
  assert.equal(projection.threads[0].status, "not_loaded_unknown");
  assert.equal(projection.threads[0].organization_route_state, "hold");
  assert.equal(projection.threads[0].execution_ready, false);
  assert.equal(projection.scope.excluded_unregistered_count, 1);
});

test("separate exact bindings are required before execution readiness is projected", () => {
  const sourceRegistry = registry([enrollmentEntry("thread-bound", { route_id: "route-system" })]);
  const exactBindingRegistry = {
    schema_version: EXACT_THREAD_BINDING_SCHEMA,
    bindings: [{
      thread_id: "thread-bound",
      route_id: "route-system",
      binding_id: "binding-001",
      execution_ready: true,
      metadata_only: true,
      raw_preview: false,
      raw_turns: false,
      raw_messages: false,
      raw_reasoning: false,
      raw_tool_io: false,
      raw_cwd: false
    }]
  };
  const projection = buildLiveThreadProjection({
    enrollmentRegistry: sourceRegistry,
    exactBindingRegistry,
    runtimeThreads: [{ id: "thread-bound", status: { type: "idle" }, updatedAt: AT }],
    adapter: { health: "ready", coverage: "partial", transport: "loopback_local", last_refresh_at: AT },
    generatedAt: AT
  });
  assert.equal(projection.threads[0].organization_route_state, "exact");
  assert.equal(projection.threads[0].execution_ready, true);
  assert.equal(projection.scope.binding_coverage, "exact");
});

test("status projection never turns idle or not loaded into completed", () => {
  assert.deepEqual(projectRuntimeThread({ id: "thread-active", status: { type: "active", activeFlags: [] }, updatedAt: AT }), {
    thread_id: "thread-active",
    status: "active",
    updated_at: AT
  });
  assert.equal(projectRuntimeThread({ id: "thread-wait", status: { type: "active", activeFlags: ["waitingOnUserInput"] } }).status, "waiting");
  assert.equal(projectRuntimeThread({ id: "thread-idle", status: { type: "idle" } }).status, "idle_result_check");
  assert.equal(projectRuntimeThread({ id: "thread-notloaded", status: { type: "notLoaded" } }).status, "not_loaded_unknown");
  assert.equal(projectRuntimeThread({ id: "thread-error", status: { type: "systemError" } }).status, "error");
});

test("completed or unknown TASK and REVIEWER results can be locally acknowledged", () => {
  assert.equal(isAcknowledgeableLiveThread({ thread_kind: "task", status: "idle_result_check" }), true);
  assert.equal(isAcknowledgeableLiveThread({ thread_kind: "verifier", status: "not_loaded_unknown" }), true);
  assert.equal(isAcknowledgeableLiveThread({ thread_kind: "manager", status: "idle_result_check" }), false);
  assert.equal(isAcknowledgeableLiveThread({ thread_kind: "task", status: "active" }), false);
});

test("known organization group IDs use friendly labels without changing unknown authority", () => {
  assert.equal(organizationGroupLabel("ai_platform_system"), "SYSTEM 개발 조직");
  assert.equal(organizationGroupLabel("development1_projects"), "개발1팀 프로젝트");
  assert.equal(organizationGroupLabel("owner_defined_group"), "owner_defined_group");
});

test("frontend normalizer rejects unexpected fields and fails closed", () => {
  const unavailable = createUnavailableLiveThreadProjection({ health: "error", enrollmentHealth: "invalid" });
  const invalid = normalizeLiveThreadProjection({ ...unavailable, unexpected: "raw" });
  assert.equal(invalid.adapter.health, "error");
  assert.equal(invalid.scope.enrollment_health, "invalid");
});
