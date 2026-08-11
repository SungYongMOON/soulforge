import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTopologyFederationViewModel,
  selectTopologyFederationProvider,
  shortTopologyDigest,
} from "./topology-federation-view.mjs";

const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);

function providerFragment(providerId, overrides = {}) {
  return {
    schema_version: "soulforge.ax_topology.provider.v1",
    provider_id: providerId,
    provider_kind: providerId === "watchtower" ? "platform" : "domain_engine",
    label: `${providerId} declared topology`,
    source: {
      source_id: `${providerId}_source`,
      schema_version: "synthetic_topology.v1",
      revision: "synthetic.v1",
      digest: DIGEST_A,
    },
    declared_status: providerId === "watchtower" ? "active" : "candidate",
    validation: {
      validator_id: `${providerId}_adapter.v1`,
      state: "passed",
      evidence_ref: "guild_hall/watchtower/topology.mjs",
      source_commit: null,
    },
    capabilities: {
      observe: ["declared_structure"],
      diagnose: ["structural_validation"],
      propose_repair: [],
      execute_repair: false,
    },
    authority_boundary: {
      source_truth: false,
      answer_authority: false,
      owner_approval_authority: false,
      runtime_mutation: false,
    },
    claim_ceiling: "observed",
    runtime_state: "unknown",
    payload_state: "public_safe_contract",
    blocker_codes: ["runtime_observation_absent"],
    nodes: [],
    edges: [],
    ...overrides,
  };
}

function namespacedNode(providerId, id, overrides = {}) {
  return {
    id: `${providerId}::${id}`,
    label: `${id} node`,
    kind: "worker",
    layer: "subsystem",
    parent_id: null,
    group: "collect",
    diagnostic_state: "validator_backed",
    repair_state: "none",
    provider_id: providerId,
    ...overrides,
  };
}

function namespacedEdge(providerId, id, from, to, overrides = {}) {
  return {
    id: `${providerId}::${id}`,
    from: `${providerId}::${from}`,
    to: `${providerId}::${to}`,
    label: "append",
    relation: "data",
    layer: "subsystem",
    evidence_mode: "structural_only",
    provider_id: providerId,
    ...overrides,
  };
}

function syntheticProjection(overrides = {}) {
  const nodes = [
    namespacedNode("engineering_engine", "graph", { kind: "module", layer: "module", group: "kernel" }),
    namespacedNode("engineering_engine", "pipeline", {
      kind: "module", layer: "module", group: "kernel",
      diagnostic_state: "structural", repair_state: "candidate_only",
    }),
    namespacedNode("watchtower", "collector"),
    namespacedNode("watchtower", "ledger", { kind: "store", group: "data" }),
    namespacedNode("watchtower", "board", { kind: "consumer", group: "consume" }),
  ];
  const edges = [
    namespacedEdge("engineering_engine", "imports.pipeline.graph", "pipeline", "graph", {
      relation: "imports", layer: "module", label: "imports",
    }),
    namespacedEdge("watchtower", "edge.collector.ledger", "collector", "ledger"),
    namespacedEdge("watchtower", "edge.ledger.board", "ledger", "board", {
      evidence_mode: "receipt_required",
    }),
  ];
  return {
    schema_version: "soulforge.team_ops_board.topology_federation_projection.v1",
    lens: "declared_structure",
    state: "ready",
    reason: null,
    proves: ["declared_structure_contract_only"],
    does_not_prove: [
      "live_health", "runtime_execution", "delivery_receipt",
      "provider_availability", "repair_execution",
    ],
    snapshot: {
      schema_version: "soulforge.ax_topology.federation.v1",
      projection_kind: "declared_structure",
      providers: [providerFragment("engineering_engine"), providerFragment("watchtower")],
      nodes,
      edges,
      source_set_digest: DIGEST_B,
      summary: {
        provider_count: 2,
        node_count: nodes.length,
        edge_count: edges.length,
        runtime_authority: false,
        repair_execution_authority: false,
      },
      topology_digest: DIGEST_A,
    },
    ...overrides,
  };
}

test("provider overview reports declared status, claim ceiling, validation, runtime state and counts", () => {
  const model = buildTopologyFederationViewModel(syntheticProjection());
  assert.equal(model.available, true);
  assert.equal(model.state, "ready");
  assert.equal(model.lens, "declared_structure");
  assert.deepEqual(model.providers.map((provider) => provider.id), ["engineering_engine", "watchtower"]);
  assert.deepEqual(model.summary, {
    providerCount: 2, nodeCount: 5, edgeCount: 3,
    runtimeAuthority: false, repairExecutionAuthority: false,
  });
  assert.equal(model.digest.topologyShort, shortTopologyDigest(DIGEST_A));

  const [engine, watchtower] = model.providers;
  assert.deepEqual(
    {
      status: engine.declaredStatusLabel,
      ceiling: engine.claimCeilingLabel,
      validation: engine.validationStateLabel,
      runtime: engine.runtimeStateLabel,
      nodes: engine.nodeCount,
      edges: engine.edgeCount,
    },
    {
      status: "선언 후보", ceiling: "관찰됨", validation: "구조 검증 통과",
      runtime: "런타임 미관측", nodes: 2, edges: 1,
    },
  );
  assert.equal(watchtower.declaredStatusLabel, "선언 활성");
  assert.equal(watchtower.nodeCount, 3);
  assert.equal(watchtower.edgeCount, 2);
  assert.equal(watchtower.capabilities.executeRepair, false);
  assert.deepEqual(watchtower.blockerCodes, ["runtime_observation_absent"]);
});

test("provider selection returns only that provider's namespaced nodes and edges", () => {
  const model = buildTopologyFederationViewModel(syntheticProjection());
  const selection = selectTopologyFederationProvider(model, "watchtower");
  assert.deepEqual(selection.nodes.map((node) => node.id), [
    "watchtower::collector", "watchtower::ledger", "watchtower::board",
  ]);
  assert.deepEqual(selection.nodes.map((node) => node.localId), ["collector", "ledger", "board"]);
  assert.deepEqual(selection.counts, {
    nodes: 3, edges: 2, structuralOnlyEdges: 1, receiptRequiredEdges: 1, repairCandidateNodes: 0,
  });
  assert.equal(selection.edges.every((edge) => edge.id.startsWith("watchtower::")), true);
  assert.equal(
    selection.edges.every((edge) => edge.from.startsWith("watchtower::") && edge.to.startsWith("watchtower::")),
    true,
  );
  assert.equal(selection.edges[0].fromLabel, "collector node");
  assert.deepEqual(selection.groups, [
    { group: "collect", nodeCount: 1 }, { group: "consume", nodeCount: 1 }, { group: "data", nodeCount: 1 },
  ]);

  const engine = selectTopologyFederationProvider(model, "engineering_engine");
  assert.deepEqual(engine.nodes.map((node) => node.id), [
    "engineering_engine::graph", "engineering_engine::pipeline",
  ]);
  assert.equal(engine.counts.repairCandidateNodes, 1);
  assert.equal(
    engine.nodes.find((node) => node.repairState === "candidate_only").repairStateLabel,
    "복구 후보 · Owner 승인 필요",
  );
});

test("an unknown or unselected provider yields no invented drill-down", () => {
  const model = buildTopologyFederationViewModel(syntheticProjection());
  assert.equal(selectTopologyFederationProvider(model, "notebook_lm"), null);
  assert.equal(selectTopologyFederationProvider(model, null), null);
  assert.equal(selectTopologyFederationProvider(model, ""), null);
  assert.equal(selectTopologyFederationProvider({ available: false, providers: [] }, "watchtower"), null);
});

test("a node claiming a provider it is not namespaced under is excluded, not adopted", () => {
  const projection = syntheticProjection();
  projection.snapshot.nodes.push({
    ...namespacedNode("engineering_engine", "smuggled"),
    provider_id: "watchtower",
  });
  projection.snapshot.summary.node_count = projection.snapshot.nodes.length;
  const model = buildTopologyFederationViewModel(projection);
  const selection = selectTopologyFederationProvider(model, "watchtower");
  assert.equal(selection.nodes.some((node) => node.id.includes("smuggled")), false);
  assert.equal(selection.counts.nodes, 3);
});

test("an edge whose endpoint is missing from the provider node set is dropped, not drawn", () => {
  const projection = syntheticProjection();
  projection.snapshot.edges.push(namespacedEdge("watchtower", "edge.dangling", "collector", "absent_node"));
  projection.snapshot.summary.edge_count = projection.snapshot.edges.length;
  const model = buildTopologyFederationViewModel(projection);
  const selection = selectTopologyFederationProvider(model, "watchtower");
  assert.equal(selection.edges.some((edge) => edge.id.includes("dangling")), false);
  assert.equal(selection.counts.edges, 2);
});

test("declared structure never promotes itself into live health or delivery evidence", () => {
  const model = buildTopologyFederationViewModel(syntheticProjection());
  const selection = selectTopologyFederationProvider(model, "watchtower");
  const serialized = JSON.stringify({ model, selection });
  for (const forbidden of ["health", "healthBasis", "healthObserved", "deliveryProven", "deliveryState", "stateLabel", "ageLabel"]) {
    assert.equal(serialized.includes(`"${forbidden}"`), false, `${forbidden} must not reach the declared lens`);
  }
  const healthTokens = new Set(["ok", "degraded", "down", "unmonitored"]);
  for (const provider of model.providers) {
    assert.equal(healthTokens.has(provider.declaredStatus), false);
    assert.equal(provider.evidenceScope, "declared_structure_contract_only");
  }
  for (const node of selection.nodes) {
    assert.equal(healthTokens.has(node.diagnosticState), false);
    assert.equal(node.evidenceScope, "declared_structure_contract_only");
  }
  assert.deepEqual(model.doesNotProve, [
    "live_health", "runtime_execution", "delivery_receipt", "provider_availability", "repair_execution",
  ]);
  assert.equal(selection.edges.every((edge) => edge.evidenceScope === "declared_structure_contract_only"), true);
  assert.equal(
    selection.edges.find((edge) => edge.evidenceMode === "receipt_required").evidenceModeLabel,
    "영수증 필요 · 이 표면에 영수증 없음",
  );
});

test("missing, unavailable, foreign, or inconsistent projections fall back without inventing structure", () => {
  for (const [input, reason] of [
    [null, "projection_unavailable"],
    [{ lens: "observed_runtime", state: "ready", snapshot: {} }, "projection_unavailable"],
    [{ lens: "declared_structure", state: "exploded", snapshot: {} }, "projection_unavailable"],
    [{ lens: "declared_structure", state: "unavailable", reason: "topology_federation_digest_mismatch", snapshot: null }, "topology_federation_digest_mismatch"],
    [{ lens: "declared_structure", state: "ready", snapshot: null }, "snapshot_absent"],
  ]) {
    const model = buildTopologyFederationViewModel(input);
    assert.equal(model.available, false);
    assert.equal(model.state, "unavailable");
    assert.equal(model.reason, reason);
    assert.deepEqual(model.providers, []);
    assert.equal(model.summary, null);
  }

  const emptyProviders = syntheticProjection();
  emptyProviders.snapshot.providers = [];
  assert.equal(buildTopologyFederationViewModel(emptyProviders).reason, "snapshot_shape_invalid");

  const malformedProvider = syntheticProjection();
  malformedProvider.snapshot.providers[0] = { provider_id: "engineering_engine" };
  assert.equal(buildTopologyFederationViewModel(malformedProvider).reason, "snapshot_provider_invalid");

  const summaryDrift = syntheticProjection();
  summaryDrift.snapshot.summary.node_count = 99;
  assert.equal(buildTopologyFederationViewModel(summaryDrift).reason, "snapshot_summary_mismatch");
});

test("a stale projection stays usable but keeps its explicit stale state and reason", () => {
  const model = buildTopologyFederationViewModel(syntheticProjection({
    state: "stale",
    reason: "topology_federation_file_invalid",
  }));
  assert.equal(model.available, true);
  assert.equal(model.state, "stale");
  assert.equal(model.reason, "topology_federation_file_invalid");
  assert.equal(model.providers.length, 2);
  assert.equal(selectTopologyFederationProvider(model, "watchtower").counts.nodes, 3);
});

test("digest presentation is truncated and never fabricated", () => {
  assert.equal(shortTopologyDigest(DIGEST_A), `${"a".repeat(12)}…`);
  assert.equal(shortTopologyDigest("not-a-digest"), "—");
  assert.equal(shortTopologyDigest(null), "—");
});
