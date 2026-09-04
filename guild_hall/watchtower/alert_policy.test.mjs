import assert from "node:assert/strict";
import test from "node:test";

import {
  ALERT_LEDGER_SCHEMA,
  DEFAULT_BACKOFF_SECONDS,
  createEmptyAlertLedger,
  planAlerts,
  renderAlertText,
} from "./alert_policy.mjs";

const T0 = Date.parse("2026-09-04T00:00:00.000Z");
const HOUR = 3600_000;

function snap(...entries) {
  return {
    nodes: entries.map(([id, state, extra = {}]) => ({
      id,
      label: extra.label ?? id,
      health: {
        state,
        age_seconds: extra.age ?? 0,
        reasons: extra.reasons ?? [],
      },
    })),
  };
}

test("a fault fires once on transition and stays quiet while it persists", () => {
  let ledger = createEmptyAlertLedger();
  let out = planAlerts({ snapshot: snap(["buzz_collect", "down"]), ledger, now: T0 });
  assert.equal(out.requests.length, 1);
  assert.equal(out.requests[0].event, "node_down");
  assert.equal(out.requests[0].repeat_index, 0);
  ledger = out.ledger;

  // 같은 상태가 이어지는 동안은 침묵한다. 판정은 매 회차 나지만 사건이 아니다.
  for (const minutes of [5, 10, 30, 55]) {
    out = planAlerts({ snapshot: snap(["buzz_collect", "down"]), ledger, now: T0 + minutes * 60_000 });
    assert.deepEqual(out.requests, [], `${minutes}분 뒤에는 울리지 않아야 한다`);
    ledger = out.ledger;
  }
});

test("a persisting fault re-fires on a widening backoff, then daily", () => {
  let ledger = createEmptyAlertLedger();
  let now = T0;
  const fires = [];
  // 60일을 5분 간격으로 돌린다. 실제 운영과 같은 판정 빈도다.
  for (let step = 0; step < 60 * 24 * 12; step += 1) {
    const out = planAlerts({ snapshot: snap(["buzz_collect", "down"]), ledger, now });
    if (out.requests.length > 0) fires.push((now - T0) / HOUR);
    ledger = out.ledger;
    now += 5 * 60_000;
  }
  // 0h(최초) → +1h → +4h → +24h → 이후 매일
  assert.deepEqual(fires.slice(0, 4), [0, 1, 5, 29]);
  const tail = fires.slice(4).map((hours, index) => hours - (index === 0 ? 29 : fires[4 + index - 1]));
  assert.ok(tail.every((gap) => gap === 24), "이후 간격은 하루로 고정된다");
  // 60일 고장에 알림은 60여 통이지, 회차마다 울린 17,280통이 아니다.
  assert.ok(fires.length < 70, `총 발화 ${fires.length}건`);
});

test("recovery fires only when the fault was actually reported", () => {
  // 보고된 고장 → 복구: 알린다.
  let out = planAlerts({ snapshot: snap(["linear_collect", "stale"]), ledger: createEmptyAlertLedger(), now: T0 });
  assert.equal(out.requests[0].event, "node_stale");
  out = planAlerts({ snapshot: snap(["linear_collect", "ok"]), ledger: out.ledger, now: T0 + HOUR });
  assert.equal(out.requests.length, 1);
  assert.equal(out.requests[0].event, "node_recovered");
  assert.equal(out.requests[0].previous_state, "stale");

  // 복구 뒤에는 조용하다.
  out = planAlerts({ snapshot: snap(["linear_collect", "ok"]), ledger: out.ledger, now: T0 + 2 * HOUR });
  assert.deepEqual(out.requests, []);

  // 알린 적 없는 고장(대상 밖이었다)에서 회복하면 "고쳐졌다"고 말하지 않는다.
  // 알림 없이 복구 통지만 받으면 사람은 무슨 일인지 알 수 없다.
  const unreported = planAlerts({
    snapshot: snap(["mail_forwarder", "down"]), ledger: createEmptyAlertLedger(), now: T0, eligible: [],
  });
  assert.deepEqual(unreported.requests, []);
  const after = planAlerts({ snapshot: snap(["mail_forwarder", "ok"]), ledger: unreported.ledger, now: T0 + HOUR });
  assert.deepEqual(after.requests, [], "보고되지 않은 고장의 복구는 알리지 않는다");
});

test("unmonitored never alerts, in either direction", () => {
  const many = snap(
    ["a", "unmonitored"], ["b", "unmonitored"], ["c", "unmonitored"],
    ["d", "unmonitored"], ["e", "unmonitored"],
  );
  const first = planAlerts({ snapshot: many, ledger: createEmptyAlertLedger(), now: T0 });
  assert.deepEqual(first.requests, [], "첫 회차에 미감시 노드가 쏟아지면 안 된다");

  // 미감시 → ok 는 복구가 아니다. 고장난 적이 없다.
  const green = planAlerts({ snapshot: snap(["a", "ok"]), ledger: first.ledger, now: T0 + HOUR });
  assert.deepEqual(green.requests, []);

  // 고장 → 미감시(probe 가 사라짐)도 복구가 아니다.
  const broke = planAlerts({ snapshot: snap(["z", "down"]), ledger: createEmptyAlertLedger(), now: T0 });
  assert.equal(broke.requests.length, 1);
  const gone = planAlerts({ snapshot: snap(["z", "unmonitored"]), ledger: broke.ledger, now: T0 + HOUR });
  assert.deepEqual(gone.requests, [], "미감시로 바뀐 것은 복구가 아니다");
});

test("a fault that returns after recovery starts its backoff over", () => {
  let out = planAlerts({ snapshot: snap(["x", "down"]), ledger: createEmptyAlertLedger(), now: T0 });
  out = planAlerts({ snapshot: snap(["x", "ok"]), ledger: out.ledger, now: T0 + HOUR });
  assert.equal(out.requests[0].event, "node_recovered");
  // 다시 고장: 즉시 울려야 한다. 이전 백오프를 물려받으면 안 된다.
  out = planAlerts({ snapshot: snap(["x", "down"]), ledger: out.ledger, now: T0 + HOUR + 60_000 });
  assert.equal(out.requests.length, 1);
  assert.equal(out.requests[0].repeat_index, 0);
});

test("changing fault kind is a new fault, and `since` tracks entry not restart", () => {
  let out = planAlerts({ snapshot: snap(["y", "stale"]), ledger: createEmptyAlertLedger(), now: T0 });
  assert.equal(out.requests[0].event, "node_stale");
  const since = out.ledger.nodes.y.since;
  // stale -> down 은 상태가 바뀐 것이므로 백오프를 기다리지 않고 알린다.
  out = planAlerts({ snapshot: snap(["y", "down"]), ledger: out.ledger, now: T0 + 60_000 });
  assert.equal(out.requests[0].event, "node_down");
  assert.notEqual(out.ledger.nodes.y.since, since, "상태가 바뀌면 since 가 갱신된다");
  // 같은 상태가 이어지면 since 는 유지된다.
  const held = planAlerts({ snapshot: snap(["y", "down"]), ledger: out.ledger, now: T0 + 120_000 });
  assert.equal(held.ledger.nodes.y.since, out.ledger.nodes.y.since);
});

test("the eligible list gates alerting without hiding state", () => {
  const both = snap(["buzz_collect", "down"], ["mail_forwarder", "down"]);
  const out = planAlerts({ snapshot: both, ledger: createEmptyAlertLedger(), now: T0, eligible: ["buzz_collect"] });
  assert.deepEqual(out.requests.map((r) => r.node_id), ["buzz_collect"]);
  // 대상 밖 노드도 장부에는 남는다 - 나중에 대상에 넣으면 그때부터 정상 판정된다.
  assert.equal(out.ledger.nodes.mail_forwarder.last_state, "down");
  assert.equal(out.ledger.nodes.mail_forwarder.notify_count, 0);
});

test("a corrupt or foreign ledger is treated as empty, not trusted", () => {
  for (const bad of [null, undefined, 42, "x", [], { nodes: [] }, { schema_version: "other", nodes: { a: {} } }]) {
    const out = planAlerts({ snapshot: snap(["a", "down"]), ledger: bad, now: T0 });
    assert.equal(out.requests.length, 1, `ledger=${JSON.stringify(bad)}`);
    assert.equal(out.ledger.schema_version, ALERT_LEDGER_SCHEMA);
  }
});

test("nodes absent from the snapshot are dropped from the ledger", () => {
  const out = planAlerts({ snapshot: snap(["a", "down"], ["b", "ok"]), ledger: createEmptyAlertLedger(), now: T0 });
  const next = planAlerts({ snapshot: snap(["a", "down"]), ledger: out.ledger, now: T0 + HOUR });
  assert.deepEqual(Object.keys(next.ledger.nodes), ["a"]);
});

test("the request carries no path, and unsafe reason codes are dropped", () => {
  const out = planAlerts({
    // 경로 모양·대문자·과길이는 전부 걸러진다. 실제 절대경로 문자열은 이 저장소의
    // path-policy 가 소스에서 금지하므로, 같은 성질을 가진 상대경로 모양으로 시험한다.
    snapshot: snap(["a", "down", { reasons: ["heartbeat_stale", "var/lib/hidden", "ok_code", "A".repeat(200)] }]),
    ledger: createEmptyAlertLedger(),
    now: T0,
  });
  assert.deepEqual(out.requests[0].reasons, ["heartbeat_stale", "ok_code"]);
  assert.ok(!JSON.stringify(out.requests[0]).includes("hidden"));
});

test("the rendered line is plain Korean with no code or path", () => {
  const [down] = planAlerts({
    snapshot: snap(["linear_collect", "stale", { label: "Linear 수집기", age: 2700, reasons: ["heartbeat_stale"] }]),
    ledger: createEmptyAlertLedger(), now: T0,
  }).requests;
  const text = renderAlertText(down);
  assert.match(text, /Linear 수집기가 45분째 응답이 없습니다/u);
  assert.ok(!text.includes("heartbeat_stale") && !text.includes("/") && !text.includes("_"));

  assert.equal(renderAlertText({ event: "node_recovered", label: "Buzz 수집기" }), "Buzz 수집기가 정상으로 돌아왔습니다.");
  assert.match(renderAlertText({ event: "node_down", label: "백업", age_seconds: 2 * 86400 }), /2일째/u);
});

test("default backoff is the documented 1h / 4h / 24h", () => {
  assert.deepEqual([...DEFAULT_BACKOFF_SECONDS], [3600, 14400, 86400]);
});

test("a fault self-repair is handling stays quiet; one it refuses alerts at once", () => {
  const both = snap(["a", "down"], ["b", "down"]);
  const out = planAlerts({
    snapshot: both,
    ledger: createEmptyAlertLedger(),
    now: T0,
    recovery: {
      a: { disposition: "bounded_retry" },        // 코디네이터가 처리 중
      b: { disposition: "owner_action_required" }, // 사람이 필요하다고 판정
    },
  });
  assert.deepEqual(out.requests.map((r) => r.node_id), ["b"]);
  assert.equal(out.requests[0].event, "node_down");
  assert.equal(out.requests[0].disposition, "owner_action_required");
});

test("2026-09-04 재현: owner_action_required 200건이 알림 1통이 된다", () => {
  // 그날 실제 모양 - 노드 8개가 2시간 동안 5분마다 같은 판정을 받았다.
  const nodes = [
    "usage_codex_collector", "usage_claude_collector", "usage_antigravity_collector",
    "usage_meter", "store_usage_ledger", "store_workmeta", "gate_five_field",
    "watchtower_self",
  ];
  const snapshot = snap(...nodes.map((id) => [id, "stale", { age: 160000 }]));
  const recovery = Object.fromEntries(nodes.map((id) => [id, { disposition: "owner_action_required" }]));

  let ledger = createEmptyAlertLedger();
  let now = T0;
  const perNode = new Map(nodes.map((id) => [id, 0]));
  let judgements = 0;
  for (let sweep = 0; sweep < 25; sweep += 1) {       // 2시간 / 5분 = 25회차
    const out = planAlerts({ snapshot, ledger, now, recovery });
    judgements += snapshot.nodes.length;
    for (const request of out.requests) perNode.set(request.node_id, perNode.get(request.node_id) + 1);
    ledger = out.ledger;
    now += 5 * 60_000;
  }
  const total = [...perNode.values()].reduce((sum, count) => sum + count, 0);
  assert.equal(judgements, 200, "그날 실제 판정 건수와 같은 조건이다");
  // 노드당 2통: 최초 발화 + 1시간 백오프 1회. 2시간 창이라 4시간 단계는 아직이다.
  assert.ok([...perNode.values()].every((count) => count === 2), "노드당 2통");
  assert.equal(total, 16, `판정 200건 -> 알림 ${total}통`);
});

test("self-repair that never succeeds becomes reportable after the grace", () => {
  // 코디네이터가 "고칠 수 있다"고 하면서 영원히 못 고치는 경우. 밖에서 보면
  // 건강한 것과 구분이 안 되므로, 유예를 넘기면 알린다.
  const snapshot = snap(["a", "down"]);
  const recovery = { a: { disposition: "auto_repairable" } };
  let out = planAlerts({ snapshot, ledger: createEmptyAlertLedger(), now: T0, recovery });
  assert.deepEqual(out.requests, [], "유예 안에서는 조용하다");

  out = planAlerts({ snapshot, ledger: out.ledger, now: T0 + 59 * 60_000, recovery });
  assert.deepEqual(out.requests, [], "59분에도 조용하다");

  out = planAlerts({ snapshot, ledger: out.ledger, now: T0 + 61 * 60_000, recovery });
  assert.equal(out.requests.length, 1);
  assert.equal(out.requests[0].event, "node_repair_stalled");
  assert.match(renderAlertText(out.requests[0]), /자동으로 고치지 못하고 있습니다/u);
});

test("missing recovery evidence alerts rather than staying silent", () => {
  // 복구 정보가 아예 없거나 그 노드만 빠져 있으면, 조용히 있는 쪽이 아니라
  // 알리는 쪽으로 기운다. 침묵이 증거 부재의 결과가 되면 안 된다.
  for (const recovery of [null, {}, { other: { disposition: "auto_repairable" } }, { a: {} }]) {
    const out = planAlerts({ snapshot: snap(["a", "down"]), ledger: createEmptyAlertLedger(), now: T0, recovery });
    assert.equal(out.requests.length, 1, `recovery=${JSON.stringify(recovery)}`);
    assert.equal(out.requests[0].disposition, null);
  }
});

test("recovery handled quietly still records state, and its recovery is not announced", () => {
  const recovery = { a: { disposition: "bounded_retry" } };
  const quiet = planAlerts({ snapshot: snap(["a", "down"]), ledger: createEmptyAlertLedger(), now: T0, recovery });
  assert.deepEqual(quiet.requests, []);
  assert.equal(quiet.ledger.nodes.a.last_state, "down");

  // 알린 적 없으니 복구도 알리지 않는다 - 스스로 고친 것은 이력에만 남는다.
  const fixed = planAlerts({ snapshot: snap(["a", "ok"]), ledger: quiet.ledger, now: T0 + 10 * 60_000, recovery });
  assert.deepEqual(fixed.requests, [], "스스로 고친 건은 알리지 않는다");
});
