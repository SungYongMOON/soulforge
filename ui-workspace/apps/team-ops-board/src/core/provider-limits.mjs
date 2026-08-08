// provider-limits.mjs — 공급자(Codex·Claude)가 스스로 보고한 공식 한도 사용률의
// 순수 파싱·정규화 계층. 로컬 추정치가 아니라 관측된 공식 값만 다루며, 실패는 null로 닫는다.

export const PROVIDER_LIMITS_SCHEMA_VERSION = "soulforge.team_ops_board_provider_limits.v1";

const SAFE_PLAN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/u;

function finitePercent(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1000
    ? Math.round(value * 10) / 10
    : null;
}

function safeEpochSeconds(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function isoOrNull(value) {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function codexWindow(window) {
  if (typeof window !== "object" || window === null) return null;
  const usedPercent = finitePercent(window.used_percent);
  if (usedPercent === null) return null;
  return {
    used_percent: usedPercent,
    window_minutes: safeEpochSeconds(window.window_minutes),
    resets_at_epoch_s: safeEpochSeconds(window.resets_at),
  };
}

// 세션 JSONL 텍스트에서 마지막(최신) rate_limits 관측을 찾는다. 파싱 불가 줄은 건너뛴다.
export function parseCodexRateLimitsFromJsonlText(text) {
  if (typeof text !== "string" || text.length === 0) return null;
  const lines = text.split("\n");
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line.includes('"rate_limits"')) continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    const limits = parsed?.payload?.rate_limits ?? parsed?.rate_limits ?? null;
    if (typeof limits !== "object" || limits === null) continue;
    const primary = codexWindow(limits.primary);
    if (primary === null) continue;
    return {
      primary,
      secondary: codexWindow(limits.secondary),
      plan_type: typeof limits.plan_type === "string" && SAFE_PLAN.test(limits.plan_type) ? limits.plan_type : null,
      observed_at: isoOrNull(parsed?.timestamp),
    };
  }
  return null;
}

function claudeWindow(window) {
  if (typeof window !== "object" || window === null) return null;
  const utilization = finitePercent(window.utilization);
  if (utilization === null) return null;
  return {
    utilization,
    resets_at: isoOrNull(window.resets_at),
  };
}

// Anthropic OAuth usage 응답에서 사용률 창만 추린다. 그 외 필드(한도 원값·과금)는 싣지 않는다.
export function normalizeClaudeOauthUsage(body) {
  if (typeof body !== "object" || body === null) return null;
  const fiveHour = claudeWindow(body.five_hour);
  const sevenDay = claudeWindow(body.seven_day);
  if (fiveHour === null && sevenDay === null) return null;
  return {
    five_hour: fiveHour,
    seven_day: sevenDay,
    seven_day_opus: claudeWindow(body.seven_day_opus),
    seven_day_sonnet: claudeWindow(body.seven_day_sonnet),
  };
}

export function buildProviderLimitsSnapshot({ codex = null, claude = null, observedAtMs = Date.now() } = {}) {
  return {
    schema_version: PROVIDER_LIMITS_SCHEMA_VERSION,
    observed_at: new Date(observedAtMs).toISOString(),
    codex,
    claude,
  };
}
