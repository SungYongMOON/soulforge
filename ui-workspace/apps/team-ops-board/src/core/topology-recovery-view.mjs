// Recovery supervision presentation. Pure projection over the read-only
// loopback recovery snapshot. It never mutates node health, never promotes a
// node color, and never exposes raw output, local paths, or task names.

export const RECOVERY_SUPERVISION_STATE_LABELS = Object.freeze({
  repairing: "복구 중",
  waiting: "재시도 대기",
  blocked: "회로 차단/승인 필요",
  not_targeted: "자동 조치 대상 아님",
  unavailable: "조치 기록 없음",
});

export const RECOVERY_OUTCOME_LABELS = Object.freeze({
  verified_repair: "안전 조치 완료 · 사후 검증 통과",
  precondition_unmet: "사전 조건 불충족 · 실행 안 함",
  execution_failed: "조치 실행 실패",
  postverify_failed: "사후 검증 실패",
  running_but_stale: "실행 중이나 근거 지연 · 재시작하지 않음",
  suppressed_backoff: "재시도 대기 중 · 실행 안 함",
  suppressed_circuit_open: "회로 차단으로 보류 · 실행 안 함",
  supervision_unavailable: "감독 상태 확인 불가 · 실행 보류",
  not_eligible: "자동 조치 대상 아님",
  forbidden: "금지된 조치 · 실행 안 함",
  observe_only: "관측 전용 모드 · 실행 안 함",
});

export const RECOVERY_CIRCUIT_LABELS = Object.freeze({
  closed: "정상",
  open: "차단",
  half_open: "1회 시험",
});

const SUPERVISOR_ERROR_LABELS = Object.freeze({
  recovery_cycle_failed: "복구 주기 실행 실패",
  recovery_binding_invalid: "복구 바인딩 무효",
  recovery_binding_task_invalid: "복구 바인딩 작업 무효",
  recovery_root_invalid: "복구 경로 설정 무효",
  recovery_evidence_root_invalid: "복구 근거 경로 무효",
});

const BLOCKED_OUTCOMES = new Set([
  "suppressed_circuit_open", "running_but_stale", "forbidden", "supervision_unavailable",
]);
const NOT_TARGETED_OUTCOMES = new Set(["not_eligible", "observe_only"]);
const ATTEMPTED_OUTCOMES = new Set([
  "precondition_unmet", "execution_failed", "postverify_failed",
]);

export const RECOVERY_HISTORY_VIEW_MAX = 5;

function stateKey(row) {
  // A tracked node with no supervision row was never a repair candidate this
  // cycle. That is "not targeted", never "healthy".
  if (row === null) return "not_targeted";
  if (row.outcome_code === "verified_repair") return "repairing";
  if (BLOCKED_OUTCOMES.has(row.outcome_code)) return "blocked";
  if (NOT_TARGETED_OUTCOMES.has(row.outcome_code)) return "not_targeted";
  if (ATTEMPTED_OUTCOMES.has(row.outcome_code)) {
    return row.circuit_state === "open" ? "blocked" : "waiting";
  }
  if (row.outcome_code === "suppressed_backoff") return "waiting";
  return "not_targeted";
}

function supervisorNotice(supervisor) {
  if (supervisor === null || typeof supervisor !== "object" || supervisor.status !== "error") return null;
  const reason = SUPERVISOR_ERROR_LABELS[supervisor.error_code] ?? "복구 주기 실행 실패";
  const count = Number.isSafeInteger(supervisor.consecutive_errors) ? supervisor.consecutive_errors : 0;
  return `감시 주기 실패 ${count}회 · ${reason}`;
}

/**
 * Build the per-node recovery supervision view. Unknown node IDs, malformed
 * rows, and an unavailable projection all fail closed to "조치 기록 없음"
 * instead of implying that automatic recovery is healthy.
 */
export function buildTopologyRecoverySupervision({ projection, nodeId } = {}) {
  const freshness = projection?.state === "ready" || projection?.state === "stale"
    ? projection.state
    : "unavailable";
  const rows = Array.isArray(projection?.cycle?.recovery) ? projection.cycle.recovery : [];
  const row = freshness === "unavailable"
    ? null
    : rows.find((entry) => entry?.node_id === nodeId
      && Object.hasOwn(RECOVERY_OUTCOME_LABELS, entry?.outcome_code)
      && Object.hasOwn(RECOVERY_CIRCUIT_LABELS, entry?.circuit_state)) ?? null;
  const historyState = projection?.history?.state === "ready" ? "ready" : "unavailable";
  const history = historyState === "ready" && Array.isArray(projection.history.entries)
    ? projection.history.entries
      .filter((entry) => entry?.node_id === nodeId
        && Object.hasOwn(RECOVERY_OUTCOME_LABELS, entry?.outcome_code)
        && Object.hasOwn(RECOVERY_CIRCUIT_LABELS, entry?.circuit_state))
      .slice(-RECOVERY_HISTORY_VIEW_MAX)
      .reverse()
      .map((entry) => ({
        at: entry.at,
        outcomeLabel: RECOVERY_OUTCOME_LABELS[entry.outcome_code],
        circuitLabel: RECOVERY_CIRCUIT_LABELS[entry.circuit_state],
        nextRetryAt: entry.next_retry_at,
      }))
    : [];
  const key = freshness === "unavailable" ? "unavailable" : stateKey(row);
  return {
    available: freshness !== "unavailable",
    freshness,
    stateKey: key,
    stateLabel: RECOVERY_SUPERVISION_STATE_LABELS[key],
    outcomeLabel: row === null ? null : RECOVERY_OUTCOME_LABELS[row.outcome_code],
    circuitLabel: row === null ? null : RECOVERY_CIRCUIT_LABELS[row.circuit_state],
    consecutiveFailures: row === null ? 0 : row.consecutive_failures,
    lastAttemptAt: row?.last_attempt_at ?? null,
    lastVerifiedRepairAt: row?.last_verified_repair_at ?? null,
    nextRetryAt: row?.next_retry_at ?? null,
    historyState,
    history,
    supervisorNotice: supervisorNotice(projection?.supervisor ?? null),
  };
}
