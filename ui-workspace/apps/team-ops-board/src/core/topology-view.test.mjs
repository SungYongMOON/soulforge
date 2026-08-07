import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTopologyViewModel,
  describeTopologyAge,
  describeTopologyReason,
} from "./topology-view.mjs";

function sampleSnapshot() {
  return {
    schema_version: "soulforge.watchtower.topology_health.v1",
    observed_at: "2026-08-07T13:36:26.125Z",
    summary: { ok: 2, degraded: 1, stale: 0, down: 1, unmonitored: 1 },
    nodes: [
      { id: "src_hiworks", label: "Hiworks 메일", kind: "external", group: "외부 소스", health: { state: "unmonitored", reasons: [], age_seconds: null } },
      { id: "ingress_supervisor", label: "Five-Lane Ingress 감독", kind: "supervisor", group: "수집", health: { state: "degraded", reasons: ["status_degraded"], age_seconds: 77 } },
      { id: "voice_label_worker", label: "음성 ASR·라벨 워커", kind: "supervisor", group: "수집", health: { state: "ok", reasons: [], age_seconds: 577 } },
      { id: "slack_batch", label: "Slack 배치 수집기", kind: "worker", group: "수집", health: { state: "down", reasons: ["source_missing"], age_seconds: null } },
      { id: "consumer_board", label: "Workspace Board", kind: "consumer", group: "소비", health: { state: "ok", reasons: [], age_seconds: 0 } },
    ],
    edges: [
      { from: "src_hiworks", to: "ingress_supervisor", label: "POP3 수집" },
      { from: "src_hiworks", to: "voice_label_worker", label: "검사", flow: "control" },
      { from: "ghost", to: "consumer_board", label: "무효 간선" },
    ],
  };
}

test("view model lays out columns, maps states, and drops dangling edges", () => {
  const model = buildTopologyViewModel(sampleSnapshot());
  assert.equal(model.available, true);
  assert.equal(model.observedAt, "2026-08-07T13:36:26.125Z");

  const captions = model.nodes.filter((node) => node.kind === "caption");
  assert.deepEqual(captions.map((node) => node.label), ["외부 소스", "수집", "소비"]);
  assert.ok(captions.every((node) => node.position.y === 8 && node.state === "caption"));
  assert.equal(model.nodes.length, 5 + captions.length);

  const external = model.nodes.find((node) => node.id === "src_hiworks");
  const collectorA = model.nodes.find((node) => node.id === "ingress_supervisor");
  const collectorB = model.nodes.find((node) => node.id === "voice_label_worker");
  const consumer = model.nodes.find((node) => node.id === "consumer_board");
  assert.equal(external.position.x, 0);
  assert.equal(collectorA.position.x, 300);
  assert.equal(consumer.position.x, 900);
  assert.ok(collectorB.position.y > collectorA.position.y);

  assert.equal(collectorA.state, "degraded");
  assert.equal(collectorA.stateLabel, "열화");
  assert.deepEqual(collectorA.reasons, ["상태 신호: degraded"]);

  assert.equal(model.edges.length, 2);
  assert.equal(model.edges[0].source, "src_hiworks");
  assert.equal(model.edges[0].flow, "data");
  assert.equal(model.edges[1].flow, "control");

  assert.deepEqual(model.summary, { ok: 2, degraded: 1, stale: 0, down: 1, unmonitored: 1 });
  assert.deepEqual(model.attention.map((node) => node.id), ["slack_batch", "ingress_supervisor"]);
});

test("unknown states and malformed snapshots fail closed", () => {
  const snapshot = sampleSnapshot();
  snapshot.nodes[0].health.state = "mystery";
  const model = buildTopologyViewModel(snapshot);
  assert.equal(model.nodes.find((node) => node.id === "src_hiworks").state, "unmonitored");

  const empty = buildTopologyViewModel(null);
  assert.equal(empty.available, false);
  assert.deepEqual(empty.nodes, []);
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
