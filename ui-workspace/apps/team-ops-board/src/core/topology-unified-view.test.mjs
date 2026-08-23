import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildUnifiedTopologyViewModel,
  toggleUnifiedTopologyExpansion,
} from "./topology-unified-view.mjs";

const DIGEST = "a".repeat(64);

function provider(providerId, overrides = {}) {
  return {
    provider_id: providerId,
    provider_kind: providerId === "watchtower" ? "platform" : "domain_engine",
    label: providerId,
    source: { source_id: `${providerId}_source`, revision: "v1", digest: DIGEST },
    declared_status: "active",
    validation: { validator_id: `${providerId}_validator`, state: "passed", evidence_ref: "public/ref" },
    capabilities: { observe: [], diagnose: [], propose_repair: [], execute_repair: false },
    authority_boundary: { runtime_mutation: false },
    claim_ceiling: "observed",
    runtime_state: "unknown",
    payload_state: "public_safe_contract",
    blocker_codes: [],
    ...overrides,
  };
}

function node(providerId, id, overrides = {}) {
  return {
    id: `${providerId}::${id}`,
    provider_id: providerId,
    label: id,
    kind: "worker",
    layer: "subsystem",
    parent_id: null,
    group: "collect",
    diagnostic_state: "validator_backed",
    repair_state: "none",
    ...overrides,
  };
}

function edge(providerId, id, from, to, overrides = {}) {
  return {
    id: `${providerId}::${id}`,
    provider_id: providerId,
    from: `${providerId}::${from}`,
    to: `${providerId}::${to}`,
    label: "append",
    relation: "data",
    layer: "subsystem",
    evidence_mode: "receipt_required",
    ...overrides,
  };
}

function federationProjection(overrides = {}) {
  const nodes = [
    node("watchtower", "collector"),
    node("watchtower", "ledger", { kind: "store", group: "데이터 평면" }),
    node("watchtower", "board", { kind: "consumer", group: "소비" }),
    node("engineering_engine", "kernel", { kind: "module", layer: "module", group: "kernel" }),
  ];
  const edges = [
    edge("watchtower", "edge.collector.ledger.data", "collector", "ledger"),
    edge("watchtower", "edge.ledger.board.data", "ledger", "board"),
  ];
  return {
    lens: "declared_structure",
    state: "ready",
    reason: null,
    snapshot: {
      projection_kind: "declared_structure",
      providers: [provider("watchtower"), provider("engineering_engine")],
      nodes,
      edges,
      source_set_digest: DIGEST,
      topology_digest: DIGEST,
      summary: {
        provider_count: 2,
        node_count: nodes.length,
        edge_count: edges.length,
        runtime_authority: false,
        repair_execution_authority: false,
      },
      ...overrides.snapshot,
    },
    ...overrides,
  };
}

function healthNode(id, kind, state = "ok", overrides = {}) {
  return {
    id,
    label: id,
    kind,
    group: kind === "store" ? "데이터 평면" : kind === "consumer" ? "소비" : "수집",
    health: { state, reasons: [], age_seconds: 12, ...overrides.health },
    ...overrides,
  };
}

function healthEdge(from, to, kindFlow, label = "append", overrides = {}) {
  return {
    from,
    to,
    flow: kindFlow,
    label,
    delivery: {
      state: "delivering",
      reason: null,
      age_seconds: 4,
      proves_delivery: true,
      ...overrides.delivery,
    },
  };
}

function healthProjection(overrides = {}) {
  return {
    refresh_state: "ready",
    snapshot: {
      observed_at: "2026-08-11T00:00:00.000Z",
      nodes: [
        healthNode("collector", "worker"),
        healthNode("ledger", "store", "stale"),
        healthNode("board", "consumer"),
      ],
      edges: [
        healthEdge("collector", "ledger", "data"),
        healthEdge("ledger", "board", "data"),
      ],
      ...overrides.snapshot,
    },
    ...overrides,
  };
}

function assertNoVisibleNodeOverlap(nodes) {
  const sizeByKind = {
    provider: { width: 292, height: 116 },
    group: { width: 242, height: 88 },
    node: { width: 226, height: 82 },
  };
  for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
      const left = nodes[leftIndex];
      const right = nodes[rightIndex];
      const leftSize = sizeByKind[left.displayKind];
      const rightSize = sizeByKind[right.displayKind];
      const overlaps = left.position.x < right.position.x + rightSize.width
        && left.position.x + leftSize.width > right.position.x
        && left.position.y < right.position.y + rightSize.height
        && left.position.y + leftSize.height > right.position.y;
      assert.equal(overlaps, false, `${left.id} overlaps ${right.id}`);
    }
  }
}

test("tracked federation totals remain 4 providers, 74 nodes and 206 provider-local edges", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..", "guild_hall", "watchtower", "topology", "federated_topology.v1.json");
  const snapshot = JSON.parse(readFileSync(root, "utf8"));
  const model = buildUnifiedTopologyViewModel({ lens: "declared_structure", state: "ready", reason: null, snapshot }, null);
  assert.equal(model.available, true);
  assert.deepEqual(
    { providers: model.source.providerCount, nodes: model.source.nodeCount, edges: model.source.edgeCount },
    { providers: 4, nodes: 74, edges: 206 },
  );
  assert.deepEqual(model.providers.map(({ id, nodeCount, edgeCount }) => ({ id, nodeCount, edgeCount })), [
    { id: "watchtower", nodeCount: 28, edgeCount: 36 },
    { id: "engineering_engine", nodeCount: 35, edgeCount: 156 },
    { id: "knowledge_stack", nodeCount: 7, edgeCount: 9 },
    { id: "watchtower_notebook_advisory_adapter", nodeCount: 4, edgeCount: 5 },
  ]);
  assert.equal(model.nodes.length, 4);
  assert.equal(model.nodes.every((entry) => entry.displayKind === "provider"), true);
  assert.equal(model.diagnostics.crossProviderEdgeCount, 0);
  assert.equal(model.diagnostics.gapLabel, "연결 계약 미선언");
});

test("tracked Watchtower identity overlays exact 28/28 with no duplicates or invented receipts", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..", "guild_hall", "watchtower", "topology", "federated_topology.v1.json");
  const snapshot = JSON.parse(readFileSync(root, "utf8"));
  const watchtowerNodes = snapshot.nodes.filter((entry) => entry.provider_id === "watchtower");
  const watchtowerEdges = snapshot.edges.filter((entry) => entry.provider_id === "watchtower");
  const health = {
    refresh_state: "ready",
    snapshot: {
      observed_at: "2026-08-11T00:00:00.000Z",
      nodes: watchtowerNodes.map((entry) => ({
        id: entry.id.slice("watchtower::".length),
        label: entry.label,
        kind: entry.kind,
        group: entry.group,
        health: { state: "unmonitored", reasons: [], age_seconds: 0 },
      })),
      edges: watchtowerEdges.map((entry) => ({
        from: entry.from.slice("watchtower::".length),
        to: entry.to.slice("watchtower::".length),
        flow: entry.relation,
        label: entry.label,
        delivery: { state: "unreceipted", reason: "receipt_channel_absent", age_seconds: 0, proves_delivery: false },
      })),
    },
  };
  const model = buildUnifiedTopologyViewModel({ lens: "declared_structure", state: "ready", reason: null, snapshot }, health);
  assert.equal(model.available, true);
  assert.equal(model.diagnostics.matchedHealthNodeCount, 28);
  assert.equal(model.diagnostics.watchtowerDeclaredNodeCount, 28);
  assert.deepEqual(model.diagnostics.unmatchedHealthIds, []);
  assert.deepEqual(model.diagnostics.missingWatchtowerIds, []);
  assert.equal(model.source.nodeIds.length, new Set(model.source.nodeIds).size);
  assert.equal(model.diagnostics.receiptOverlayCount, 36);
  assert.equal(model.diagnostics.receiptDeliveryProvenCount, 0);
  assert.equal(model.providers.filter((entry) => entry.id !== "watchtower")
    .every((entry) => entry.healthObserved === false && entry.runtimeState === "unknown"), true);
});

test("size-aware layout has no collisions for all-expanded and single drill-down views", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..", "guild_hall", "watchtower", "topology", "federated_topology.v1.json");
  const snapshot = JSON.parse(readFileSync(root, "utf8"));
  const allExpanded = {
    providerIds: snapshot.providers.map((entry) => entry.provider_id),
    groupKeys: [...new Set(snapshot.nodes.map((entry) => `${entry.provider_id}::${entry.group ?? "그룹 없음"}`))],
  };
  const expanded = buildUnifiedTopologyViewModel({ lens: "declared_structure", state: "ready", reason: null, snapshot }, null, allExpanded);
  assert.equal(expanded.nodes.filter((entry) => entry.displayKind === "node").length, 74);
  assert.equal(expanded.edges.length, 206);
  assertNoVisibleNodeOverlap(expanded.nodes);

  const single = buildUnifiedTopologyViewModel(federationProjection(), healthProjection(), {
    providerIds: ["watchtower"], groupKeys: ["watchtower::collect"],
  });
  assertNoVisibleNodeOverlap(single.nodes);
});

test("expanded declared nodes follow provider-local processing flow in an asymmetric sector layout", () => {
  const model = buildUnifiedTopologyViewModel(federationProjection(), null, {
    providerIds: ["watchtower"],
    groupKeys: ["watchtower::collect", "watchtower::데이터 평면", "watchtower::소비"],
  });
  const collector = model.nodes.find((entry) => entry.id === "watchtower::collector");
  const ledger = model.nodes.find((entry) => entry.id === "watchtower::ledger");
  const board = model.nodes.find((entry) => entry.id === "watchtower::board");
  assert.ok(collector.position.x < ledger.position.x);
  assert.ok(ledger.position.x < board.position.x);
  const sectors = buildUnifiedTopologyViewModel(federationProjection(), null).nodes;
  assert.notEqual(sectors[0].position.y, sectors[1].position.y);
});

test("parallel declared relations share one flow dependency without becoming a false cycle", () => {
  const projection = federationProjection();
  projection.snapshot.edges.push(edge(
    "watchtower",
    "edge.collector.ledger.control",
    "collector",
    "ledger",
    { relation: "control", label: "notify" },
  ));
  projection.snapshot.summary.edge_count += 1;
  const model = buildUnifiedTopologyViewModel(projection, null, {
    providerIds: ["watchtower"],
    groupKeys: ["watchtower::collect", "watchtower::데이터 평면", "watchtower::소비"],
  });
  assert.equal(model.available, true);
  const collector = model.nodes.find((entry) => entry.id === "watchtower::collector");
  const ledger = model.nodes.find((entry) => entry.id === "watchtower::ledger");
  const board = model.nodes.find((entry) => entry.id === "watchtower::board");
  assert.ok(collector.position.x < ledger.position.x);
  assert.ok(ledger.position.x < board.position.x);
});

test("default is compact sectors and deterministic provider-group-node drill-down preserves source IDs", () => {
  const compact = buildUnifiedTopologyViewModel(federationProjection(), healthProjection());
  assert.deepEqual(compact.nodes.map((entry) => entry.id), [
    "sector::watchtower", "sector::engineering_engine",
  ]);
  assert.equal(compact.edges.length, 0);

  const providerOpen = toggleUnifiedTopologyExpansion({}, { kind: "provider", providerId: "watchtower" });
  const groupOpen = toggleUnifiedTopologyExpansion(providerOpen, { kind: "group", groupKey: "watchtower::collect" });
  const expanded = buildUnifiedTopologyViewModel(federationProjection(), healthProjection(), groupOpen);
  assert.ok(expanded.nodes.some((entry) => entry.id === "group::watchtower::collect"));
  assert.ok(expanded.nodes.some((entry) => entry.id === "watchtower::collector"));
  assert.deepEqual(expanded.source.nodeIds, compact.source.nodeIds);
  assert.deepEqual(expanded.source.edgeIds, compact.source.edgeIds);

  const groupClosed = toggleUnifiedTopologyExpansion(groupOpen, { kind: "group", groupKey: "watchtower::collect" });
  const providerClosed = toggleUnifiedTopologyExpansion(groupClosed, { kind: "provider", providerId: "watchtower" });
  assert.deepEqual(providerClosed, { providerIds: [], groupKeys: [] });
  const roundTrip = buildUnifiedTopologyViewModel(federationProjection(), healthProjection(), providerClosed);
  assert.deepEqual(roundTrip.nodes.map((entry) => entry.id), compact.nodes.map((entry) => entry.id));
});

test("W1 overlays exact watchtower IDs 3/3 without duplicates and never touches another provider", () => {
  const health = healthProjection();
  health.snapshot.nodes[0] = healthNode("collector", "worker", "unmonitored");
  const model = buildUnifiedTopologyViewModel(federationProjection(), health, {
    providerIds: ["watchtower", "engineering_engine"],
    groupKeys: ["watchtower::collect", "watchtower::데이터 평면", "watchtower::소비", "engineering_engine::kernel"],
  });
  assert.equal(model.diagnostics.matchedHealthNodeCount, 3);
  assert.equal(model.diagnostics.watchtowerDeclaredNodeCount, 3);
  assert.deepEqual(model.diagnostics.unmatchedHealthIds, []);
  assert.deepEqual(model.diagnostics.missingWatchtowerIds, []);
  assert.equal(model.source.nodeIds.length, new Set(model.source.nodeIds).size);
  const engine = model.nodes.find((entry) => entry.id === "engineering_engine::kernel");
  assert.equal(engine.healthState, null);
  assert.equal(engine.healthObserved, false);
  assert.equal(engine.runtimeState, "unknown");
});

test("fuzzy and missing W1 IDs are never overlaid and are named in diagnostics", () => {
  const projection = healthProjection();
  projection.snapshot.nodes = [
    healthNode("collector-fuzzy", "worker"),
    healthNode("ledger", "store"),
    healthNode("board", "consumer"),
  ];
  projection.snapshot.edges = [healthEdge("ledger", "board", "data")];
  const model = buildUnifiedTopologyViewModel(federationProjection(), projection, {
    providerIds: ["watchtower"], groupKeys: ["watchtower::collect"],
  });
  assert.equal(model.diagnostics.matchedHealthNodeCount, 2);
  assert.deepEqual(model.diagnostics.unmatchedHealthIds, ["collector-fuzzy"]);
  assert.deepEqual(model.diagnostics.missingWatchtowerIds, ["collector"]);
  const collector = model.nodes.find((entry) => entry.id === "watchtower::collector");
  assert.equal(collector.healthObserved, false);
  assert.equal(collector.healthState, null);
});

test("W1 absent leaves declared structure visible with no live claim", () => {
  const model = buildUnifiedTopologyViewModel(federationProjection(), null);
  assert.equal(model.available, true);
  assert.equal(model.diagnostics.w1Available, false);
  assert.equal(model.diagnostics.matchedHealthNodeCount, 0);
  assert.equal(model.providers.find((entry) => entry.id === "watchtower").healthObserved, false);
  assert.equal(model.providers.every((entry) => entry.runtimeState === "unknown"), true);
});

test("retained federation remains explicitly stale with its safe reason", () => {
  const model = buildUnifiedTopologyViewModel(federationProjection({
    state: "stale",
    reason: "snapshot_refresh_failed",
  }), null);
  assert.equal(model.available, true);
  assert.equal(model.state, "stale");
  assert.equal(model.reason, "snapshot_refresh_failed");
  assert.equal(model.nodes.length, 2);
});

test("W1 stale health and refresh state remain stale", () => {
  const model = buildUnifiedTopologyViewModel(federationProjection(), healthProjection({ refresh_state: "stale" }), {
    providerIds: ["watchtower"], groupKeys: ["watchtower::collect", "watchtower::데이터 평면", "watchtower::소비"],
  });
  assert.equal(model.healthRefreshState, "stale");
  assert.equal(model.diagnostics.w1Current, false);
  assert.equal(model.nodes.find((entry) => entry.id === "watchtower::ledger").healthState, "stale");
  assert.equal(model.nodes.filter((entry) => entry.displayKind === "node" && entry.healthRetained)
    .every((entry) => entry.healthObserved === false && entry.healthState === "stale"
      && entry.runtimeState === "stale"), true);
  assert.equal(model.nodes.find((entry) => entry.id === "sector::watchtower").healthState, "stale");
  assert.equal(model.nodes.find((entry) => entry.id === "sector::watchtower").healthObserved, false);
  assert.equal(model.nodes.find((entry) => entry.id === "sector::watchtower").healthRetained, true);
  assert.equal(model.providers.find((entry) => entry.id === "watchtower").runtimeState, "stale");
  assert.equal(model.providers.find((entry) => entry.id === "watchtower").healthObserved, false);
  assert.equal(model.providers.find((entry) => entry.id === "watchtower").healthRetained, true);
  assert.equal(model.edges.some((entry) => entry.receiptObserved), false);
  assert.equal(model.diagnostics.receiptDeliveryProvenCount, 0);
});

test("available W1 structure with only unmonitored nodes never marks the provider observed", () => {
  const health = healthProjection();
  health.snapshot.nodes = health.snapshot.nodes.map((entry) => ({
    ...entry,
    health: { ...entry.health, state: "unmonitored", reasons: [] },
  }));
  const model = buildUnifiedTopologyViewModel(federationProjection(), health);
  const providerNode = model.nodes.find((entry) => entry.id === "sector::watchtower");
  const provider = model.providers.find((entry) => entry.id === "watchtower");
  assert.equal(providerNode.healthObserved, false);
  assert.equal(providerNode.healthState, null);
  assert.equal(providerNode.runtimeState, "unknown");
  assert.equal(provider.healthObserved, false);
  assert.equal(provider.runtimeState, "unknown");
});

test("receipt overlay requires the exact from-to-flow-label tuple", () => {
  const exactHealth = healthProjection();
  exactHealth.snapshot.edges[0] = healthEdge("collector", "ledger", "data", "append", {
    delivery: { state: "unreceipted", reason: "receipt_missing", proves_delivery: false },
  });
  const exact = buildUnifiedTopologyViewModel(federationProjection(), exactHealth, {
    providerIds: ["watchtower"],
    groupKeys: ["watchtower::collect", "watchtower::데이터 평면", "watchtower::소비"],
  });
  assert.equal(exact.diagnostics.receiptOverlayCount, 2);
  assert.equal(exact.diagnostics.receiptDeliveryProvenCount, 1);
  assert.equal(exact.edges.find((entry) => entry.source === "watchtower::collector").receiptObserved, false);

  const changed = healthProjection();
  changed.snapshot.edges[0] = healthEdge("collector", "ledger", "data", "different-label");
  const mismatch = buildUnifiedTopologyViewModel(federationProjection(), changed, {
    providerIds: ["watchtower"],
    groupKeys: ["watchtower::collect", "watchtower::데이터 평면", "watchtower::소비"],
  });
  assert.equal(mismatch.diagnostics.receiptOverlayCount, 1);
  assert.equal(mismatch.edges.find((entry) => entry.source === "watchtower::collector").receiptObserved, false);
});

test("summary mismatch, cross-provider edges, and runtime or repair authority fail closed", () => {
  const mismatch = federationProjection();
  mismatch.snapshot.summary.node_count += 1;
  assert.equal(buildUnifiedTopologyViewModel(mismatch, null).reason, "snapshot_summary_mismatch");

  const crossing = federationProjection();
  crossing.snapshot.edges[0] = {
    ...crossing.snapshot.edges[0],
    to: "engineering_engine::kernel",
  };
  assert.equal(buildUnifiedTopologyViewModel(crossing, null).reason, "cross_provider_edge_refused");

  const runtime = federationProjection();
  runtime.snapshot.summary.runtime_authority = true;
  assert.equal(buildUnifiedTopologyViewModel(runtime, null).reason, "authority_boundary_refused");

  const repair = federationProjection();
  repair.snapshot.summary.repair_execution_authority = true;
  assert.equal(buildUnifiedTopologyViewModel(repair, null).reason, "authority_boundary_refused");
});
