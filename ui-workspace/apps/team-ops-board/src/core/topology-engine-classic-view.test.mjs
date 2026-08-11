import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildEngineeringClassicTopologyViewModel } from "./topology-engine-classic-view.mjs";

const ARTIFACT_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..", "..", "..", "..", "..",
  "guild_hall", "watchtower", "topology", "federated_topology.v1.json",
);

function trackedProjection(overrides = {}) {
  return {
    lens: "declared_structure",
    state: "ready",
    reason: null,
    snapshot: {
      ...JSON.parse(readFileSync(ARTIFACT_PATH, "utf8")),
      ...overrides.snapshot,
    },
    ...overrides,
  };
}

test("classic engine view preserves all 26 modules and 113 provider-local import edges", () => {
  const model = buildEngineeringClassicTopologyViewModel(trackedProjection());
  assert.equal(model.available, true);
  assert.deepEqual(model.source, {
    nodeCount: 26,
    edgeCount: 113,
    nodeIds: [...model.source.nodeIds].sort(),
    edgeIds: [...model.source.edgeIds].sort(),
  });
  assert.equal(model.nodes.filter((node) => node.kind === "lane").length, 5);
  assert.equal(model.nodes.filter((node) => node.kind !== "lane").length, 26);
  assert.equal(model.edges.length, 113);
  assert.equal(model.edges.every((edge) => edge.source.startsWith("engineering_engine::")
    && edge.target.startsWith("engineering_engine::") && edge.relation === "imports"), true);
});

test("classic engine view is fully expanded, deterministic and collision free", () => {
  const first = buildEngineeringClassicTopologyViewModel(trackedProjection());
  const second = buildEngineeringClassicTopologyViewModel(trackedProjection());
  assert.deepEqual(first, second);
  const nodes = first.nodes.filter((node) => node.kind !== "lane");
  for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
      const left = nodes[leftIndex];
      const right = nodes[rightIndex];
      const overlaps = left.position.x < right.position.x + 260
        && left.position.x + 260 > right.position.x
        && left.position.y < right.position.y + 94
        && left.position.y + 94 > right.position.y;
      assert.equal(overlaps, false, `${left.id} overlaps ${right.id}`);
    }
  }
  assert.equal(nodes.every((node) => node.state === "unmonitored"
    && node.healthObserved === false
    && node.statusText.includes("runtime UNKNOWN")), true);
});

test("classic engine view uses the original shape vocabulary without inventing live health", () => {
  const model = buildEngineeringClassicTopologyViewModel(trackedProjection());
  const nodes = model.nodes.filter((node) => node.kind !== "lane");
  assert.deepEqual([...new Set(nodes.map((node) => node.kind))].sort(), [
    "consumer", "external", "gate", "store", "supervisor", "worker",
  ]);
  assert.equal(nodes.every((node) => node.sourceKind === "module"
    && node.evidenceScope === "engineering_engine_declared_structure_only"), true);
  assert.equal(model.edges.every((edge) => edge.deliveryProven === false
    && edge.deliveryState === "unreceipted"), true);
  assert.deepEqual(model.authority, { runtime: false, repair: false });
});

test("classic engine view excludes Knowledge and Notebook identities", () => {
  const model = buildEngineeringClassicTopologyViewModel(trackedProjection());
  const allIds = [...model.source.nodeIds, ...model.source.edgeIds].join("\n");
  assert.doesNotMatch(allIds, /knowledge_stack|watchtower_notebook_advisory_adapter/u);
  assert.equal(model.gap, "Watchtower와 Engineering Engine 사이 연결 계약 미선언");
});

test("authority or provider contract drift fails closed", () => {
  const authority = trackedProjection();
  authority.snapshot.summary.runtime_authority = true;
  assert.equal(buildEngineeringClassicTopologyViewModel(authority).reason, "authority_boundary_refused");

  const missing = trackedProjection();
  missing.snapshot.providers = missing.snapshot.providers.filter((provider) => provider.provider_id !== "engineering_engine");
  missing.snapshot.nodes = missing.snapshot.nodes.filter((node) => node.provider_id !== "engineering_engine");
  missing.snapshot.edges = missing.snapshot.edges.filter((edge) => edge.provider_id !== "engineering_engine");
  missing.snapshot.summary.provider_count -= 1;
  missing.snapshot.summary.node_count -= 26;
  missing.snapshot.summary.edge_count -= 113;
  assert.equal(buildEngineeringClassicTopologyViewModel(missing).reason, "engineering_engine_provider_missing");
});
