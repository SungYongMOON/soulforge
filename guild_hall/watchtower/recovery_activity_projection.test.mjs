import assert from "node:assert/strict";
import test from "node:test";

import { buildActivityEvent } from "../activity/activity_log.mjs";
import {
  RECOVERY_ACTIVITY_SCOPE,
  closeMissingEpisodes,
  createEmptyRecoveryActivityWatermark,
  projectRecoveryActivity,
} from "./recovery_activity_projection.mjs";

const T0 = Date.parse("2026-09-04T03:07:40.379Z");

function judgement(nodeId, at, over = {}) {
  return {
    at: new Date(at).toISOString(),
    node_id: nodeId,
    reason: "processing_failed",
    diagnostic_code: "task_action_path_drift",
    action: "none",
    attempt: "denied",
    verification: "not_run",
    circuit_state: "closed",
    next_retry_at: null,
    outcome_code: "owner_action_required",
    ...over,
  };
}

test("2026-09-04 재현: 판정 200건이 장부 8행이 된다", () => {
  // 그날 실제 모양 - 노드 8개가 2시간 동안 5분마다 같은 판정을 받았다.
  const nodes = [
    "usage_codex_collector", "usage_claude_collector", "usage_antigravity_collector",
    "usage_meter", "store_usage_ledger", "store_workmeta", "gate_five_field",
    "watchtower_self",
  ];
  const entries = [];
  for (let sweep = 0; sweep < 25; sweep += 1) {
    for (const id of nodes) entries.push(judgement(id, T0 + sweep * 5 * 60_000));
  }
  assert.equal(entries.length, 200, "그날과 같은 판정 건수");

  const out = projectRecoveryActivity({ entries, watermark: createEmptyRecoveryActivityWatermark(), now: T0 });
  assert.equal(out.events.length, nodes.length, "노드당 1행 - episode 가 열릴 때 한 번");
  assert.ok(out.events.every((event) => event.scope === RECOVERY_ACTIVITY_SCOPE));
  assert.ok(out.events.every((event) => event.result === "hold"), "사람이 필요한 건은 hold");
  assert.ok(out.events.every((event) => event.carry_forward === true), "미해결이므로 이월된다");
});

test("같은 버퍼를 다시 읽어도 행이 늘지 않는다", () => {
  const entries = [judgement("a", T0), judgement("a", T0 + 60_000)];
  const first = projectRecoveryActivity({ entries, watermark: null, now: T0 });
  assert.equal(first.events.length, 1);

  // 롤링 버퍼는 매번 같은 항목을 다시 준다. 워터마크가 그것을 막는다.
  const again = projectRecoveryActivity({ entries, watermark: first.watermark, now: T0 });
  assert.deepEqual(again.events, []);

  // 새 항목만 반영된다.
  const grown = [...entries, judgement("a", T0 + 120_000)];
  const third = projectRecoveryActivity({ entries: grown, watermark: first.watermark, now: T0 });
  assert.deepEqual(third.events, [], "같은 episode 가 이어지는 것은 행이 아니다");
});

test("진단이나 결과가 바뀌면 이전 episode 를 닫고 새로 연다", () => {
  const entries = [
    judgement("a", T0),
    judgement("a", T0 + 300_000),
    judgement("a", T0 + 600_000, { diagnostic_code: "auth_token_revoked" }),
  ];
  const out = projectRecoveryActivity({ entries, watermark: null, now: T0 });
  assert.equal(out.events.length, 3);
  assert.match(out.events[1].summary, /task_action_path_drift.*종료/u);
  assert.match(out.events[1].summary, /판정 2회, 600초/u, "닫는 행이 지속 시간과 횟수를 담는다");
  assert.match(out.events[2].summary, /auth_token_revoked/u);
});

test("스스로 고친 건은 hold 가 아니라 ok 로, 이월되지 않는다", () => {
  const out = projectRecoveryActivity({
    entries: [judgement("a", T0, {
      action: "restart_owned_task", attempt: "executed",
      verification: "passed", outcome_code: "auto_repairable",
    })],
    watermark: null, now: T0,
  });
  assert.equal(out.events[0].result, "ok");
  assert.equal(out.events[0].carry_forward, false, "해결된 건은 이월하지 않는다");
  assert.equal(out.events[0].next_action, null);
});

test("보고가 끊긴 노드의 episode 는 닫힌다", () => {
  const opened = projectRecoveryActivity({
    entries: [judgement("a", T0), judgement("b", T0)], watermark: null, now: T0,
  });
  assert.equal(Object.keys(opened.watermark.open).length, 2);

  // a 만 계속 보고된다 - b 는 끝난 것이므로 영원히 이월되면 안 된다.
  const closed = closeMissingEpisodes({
    watermark: opened.watermark, presentNodeIds: ["a"], now: T0 + 900_000,
  });
  assert.equal(closed.events.length, 1);
  // 여기서 정규식 앵커를 쓰지 않는 이유: 한 글자 노드 이름 뒤에 콜론과 슬래시가
  // 붙으면 path-policy 가 Windows 드라이브 경로로 읽어 위반으로 잡는다.
  assert.ok(closed.events[0].summary.startsWith("b: "));
  assert.deepEqual(Object.keys(closed.watermark.open), ["a"]);
});

test("깨진 워터마크는 신뢰하지 않고 빈 것으로 본다", () => {
  for (const bad of [null, 7, "x", [], { open: [] }, { schema_version: "other", last_at: "2030-01-01T00:00:00.000Z" }]) {
    const out = projectRecoveryActivity({ entries: [judgement("a", T0)], watermark: bad, now: T0 });
    assert.equal(out.events.length, 1, `watermark=${JSON.stringify(bad)}`);
  }
});

test("불량 값이 있어도 활동 이벤트로 그대로 통과한다", () => {
  // 프로젝션 출력은 activity 장부의 실제 빌더를 통과해야 한다. 통과하지 못하면
  // 이 모듈은 쓸 수 없는 행을 만드는 것이다.
  const out = projectRecoveryActivity({
    entries: [judgement("a", T0, {
      node_id: "정상아님/../x", diagnostic_code: "A".repeat(200), action: null, outcome_code: 7,
    })],
    watermark: null, now: T0,
  });
  const event = buildActivityEvent(out.events[0], { repoRoot: "/tmp", now: new Date(T0) });
  assert.equal(event.scope, "recovery");
  assert.equal(event.schema_version, "soulforge.activity.event.v1");
  assert.ok(!event.summary.includes(".."), "경로 모양은 통과하지 못한다");
  assert.equal(event.sensitive_content_included, false);
});
