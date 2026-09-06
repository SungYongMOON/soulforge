import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  FORGE_COMPONENTS,
  clampForgeText,
  estimateForgeTextWidth,
  FORGE_NODE_COMPONENT_INDEX,
  FORGE_OTHER_COMPONENT_ID,
  FORGE_STATE_PRIORITY,
  aggregateForgeComponentState,
  buildForgeMapViewModel,
  forgeStateFromNodeState,
} from "./forge-map-view.mjs";

const CORE_ROOT = dirname(fileURLToPath(import.meta.url));
const TOPOLOGY_MODULE_PATH = resolve(CORE_ROOT, "../../../../../guild_hall/watchtower/topology.mjs");

function node(id, state, reasons = []) {
  return { id, label: id, kind: "worker", group: "테스트", health: { state, reasons, age_seconds: 1 } };
}

function snapshot(nodes) {
  return { observed_at: "2026-09-06T00:00:00.000Z", nodes, edges: [] };
}

test("추적 중인 Watchtower 노드는 전부 부품에 매핑된다", async () => {
  const { TOPOLOGY_NODES } = await import(pathToFileURL(TOPOLOGY_MODULE_PATH).href);
  const unmapped = TOPOLOGY_NODES
    .map((entry) => entry.id)
    .filter((id) => FORGE_NODE_COMPONENT_INDEX[id] === undefined);
  assert.deepEqual(unmapped, [], "새 노드를 추가했으면 FORGE_COMPONENTS 에 자리를 정해야 한다");
});

test("매핑은 단사다: 한 노드가 두 부품에 들어가지 않는다", () => {
  const seen = new Map();
  for (const component of FORGE_COMPONENTS) {
    for (const id of component.nodes) {
      assert.equal(seen.has(id), false, `${id} 는 ${seen.get(id)} 와 ${component.id} 양쪽에 있다`);
      seen.set(id, component.id);
    }
  }
  assert.equal(seen.size, Object.keys(FORGE_NODE_COMPONENT_INDEX).length);
});

test("부품 id 와 배치 좌표는 서로 겹치지 않는다", () => {
  const ids = new Set();
  const slots = new Set();
  for (const component of FORGE_COMPONENTS) {
    assert.equal(ids.has(component.id), false, `중복 부품 id ${component.id}`);
    ids.add(component.id);
    const slot = `${component.band}:${component.col}`;
    assert.equal(slots.has(slot), false, `중복 배치 좌표 ${slot}`);
    slots.add(slot);
  }
  assert.equal(ids.has(FORGE_OTHER_COMPONENT_ID), false, "기타 자리는 선언 부품이 아니다");
});

test("집계는 hold > down > stale > degraded > unknown > ok 우선순위를 따른다", () => {
  assert.equal(aggregateForgeComponentState(["ok", "ok"]), "ok");
  assert.equal(aggregateForgeComponentState(["ok", "unknown"]), "unknown");
  assert.equal(aggregateForgeComponentState(["unknown", "degraded"]), "degraded");
  assert.equal(aggregateForgeComponentState(["degraded", "stale"]), "stale");
  assert.equal(aggregateForgeComponentState(["stale", "down"]), "down");
  assert.equal(aggregateForgeComponentState(["down", "hold"]), "hold");
  // 우선순위 배열 자체와 어긋나지 않는지 전수로 확인한다.
  for (let index = 0; index < FORGE_STATE_PRIORITY.length; index += 1) {
    for (let other = 0; other < FORGE_STATE_PRIORITY.length; other += 1) {
      const expected = FORGE_STATE_PRIORITY[Math.min(index, other)];
      assert.equal(aggregateForgeComponentState([FORGE_STATE_PRIORITY[index], FORGE_STATE_PRIORITY[other]]), expected);
    }
  }
});

test("근거가 없거나 전부 unmonitored 인 부품은 ok 가 아니라 unknown 이다", () => {
  assert.equal(aggregateForgeComponentState([]), "unknown");
  assert.equal(aggregateForgeComponentState(["unknown", "unknown"]), "unknown");
  const model = buildForgeMapViewModel({
    topology: snapshot([node("src_hiworks", "unmonitored", ["structural_only"])]),
  });
  const tributary = model.components.find((component) => component.id === "tributary");
  assert.equal(tributary.state, "unknown");
  const rune = model.components.find((component) => component.id === "rune");
  assert.equal(rune.state, "unknown");
  assert.equal(rune.observedNodeCount, 0);
});

test("이 화면이 모르는 상태는 조용히 무시되지 않고 최악(hold)으로 오른다", () => {
  assert.equal(aggregateForgeComponentState(["ok", "quantum"]), "hold");
  assert.equal(forgeStateFromNodeState("no_such_state"), "unknown");
});

test("unmonitored 만 unknown 으로 접고 나머지 노드 상태는 그대로 통과한다", () => {
  assert.equal(forgeStateFromNodeState("ok"), "ok");
  assert.equal(forgeStateFromNodeState("degraded"), "degraded");
  assert.equal(forgeStateFromNodeState("stale"), "stale");
  assert.equal(forgeStateFromNodeState("down"), "down");
  assert.equal(forgeStateFromNodeState("unmonitored"), "unknown");
});

test("매핑되지 않은 노드는 숨지 않고 기타로 세어진다", () => {
  const model = buildForgeMapViewModel({
    topology: snapshot([
      node("store_mail_events", "ok"),
      node("brand_new_collector", "degraded", ["status_error"]),
      node("another_unknown_node", "ok"),
    ]),
  });
  assert.equal(model.summary.unmappedNodeCount, 2);
  assert.equal(model.other.observedNodeCount, 2);
  assert.deepEqual(model.other.nodes.map((row) => row.id), ["brand_new_collector", "another_unknown_node"]);
  assert.equal(model.other.state, "degraded");
  // 기타에 들어간 고장도 주의 목록에 뜬다.
  assert.equal(model.attention.some((row) => row.id === "brand_new_collector" && row.componentName === "기타"), true);
});

test("어댑터 봉투와 스냅샷 두 모양을 모두 받고 refresh_state 를 그대로 보여 준다", () => {
  const plain = buildForgeMapViewModel({ topology: snapshot([node("consumer_board", "ok")]) });
  const wrapped = buildForgeMapViewModel({
    topology: { refresh_state: "stale", snapshot: snapshot([node("consumer_board", "ok")]) },
  });
  assert.equal(plain.available, true);
  assert.equal(plain.refreshState, null);
  assert.equal(wrapped.available, true);
  assert.equal(wrapped.refreshState, "stale");
  assert.equal(wrapped.observedAt, "2026-09-06T00:00:00.000Z");
});

test("topology 가 없으면 available=false 이고 모든 부품이 회색으로 남는다", () => {
  const model = buildForgeMapViewModel({});
  assert.equal(model.available, false);
  assert.equal(model.summary.observedNodeTotal, 0);
  assert.equal(model.components.every((component) => component.state === "unknown"), true);
  assert.equal(model.attention.length, 0);
});

test("실제 라이브 모양(28노드·ok16·degraded3·unmonitored9)에서 부품 색이 관측대로 나온다", () => {
  const live = snapshot([
    node("src_hiworks", "unmonitored", ["structural_only"]),
    node("src_plaud", "unmonitored", ["structural_only"]),
    node("src_slack", "unmonitored", ["structural_only"]),
    node("src_onedrive", "unmonitored", ["structural_only"]),
    node("src_codex", "unmonitored", ["provider_evidence_absent"]),
    node("src_claude", "unmonitored", ["provider_evidence_absent"]),
    node("src_antigravity", "unmonitored", ["provider_evidence_absent"]),
    node("ingress_supervisor", "degraded", ["status_degraded"]),
    node("mail_forwarder", "ok"),
    node("slack_batch", "ok"),
    node("local_activity", "ok"),
    node("usage_codex_collector", "degraded", ["status_error"]),
    node("usage_claude_collector", "ok"),
    node("usage_antigravity_collector", "ok"),
    node("store_mail_events", "ok"),
    node("store_voice_custody", "ok"),
    node("store_slack_custody", "ok"),
    node("gate_five_field", "ok"),
    node("usage_meter", "ok"),
    node("codex_retention_report", "ok"),
    node("store_workmeta", "ok"),
    node("src_gmail", "unmonitored", ["structural_only"]),
    node("voice_label_worker", "degraded", ["status_blocked"]),
    node("store_activity_outbox", "ok"),
    node("store_usage_ledger", "ok"),
    node("watchtower_self", "ok"),
    node("consumer_timeline", "unmonitored", ["structural_only"]),
    node("consumer_board", "ok"),
  ]);
  const model = buildForgeMapViewModel({ topology: { refresh_state: "stale", snapshot: live } });
  const stateOf = (id) => model.components.find((component) => component.id === id).state;
  assert.equal(model.summary.observedNodeTotal, 28);
  assert.equal(model.summary.unmappedNodeCount, 0, "라이브 28노드는 전부 부품에 붙는다");
  assert.equal(stateOf("heartwood"), "ok");
  assert.equal(stateOf("quench"), "ok");
  assert.equal(stateOf("vigil"), "ok");
  assert.equal(stateOf("tributary"), "degraded");
  assert.equal(stateOf("hearth"), "degraded");
  assert.equal(stateOf("world_tree"), "unknown");
  assert.equal(stateOf("hermes"), "unknown");
  assert.equal(stateOf("reliquary"), "unknown");
  assert.equal(stateOf("buzz"), "unknown");
  assert.equal(model.summary.attentionCount, 3);
  assert.deepEqual(
    model.attention.map((row) => `${row.componentName}:${row.id}`).sort(),
    ["Hearth:usage_codex_collector", "Tributary:ingress_supervisor", "Tributary:voice_label_worker"],
  );
  assert.deepEqual(model.attention[0].reasons, ["상태 신호: degraded"]);
});

test("Tongs 색은 하트비트를 따르고 없음과 깨짐을 구분한다", () => {
  const tongsOf = (tongs) => buildForgeMapViewModel({ tongs }).components.find((c) => c.id === "tongs");
  assert.equal(tongsOf(null).state, "unknown");
  assert.equal(tongsOf({ state: "unknown", reason: "tongs_heartbeat_absent" }).state, "unknown");
  assert.equal(tongsOf({ state: "unavailable", reason: "tongs_heartbeat_status_unexpected" }).state, "degraded");
  // "ready" 는 Tongs lane 이 실제로 쓰는 상태 값이다(tongs_lane_support.mjs의
  // TONGS_HEARTBEAT_STATUSES) — 예전 "listening" 은 lane 이 절대 쓰지 않는 값이었다.
  assert.equal(tongsOf({ state: "ready", status: "ready", listen_port: 4311, fresh: true }).state, "ok");
  assert.equal(tongsOf({ state: "ready", status: "ready", listen_port: 4311, fresh: false }).state, "stale");
  assert.equal(tongsOf({ state: "ready", status: "starting", listen_port: 4311, fresh: true }).state, "degraded");
  assert.equal(tongsOf({ state: "ready", status: "degraded", listen_port: 4311, fresh: true }).state, "degraded");
  assert.equal(tongsOf({ state: "ready", status: "stopped", listen_port: 4311, fresh: true }).state, "down");
  assert.equal(tongsOf({ state: "ready", status: "error", listen_port: null, fresh: true }).state, "down");
  assert.match(tongsOf({ state: "ready", status: "ready", listen_port: 4311, fresh: true }).evidenceNote, /4311/u);
});

test("외부 작업 사이클 색은 상태 파일의 건수를 따른다", () => {
  const cycleOf = (secureWork) => buildForgeMapViewModel({ secureWork }).components.find((c) => c.id === "secure_work");
  assert.equal(cycleOf(null).state, "unknown");
  assert.equal(cycleOf({ state: "unknown", reason: "secure_work_status_absent" }).state, "unknown");
  assert.equal(cycleOf({ state: "unavailable", reason: "secure_work_status_unparsable" }).state, "degraded");
  assert.equal(cycleOf({ state: "ready", jobs: {} }).state, "unknown");
  assert.equal(cycleOf({ state: "ready", jobs: { G2_PREPARED: 1 } }).state, "ok");
  assert.equal(cycleOf({ state: "ready", jobs: { G2_PREPARED: 1, G3_FAILED: 2 } }).state, "degraded");
  assert.match(cycleOf({ state: "ready", jobs: { G2_PREPARED: 1 } }).evidenceNote, /G2_PREPARED 1/u);
});

test("Bellows 색은 예약 작업 결과 코드를 따른다", () => {
  const bellowsOf = (scheduledTasks) => buildForgeMapViewModel({ scheduledTasks }).components.find((c) => c.id === "bellows");
  assert.equal(bellowsOf(null).state, "unknown");
  assert.equal(bellowsOf({ state: "unavailable", reason: "scheduled_tasks_platform_unsupported" }).state, "unknown");
  assert.equal(bellowsOf({ state: "ready", tasks: [] }).state, "unknown");
  assert.equal(bellowsOf({ state: "ready", tasks: [{ name: "Soulforge-A", status: "Ready", healthy: true }] }).state, "ok");
  assert.equal(bellowsOf({
    state: "ready",
    tasks: [
      { name: "Soulforge-A", status: "Ready", healthy: true },
      { name: "Soulforge-B", status: "Ready", healthy: false },
    ],
  }).state, "degraded");
});

test("view model 은 얼려서 나오고 소비 쪽에서 바꿀 수 없다", () => {
  const model = buildForgeMapViewModel({ topology: snapshot([node("consumer_board", "ok")]) });
  assert.equal(Object.isFrozen(model), true);
  assert.equal(Object.isFrozen(model.components), true);
  assert.equal(Object.isFrozen(model.components[0]), true);
  assert.throws(() => { model.summary.attentionCount = 99; }, TypeError);
});

test("상자를 넘칠 글자는 잘리고 들어가는 글자는 그대로 남는다", () => {
  assert.equal(clampForgeText("짧다", 200, 11), "짧다");
  const clamped = clampForgeText("아주 긴 한국어 설명이 상자를 넘어간다", 60, 11);
  assert.equal(clamped.endsWith("\u2026"), true);
  assert.equal(clamped.length < "아주 긴 한국어 설명이 상자를 넘어간다".length, true);
  assert.equal(estimateForgeTextWidth("가나다", 10) > estimateForgeTextWidth("abc", 10), true, "한글이 더 넓다");
  assert.equal(clampForgeText("무엇이든", 0, 11), "");
  assert.equal(clampForgeText(null, 100, 11), "");
});

test("사유 코드는 기존 사유 사전을 그대로 통과해 한국어로 읽힌다", () => {
  const model = buildForgeMapViewModel({
    topology: snapshot([node("src_hiworks", "unmonitored", ["structural_only"])]),
  });
  const tributary = model.components.find((component) => component.id === "tributary");
  assert.deepEqual(tributary.nodes[0].reasons, ["구조 관계만 표시"]);
});

test("모듈은 fetch·타이머·writer 를 갖지 않는다", () => {
  const source = readFileSync(join(CORE_ROOT, "forge-map-view.mjs"), "utf8");
  for (const forbidden of ["fetch(", "setInterval", "setTimeout", "node:fs", "node:child_process", "XMLHttpRequest", "localStorage"]) {
    assert.equal(source.includes(forbidden), false, `순수 view-model 에 ${forbidden} 이 있으면 안 된다`);
  }
});
