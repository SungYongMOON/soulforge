import test from "node:test";
import assert from "node:assert/strict";

import {
  EXACT_THREAD_BINDING_SCHEMA,
  THREAD_ENROLLMENT_SCHEMA,
  THREAD_RESULT_GATE_SCHEMA,
  buildLiveThreadProjection,
  createUnavailableLiveThreadProjection,
  isAcknowledgeableLiveThread,
  normalizeLiveThreadProjection,
  organizationGroupLabel,
  projectRuntimeThread
} from "./live-thread-projection.mjs";

const AT = "2026-08-04T01:02:03.000Z";
const SYNTHETIC_LEAK_SENTINEL_CWD = ["C:", "\\LEAK_SENTINEL_CWD"].join("");

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

function resultGateEvent(eventId, threadId, eventType, target, occurredAt) {
  return {
    event_id: eventId,
    thread_id: threadId,
    event_type: eventType,
    target,
    target_thread_id: null,
    occurred_at: occurredAt,
    metadata_only: true,
    raw_preview: false,
    raw_turns: false,
    raw_messages: false,
    raw_reasoning: false,
    raw_tool_io: false,
    raw_cwd: false
  };
}

function ownerResultGateRegistry(threadId, terminalStage = null) {
  const events = [
    resultGateEvent(`gate-${threadId}-started`, threadId, "started", "none", "2026-08-04T01:02:03.000Z"),
    resultGateEvent(`gate-${threadId}-result`, threadId, "result_ready", "owner", "2026-08-04T01:02:04.000Z")
  ];
  if (terminalStage === "accepted" || terminalStage === "closed") {
    events.push(resultGateEvent(`gate-${threadId}-accepted`, threadId, "accepted", "owner", "2026-08-04T01:02:05.000Z"));
  }
  if (terminalStage === "closed") {
    events.push(resultGateEvent(`gate-${threadId}-closed`, threadId, "closed", "owner", "2026-08-04T01:02:06.000Z"));
  }
  return {
    schema_version: THREAD_RESULT_GATE_SCHEMA,
    registry_revision: 1,
    updated_at: AT,
    disabled: false,
    events
  };
}

function emptyResultGateRegistry() {
  return {
    schema_version: THREAD_RESULT_GATE_SCHEMA,
    registry_revision: 1,
    updated_at: AT,
    disabled: false,
    events: []
  };
}

function buildOwnerResultProjection(threadId, runtimeThreads, terminalStage = null) {
  return buildLiveThreadProjection({
    enrollmentRegistry: registry([enrollmentEntry(threadId)]),
    resultGateRegistry: ownerResultGateRegistry(threadId, terminalStage),
    runtimeThreads,
    adapter: { health: "ready", coverage: "partial", transport: "loopback_local", last_refresh_at: AT },
    generatedAt: AT
  });
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
        cwd: SYNTHETIC_LEAK_SENTINEL_CWD,
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
        cwd: SYNTHETIC_LEAK_SENTINEL_CWD
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
    "attention_target",
    "child_result_count",
    "display_label",
    "execution_ready",
    "lifecycle",
    "observed",
    "organization_group_id",
    "organization_route_state",
    "parent_thread_id",
    "relationship",
    "result_state",
    "route_id",
    "status",
    "stop_observed_at",
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
    updated_at: AT,
    stop_observed_at: null
  });
  assert.equal(projectRuntimeThread({ id: "thread-wait", status: { type: "active", activeFlags: ["waitingOnUserInput"] } }).status, "waiting");
  assert.equal(projectRuntimeThread({ id: "thread-idle", status: { type: "idle" } }).status, "not_loaded_unknown");
  assert.equal(projectRuntimeThread({ id: "thread-notloaded", status: { type: "notLoaded" } }).status, "not_loaded_unknown");
  assert.equal(projectRuntimeThread({ id: "thread-error", status: { type: "systemError" } }).status, "error");
});

test("an exact stopped root turn stays non-attention without an explicit result gate", () => {
  const projection = buildLiveThreadProjection({
    enrollmentRegistry: registry([enrollmentEntry("thread-root-stopped")]),
    resultGateRegistry: emptyResultGateRegistry(),
    lifecycleSourceHealth: "available",
    runtimeThreads: [{
      thread_id: "thread-root-stopped",
      status: "stopped",
      updated_at: AT,
      stop_observed_at: AT
    }],
    adapter: { health: "ready", coverage: "partial", transport: "loopback_local", last_refresh_at: AT },
    generatedAt: AT
  });
  const root = projection.threads[0];

  assert.equal(root.status, "stopped");
  assert.equal(root.result_state, "none");
  assert.equal(root.attention_target, "none");
  assert.equal(root.stop_observed_at, AT);
  assert.equal(isAcknowledgeableLiveThread(root), false);
});

test("an explicit gate state keeps its meaning when the latest turn is stopped", () => {
  const projection = buildLiveThreadProjection({
    enrollmentRegistry: registry([enrollmentEntry("thread-started-gate")]),
    resultGateRegistry: {
      ...emptyResultGateRegistry(),
      events: [resultGateEvent("gate-thread-started", "thread-started-gate", "started", "none", AT)]
    },
    lifecycleSourceHealth: "available",
    runtimeThreads: [{
      thread_id: "thread-started-gate",
      status: "stopped",
      updated_at: AT,
      stop_observed_at: AT
    }],
    adapter: { health: "ready", coverage: "partial", transport: "loopback_local", last_refresh_at: AT },
    generatedAt: AT
  });
  const thread = projection.threads[0];

  assert.equal(thread.status, "stopped");
  assert.equal(thread.result_state, "started");
  assert.equal(thread.attention_target, "none");
});

test("an exact stopped child turn does not create a parent result without an explicit gate", () => {
  const projection = buildLiveThreadProjection({
    enrollmentRegistry: registry([
      enrollmentEntry("thread-parent", { thread_kind: "manager", display_label: "Parent MANAGER" }),
      enrollmentEntry("thread-child", {
        display_label: "Child TASK",
        relationship: "child",
        parent_thread_id: "thread-parent"
      })
    ]),
    resultGateRegistry: emptyResultGateRegistry(),
    lifecycleSourceHealth: "available",
    runtimeThreads: [{
      thread_id: "thread-child",
      status: "stopped",
      updated_at: AT,
      stop_observed_at: AT
    }],
    adapter: { health: "ready", coverage: "partial", transport: "loopback_local", last_refresh_at: AT },
    generatedAt: AT
  });
  const parent = projection.threads.find((thread) => thread.thread_id === "thread-parent");
  const child = projection.threads.find((thread) => thread.thread_id === "thread-child");

  assert.equal(child.status, "stopped");
  assert.equal(child.result_state, "none");
  assert.equal(child.attention_target, "none");
  assert.equal(isAcknowledgeableLiveThread(child), false);
  assert.equal(parent.status, "not_loaded_unknown");
  assert.equal(parent.child_result_count, 0);
  assert.equal(isAcknowledgeableLiveThread(parent), false);
});

test("stopped turns stay fail-closed when a result-gate source is unavailable or their exact parent is no longer current", () => {
  const unavailableGate = buildLiveThreadProjection({
    enrollmentRegistry: registry([enrollmentEntry("thread-root-unavailable-gate")]),
    resultGateHealth: "available",
    lifecycleSourceHealth: "available",
    runtimeThreads: [{
      thread_id: "thread-root-unavailable-gate",
      status: "stopped",
      updated_at: AT,
      stop_observed_at: AT
    }],
    adapter: { health: "ready", coverage: "partial", transport: "loopback_local", last_refresh_at: AT },
    generatedAt: AT
  });
  const inactiveParent = buildLiveThreadProjection({
    enrollmentRegistry: registry([
      enrollmentEntry("thread-history-parent", { lifecycle: "history", thread_kind: "manager" }),
      enrollmentEntry("thread-child-with-history-parent", {
        relationship: "child",
        parent_thread_id: "thread-history-parent"
      })
    ]),
    resultGateRegistry: emptyResultGateRegistry(),
    lifecycleSourceHealth: "available",
    runtimeThreads: [{
      thread_id: "thread-child-with-history-parent",
      status: "stopped",
      updated_at: AT,
      stop_observed_at: AT
    }],
    adapter: { health: "ready", coverage: "partial", transport: "loopback_local", last_refresh_at: AT },
    generatedAt: AT
  });

  assert.equal(unavailableGate.scope.result_gate_health, "missing");
  for (const thread of [
    unavailableGate.threads.find((item) => item.thread_id === "thread-root-unavailable-gate"),
    inactiveParent.threads.find((item) => item.thread_id === "thread-child-with-history-parent")
  ]) {
    assert.equal(thread.status, "stopped");
    assert.equal(thread.result_state, "none");
    assert.equal(thread.attention_target, "none");
  }
});

test("a positive active or waiting observation supersedes a stopped-turn result candidate", () => {
  const projection = buildLiveThreadProjection({
    enrollmentRegistry: registry([enrollmentEntry("thread-resumed")]),
    resultGateRegistry: emptyResultGateRegistry(),
    lifecycleSourceHealth: "available",
    runtimeThreads: [
      { thread_id: "thread-resumed", status: "stopped", updated_at: "2026-08-04T01:02:04.000Z", stop_observed_at: "2026-08-04T01:02:04.000Z" },
      { id: "thread-resumed", status: { type: "active", activeFlags: ["waitingOnUserInput"] }, updatedAt: AT }
    ],
    adapter: { health: "ready", coverage: "partial", transport: "loopback_local", last_refresh_at: AT },
    generatedAt: AT
  });
  const thread = projection.threads[0];

  assert.equal(thread.status, "waiting");
  assert.equal(thread.result_state, "none");
  assert.equal(thread.attention_target, "none");
});

test("positive runtime activity temporarily supersedes an Owner result gate without mutating it", () => {
  for (const [label, runtime] of [
    ["active", { id: "thread-owner-active", status: { type: "active", activeFlags: [] }, updatedAt: AT }],
    ["waiting", { id: "thread-owner-waiting", status: { type: "active", activeFlags: ["waitingOnUserInput"] }, updatedAt: AT }]
  ]) {
    const threadId = runtime.id;
    const resultGateRegistry = ownerResultGateRegistry(threadId);
    const beforeProjection = JSON.stringify(resultGateRegistry);
    const projection = buildLiveThreadProjection({
      enrollmentRegistry: registry([enrollmentEntry(threadId)]),
      resultGateRegistry,
      runtimeThreads: [runtime],
      adapter: { health: "ready", coverage: "partial", transport: "loopback_local", last_refresh_at: AT },
      generatedAt: AT
    });
    const thread = projection.threads[0];

    assert.equal(thread.status, label);
    assert.equal(thread.result_state, "none");
    assert.equal(thread.attention_target, "none");
    assert.equal(isAcknowledgeableLiveThread(thread), false);
    assert.equal(JSON.stringify(resultGateRegistry), beforeProjection);
    assert.equal(normalizeLiveThreadProjection(projection).adapter.health, "ready");
  }
});

test("stopped or unknown runtime observation reveals an unaccepted Owner result gate", () => {
  for (const [threadId, runtime] of [
    ["thread-owner-stopped", { thread_id: "thread-owner-stopped", status: "stopped", updated_at: AT, stop_observed_at: AT }],
    ["thread-owner-unknown", { id: "thread-owner-unknown", status: { type: "idle" }, updatedAt: AT }]
  ]) {
    const projection = buildOwnerResultProjection(threadId, [runtime]);
    const thread = projection.threads[0];

    assert.equal(thread.status, "owner_attention");
    assert.equal(thread.result_state, "owner_attention");
    assert.equal(thread.attention_target, "owner");
    assert.equal(isAcknowledgeableLiveThread(thread), true);
  }
});

test("accepted and closed gates remain terminal despite a positive runtime observation", () => {
  for (const terminalStage of ["accepted", "closed"]) {
    const threadId = `thread-owner-${terminalStage}`;
    const projection = buildOwnerResultProjection(
      threadId,
      [{ id: threadId, status: { type: "active", activeFlags: [] }, updatedAt: AT }],
      terminalStage
    );
    const thread = projection.history[0];

    assert.equal(projection.threads.length, 0);
    assert.equal(thread.status, "accepted_closed");
    assert.equal(thread.result_state, terminalStage);
    assert.equal(thread.attention_target, "none");
    assert.equal(isAcknowledgeableLiveThread(thread), false);
  }
});

test("only an explicit Owner-targeted result can be locally acknowledged", () => {
  const ownerResult = { status: "owner_attention", result_state: "owner_attention", attention_target: "owner", lifecycle: "current" };
  assert.equal(isAcknowledgeableLiveThread({ thread_kind: "task", ...ownerResult }), true);
  assert.equal(isAcknowledgeableLiveThread({ thread_kind: "manager", ...ownerResult }), true);
  assert.equal(isAcknowledgeableLiveThread({ thread_kind: "verifier", status: "parent_result_ready", result_state: "delivered_to_parent", attention_target: "parent", lifecycle: "current" }), false);
  assert.equal(isAcknowledgeableLiveThread({ thread_kind: "task", status: "active" }), false);
  assert.equal(isAcknowledgeableLiveThread({ thread_kind: "task", status: "not_loaded_unknown" }), false);
});

test("catalog metadata supplies arbitrary group labels while unknown groups remain HOLD", () => {
  const organization = {
    health: "available",
    catalog_revision: 7,
    root_display_label: "Synthetic organization",
    companies: [{
      company_id: "catalog-company",
      display_label: "Catalog Company",
      ceo_group_id: "catalog-ceo",
      sort_order: 3
    }],
    groups: [
      {
        organization_group_id: "catalog-ceo",
        company_id: "catalog-company",
        display_label: "Catalog CEO",
        parent_group_id: null,
        presentation_role: "ceo",
        sort_order: 0
      },
      {
        organization_group_id: "catalog-delivery",
        company_id: "catalog-company",
        display_label: "Renamed Delivery",
        parent_group_id: "catalog-ceo",
        presentation_role: "manager_peers",
        sort_order: 2
      }
    ],
    unknown_enrolled_group_ids: []
  };
  assert.equal(organizationGroupLabel("catalog-delivery", organization), "Renamed Delivery");
  assert.equal(organizationGroupLabel("new-owner-group", organization), "new-owner-group · 미할당/보류");
});

test("projection carries only sanitized catalog metadata and holds unknown enrolled groups", () => {
  const catalog = {
    schema_version: "soulforge.team_ops_board.organization_catalog.v1",
    catalog_revision: 4,
    updated_at: AT,
    disabled: false,
    root_display_label: "Synthetic organization",
    companies: [{
      company_id: "catalog-company",
      display_label: "Catalog Company",
      ceo_group_id: "catalog-ceo",
      sort_order: 0,
      lifecycle: "active"
    }],
    groups: [{
      organization_group_id: "catalog-ceo",
      company_id: "catalog-company",
      display_label: "Catalog CEO",
      parent_group_id: null,
      presentation_role: "ceo",
      sort_order: 0,
      lifecycle: "active"
    }],
    metadata_only: true,
    raw_preview: false,
    raw_turns: false,
    raw_messages: false,
    raw_reasoning: false,
    raw_tool_io: false,
    raw_cwd: false
  };
  const projection = buildLiveThreadProjection({
    enrollmentRegistry: registry([
      enrollmentEntry("catalog-thread", { organization_group_id: "catalog-ceo" }),
      enrollmentEntry("unknown-thread", { organization_group_id: "future-group" })
    ]),
    organizationCatalog: catalog,
    organizationCatalogHealth: "available",
    adapter: { health: "ready", coverage: "partial", transport: "loopback_local", last_refresh_at: AT },
    generatedAt: AT
  });
  assert.equal(projection.organization.health, "hold");
  assert.deepEqual(projection.organization.companies.map((company) => company.company_id), ["catalog-company"]);
  assert.deepEqual(projection.organization.unknown_enrolled_group_ids, ["future-group"]);
  assert.equal(JSON.stringify(projection).includes("raw_messages"), false);
  assert.equal(normalizeLiveThreadProjection(projection).organization.health, "hold");
});

test("frontend normalizer rejects unexpected fields and fails closed", () => {
  const unavailable = createUnavailableLiveThreadProjection({ health: "error", enrollmentHealth: "invalid" });
  const invalid = normalizeLiveThreadProjection({ ...unavailable, unexpected: "raw" });
  assert.equal(invalid.adapter.health, "error");
  assert.equal(invalid.scope.enrollment_health, "invalid");
});
