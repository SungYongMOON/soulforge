import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTopologyStructuralPaths,
  buildTopologyViewModel,
  describeTopologyAge,
  describeTopologyReason,
  distributeTopologyPorts,
} from "./topology-view.mjs";

function sampleSnapshot() {
  return {
    schema_version: "soulforge.watchtower.topology_health.v1",
    observed_at: "2026-08-07T13:36:26.125Z",
    summary: { ok: 2, degraded: 1, stale: 0, down: 1, unmonitored: 2 },
    nodes: [
      { id: "src_hiworks", label: "Hiworks 메일", kind: "external", group: "외부 소스", health: { state: "unmonitored", reasons: [], age_seconds: null } },
      { id: "ingress_supervisor", label: "Five-Lane Ingress 감독", kind: "supervisor", group: "수집", health: { state: "degraded", reasons: ["status_degraded"], age_seconds: 77 } },
      { id: "voice_label_worker", label: "음성 ASR·라벨 워커", kind: "supervisor", group: "수집", col: 1.4, health: { state: "ok", reasons: [], age_seconds: 577 } },
      { id: "slack_batch", label: "Slack 배치 수집기", kind: "worker", group: "수집", health: { state: "down", reasons: ["source_missing"], age_seconds: null } },
      { id: "gate_five_field", label: "five-field 원장 검증", kind: "gate", group: "게이트", health: { state: "unmonitored", reasons: ["structural_only"], age_seconds: null } },
      { id: "consumer_board", label: "Workspace Board", kind: "consumer", group: "소비", health: { state: "ok", reasons: [], age_seconds: 0 } },
    ],
    edges: [
      { from: "src_hiworks", to: "ingress_supervisor", label: "POP3 수집", flow: "data", receipt: null, unreceipted_reason: "receipt_channel_absent", delivery: { state: "unreceipted", reason: "receipt_channel_absent", proves_delivery: false } },
      { from: "src_hiworks", to: "voice_label_worker", label: "수집", flow: "data", receipt: "voice_delivery", delivery: { state: "delivering", age_seconds: 12, proves_delivery: true } },
      { from: "slack_batch", to: "gate_five_field", label: "검사", flow: "control", receipt: null, unreceipted_reason: "structural_only", delivery: { state: "unreceipted", reason: "structural_only", proves_delivery: false } },
    ],
  };
}

test("view model lays out columns and keeps observed health separate from catalog relations", () => {
  const model = buildTopologyViewModel(sampleSnapshot());
  assert.equal(model.available, true);
  assert.equal(model.observedAt, "2026-08-07T13:36:26.125Z");

  const lanes = model.nodes.filter((node) => node.kind === "lane");
  assert.deepEqual(lanes.map((node) => node.label), ["외부 소스", "수집·연산", "데이터·판단", "소비"]);
  assert.deepEqual(lanes.map((node) => node.roleLabel), ["INPUT", "COLLECT", "DATA / DECISION", "OUTPUT"]);
  assert.ok(lanes.every((node) => node.position.y === 0 && node.state === "lane" && node.height > 0));
  assert.equal(model.nodes.length, 6 + lanes.length);

  const external = model.nodes.find((node) => node.id === "src_hiworks");
  const collectorA = model.nodes.find((node) => node.id === "ingress_supervisor");
  const collectorB = model.nodes.find((node) => node.id === "voice_label_worker");
  const consumer = model.nodes.find((node) => node.id === "consumer_board");
  assert.equal(external.position.x, 0);
  assert.equal(collectorA.position.x, 440);
  assert.equal(collectorB.position.x, 440);
  assert.equal(consumer.position.x, 1760);
  assert.ok(collectorA.position.x - external.position.x >= 430);
  assert.ok(collectorB.position.y - collectorA.position.y > 120);
  assert.ok(collectorB.position.y > collectorA.position.y);

  assert.equal(collectorA.state, "degraded");
  assert.equal(collectorA.stateLabel, "열화");
  assert.deepEqual(collectorA.reasons, ["상태 신호: degraded"]);

  assert.equal(model.edges.length, 3);
  assert.equal(model.edges[0].source, "src_hiworks");
  assert.equal(model.edges[0].flow, "data");
  assert.equal(model.edges[1].flow, "data");
  assert.equal(model.edges[2].flow, "control");
  assert.equal(model.edges[0].relationKind, "catalog_only");
  assert.equal(model.edges[1].relationKind, "receipted_delivery");
  assert.equal(model.edges[1].deliveryProven, true);
  assert.ok(model.edges.every((edge) => edge.healthObserved === false));
  assert.deepEqual(model.edgeDelivery, { total: 3, deliveryProven: 1, deliveryUnproven: 2 });
  assert.equal(model.edges[0].sourceHandle, "output-topo-edge-0");
  assert.equal(model.edges[0].targetHandle, "input-topo-edge-0");
  assert.notEqual(model.edges[0].sourceHandle, model.edges[1].sourceHandle);
  assert.deepEqual(external.outputPorts.map((port) => port.top), [36, 64]);
  assert.deepEqual(collectorA.inputPorts.map((port) => port.top), [50]);

  assert.deepEqual(model.summary, { ok: 2, degraded: 1, stale: 0, down: 1, unmonitored: 2 });
  assert.deepEqual(model.attention.map((node) => node.id), ["slack_batch", "ingress_supervisor"]);
  assert.deepEqual(model.unmonitored.map((node) => node.id), ["src_hiworks", "gate_five_field"]);
  assert.equal(external.healthObserved, false);
  assert.equal(external.healthBasis, "catalog_only");
  assert.equal(external.evidenceScope, "structural_catalog_only");
  assert.deepEqual(external.doesNotProve, ["provider_availability", "provider_health", "live_execution", "end_to_end_execution", "edge_receipt"]);
  assert.equal(external.statusText, "미감시 · 관측 근거 없음");
  assert.equal(collectorA.healthBasis, "observed");
  assert.match(collectorA.statusText, /^열화 · 77초 전 · 상태 신호: degraded$/u);
});

test("usage health labels idle and collecting without changing the health state", () => {
  const snapshot = sampleSnapshot();
  const node = snapshot.nodes.find(({ id }) => id === "consumer_board");
  node.id = "usage_meter";
  node.health.activity_state = "idle";
  let usage = buildTopologyViewModel(snapshot).nodes.find(({ id }) => id === "usage_meter");
  assert.equal(usage.state, "ok");
  assert.equal(usage.stateLabel, "정상 유휴");
  node.health.activity_state = "collecting";
  usage = buildTopologyViewModel(snapshot).nodes.find(({ id }) => id === "usage_meter");
  assert.equal(usage.stateLabel, "정상 수집 중");
});

test("selected-node paths remain structural and enumerate direct plus reachable relationships", () => {
  const model = buildTopologyViewModel(sampleSnapshot());
  const paths = buildTopologyStructuralPaths(model, "src_hiworks");
  assert.deepEqual(paths.direct.map((edge) => edge.edge_id), ["topo-edge-0", "topo-edge-1"]);
  assert.equal(paths.direct[0].evidence_scope, "structural_catalog_only");
  assert.equal(paths.direct[1].evidence_scope, "watchtower_edge_delivery_receipt");
  assert.equal(paths.direct[1].delivery_state, "delivering");
  assert.deepEqual(paths.direct[0].does_not_prove, ["provider_availability", "provider_health", "live_execution", "end_to_end_execution", "edge_receipt"]);
  assert.deepEqual(paths.all.map((path) => path.node_ids), [
    ["src_hiworks", "ingress_supervisor"],
    ["src_hiworks", "voice_label_worker"]
  ]);
  assert.deepEqual(buildTopologyStructuralPaths(model, "missing"), { direct: [], all: [] });
});

test("port slots remain separated for dense fan-in and fan-out", () => {
  assert.deepEqual(distributeTopologyPorts(0), []);
  assert.deepEqual(distributeTopologyPorts(1), [50]);
  assert.deepEqual(distributeTopologyPorts(4), [22, 41, 59, 78]);
  assert.deepEqual(distributeTopologyPorts(5), [18, 34, 50, 66, 82]);
});

test("unknown states, dangling edges, and unsupported flows fail closed", () => {
  const snapshot = sampleSnapshot();
  snapshot.nodes[0].health.state = "mystery";
  assert.equal(buildTopologyViewModel(snapshot).available, false);

  const dangling = sampleSnapshot();
  dangling.edges[0].to = "missing_node";
  assert.equal(buildTopologyViewModel(dangling).available, false);

  const unsupported = sampleSnapshot();
  unsupported.edges[0].flow = "inferred";
  assert.equal(buildTopologyViewModel(unsupported).available, false);

  const unsupportedKindFlow = sampleSnapshot();
  unsupportedKindFlow.edges[0].to = "consumer_board";
  assert.equal(buildTopologyViewModel(unsupportedKindFlow).available, false);

  const duplicate = sampleSnapshot();
  duplicate.edges.push({ ...duplicate.edges[0], label: "라벨만 다른 중복" });
  assert.equal(buildTopologyViewModel(duplicate).available, false);

  const empty = buildTopologyViewModel(null);
  assert.equal(empty.available, false);
  assert.deepEqual(empty.nodes, []);
});

test("node health never promotes an unreceipted edge", () => {
  const snapshot = sampleSnapshot();
  snapshot.nodes[0].health = { state: "ok", reasons: [], age_seconds: 0 };
  const edge = buildTopologyViewModel(snapshot).edges[0];
  assert.equal(edge.deliveryState, "unreceipted");
  assert.equal(edge.deliveryProven, false);
  assert.equal(edge.relationKind, "catalog_only");
});

test("all provider evidence absent remains explicit catalog-only text-ready data", () => {
  const snapshot = {
    schema_version: "soulforge.watchtower.topology_health.v1",
    observed_at: "2026-08-08T06:00:00.000Z",
    summary: { ok: 0, degraded: 0, stale: 0, down: 0, unmonitored: 3 },
    nodes: ["codex", "claude", "antigravity"].map((provider, index) => ({
      id: `src_${provider}`,
      label: provider,
      kind: "external",
      group: "외부 소스",
      col: 0,
      row: index,
      operation_mode: "structural",
      provider,
      health_scope: "provider",
      health: { state: "unmonitored", reasons: ["provider_evidence_absent"], age_seconds: null },
    })),
    edges: [],
  };
  const model = buildTopologyViewModel(snapshot);
  assert.equal(model.available, true);
  assert.equal(model.attention.length, 0);
  assert.equal(model.unmonitored.length, 3);
  assert.ok(model.unmonitored.every((node) => (
    node.healthBasis === "catalog_only"
      && node.healthObserved === false
      && node.healthScope === "provider"
      && node.statusText === "미감시 · 공급자 관측 근거 없음"
  )));
  assert.deepEqual(model.unmonitored.map((node) => node.provider), ["codex", "claude", "antigravity"]);
});

test("reason and age describers stay human-readable without leaking codes", () => {
  assert.equal(describeTopologyReason("task_not_running"), "예약작업 미실행");
  assert.equal(describeTopologyReason("status_partial"), "상태 신호: partial");
  assert.equal(describeTopologyReason("count_failed_count_5"), "수치 초과: failed_count_5");
  assert.equal(describeTopologyAge(45), "45초 전");
  assert.equal(describeTopologyAge(600), "10분 전");
  assert.equal(describeTopologyAge(7200), "2시간 전");
  assert.equal(describeTopologyAge(null), "관측 없음");
});
