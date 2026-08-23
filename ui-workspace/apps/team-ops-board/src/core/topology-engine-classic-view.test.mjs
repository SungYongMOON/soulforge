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

const TRACKED_SNAPSHOT = JSON.parse(readFileSync(ARTIFACT_PATH, "utf8"));
// 기대 수치는 손으로 적지 않고 tracked artifact 의 engineering_engine slice 에서 유도한다.
// 화면이 지켜야 하는 계약은 "추적된 모듈·간선을 하나도 빠뜨리지 않는다" 이지, 특정 상수가 아니다.
const ENGINE_NODE_COUNT = TRACKED_SNAPSHOT.nodes
  .filter((node) => node.provider_id === "engineering_engine").length;
const ENGINE_EDGE_COUNT = TRACKED_SNAPSHOT.edges
  .filter((edge) => edge.provider_id === "engineering_engine").length;

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

test("classic engine view preserves all 35 modules and 156 provider-local import edges", () => {
  // 추적 artifact 가 실제로 이 규모인지 한 자리에서만 고정한다.
  assert.deepEqual({ nodes: ENGINE_NODE_COUNT, edges: ENGINE_EDGE_COUNT }, { nodes: 35, edges: 156 });
  const model = buildEngineeringClassicTopologyViewModel(trackedProjection());
  assert.equal(model.available, true);
  assert.deepEqual(model.source, {
    nodeCount: ENGINE_NODE_COUNT,
    edgeCount: ENGINE_EDGE_COUNT,
    nodeIds: [...model.source.nodeIds].sort(),
    edgeIds: [...model.source.edgeIds].sort(),
  });
  assert.equal(model.nodes.filter((node) => node.kind === "lane").length, 5);
  assert.equal(model.nodes.filter((node) => node.kind !== "lane").length, ENGINE_NODE_COUNT);
  assert.equal(model.edges.length, ENGINE_EDGE_COUNT);
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
  const crosswalkProjection = nodes.find((node) => node.localId === "se_core_crosswalk_projection");
  const crosswalkCaseRun = nodes.find((node) => node.localId === "se_core_crosswalk_case_run");
  const sourceCitedAnswerRun = nodes.find((node) => node.localId === "se_core_source_cited_answer_run");
  const boundaryLane = model.nodes.find((node) => node.roleLabel === "BOUNDARY");
  const outputLane = model.nodes.find((node) => node.roleLabel === "OUTPUT");
  assert.deepEqual([...new Set(nodes.map((node) => node.kind))].sort(), [
    "consumer", "external", "gate", "store", "supervisor", "worker",
  ]);
  assert.deepEqual(
    { kind: crosswalkProjection.kind, laneX: crosswalkProjection.position.x },
    { kind: "external", laneX: boundaryLane.position.x + 64 },
  );
  assert.deepEqual(
    { kind: crosswalkCaseRun.kind, laneX: crosswalkCaseRun.position.x },
    { kind: "consumer", laneX: outputLane.position.x + 64 },
  );
  assert.deepEqual(
    { kind: sourceCitedAnswerRun.kind, laneX: sourceCitedAnswerRun.position.x },
    { kind: "consumer", laneX: outputLane.position.x + 64 },
  );
  // AX·SE subject 네 모듈도 같은 소비자 어휘로 OUTPUT lane 에 놓인다.
  assert.deepEqual(
    [
      "ax_se_project_assessment",
      "ax_se_project_role_roster",
      "ax_se_project_role_bound_assessment",
      "ax_se_project_context_pilot",
    ].map((localId) => {
      const node = nodes.find((entry) => entry.localId === localId);
      return { localId, kind: node.kind, laneX: node.position.x };
    }),
    [
      "ax_se_project_assessment",
      "ax_se_project_role_roster",
      "ax_se_project_role_bound_assessment",
      "ax_se_project_context_pilot",
    ].map((localId) => ({ localId, kind: "consumer", laneX: outputLane.position.x + 64 })),
  );
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
  missing.snapshot.summary.node_count -= ENGINE_NODE_COUNT;
  missing.snapshot.summary.edge_count -= ENGINE_EDGE_COUNT;
  assert.equal(buildEngineeringClassicTopologyViewModel(missing).reason, "engineering_engine_provider_missing");
});
