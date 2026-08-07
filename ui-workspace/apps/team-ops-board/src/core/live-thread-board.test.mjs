import test from "node:test";
import assert from "node:assert/strict";

import {
  acknowledgeLiveThread,
  buildCompactOrganizationLanes,
  buildManagerDescendantProjection,
  buildOperationalOrganizationTopology,
  buildProjectManagerCards,
  createLiveThreadProjectionRequest,
  findExactManagerAncestor,
  groupLiveThreadsByOrganization,
  isLiveThreadAcknowledged,
  isOperationalTopologyTransient,
  liveThreadAcknowledgementKey,
  operationalTopologyStatusTone,
  restoreLiveThread,
  selectOwnerAttentionThreads,
  selectLiveThreadView
} from "./live-thread-board.mjs";
import {
  LIVE_THREAD_PROJECTION_SCHEMA,
  THREAD_ENROLLMENT_SCHEMA,
  THREAD_RESULT_GATE_SCHEMA,
  buildLiveThreadProjection
} from "./live-thread-projection.mjs";

const AT = "2026-08-04T01:02:03.000Z";

function organization(overrides = {}) {
  return {
    health: "available",
    catalog_revision: 4,
    root_display_label: "Synthetic organization",
    companies: [
      {
        company_id: "catalog-company",
        display_label: "Catalog Company",
        ceo_group_id: "catalog-company",
        sort_order: 20
      },
      {
        company_id: "first-company",
        display_label: "First Company",
        ceo_group_id: "first-company",
        sort_order: 10
      }
    ],
    groups: [
      {
        organization_group_id: "catalog-company",
        company_id: "catalog-company",
        display_label: "Catalog CEO",
        parent_group_id: null,
        presentation_role: "ceo",
        sort_order: 0
      },
      {
        organization_group_id: "catalog-delivery",
        company_id: "catalog-company",
        display_label: "Catalog Delivery",
        parent_group_id: "catalog-company",
        presentation_role: "manager_peers",
        sort_order: 30
      },
      {
        organization_group_id: "catalog-new-unit",
        company_id: "catalog-company",
        display_label: "New Catalog Unit",
        parent_group_id: "catalog-company",
        presentation_role: "group_node",
        sort_order: 40
      },
      {
        organization_group_id: "first-company",
        company_id: "first-company",
        display_label: "First CEO",
        parent_group_id: null,
        presentation_role: "ceo",
        sort_order: 0
      }
    ],
    unknown_enrolled_group_ids: [],
    ...overrides
  };
}

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
    organization: organization(),
    threads,
    history
  };
}

function explicitOwnerResultProjection(updatedAt = AT) {
  return buildLiveThreadProjection({
    enrollmentRegistry: {
      schema_version: THREAD_ENROLLMENT_SCHEMA,
      registry_revision: 1,
      updated_at: updatedAt,
      disabled: false,
      entries: [{
        thread_id: "thread-stopped-root",
        organization_group_id: "org-development1",
        route_id: null,
        work_id: null,
        thread_kind: "task",
        display_label: "Explicit Owner result",
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
        updated_at: updatedAt
      }]
    },
    resultGateRegistry: {
      schema_version: THREAD_RESULT_GATE_SCHEMA,
      registry_revision: 1,
      updated_at: updatedAt,
      disabled: false,
      events: [
        {
          event_id: `gate-thread-stopped-root-started-${Date.parse(updatedAt)}`,
          thread_id: "thread-stopped-root",
          event_type: "started",
          target: "none",
          target_thread_id: null,
          occurred_at: new Date(Date.parse(updatedAt) - 1).toISOString(),
          metadata_only: true,
          raw_preview: false,
          raw_turns: false,
          raw_messages: false,
          raw_reasoning: false,
          raw_tool_io: false,
          raw_cwd: false
        },
        {
          event_id: `gate-thread-stopped-root-result-${Date.parse(updatedAt)}`,
          thread_id: "thread-stopped-root",
          event_type: "result_ready",
          target: "owner",
          target_thread_id: null,
          occurred_at: updatedAt,
          metadata_only: true,
          raw_preview: false,
          raw_turns: false,
          raw_messages: false,
          raw_reasoning: false,
          raw_tool_io: false,
          raw_cwd: false
        }
      ]
    },
    lifecycleSourceHealth: "available",
    runtimeThreads: [{
      thread_id: "thread-stopped-root",
      status: "stopped",
      updated_at: updatedAt,
      stop_observed_at: updatedAt
    }],
    adapter: { health: "ready", coverage: "partial", transport: "loopback_local", last_refresh_at: updatedAt },
    generatedAt: updatedAt
  });
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

test("an acknowledged explicit Owner result stays in local history and reappears for a newer result event", () => {
  const storage = new MemoryStorage();
  const first = explicitOwnerResultProjection();
  const root = first.threads[0];
  assert.equal(root.status, "owner_attention");
  assert.equal(acknowledgeLiveThread(storage, root), true);
  assert.deepEqual(selectLiveThreadView(first, storage, "active").threads, []);
  assert.equal(selectLiveThreadView(first, storage, "history").threads[0].thread_id, "thread-stopped-root");

  const updated = explicitOwnerResultProjection("2026-08-04T01:12:03.000Z");
  assert.equal(selectLiveThreadView(updated, storage, "active").threads[0].thread_id, "thread-stopped-root");
});

test("grouping uses owner-provided organization group metadata only", () => {
  const groups = groupLiveThreadsByOrganization([
    thread("thread-b", { organization_group_id: "org-system" }),
    thread("thread-a", { organization_group_id: "org-development1" })
  ]);
  assert.deepEqual(groups.map((group) => group.organization_group_id), ["org-development1", "org-system"]);
});

test("compact organization lanes retain arbitrary catalog-backed root managers as peers without fixed lane names", () => {
  const catalog = organization();
  const groups = groupLiveThreadsByOrganization([
    thread("root-executive", { thread_kind: "manager", organization_group_id: "catalog-company" }),
    thread("manager-alpha", { thread_kind: "manager", organization_group_id: "catalog-delivery", display_label: "Arbitrary Alpha" }),
    thread("manager-beta", { thread_kind: "manager", organization_group_id: "catalog-delivery", display_label: "Arbitrary Beta", status: "active" }),
    thread("responsibility-alpha", { thread_kind: "manager", organization_group_id: "catalog-delivery", parent_thread_id: "manager-alpha" })
  ], catalog).map((group) => ({ ...group, buckets: {} }));
  const { companies } = buildCompactOrganizationLanes(groups, catalog);
  const company = companies.find((item) => item.company_id === "catalog-company");
  const delivery = company.lanes.find((lane) => lane.lane_id === "catalog-delivery");
  assert.deepEqual(delivery.group_ids, ["catalog-delivery"]);
  assert.deepEqual(delivery.manager_threads.map((item) => item.thread_id).sort(), ["manager-alpha", "manager-beta"]);
});

test("catalog order and an empty newly-created group are preserved without code changes", () => {
  const catalog = organization();
  const groups = groupLiveThreadsByOrganization([], catalog).map((group) => ({ ...group, buckets: {} }));
  const layout = buildCompactOrganizationLanes(groups, catalog);
  assert.deepEqual(layout.companies.map((company) => company.company_id), ["first-company", "catalog-company"]);
  const company = layout.companies.find((item) => item.company_id === "catalog-company");
  assert.deepEqual(company.lanes.map((lane) => lane.lane_id), ["catalog-delivery", "catalog-new-unit"]);
  assert.equal(company.lanes.find((lane) => lane.lane_id === "catalog-new-unit").threads.length, 0);
});

test("operational topology keeps catalog Company/CEO and exact root managers as stable anchors", () => {
  const storage = new MemoryStorage();
  const ownerResult = thread("owner-result", {
    organization_group_id: "catalog-delivery",
    parent_thread_id: "responsibility",
    status: "owner_attention",
    result_state: "owner_attention",
    attention_target: "owner"
  });
  assert.equal(acknowledgeLiveThread(storage, ownerResult), true);
  const topology = buildOperationalOrganizationTopology({
    organization: organization(),
    storage,
    threadsInput: [
      thread("root-manager", {
        organization_group_id: "catalog-delivery",
        thread_kind: "manager",
        status: "stopped"
      }),
      thread("responsibility", {
        organization_group_id: "catalog-delivery",
        thread_kind: "manager",
        parent_thread_id: "root-manager",
        status: "active"
      }),
      thread("execution-task", {
        organization_group_id: "catalog-delivery",
        parent_thread_id: "responsibility",
        status: "waiting"
      }),
      thread("verification", {
        organization_group_id: "catalog-delivery",
        thread_kind: "verifier",
        parent_thread_id: "execution-task",
        status: "parent_result_ready",
        attention_target: "parent"
      }),
      ownerResult,
      thread("closed-task", {
        organization_group_id: "catalog-delivery",
        parent_thread_id: "responsibility",
        status: "accepted_closed"
      }),
      thread("stopped-task", {
        organization_group_id: "catalog-delivery",
        parent_thread_id: "responsibility",
        status: "stopped"
      }),
      thread("unknown-task", {
        organization_group_id: "catalog-delivery",
        parent_thread_id: "responsibility",
        status: "not_loaded_unknown"
      })
    ]
  });

  assert.deepEqual(
    topology.nodes.filter((node) => node.node_kind === "company_anchor").map((node) => node.node_id),
    ["company:first-company", "company:catalog-company"]
  );
  const root = topology.nodes.find((node) => node.thread_id === "root-manager");
  assert.equal(root?.node_kind, "manager_anchor");
  assert.equal(root?.stable, true);
  assert.equal(root?.tone, "unknown");
  assert.deepEqual(
    topology.nodes.filter((node) => node.node_kind === "transient_thread").map((node) => node.thread_id).sort(),
    ["execution-task", "responsibility", "verification"]
  );
  assert.deepEqual(
    topology.edges.map((edge) => edge.edge_id).sort(),
    [
      "authority:catalog-company:root-manager",
      "parent:execution-task:verification",
      "parent:responsibility:execution-task",
      "parent:root-manager:responsibility"
    ]
  );
  assert.equal(topology.nodes.some((node) => node.thread_id === "owner-result"), false);
  assert.equal(topology.nodes.some((node) => node.thread_id === "closed-task"), false);
  assert.equal(topology.nodes.some((node) => node.thread_id === "stopped-task"), false);
  assert.equal(topology.nodes.some((node) => node.thread_id === "unknown-task"), false);
});

test("live operational topology keeps two actionable TASK paths and omits unrelated manager anchors", () => {
  const topology = buildOperationalOrganizationTopology({
    organization: organization(),
    mode: "live",
    threadsInput: [
      thread("root-manager", {
        organization_group_id: "catalog-delivery",
        thread_kind: "manager",
        status: "stopped"
      }),
      thread("responsibility-a", {
        organization_group_id: "catalog-delivery",
        thread_kind: "manager",
        parent_thread_id: "root-manager",
        status: "not_loaded_unknown"
      }),
      thread("task-a", {
        organization_group_id: "catalog-delivery",
        parent_thread_id: "responsibility-a",
        status: "active"
      }),
      thread("responsibility-b", {
        organization_group_id: "catalog-delivery",
        thread_kind: "manager",
        parent_thread_id: "root-manager",
        status: "stopped"
      }),
      thread("task-b", {
        organization_group_id: "catalog-delivery",
        parent_thread_id: "responsibility-b",
        status: "waiting"
      }),
      thread("unrelated-manager", {
        organization_group_id: "catalog-new-unit",
        thread_kind: "manager",
        status: "stopped"
      }),
      thread("other-company-manager", {
        organization_group_id: "first-company",
        thread_kind: "manager",
        status: "stopped"
      })
    ]
  });

  assert.equal(topology.mode, "live");
  assert.deepEqual(topology.companies.map((company) => company.company_id), ["catalog-company"]);
  assert.deepEqual(
    topology.nodes.filter((node) => node.thread_id).map((node) => node.thread_id).sort(),
    ["responsibility-a", "responsibility-b", "root-manager", "task-a", "task-b"]
  );
  assert.equal(topology.nodes.some((node) => node.thread_id === "unrelated-manager"), false);
  assert.equal(topology.nodes.some((node) => node.thread_id === "other-company-manager"), false);
  assert.deepEqual(
    topology.edges
      .filter((edge) => edge.edge_kind === "parent_thread_id")
      .map((edge) => [edge.parent_thread_id, edge.child_thread_id])
      .sort((left, right) => left.join(":").localeCompare(right.join(":"))),
    [
      ["responsibility-a", "task-a"],
      ["responsibility-b", "task-b"],
      ["root-manager", "responsibility-a"],
      ["root-manager", "responsibility-b"]
    ]
  );
});

test("operational topology status tones fail closed and omit locally acknowledged results", () => {
  const storage = new MemoryStorage();
  const ownerResult = thread("owner-result", {
    status: "owner_attention",
    result_state: "owner_attention",
    attention_target: "owner"
  });
  assert.equal(operationalTopologyStatusTone(thread("active", { status: "active" })), "active");
  assert.equal(operationalTopologyStatusTone(thread("waiting", { status: "waiting" })), "waiting");
  assert.equal(operationalTopologyStatusTone(thread("parent-result", { status: "parent_result_ready", attention_target: "parent" })), "result");
  assert.equal(operationalTopologyStatusTone(ownerResult), "result");
  assert.equal(operationalTopologyStatusTone(thread("wrong-target", { status: "owner_attention", attention_target: "parent" })), "unknown");
  assert.equal(operationalTopologyStatusTone(thread("closed", { status: "accepted_closed" })), "unknown");
  assert.equal(operationalTopologyStatusTone(thread("dormant", { status: "dormant" })), "unknown");
  assert.equal(operationalTopologyStatusTone(thread("stopped", { status: "stopped" })), "unknown");
  assert.equal(operationalTopologyStatusTone(thread("unknown", { status: "not_loaded_unknown" })), "unknown");
  assert.equal(isOperationalTopologyTransient(thread("unknown", { status: "not_loaded_unknown" })), false);
  assert.equal(acknowledgeLiveThread(storage, ownerResult), true);
  assert.equal(operationalTopologyStatusTone(ownerResult, storage), "unknown");
  assert.equal(isOperationalTopologyTransient(ownerResult, storage), false);
});

test("operational topology keeps an explicit parent-delivered TASK as a result at its root manager", () => {
  const taskId = "019fcb05-69da-7ce3-86c4-d06100ad0606";
  const deliveredTask = thread(taskId, {
    organization_group_id: "catalog-delivery",
    parent_thread_id: "root-manager",
    status: "stopped",
    result_state: "delivered_to_parent",
    attention_target: "parent"
  });
  const topology = buildOperationalOrganizationTopology({
    organization: organization(),
    threadsInput: [
      thread("root-manager", {
        organization_group_id: "catalog-delivery",
        thread_kind: "manager",
        status: "not_loaded_unknown"
      }),
      deliveredTask
    ]
  });
  const node = topology.nodes.find((item) => item.thread_id === taskId);
  assert.equal(operationalTopologyStatusTone(deliveredTask), "result");
  assert.equal(isOperationalTopologyTransient(deliveredTask), true);
  assert.equal(node?.node_kind, "transient_thread");
  assert.equal(node?.tone, "result");
  assert.deepEqual(
    topology.edges.filter((edge) => edge.edge_kind === "parent_thread_id").map((edge) => [edge.parent_thread_id, edge.child_thread_id]),
    [["root-manager", taskId]]
  );
  const genericStopped = thread("generic-stopped", { status: "stopped" });
  assert.equal(operationalTopologyStatusTone(genericStopped), "unknown");
  assert.equal(isOperationalTopologyTransient(genericStopped), false);
});

test("operational topology keeps an exact unknown responsibility as a fixed roster anchor for an active descendant", () => {
  const topology = buildOperationalOrganizationTopology({
    organization: organization(),
    threadsInput: [
      thread("root-manager", {
        organization_group_id: "catalog-delivery",
        thread_kind: "manager",
        status: "stopped"
      }),
      thread("unknown-responsibility", {
        organization_group_id: "catalog-delivery",
        thread_kind: "manager",
        parent_thread_id: "root-manager",
        status: "not_loaded_unknown"
      }),
      thread("active-task", {
        organization_group_id: "catalog-delivery",
        parent_thread_id: "unknown-responsibility",
        status: "active"
      })
    ]
  });
  const responsibility = topology.nodes.find((node) => node.thread_id === "unknown-responsibility");
  const activeTask = topology.nodes.find((node) => node.thread_id === "active-task");
  assert.equal(responsibility?.node_kind, "responsibility_anchor");
  assert.equal(responsibility?.tone, "unknown");
  assert.equal(responsibility?.rollup_tone, "active");
  assert.equal(activeTask?.node_kind, "transient_thread");
  assert.equal(activeTask?.tone, "active");
  assert.deepEqual(
    topology.edges.filter((edge) => edge.edge_kind === "parent_thread_id").map((edge) => [edge.parent_thread_id, edge.child_thread_id]),
    [["root-manager", "unknown-responsibility"], ["unknown-responsibility", "active-task"]]
  );
});

test("full topology includes every exact current manager through responsibility level but no dormant TASK", () => {
  const topology = buildOperationalOrganizationTopology({
    mode: "all",
    organization: organization(),
    threadsInput: [
      thread("root-manager", {
        organization_group_id: "catalog-delivery",
        thread_kind: "manager",
        status: "not_loaded_unknown"
      }),
      thread("responsibility-one", {
        organization_group_id: "catalog-delivery",
        thread_kind: "manager",
        parent_thread_id: "root-manager",
        status: "not_loaded_unknown"
      }),
      thread("responsibility-two", {
        organization_group_id: "catalog-delivery",
        thread_kind: "manager",
        parent_thread_id: "root-manager",
        status: "stopped"
      }),
      thread("dormant-task", {
        organization_group_id: "catalog-delivery",
        parent_thread_id: "responsibility-one",
        status: "not_loaded_unknown"
      })
    ]
  });
  assert.deepEqual(
    topology.nodes.filter((node) => node.thread_id).map((node) => [node.thread_id, node.node_kind]),
    [
      ["root-manager", "manager_anchor"],
      ["responsibility-two", "responsibility_anchor"],
      ["responsibility-one", "responsibility_anchor"]
    ]
  );
  assert.equal(topology.nodes.some((node) => node.thread_id === "dormant-task"), false);
});

test("full topology follows an exact manager edge into its catalog child group", () => {
  const topology = buildOperationalOrganizationTopology({
    mode: "all",
    organization: organization(),
    threadsInput: [
      thread("company-manager", {
        organization_group_id: "catalog-company",
        thread_kind: "manager"
      }),
      thread("unit-manager", {
        organization_group_id: "catalog-new-unit",
        thread_kind: "manager",
        relationship: "child",
        parent_thread_id: "company-manager"
      }),
      thread("unit-responsibility", {
        organization_group_id: "catalog-new-unit",
        thread_kind: "manager",
        relationship: "child",
        parent_thread_id: "unit-manager"
      })
    ]
  });
  assert.deepEqual(
    topology.nodes.filter((node) => node.thread_id).map((node) => [node.thread_id, node.node_kind]),
    [
      ["company-manager", "manager_anchor"],
      ["unit-manager", "responsibility_anchor"],
      ["unit-responsibility", "responsibility_anchor"]
    ]
  );
  assert.deepEqual(
    topology.edges.filter((edge) => edge.edge_kind === "parent_thread_id").map((edge) => [edge.parent_thread_id, edge.child_thread_id]),
    [["company-manager", "unit-manager"], ["unit-manager", "unit-responsibility"]]
  );
});

test("live topology walks an exact actionable path across multiple catalog group levels", () => {
  const catalog = organization();
  catalog.groups.push({
    organization_group_id: "catalog-subunit",
    company_id: "catalog-company",
    display_label: "Catalog Subunit",
    parent_group_id: "catalog-new-unit",
    presentation_role: "group_node",
    sort_order: 50
  });
  const topology = buildOperationalOrganizationTopology({
    mode: "live",
    organization: catalog,
    threadsInput: [
      thread("company-manager", {
        organization_group_id: "catalog-company",
        thread_kind: "manager"
      }),
      thread("unit-manager", {
        organization_group_id: "catalog-new-unit",
        thread_kind: "manager",
        relationship: "child",
        parent_thread_id: "company-manager"
      }),
      thread("subunit-responsibility", {
        organization_group_id: "catalog-subunit",
        thread_kind: "manager",
        relationship: "child",
        parent_thread_id: "unit-manager"
      }),
      thread("active-subunit-task", {
        organization_group_id: "catalog-subunit",
        relationship: "child",
        parent_thread_id: "subunit-responsibility",
        status: "active"
      })
    ]
  });
  assert.deepEqual(
    topology.nodes.filter((node) => node.thread_id).map((node) => node.thread_id),
    ["company-manager", "unit-manager", "subunit-responsibility", "active-subunit-task"]
  );
  assert.deepEqual(topology.omitted_transient_thread_ids, []);
});

test("an exact stopped child turn stays out of live topology without explicit result delivery", () => {
  const stoppedTask = thread("stopped-child", {
    organization_group_id: "catalog-delivery",
    parent_thread_id: "root-manager",
    status: "not_loaded_unknown",
    stop_observed_at: "2026-08-06T01:02:03.000Z",
    result_state: "none",
    attention_target: "none"
  });
  const topology = buildOperationalOrganizationTopology({
    organization: organization(),
    threadsInput: [
      thread("root-manager", {
        organization_group_id: "catalog-delivery",
        thread_kind: "manager",
        status: "not_loaded_unknown"
      }),
      stoppedTask
    ]
  });
  const node = topology.nodes.find((item) => item.thread_id === "stopped-child");
  assert.equal(operationalTopologyStatusTone(stoppedTask), "unknown");
  assert.equal(node, undefined);
});

test("operational topology fails closed behind an accepted responsibility ancestor", () => {
  const topology = buildOperationalOrganizationTopology({
    organization: organization(),
    threadsInput: [
      thread("root-manager", {
        organization_group_id: "catalog-delivery",
        thread_kind: "manager",
        status: "active"
      }),
      thread("accepted-responsibility", {
        organization_group_id: "catalog-delivery",
        thread_kind: "manager",
        parent_thread_id: "root-manager",
        status: "accepted_closed"
      }),
      thread("active-task", {
        organization_group_id: "catalog-delivery",
        parent_thread_id: "accepted-responsibility",
        status: "active"
      })
    ]
  });
  assert.equal(topology.nodes.some((node) => node.thread_id === "accepted-responsibility"), false);
  assert.equal(topology.nodes.some((node) => node.thread_id === "active-task"), false);
  assert.equal(topology.edges.some((edge) => edge.edge_kind === "parent_thread_id"), false);
  assert.deepEqual(topology.omitted_transient_thread_ids, ["active-task"]);
});

test("operational topology fails closed behind a locally acknowledged Owner-result ancestor", () => {
  const storage = new MemoryStorage();
  const acknowledgedResult = thread("acknowledged-result", {
    organization_group_id: "catalog-delivery",
    thread_kind: "manager",
    parent_thread_id: "root-manager",
    status: "owner_attention",
    result_state: "owner_attention",
    attention_target: "owner"
  });
  assert.equal(acknowledgeLiveThread(storage, acknowledgedResult), true);
  const topology = buildOperationalOrganizationTopology({
    organization: organization(),
    storage,
    threadsInput: [
      thread("root-manager", {
        organization_group_id: "catalog-delivery",
        thread_kind: "manager",
        status: "active"
      }),
      acknowledgedResult,
      thread("active-verifier", {
        organization_group_id: "catalog-delivery",
        thread_kind: "verifier",
        parent_thread_id: "acknowledged-result",
        status: "active"
      })
    ]
  });
  assert.equal(topology.nodes.some((node) => node.thread_id === "acknowledged-result"), false);
  assert.equal(topology.nodes.some((node) => node.thread_id === "active-verifier"), false);
  assert.equal(topology.edges.some((edge) => edge.edge_kind === "parent_thread_id"), false);
  assert.deepEqual(topology.omitted_transient_thread_ids, ["active-verifier"]);
});

test("operational topology rejects cross-group, unattached, cyclic, and guessed edges", () => {
  const topology = buildOperationalOrganizationTopology({
    organization: organization(),
    threadsInput: [
      thread("root-manager", {
        organization_group_id: "catalog-delivery",
        thread_kind: "manager",
        display_label: "Shared label",
        status: "active"
      }),
      thread("same-group-task", {
        organization_group_id: "catalog-delivery",
        parent_thread_id: "root-manager",
        display_label: "Shared label",
        status: "active"
      }),
      thread("cross-group-task", {
        organization_group_id: "catalog-new-unit",
        parent_thread_id: "root-manager",
        status: "active"
      }),
      thread("unattached-task", {
        organization_group_id: "catalog-delivery",
        parent_thread_id: null,
        status: "active"
      }),
      thread("cycle-left", {
        organization_group_id: "catalog-delivery",
        parent_thread_id: "cycle-right",
        status: "active"
      }),
      thread("cycle-right", {
        organization_group_id: "catalog-delivery",
        parent_thread_id: "cycle-left",
        status: "active"
      })
    ]
  });
  assert.deepEqual(
    topology.edges.filter((edge) => edge.edge_kind === "parent_thread_id").map((edge) => [edge.parent_thread_id, edge.child_thread_id]),
    [["root-manager", "same-group-task"]]
  );
  assert.deepEqual(topology.omitted_transient_thread_ids, ["cross-group-task", "cycle-left", "cycle-right", "unattached-task"]);
  assert.equal(topology.nodes.some((node) => node.thread_id === "cross-group-task"), false);
  assert.equal(topology.nodes.some((node) => node.thread_id === "unattached-task"), false);
  assert.equal(topology.nodes.some((node) => node.thread_id === "cycle-left"), false);
  assert.equal(topology.edges.some((edge) => edge.edge_id.includes("Shared label")), false);
});

test("manager descendants use only exact parent_thread_id and retain each explicit status", () => {
  const descendants = buildManagerDescendantProjection([
    thread("manager", { thread_kind: "manager" }),
    thread("responsibility", { thread_kind: "manager", parent_thread_id: "manager", status: "active" }),
    thread("direct-task", { parent_thread_id: "manager", status: "waiting" }),
    thread("nested-task", { parent_thread_id: "responsibility", status: "stopped" }),
    thread("unrelated", { parent_thread_id: null, status: "active" })
  ], "manager");
  assert.deepEqual(descendants.direct_children.map((item) => item.thread_id).sort(), ["direct-task", "responsibility"]);
  assert.deepEqual(descendants.all_descendants.map((item) => item.thread_id).sort(), ["direct-task", "nested-task", "responsibility"]);
  assert.deepEqual(descendants.task_descendants.map((item) => item.thread_id).sort(), ["direct-task", "nested-task"]);
  assert.equal(descendants.direct_children.find((item) => item.thread_id === "responsibility").status, "active");
  assert.equal(descendants.task_descendants.find((item) => item.thread_id === "nested-task").status, "stopped");
});

test("project cards keep each root manager separate and show only exact direct responsibility managers", () => {
  const managerAlpha = thread("manager-alpha", { thread_kind: "manager", organization_group_id: "projects" });
  const managerBeta = thread("manager-beta", { thread_kind: "manager", organization_group_id: "projects" });
  const responsibility = thread("responsibility", { thread_kind: "manager", organization_group_id: "projects", parent_thread_id: "manager-alpha" });
  const nestedResponsibility = thread("nested-responsibility", { thread_kind: "manager", organization_group_id: "projects", parent_thread_id: "responsibility" });
  const directTask = thread("direct-task", { thread_kind: "task", organization_group_id: "projects", parent_thread_id: "manager-alpha" });
  const crossGroup = thread("cross-group", { thread_kind: "manager", organization_group_id: "other", parent_thread_id: "manager-alpha" });
  const cards = buildProjectManagerCards(
    [managerAlpha, managerBeta],
    [managerAlpha, managerBeta, responsibility, nestedResponsibility, directTask, crossGroup]
  );
  assert.deepEqual(cards.map((card) => card.manager.thread_id), ["manager-alpha", "manager-beta"]);
  assert.deepEqual(cards[0].responsibility_threads.map((item) => item.thread_id), ["responsibility"]);
  assert.deepEqual(cards[1].responsibility_threads, []);
});

test("exact manager scope excludes peer roots, resolves a selected child upward, and fails closed on cycles", () => {
  const threads = [
    thread("manager-alpha", { thread_kind: "manager", display_label: "Arbitrary Alpha" }),
    thread("manager-beta", { thread_kind: "manager", display_label: "Arbitrary Beta" }),
    thread("responsibility-alpha", { thread_kind: "manager", parent_thread_id: "manager-alpha" }),
    thread("task-alpha", { parent_thread_id: "responsibility-alpha" }),
    thread("verifier-alpha", { thread_kind: "verifier", parent_thread_id: "task-alpha" }),
    thread("cycle-one", { parent_thread_id: "cycle-two" }),
    thread("cycle-two", { parent_thread_id: "cycle-one" })
  ];
  const alpha = buildManagerDescendantProjection(threads, "manager-alpha");
  assert.deepEqual(alpha.all_descendants.map((item) => item.thread_id).sort(), ["responsibility-alpha", "task-alpha", "verifier-alpha"]);
  assert.equal(alpha.all_descendants.some((item) => item.thread_id === "manager-beta"), false);
  assert.equal(findExactManagerAncestor(threads, "task-alpha")?.thread_id, "responsibility-alpha");
  assert.equal(findExactManagerAncestor(threads, "manager-beta")?.thread_id, "manager-beta");
  assert.equal(findExactManagerAncestor(threads, "cycle-one"), null);
});

test("an unknown owner-provided organization group remains visible without a fixed company catalog entry", () => {
  const groups = groupLiveThreadsByOrganization([
    thread("future-root", { organization_group_id: "future-ops-unit", thread_kind: "manager", display_label: "Future Root" })
  ], organization()).map((group) => ({ ...group, buckets: {} }));
  const layout = buildCompactOrganizationLanes(groups, organization());
  assert.deepEqual(layout.companies.map((company) => company.company_id), ["first-company", "catalog-company"]);
  assert.deepEqual(layout.unassigned_groups.map((group) => group.organization_group_id), ["future-ops-unit"]);
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
