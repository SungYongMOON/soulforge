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
  not_verified: "조치 후 검증 대기 · 사후 근거 미확인",
  owner_action_required: "책임자 직접 조치 필요 · 자동 조치 불가",
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

export const RECOVERY_DIAGNOSTIC_LABELS = Object.freeze({
  writer_authority_expired: "작성자 권한 만료 · 수동 갱신 필요",
  task_action_path_drift: "작업 실행 경로 불일치 · 소유자 재바인딩 필요",
  usage_event_duplicate_conflict: "사용량 중복 충돌 · 격리 후 관측 계속",
  quarantine_applied: "격리 적용 완료 · 잔여 이벤트 계속",
  cutover_receipt_expired: "전환 영수증 만료 · 소유자 재검증 필요",
  backup_activation_expired: "백업 활성화 만료 · 소유자 승인 필요",
  auth_invalid_grant: "인증 토큰 무효 · 소유자 재인증 필요",
  auth_token_revoked: "인증 토큰 취소 · 소유자 재인증 필요",
  auth_mfa_required: "MFA 추가 인증 필요 · 소유자 조치 필요",
  auth_consent_required: "동의 갱신 필요 · 소유자 조치 필요",
  auth_invalid_client: "인증 클라이언트 설정 오류 · 소유자 조치 필요",
  auth_transient_retry: "일시적 인증 재시도 중",
  auth_terminal_error: "인증 치명적 오류 · 소유자 재인증 필요",
  auth_unknown_failure: "인증 미상 오류 · 소유자 확인 필요",
});

/**
 * Bounded safe lookup for recovery diagnostic label.
 * Returns the exact fixed string or null for unknown/non-string values.
 */
export function lookupRecoveryDiagnosticLabel(diagnosticCode) {
  if (typeof diagnosticCode !== "string") return null;
  return Object.hasOwn(RECOVERY_DIAGNOSTIC_LABELS, diagnosticCode)
    ? RECOVERY_DIAGNOSTIC_LABELS[diagnosticCode]
    : null;
}

/**
 * Bounded safe lookup for recovery outcome label.
 * Returns the exact fixed string or null for unknown/non-string values.
 */
export function lookupRecoveryOutcomeLabel(outcomeCode) {
  if (typeof outcomeCode !== "string") return null;
  return Object.hasOwn(RECOVERY_OUTCOME_LABELS, outcomeCode)
    ? RECOVERY_OUTCOME_LABELS[outcomeCode]
    : null;
}

const SUPERVISOR_ERROR_LABELS = Object.freeze({
  recovery_cycle_failed: "복구 주기 실행 실패",
  recovery_binding_invalid: "복구 바인딩 무효",
  recovery_binding_task_invalid: "복구 바인딩 작업 무효",
  recovery_root_invalid: "복구 경로 설정 무효",
  recovery_evidence_root_invalid: "복구 근거 경로 무효",
});

const BLOCKED_OUTCOMES = new Set([
  "suppressed_circuit_open", "running_but_stale", "forbidden", "supervision_unavailable", "owner_action_required",
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
  if (row.outcome_code === "suppressed_backoff" || row.outcome_code === "not_verified") return "waiting";
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
        outcomeLabel: lookupRecoveryOutcomeLabel(entry.outcome_code),
        diagnosticCode: entry.diagnostic_code ?? null,
        diagnosticLabel: entry.diagnostic_code ? (lookupRecoveryDiagnosticLabel(entry.diagnostic_code) ?? "원인 확인 필요") : null,
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
    outcomeLabel: row === null ? null : lookupRecoveryOutcomeLabel(row.outcome_code),
    diagnosticCode: row?.diagnostic_code ?? null,
    diagnosticLabel: row?.diagnostic_code ? (lookupRecoveryDiagnosticLabel(row.diagnostic_code) ?? "원인 확인 필요") : null,
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
