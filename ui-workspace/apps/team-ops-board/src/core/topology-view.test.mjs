import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTopologyStructuralPaths,
  buildTopologyViewModel,
  describeTopologyAge,
  describeTopologyReason,
  distributeTopologyPorts,
} from "./topology-view.mjs";

function tracking(nodeId, reasonCode, {
  evidenceOwner = "watchtower_probe",
  lastCheckedAt = "2026-08-07T13:36:26.125Z",
  nextCheckAt = "2026-08-07T13:41:26.125Z",
  nextEvidenceDueAt = "2026-08-07T13:41:26.125Z",
  repairability = "manual",
  verificationState = "observed",
  escalationOwner = "watchtower_operator",
} = {}) {
  return {
    node_id: nodeId,
    reason_code: reasonCode,
    evidence_owner: evidenceOwner,
    last_checked_at: lastCheckedAt,
    next_check_at: nextCheckAt,
    next_evidence_due_at: nextEvidenceDueAt,
    repairability,
    repair_action: null,
    verification_state: verificationState,
    escalation_owner: escalationOwner,
  };
}

function absentTracking(nodeId, reasonCode, evidenceOwner = "declared_node_owner", escalationOwner = "node_owner") {
  return tracking(nodeId, reasonCode, {
    evidenceOwner,
    lastCheckedAt: "2026-08-07T13:36:26.125Z",
    nextCheckAt: "2026-08-07T13:41:26.125Z",
    nextEvidenceDueAt: null,
    repairability: "not_available",
    verificationState: "evidence_absent",
    escalationOwner,
  });
}

function sampleSnapshot() {
  return {
    schema_version: "soulforge.watchtower.topology_health.v2",
    observed_at: "2026-08-07T13:36:26.125Z",
    summary: { ok: 1, degraded: 1, stale: 1, down: 1, unmonitored: 2 },
    nodes: [
      { id: "src_hiworks", label: "Hiworks 메일", kind: "external", group: "외부 소스", health: { state: "unmonitored", reasons: [], age_seconds: null }, tracking: absentTracking("src_hiworks", "structural_only") },
      { id: "ingress_supervisor", label: "Five-Lane Ingress 감독", kind: "supervisor", group: "수집", health: { state: "degraded", reasons: ["status_degraded"], age_seconds: 77 }, tracking: tracking("ingress_supervisor", "status_degraded") },
      { id: "voice_label_worker", label: "음성 ASR·라벨 워커", kind: "supervisor", group: "수집", col: 1.4, health: { state: "stale", reasons: ["heartbeat_stale"], age_seconds: 577 }, tracking: tracking("voice_label_worker", "heartbeat_stale") },
      { id: "slack_batch", label: "Slack 배치 수집기", kind: "worker", group: "수집", health: { state: "down", reasons: ["source_missing"], age_seconds: null }, tracking: tracking("slack_batch", "source_missing") },
      { id: "gate_five_field", label: "five-field 원장 검증", kind: "gate", group: "게이트", health: { state: "unmonitored", reasons: ["structural_only"], age_seconds: null }, tracking: absentTracking("gate_five_field", "structural_only", "five_field_event_validator", "five_field_owner") },
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
  assert.deepEqual(model.edgeDelivery, {
    total: 3,
    deliveryProven: 1,
    deliveryUnproven: 2,
    unprovenReasons: {
      receiptChannelAbsent: 1,
      probeObservationOnly: 0,
      structuralOnly: 1,
    },
  });
  assert.equal(model.edges[0].sourceHandle, "output-topo-edge-0");
  assert.equal(model.edges[0].targetHandle, "input-topo-edge-0");
  assert.notEqual(model.edges[0].sourceHandle, model.edges[1].sourceHandle);
  assert.deepEqual(external.outputPorts.map((port) => port.top), [36, 64]);
  assert.deepEqual(collectorA.inputPorts.map((port) => port.top), [50]);

  assert.deepEqual(model.summary, { ok: 1, degraded: 1, stale: 1, down: 1, unmonitored: 2 });
  assert.deepEqual(model.attention.map((node) => node.id), ["slack_batch", "voice_label_worker", "ingress_supervisor"]);
  assert.deepEqual(model.unmonitored.map((node) => node.id), ["src_hiworks", "gate_five_field"]);
  assert.deepEqual(model.unmonitoredBreakdown, {
    structuralOnly: 2,
    providerEvidenceAbsent: 0,
    onDemand: 0,
    other: 0,
  });
  assert.deepEqual(model.nonGreenQueue.map((node) => node.id), [
    "slack_batch", "voice_label_worker", "ingress_supervisor", "gate_five_field", "src_hiworks",
  ]);
  assert.equal(model.nonGreenQueue.some((node) => node.id === "consumer_board"), false);
  assert.deepEqual(model.nonGreenQueue[0], {
    id: "slack_batch",
    label: "Slack 배치 수집기",
    state: "down",
    stateLabel: "정지",
    reasonCode: "source_missing",
    reasonLabel: "신호 파일 없음",
    evidenceOwner: "watchtower_probe",
    lastCheckedAt: "2026-08-07T13:36:26.125Z",
    nextCheckAt: "2026-08-07T13:41:26.125Z",
    nextEvidenceDueAt: "2026-08-07T13:41:26.125Z",
    repairability: "manual",
    repairabilityLabel: "수동 확인",
    repairAction: null,
    verificationState: "observed",
    escalationOwner: "watchtower_operator",
  });
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

test("mail retry activity remains visible without turning a healthy collector orange", () => {
  const snapshot = sampleSnapshot();
  const node = snapshot.nodes.find(({ id }) => id === "consumer_board");
  node.id = "mail_forwarder";
  node.kind = "worker";
  node.health.activity_state = "retrying";
  node.health.activity_count = 16;
  node.health.activity_next_at = "2026-08-14T02:00:00.000Z";
  const model = buildTopologyViewModel(snapshot);
  const mail = model.nodes.find(({ id }) => id === "mail_forwarder");
  assert.equal(mail.state, "ok");
  assert.equal(mail.activityState, "retrying");
  assert.equal(mail.activityCount, 16);
  assert.equal(mail.activityNextAt, "2026-08-14T02:00:00.000Z");
  assert.equal(mail.stateLabel, "정상 · 메일 재시도");
  assert.deepEqual(model.advisoryQueue, [{
    id: "mail_forwarder",
    label: mail.label,
    stateLabel: "정상 · 메일 재시도",
    activityState: "retrying",
    activityCount: 16,
    activityNextAt: "2026-08-14T02:00:00.000Z",
  }]);
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

  const missingTracking = sampleSnapshot();
  delete missingTracking.nodes[0].tracking;
  const legacyModel = buildTopologyViewModel(missingTracking);
  assert.equal(legacyModel.available, true);
  assert.equal(legacyModel.nonGreenQueue.some((node) => node.id === "src_hiworks"), false);

  const invalidTracking = sampleSnapshot();
  invalidTracking.nodes[0].tracking.repairability = "maybe";
  assert.equal(buildTopologyViewModel(invalidTracking).available, false);

  const empty = buildTopologyViewModel(null);
  assert.equal(empty.available, false);
  assert.deepEqual(empty.nodes, []);
});

test("node health never promotes an unreceipted edge", () => {
  const snapshot = sampleSnapshot();
  snapshot.nodes[0].health = { state: "ok", reasons: [], age_seconds: 0 };
  delete snapshot.nodes[0].tracking;
  const edge = buildTopologyViewModel(snapshot).edges[0];
  assert.equal(edge.deliveryState, "unreceipted");
  assert.equal(edge.deliveryProven, false);
  assert.equal(edge.relationKind, "catalog_only");
});

test("all provider evidence absent remains explicit catalog-only text-ready data", () => {
  const snapshot = {
    schema_version: "soulforge.watchtower.topology_health.v2",
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
      tracking: absentTracking(
        `src_${provider}`,
        "provider_evidence_absent",
        `${provider}_provider_owner`,
        `${provider}_provider_owner`,
      ),
    })),
    edges: [],
  };
  const model = buildTopologyViewModel(snapshot);
  assert.equal(model.available, true);
  assert.equal(model.attention.length, 0);
  assert.equal(model.unmonitored.length, 3);
  assert.deepEqual(model.nonGreenQueue.map((node) => node.id), ["src_antigravity", "src_claude", "src_codex"]);
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
