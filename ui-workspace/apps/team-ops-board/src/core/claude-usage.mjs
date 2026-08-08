// claude-usage.mjs — Claude Code 세션 전사(jsonl)의 usage 라인을 집계 숫자·모델 id만 남는
// 사용량 스냅샷으로 재구성하는 순수 계층. 프롬프트·경로·세션 id는 절대 노출하지 않는다(node:test 검증 대상).

export const CLAUDE_USAGE_SCHEMA_VERSION = "soulforge.team_ops_board_claude_usage.v1";

export const CLAUDE_USAGE_FORBIDDEN_KEY_PATTERN = /(prompt|message|content|text|cwd|path|title)/i;

const FIVE_HOURS_MS = 5 * 3_600_000;
const SEVEN_DAYS_MS = 7 * 86_400_000;
const DAY_MS = 86_400_000;
const KST_OFFSET_MS = 9 * 3_600_000;
const MAX_MODEL_ID_LENGTH = 128;
const MAX_MODELS_LISTED = 32;
const MAX_PRIVACY_SCAN_DEPTH = 8;

const TOKEN_KEYS = Object.freeze(["input", "output", "cache_read", "cache_write", "total_tokens", "total_with_cache"]);
const WINDOW_ALLOWED_KEYS = new Set(["turns", "sidechain_turns", "tokens"]);
const TOKENS_ALLOWED_KEYS = new Set(TOKEN_KEYS);
const MODEL_ALLOWED_KEYS = new Set(["model", "turns", "tokens"]);
const SNAPSHOT_ALLOWED_KEYS = new Set([
  "schema_version",
  "observed_at",
  "last_activity_at",
  "five_hour",
  "calendar_day",
  "rolling_7d",
  "models_7d",
  "plan",
]);
const PLAN_ALLOWED_KEYS = new Set(["user_rate_limit_tier", "organization_rate_limit_tier"]);

// 표시 전용 USD 예상 비용 — 원장(크레딧)과 섞지 않는다. 공시 API 단가(2026-08 관측,
// USD/1M tok). cache_write는 1시간 TTL 요율(입력의 2배) 기준 추정치.
export const CLAUDE_USD_RATE_CARD = Object.freeze({
  observed: "2026-08",
  models: Object.freeze({
    "claude-fable-5": Object.freeze({ input: 10, output: 50, cache_read: 1, cache_write: 20 }),
    "claude-opus-5": Object.freeze({ input: 5, output: 25, cache_read: 0.5, cache_write: 10 }),
    "claude-sonnet-5": Object.freeze({ input: 2, output: 10, cache_read: 0.2, cache_write: 4 }),
    "claude-haiku-4-5-20251001": Object.freeze({ input: 1, output: 5, cache_read: 0.1, cache_write: 2 }),
  }),
});

export function estimateClaudeUsdCost(modelEntries) {
  if (!Array.isArray(modelEntries)) return null;
  let usd = 0;
  const unknownModels = [];
  for (const entry of modelEntries) {
    const rates = CLAUDE_USD_RATE_CARD.models[entry?.model];
    const tokens = entry?.tokens;
    if (!rates || !isPlainObject(tokens)) {
      if (typeof entry?.model === "string") unknownModels.push(entry.model);
      continue;
    }
    const part = (count, rate) => (Number.isFinite(count) && count > 0 ? (count / 1_000_000) * rate : 0);
    usd += part(tokens.input, rates.input)
      + part(tokens.output, rates.output)
      + part(tokens.cache_read, rates.cache_read)
      + part(tokens.cache_write, rates.cache_write);
  }
  return { usd: Math.round(usd * 100) / 100, unknown_models: unknownModels };
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value, allowedKeys) {
  if (!isPlainObject(value)) return false;
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function countOrZero(value) {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function isCount(value) {
  return Number.isFinite(value) && value >= 0;
}

function emptyTokens() {
  return { input: 0, output: 0, cache_read: 0, cache_write: 0, total_tokens: 0, total_with_cache: 0 };
}

function emptyWindow() {
  return { turns: 0, sidechain_turns: 0, tokens: emptyTokens() };
}

export function parseClaudeUsageLine(line) {
  if (typeof line !== "string" || line.length === 0) return null;
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isPlainObject(parsed) || parsed.type !== "assistant") return null;
  const message = parsed.message;
  if (!isPlainObject(message) || !isPlainObject(message.usage)) return null;
  let messageId = null;
  if (typeof message.id === "string" && message.id.length > 0) {
    messageId = message.id;
  } else if (typeof parsed.requestId === "string" && parsed.requestId.length > 0) {
    messageId = parsed.requestId;
  }
  if (messageId === null) return null;
  if (typeof parsed.timestamp !== "string" || Number.isNaN(Date.parse(parsed.timestamp))) return null;
  const model = typeof message.model === "string" && message.model.length > 0
    && message.model.length <= MAX_MODEL_ID_LENGTH
    ? message.model
    : "unknown";
  const usage = message.usage;
  const input = countOrZero(usage.input_tokens);
  const output = countOrZero(usage.output_tokens);
  const cacheRead = countOrZero(usage.cache_read_input_tokens);
  const cacheWrite = countOrZero(usage.cache_creation_input_tokens);
  return {
    message_id: messageId,
    timestamp: parsed.timestamp,
    model,
    sidechain: parsed.isSidechain === true,
    tokens: {
      input,
      output,
      cache_read: cacheRead,
      cache_write: cacheWrite,
      total_tokens: input + output,
      total_with_cache: input + output + cacheRead + cacheWrite,
    },
  };
}

function isUsableRecord(record) {
  return isPlainObject(record)
    && typeof record.message_id === "string"
    && record.message_id.length > 0
    && typeof record.timestamp === "string"
    && typeof record.model === "string"
    && isPlainObject(record.tokens);
}

function addTokens(target, tokens) {
  target.input += countOrZero(tokens.input);
  target.output += countOrZero(tokens.output);
  target.cache_read += countOrZero(tokens.cache_read);
  target.cache_write += countOrZero(tokens.cache_write);
  target.total_tokens += countOrZero(tokens.total_tokens);
  target.total_with_cache += countOrZero(tokens.total_with_cache);
}

function addToWindow(window, record) {
  window.turns += 1;
  if (record.sidechain) window.sidechain_turns += 1;
  addTokens(window.tokens, record.tokens);
}

export function kstDayStartMs(referenceMs) {
  return Math.floor((referenceMs + KST_OFFSET_MS) / DAY_MS) * DAY_MS - KST_OFFSET_MS;
}

export function buildClaudeUsageSnapshot(records, { referenceMs } = {}) {
  const reference = Number.isFinite(referenceMs) ? referenceMs : Date.now();
  const deduped = new Map();
  if (Array.isArray(records)) {
    for (const record of records) {
      if (!isUsableRecord(record)) continue;
      if (!deduped.has(record.message_id)) deduped.set(record.message_id, record);
    }
  }
  const fiveHourStart = reference - FIVE_HOURS_MS;
  const rollingStart = reference - SEVEN_DAYS_MS;
  const dayStart = kstDayStartMs(reference);
  const dayEnd = dayStart + DAY_MS;
  const fiveHour = emptyWindow();
  const calendarDay = emptyWindow();
  const rolling7d = emptyWindow();
  const modelTotals = new Map();
  let lastActivityMs = null;
  for (const record of deduped.values()) {
    const ms = Date.parse(record.timestamp);
    if (Number.isNaN(ms)) continue;
    if (lastActivityMs === null || ms > lastActivityMs) lastActivityMs = ms;
    if (ms > fiveHourStart && ms <= reference) addToWindow(fiveHour, record);
    if (ms >= dayStart && ms < dayEnd) addToWindow(calendarDay, record);
    if (ms > rollingStart && ms <= reference) {
      addToWindow(rolling7d, record);
      let modelEntry = modelTotals.get(record.model);
      if (modelEntry === undefined) {
        modelEntry = { model: record.model, turns: 0, tokens: emptyTokens() };
        modelTotals.set(record.model, modelEntry);
      }
      modelEntry.turns += 1;
      addTokens(modelEntry.tokens, record.tokens);
    }
  }
  const models7d = [...modelTotals.values()]
    .sort((a, b) => b.tokens.total_tokens - a.tokens.total_tokens || a.model.localeCompare(b.model))
    .slice(0, MAX_MODELS_LISTED);
  return {
    schema_version: CLAUDE_USAGE_SCHEMA_VERSION,
    last_activity_at: lastActivityMs === null ? null : new Date(lastActivityMs).toISOString(),
    five_hour: fiveHour,
    calendar_day: calendarDay,
    rolling_7d: rolling7d,
    models_7d: models7d,
  };
}

function scanForForbiddenKeys(value, depth) {
  if (depth > MAX_PRIVACY_SCAN_DEPTH) return true;
  if (Array.isArray(value)) {
    return value.some((entry) => scanForForbiddenKeys(entry, depth + 1));
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (CLAUDE_USAGE_FORBIDDEN_KEY_PATTERN.test(key)) return true;
      if (scanForForbiddenKeys(child, depth + 1)) return true;
    }
  }
  return false;
}

export function guardClaudeUsagePrivacy(snapshot) {
  if (!isPlainObject(snapshot)) return null;
  return scanForForbiddenKeys(snapshot, 0) ? null : snapshot;
}

function isValidTokens(tokens) {
  return hasOnlyKeys(tokens, TOKENS_ALLOWED_KEYS)
    && TOKEN_KEYS.every((key) => isCount(tokens[key]));
}

function isValidWindow(window) {
  return hasOnlyKeys(window, WINDOW_ALLOWED_KEYS)
    && isCount(window.turns)
    && isCount(window.sidechain_turns)
    && window.sidechain_turns <= window.turns
    && isValidTokens(window.tokens);
}

function isValidModelEntry(entry) {
  return hasOnlyKeys(entry, MODEL_ALLOWED_KEYS)
    && typeof entry.model === "string"
    && entry.model.length > 0
    && entry.model.length <= MAX_MODEL_ID_LENGTH
    && isCount(entry.turns)
    && isValidTokens(entry.tokens);
}

function isValidPlan(plan) {
  if (plan === null || plan === undefined) return true;
  return hasOnlyKeys(plan, PLAN_ALLOWED_KEYS)
    && (plan.user_rate_limit_tier === null || typeof plan.user_rate_limit_tier === "string")
    && (plan.organization_rate_limit_tier === null || typeof plan.organization_rate_limit_tier === "string");
}

function isValidSnapshot(snapshot) {
  return hasOnlyKeys(snapshot, SNAPSHOT_ALLOWED_KEYS)
    && snapshot.schema_version === CLAUDE_USAGE_SCHEMA_VERSION
    && (snapshot.observed_at === undefined
      || (typeof snapshot.observed_at === "string" && !Number.isNaN(Date.parse(snapshot.observed_at))))
    && (snapshot.last_activity_at === null
      || (typeof snapshot.last_activity_at === "string" && !Number.isNaN(Date.parse(snapshot.last_activity_at))))
    && isValidWindow(snapshot.five_hour)
    && isValidWindow(snapshot.calendar_day)
    && isValidWindow(snapshot.rolling_7d)
    && Array.isArray(snapshot.models_7d)
    && snapshot.models_7d.length <= MAX_MODELS_LISTED
    && snapshot.models_7d.every((entry) => isValidModelEntry(entry))
    && isValidPlan(snapshot.plan);
}

function windowView(key, label, window) {
  return {
    key,
    label,
    turns: window.turns,
    sidechainTurns: window.sidechain_turns,
    tokens: {
      input: window.tokens.input,
      output: window.tokens.output,
      cacheRead: window.tokens.cache_read,
      cacheWrite: window.tokens.cache_write,
      totalTokens: window.tokens.total_tokens,
      totalWithCache: window.tokens.total_with_cache,
    },
  };
}

const UNAVAILABLE_VIEW_MODEL = Object.freeze({
  available: false,
  observedAt: null,
  lastActivityAt: null,
  plan: null,
  windows: [],
  models: [],
});

export function buildClaudeUsageViewModel(snapshot) {
  if (guardClaudeUsagePrivacy(snapshot) === null || !isValidSnapshot(snapshot)) {
    return { ...UNAVAILABLE_VIEW_MODEL };
  }
  const plan = isPlainObject(snapshot.plan)
    ? {
      userTier: snapshot.plan.user_rate_limit_tier,
      organizationTier: snapshot.plan.organization_rate_limit_tier,
    }
    : null;
  return {
    available: true,
    observedAt: snapshot.observed_at ?? null,
    lastActivityAt: snapshot.last_activity_at,
    plan,
    windows: [
      windowView("five_hour", "5H", snapshot.five_hour),
      windowView("calendar_day", "TODAY(KST)", snapshot.calendar_day),
      windowView("rolling_7d", "7D", snapshot.rolling_7d),
    ],
    models: snapshot.models_7d.map((entry) => ({
      model: entry.model,
      turns: entry.turns,
      totalTokens: entry.tokens.total_tokens,
      totalWithCache: entry.tokens.total_with_cache,
    })),
  };
}
