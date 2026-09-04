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
