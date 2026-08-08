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

// 모델별 주간 창 후보 필드 — 계정 상태에 따라 null이었다가 나타난다. 관측되면 그대로 행이 된다.
const CLAUDE_MODEL_WINDOW_SOURCES = Object.freeze([
  ["seven_day_opus", "Opus"],
  ["seven_day_sonnet", "Sonnet"],
  ["seven_day_cowork", "Cowork"],
  ["seven_day_omelette", "Omelette"],
  ["tangelo", "tangelo"],
  ["iguana_necktie", "iguana_necktie"],
  ["nimbus_quill", "nimbus_quill"],
  ["cinder_cove", "cinder_cove"],
  ["amber_ladder", "amber_ladder"],
]);

function safeWindowLabel(value) {
  const cleaned = typeof value === "string" ? value.replace(/[^\w .-]/gu, "").trim().slice(0, 32) : "";
  return cleaned.length > 0 ? cleaned : null;
}

// Anthropic OAuth usage 응답에서 사용률 창만 추린다. 그 외 필드(한도 원값·과금)는 싣지 않는다.
// 모델별 창의 정식 소스는 limits[] 배열의 scope.model 항목(예: weekly_scoped Fable)이다.
export function normalizeClaudeOauthUsage(body) {
  if (typeof body !== "object" || body === null) return null;
  const fiveHour = claudeWindow(body.five_hour);
  const sevenDay = claudeWindow(body.seven_day);
  if (fiveHour === null && sevenDay === null) return null;
  const modelWindows = [];
  const seenLabels = new Set();
  const limitEntries = Array.isArray(body.limits) ? body.limits : [];
  for (const entry of limitEntries) {
    if (typeof entry !== "object" || entry === null) continue;
    const model = entry.scope?.model;
    if (typeof model !== "object" || model === null) continue;
    const utilization = finitePercent(entry.percent);
    const label = safeWindowLabel(model.display_name) ?? safeWindowLabel(model.id);
    if (utilization === null || label === null || seenLabels.has(label)) continue;
    seenLabels.add(label);
    modelWindows.push({
      key: typeof entry.kind === "string" ? entry.kind.slice(0, 40) : "scoped",
      label,
      utilization,
      resets_at: isoOrNull(entry.resets_at),
    });
  }
  // 구형 필드(seven_day_opus 등)는 보조 소스 — limits[]에 같은 라벨이 없을 때만 채운다.
  for (const [key, label] of CLAUDE_MODEL_WINDOW_SOURCES) {
    const window = claudeWindow(body[key]);
    if (window === null || (window.utilization === 0 && window.resets_at === null)) continue;
    if (seenLabels.has(label)) continue;
    seenLabels.add(label);
    modelWindows.push({ key, label, ...window });
  }
  return {
    five_hour: fiveHour,
    seven_day: sevenDay,
    model_windows: modelWindows,
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
