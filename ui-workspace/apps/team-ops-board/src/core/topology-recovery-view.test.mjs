import assert from "node:assert/strict";
import test from "node:test";

import {
  RECOVERY_HISTORY_VIEW_MAX,
  buildTopologyRecoverySupervision,
} from "./topology-recovery-view.mjs";

const NOW = "2026-08-14T18:00:00.000Z";

function recoveryRow(overrides = {}) {
  return {
    node_id: "consumer_board",
    outcome_code: "verified_repair",
    circuit_state: "closed",
    consecutive_failures: 0,
    last_attempt_at: NOW,
    last_verified_repair_at: NOW,
    next_retry_at: null,
    ...overrides,
  };
}

function projection(row = recoveryRow(), overrides = {}) {
  return {
    state: "ready",
    cycle: { recovery: row === null ? [] : [row] },
    history: { state: "ready", entries: [] },
    supervisor: null,
    ...overrides,
  };
}

test("recovery supervision maps verified, waiting, blocked, and untargeted states", () => {
  const verified = buildTopologyRecoverySupervision({
    projection: projection(), nodeId: "consumer_board",
  });
  assert.equal(verified.stateLabel, "복구 중");
  assert.equal(verified.outcomeLabel, "안전 조치 완료 · 사후 검증 통과");

  const notVerified = buildTopologyRecoverySupervision({
    projection: projection(recoveryRow({
      outcome_code: "not_verified", consecutive_failures: 0,
    })),
    nodeId: "consumer_board",
  });
  assert.equal(notVerified.stateLabel, "재시도 대기");
  assert.equal(notVerified.outcomeLabel, "조치 후 검증 대기 · 사후 근거 미확인");

  const ownerAction = buildTopologyRecoverySupervision({
    projection: projection(recoveryRow({
      outcome_code: "owner_action_required", consecutive_failures: 0,
    })),
    nodeId: "consumer_board",
  });
  assert.equal(ownerAction.stateLabel, "회로 차단/승인 필요");
  assert.equal(ownerAction.outcomeLabel, "책임자 직접 조치 필요 · 자동 조치 불가");

  assert.equal(buildTopologyRecoverySupervision({
    projection: projection(recoveryRow({
      outcome_code: "execution_failed", consecutive_failures: 1,
      next_retry_at: "2026-08-14T18:05:00.000Z",
    })),
    nodeId: "consumer_board",
  }).stateLabel, "재시도 대기");
  assert.equal(buildTopologyRecoverySupervision({
    projection: projection(recoveryRow({
      outcome_code: "suppressed_circuit_open", circuit_state: "open",
      consecutive_failures: 3, next_retry_at: "2026-08-14T19:00:00.000Z",
    })),
    nodeId: "consumer_board",
  }).stateLabel, "회로 차단/승인 필요");
  assert.equal(buildTopologyRecoverySupervision({
    projection: projection(null), nodeId: "consumer_board",
  }).stateLabel, "자동 조치 대상 아님");
});

test("unavailable projections fail closed and stale projections remain labelled stale", () => {
  const unavailable = buildTopologyRecoverySupervision({ projection: null, nodeId: "consumer_board" });
  assert.equal(unavailable.available, false);
  assert.equal(unavailable.stateLabel, "조치 기록 없음");

  const stale = buildTopologyRecoverySupervision({
    projection: projection(recoveryRow(), { state: "stale" }), nodeId: "consumer_board",
  });
  assert.equal(stale.available, true);
  assert.equal(stale.freshness, "stale");
});

test("history is node-scoped, newest-first, and capped for display", () => {
  const entries = Array.from({ length: RECOVERY_HISTORY_VIEW_MAX + 3 }, (_, index) => ({
    node_id: "consumer_board",
    at: new Date(Date.parse(NOW) + index * 60_000).toISOString(),
    outcome_code: "execution_failed",
    circuit_state: index >= 2 ? "open" : "closed",
    next_retry_at: null,
  }));
  entries.push({ ...entries.at(-1), node_id: "usage_meter" });
  const view = buildTopologyRecoverySupervision({
    projection: projection(recoveryRow(), {
      history: { state: "ready", entries },
      supervisor: {
        status: "error", error_code: "recovery_cycle_failed", consecutive_errors: 2,
      },
    }),
    nodeId: "consumer_board",
  });
  assert.equal(view.history.length, RECOVERY_HISTORY_VIEW_MAX);
  assert.equal(view.history[0].at, entries.at(-2).at);
  assert.match(view.supervisorNotice, /감시 주기 실패 2회/u);
});

test("recovery view renders fixed Korean diagnostic label for writer_authority_expired without raw text leak", () => {
  const view = buildTopologyRecoverySupervision({
    projection: projection(recoveryRow({
      outcome_code: "owner_action_required",
      diagnostic_code: "writer_authority_expired",
    }), {
      history: {
        state: "ready",
        entries: [{
          node_id: "consumer_board",
          at: NOW,
          outcome_code: "owner_action_required",
          diagnostic_code: "writer_authority_expired",
          circuit_state: "closed",
          next_retry_at: null,
        }],
      },
    }),
    nodeId: "consumer_board",
  });
  assert.equal(view.diagnosticCode, "writer_authority_expired");
  assert.equal(view.diagnosticLabel, "작성자 권한 만료 · 수동 갱신 필요");
  assert.equal(view.history[0].diagnosticCode, "writer_authority_expired");
  assert.equal(view.history[0].diagnosticLabel, "작성자 권한 만료 · 수동 갱신 필요");
});
