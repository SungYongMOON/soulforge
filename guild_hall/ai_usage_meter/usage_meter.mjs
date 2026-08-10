import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import path from "node:path";

export const USAGE_EVENT_SCHEMA = "soulforge.ai_usage_event.v1";
export const USAGE_CONFIG_SCHEMA = "soulforge.ai_usage_meter_config.v1";
export const RATE_CARD_SCHEMA = "soulforge.ai_usage_rate_card.v1";
export const STOP_DELIVERY_OUTCOMES = Object.freeze([
  "observed", "pending_jsonl", "unsupported", "failed",
]);

const PHASE_B_HEALTH_STATES = new Set(["available", "unknown", "hold"]);

function phaseBHealthLane(input, lane) {
  const value = input && typeof input === "object" ? input : {};
  const state = PHASE_B_HEALTH_STATES.has(value.state) ? value.state : "unknown";
  const reason = typeof value.reason === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/u.test(value.reason)
    ? value.reason
    : (state === "unknown" ? `${lane}_not_observed` : null);
  const sourceObservedAt = value.source_observed_at === null || value.source_observed_at === undefined
    ? null
    : new Date(value.source_observed_at).toISOString();
  return { state, reason, source_observed_at: sourceObservedAt };
}

export function buildUsageMeterHealthReport({
  generatedAt,
  hookDelivery = null,
  tokenProjection = null,
} = {}) {
  const generated_at = new Date(generatedAt ?? Date.now()).toISOString();
  return {
    generated_at,
    hook_delivery: phaseBHealthLane(hookDelivery, "hook_delivery"),
    token_projection: phaseBHealthLane(tokenProjection, "token_projection"),
  };
}

export function buildStopDeliveryReceipt({ outcome, observedAt = null, reason = null } = {}) {
  if (!STOP_DELIVERY_OUTCOMES.includes(outcome)) fail("stop_delivery_outcome_invalid");
  return {
    outcome,
    observed_at: observedAt === null ? null : new Date(observedAt).toISOString(),
    reason: typeof reason === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/u.test(reason) ? reason : null,
    persisted: false,
  };
}

export function reportHookManifestDrift({ expectedDigest, observedDigest, expectedCount, observedCount } = {}) {
  const digest = (value) => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value) ? value : null;
  const count = (value) => Number.isSafeInteger(value) && value >= 0 ? value : null;
  const expected_digest = digest(expectedDigest);
  const observed_digest = digest(observedDigest);
  const expected_count = count(expectedCount);
  const observed_count = count(observedCount);
  const comparable = expected_digest !== null && observed_digest !== null
    && expected_count !== null && observed_count !== null;
  return {
    status: comparable
      ? (expected_digest === observed_digest && expected_count === observed_count ? "match" : "drift")
      : "unknown",
    expected_digest,
    observed_digest,
    expected_count,
    observed_count,
  };
}
// Every allowed source kind is pinned to exactly one token-confidence label so a
// provider can never claim a stronger measurement than its collector supports.
export const USAGE_EVENT_TOKEN_CONFIDENCE_BY_SOURCE_KIND = Object.freeze({
  codex_session_jsonl: "exact_cumulative_delta",
  claude_session_jsonl: "exact_per_message",
  antigravity_conversation_db: "request_count_only",
});

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/u;
const TARGET_EVENT_MARKERS = [
  '"type":"task_started"',
  '"type":"task_complete"',
  '"type":"token_count"',
  '"type":"sub_agent_activity"',
];
const ZERO_USAGE = Object.freeze({
  input_tokens: 0,
  cached_input_tokens: 0,
  cache_write_input_tokens: 0,
  output_tokens: 0,
  reasoning_output_tokens: 0,
  total_tokens: 0,
});

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function asInteger(value, field, { minimum = 0 } = {}) {
  const number = Number(value ?? 0);
  if (!Number.isSafeInteger(number) || number < minimum) fail(`${field}_invalid`);
  return number;
}

function boundedString(value, field, { max = 512, allowNull = false } = {}) {
  if (value === null || value === undefined) {
    if (allowNull) return null;
    fail(`${field}_required`);
  }
  const text = String(value);
  if (text.length < 1 || text.length > max || /[\r\n\u0000-\u001f\u007f]/u.test(text)) {
    fail(`${field}_invalid`);
  }
  return text;
}

function safeId(value, field, fallback = null) {
  const candidate = value === null || value === undefined || value === "" ? fallback : String(value);
  if (candidate === null || !SAFE_ID.test(candidate)) fail(`${field}_invalid`);
  return candidate;
}

function isoOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  let normalized = value;
  const numeric = typeof value === "number"
    ? value
    : typeof value === "string" && /^-?\d+(?:\.\d+)?$/u.test(value.trim())
      ? Number(value)
      : null;
  if (numeric !== null && Number.isFinite(numeric)) {
    const magnitude = Math.abs(numeric);
    normalized = magnitude < 100_000_000_000
      ? numeric * 1_000
      : magnitude < 100_000_000_000_000
        ? numeric
        : magnitude < 100_000_000_000_000_000
          ? numeric / 1_000
          : numeric / 1_000_000;
  }
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function requiredIso(value, field) {
  const normalized = isoOrNull(value);
  if (!normalized) fail(`${field}_invalid`);
  return normalized;
}

function exactObject(value, field, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${field}_invalid`);
  const allowed = new Set(keys);
  if (Object.keys(value).some((key) => !allowed.has(key))) fail(`${field}_additional_property`);
  if (keys.some((key) => !Object.hasOwn(value, key))) fail(`${field}_required`);
  return value;
}

function nullableText(value, field, max = 512) {
  return value === null ? null : boundedString(value, field, { max });
}

function eventTimestamp(value, field, { allowNull = false } = {}) {
  if (value === null && allowNull) return null;
  if (typeof value !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(value)
    || !Number.isFinite(Date.parse(value))) {
    fail(`${field}_invalid`);
  }
  return value;
}

function nonnegativeNumber(value, field, { allowNull = false } = {}) {
  if (value === null && allowNull) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) fail(`${field}_invalid`);
  return value;
}

function eventInteger(value, field, { allowNull = false } = {}) {
  if (value === null && allowNull) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) fail(`${field}_invalid`);
  return value;
}

function normalizePath(value) {
  return path.resolve(String(value)).replaceAll("\\", "/").replace(/\/$/u, "");
}

function pathWithin(candidate, root) {
  const left = normalizePath(candidate);
  const right = normalizePath(root);
  const insensitive = process.platform === "win32";
  const normalizedLeft = insensitive ? left.toLowerCase() : left;
  const normalizedRight = insensitive ? right.toLowerCase() : right;
  return normalizedLeft === normalizedRight || normalizedLeft.startsWith(`${normalizedRight}/`);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort((a, b) => a.localeCompare(b, "en"))
        .map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(stableValue(value));
}

export function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function normalizeUsage(input = {}) {
  return {
    input_tokens: asInteger(input.input_tokens, "input_tokens"),
    cached_input_tokens: asInteger(input.cached_input_tokens, "cached_input_tokens"),
    cache_write_input_tokens: asInteger(
      input.cache_write_input_tokens ?? input.cache_creation_input_tokens,
      "cache_write_input_tokens",
    ),
    output_tokens: asInteger(input.output_tokens, "output_tokens"),
    reasoning_output_tokens: asInteger(input.reasoning_output_tokens, "reasoning_output_tokens"),
    total_tokens: asInteger(input.total_tokens, "total_tokens"),
  };
}

function usageSum(usage) {
  return usage.input_tokens + usage.output_tokens;
}

function usageDelta(latest, baseline) {
  const delta = {};
  for (const key of Object.keys(ZERO_USAGE)) {
    const value = latest[key] - baseline[key];
    if (value < 0) fail("usage_counter_regressed");
    delta[key] = value;
  }
  if (delta.cached_input_tokens + delta.cache_write_input_tokens > delta.input_tokens) {
    fail("input_token_partition_invalid");
  }
  if (delta.reasoning_output_tokens > delta.output_tokens) fail("reasoning_output_partition_invalid");
  return delta;
}

function safeRateLimit(input) {
  const primary = input?.primary;
  if (!primary || !Number.isFinite(Number(primary.used_percent))) return null;
  return {
    limit_id: input?.limit_id ? String(input.limit_id).slice(0, 120) : "codex",
    used_percent: Number(primary.used_percent),
    window_minutes: Number.isSafeInteger(Number(primary.window_minutes))
      ? Number(primary.window_minutes)
      : null,
    resets_at_epoch_s: Number.isSafeInteger(Number(primary.resets_at))
      ? Number(primary.resets_at)
      : null,
    plan_type: input?.plan_type ? String(input.plan_type).slice(0, 120) : null,
  };
}

function updateTurnActivity(turn, candidate) {
  if (!turn || typeof turn !== "object") return;
  const observedAt = isoOrNull(candidate);
  if (!observedAt) return;
  if (!turn.activity_observed_at || observedAt > turn.activity_observed_at) {
    turn.activity_observed_at = observedAt;
  }
}

function finalizeTurn(session, turn, latestUsage, completion = {}) {
  const usage = usageDelta(latestUsage, turn.baseline_usage);
  const completedAt = isoOrNull(completion.completed_at ?? completion.timestamp);
  return {
    thread_id: session.thread_id,
    parent_thread_id: session.parent_thread_id,
    session_started_at: session.started_at,
    cwd: session.cwd,
    originator: session.originator,
    agent_path: session.agent_path,
    agent_nickname: session.agent_nickname,
    depth: session.depth,
    source_file: session.source_file,
    turn_id: turn.turn_id,
    started_at: turn.started_at,
    // This is an exact-session metadata heartbeat only. It is not prompt,
    // reasoning, tool, or message content, and terminal turns never retain it.
    activity_observed_at: completedAt || completion.forced
      ? null
      : (turn.activity_observed_at ?? turn.started_at),
    completed_at: completedAt,
    duration_ms: completion.duration_ms === null || completion.duration_ms === undefined
      ? null
      : asInteger(completion.duration_ms, "duration_ms"),
    status: completion.forced ? "observed_at_stop" : completedAt ? "complete" : "active",
    model: turn.model,
    effort: turn.effort,
    context_window: turn.context_window,
    usage,
    model_invocation_count: turn.model_invocation_count,
    max_invocation_input_tokens: turn.max_invocation_input_tokens,
    rate_limit_snapshot: turn.rate_limit_snapshot,
  };
}

function targetLine(line) {
  const firstType = /"type":"([^"]+)"/u.exec(line)?.[1] ?? null;
  if (firstType === "session_meta" || firstType === "turn_context") return true;
  return firstType === "event_msg"
    && TARGET_EVENT_MARKERS.some((marker) => line.includes(marker));
}

export async function parseCodexSessionFile(filePath, {
  includeActive = false,
  forcedCompleteTurnIds = [],
  sourceRoot = null,
} = {}) {
  const forced = new Set(forcedCompleteTurnIds);
  const file = path.resolve(filePath);
  const sourceFile = sourceRoot && pathWithin(file, sourceRoot)
    ? path.relative(path.resolve(sourceRoot), file).replaceAll("\\", "/")
    : path.basename(file);
  const session = {
    thread_id: null,
    parent_thread_id: null,
    started_at: null,
    cwd: null,
    originator: null,
    agent_path: null,
    agent_nickname: null,
    depth: 0,
    source_file: sourceFile,
  };
  const turns = [];
  const activeTurns = new Map();
  const turnContexts = new Map();
  const childThreads = [];
  let latestUsage = { ...ZERO_USAGE };
  let lastObservedUsageSum = 0;

  const input = createReadStream(file, { encoding: "utf8" });
  const lines = createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!targetLine(line)) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      fail("session_jsonl_invalid");
    }
    const payload = row?.payload ?? {};
    if (row.type === "session_meta") {
      session.thread_id = safeId(payload.id ?? payload.session_id, "thread_id");
      session.parent_thread_id = payload.parent_thread_id
        ? safeId(payload.parent_thread_id, "parent_thread_id")
        : null;
      session.started_at = requiredIso(payload.timestamp ?? row.timestamp, "session_started_at");
      session.cwd = payload.cwd ? boundedString(payload.cwd, "cwd", { max: 1024 }) : null;
      session.originator = payload.originator ? String(payload.originator).slice(0, 120) : null;
      session.agent_path = payload.agent_path ? String(payload.agent_path).slice(0, 240) : null;
      session.agent_nickname = payload.agent_nickname ? String(payload.agent_nickname).slice(0, 120) : null;
      session.depth = asInteger(payload.source?.subagent?.thread_spawn?.depth ?? 0, "depth");
      continue;
    }
    if (row.type === "turn_context") {
      const turnId = safeId(payload.turn_id, "turn_id");
      const context = {
        model: payload.model ? String(payload.model).slice(0, 120) : null,
        effort: payload.effort ? String(payload.effort).slice(0, 120) : null,
      };
      turnContexts.set(turnId, context);
      const turn = activeTurns.get(turnId);
      if (turn) {
        turn.model = context.model;
        turn.effort = context.effort;
        updateTurnActivity(turn, row.timestamp);
      }
      continue;
    }
    if (row.type !== "event_msg") continue;
    if (payload.type === "task_started") {
      const turnId = safeId(payload.turn_id, "turn_id");
      const context = turnContexts.get(turnId) ?? { model: null, effort: null };
      const startedAt = requiredIso(payload.started_at ?? row.timestamp, "turn_started_at");
      activeTurns.set(turnId, {
        turn_id: turnId,
        started_at: startedAt,
        activity_observed_at: startedAt,
        context_window: payload.model_context_window === null || payload.model_context_window === undefined
          ? null
          : asInteger(payload.model_context_window, "context_window"),
        model: context.model,
        effort: context.effort,
        baseline_usage: { ...latestUsage },
        model_invocation_count: 0,
        max_invocation_input_tokens: 0,
        rate_limit_snapshot: null,
      });
      lastObservedUsageSum = usageSum(latestUsage);
      continue;
    }
    if (payload.type === "token_count" && payload.info?.total_token_usage) {
      latestUsage = normalizeUsage(payload.info.total_token_usage);
      const active = [...activeTurns.values()].at(-1);
      if (active) {
        updateTurnActivity(active, row.timestamp);
        const currentSum = usageSum(latestUsage);
        if (currentSum > lastObservedUsageSum) active.model_invocation_count += 1;
        lastObservedUsageSum = Math.max(lastObservedUsageSum, currentSum);
        const last = payload.info.last_token_usage;
        if (last) {
          active.max_invocation_input_tokens = Math.max(
            active.max_invocation_input_tokens,
            asInteger(last.input_tokens, "last_input_tokens"),
          );
        }
        active.rate_limit_snapshot = safeRateLimit(payload.rate_limits);
      }
      continue;
    }
    if (payload.type === "sub_agent_activity" && payload.agent_thread_id) {
      const child = safeId(payload.agent_thread_id, "agent_thread_id");
      if (!childThreads.includes(child)) childThreads.push(child);
      updateTurnActivity([...activeTurns.values()].at(-1), row.timestamp);
      continue;
    }
    if (payload.type === "task_complete") {
      const turnId = safeId(payload.turn_id, "turn_id");
      const turn = activeTurns.get(turnId);
      if (!turn) continue;
      turns.push(finalizeTurn(session, turn, latestUsage, {
        completed_at: requiredIso(payload.completed_at ?? row.timestamp, "turn_completed_at"),
        duration_ms: payload.duration_ms,
      }));
      activeTurns.delete(turnId);
    }
  }

  if (!session.thread_id) fail("session_meta_missing");
  // File mtime is metadata-only and tied to this exact session file. It is used
  // solely while the parsed turn remains active; a completed turn cannot be
  // revived by later file writes or snapshot regeneration.
  try {
    const info = await stat(file);
    if (info.isFile() && Number.isFinite(info.mtimeMs)) {
      // A session file can only supply a safe metadata heartbeat for its most
      // recently observed active turn. Do not infer activity for older,
      // concurrently-open turns from a shared file timestamp.
      updateTurnActivity([...activeTurns.values()].at(-1), info.mtimeMs);
    }
  } catch {}
  for (const turn of activeTurns.values()) {
    if (!includeActive && !forced.has(turn.turn_id)) continue;
    turns.push(finalizeTurn(session, turn, latestUsage, {
      forced: forced.has(turn.turn_id),
    }));
  }
  turns.sort((a, b) => (a.started_at ?? "").localeCompare(b.started_at ?? "", "en"));
  childThreads.sort((a, b) => a.localeCompare(b, "en"));
  return { ...session, turns, child_threads: childThreads };
}

export async function loadRateCard(filePath) {
  const parsed = JSON.parse(await readFile(filePath, "utf8"));
  if (parsed.schema_version !== RATE_CARD_SCHEMA) fail("rate_card_schema_invalid");
  if (!parsed.rate_card_id || !parsed.models || !parsed.service_tiers) fail("rate_card_invalid");
  if (!Number.isFinite(Date.parse(parsed.effective_from))
    || !Number.isFinite(Date.parse(parsed.token_pricing_effective_from))
    || !SAFE_ID.test(parsed.pricing_scope ?? "")
    || !/^https:\/\//u.test(parsed.source_url ?? "")
    || !/^https:\/\//u.test(parsed.service_tier_source_url ?? "")) {
    fail("rate_card_provenance_invalid");
  }
  const tiers = Object.entries(parsed.service_tiers);
  if (!tiers.length || tiers.some(([, multiplier]) => !Number.isFinite(Number(multiplier)) || Number(multiplier) <= 0)) {
    fail("rate_card_service_tier_invalid");
  }
  const requiredRates = ["input", "cached_input", "cache_write_input", "output"];
  const models = Object.entries(parsed.models);
  if (!models.length || models.some(([model, rates]) => (
    !SAFE_ID.test(model)
    || !rates
    || requiredRates.some((field) => !Number.isFinite(Number(rates[field])) || Number(rates[field]) < 0)
    || Object.entries(rates.service_tier_multipliers ?? {}).some(([tier, multiplier]) => (
      !Object.hasOwn(parsed.service_tiers, tier)
      || !Number.isFinite(Number(multiplier))
      || Number(multiplier) <= 0
    ))
  ))) {
    fail("rate_card_model_rate_invalid");
  }
  return parsed;
}

export function calculateCredits(usage, model, rateCard, serviceTier = "standard", observedAt = null) {
  const rates = rateCard.models?.[model];
  if (observedAt !== null && !Number.isFinite(Date.parse(observedAt))) fail("credit_observed_at_invalid");
  const beforeTokenPricing = observedAt !== null
    && Date.parse(observedAt) < Date.parse(rateCard.token_pricing_effective_from);
  const multiplier = Number(
    rates?.service_tier_multipliers?.[serviceTier] ?? rateCard.service_tiers?.[serviceTier],
  );
  if (!rates || beforeTokenPricing || !Number.isFinite(multiplier) || multiplier <= 0) {
    return {
      status: "rate_unknown",
      rate_card_id: rateCard.rate_card_id,
      service_tier: serviceTier,
      total: null,
      components: null,
    };
  }
  const uncached = usage.input_tokens - usage.cached_input_tokens - usage.cache_write_input_tokens;
  if (uncached < 0) fail("input_token_partition_invalid");
  const components = {
    uncached_input: uncached * Number(rates.input) * multiplier / 1_000_000,
    cached_input: usage.cached_input_tokens * Number(rates.cached_input) * multiplier / 1_000_000,
    cache_write_input: usage.cache_write_input_tokens * Number(rates.cache_write_input) * multiplier / 1_000_000,
    output: usage.output_tokens * Number(rates.output) * multiplier / 1_000_000,
  };
  const rounded = Object.fromEntries(
    Object.entries(components).map(([key, value]) => [key, Number(value.toFixed(9))]),
  );
  return {
    status: "calculated",
    rate_card_id: rateCard.rate_card_id,
    service_tier: serviceTier,
    total: Number(Object.values(rounded).reduce((sum, value) => sum + value, 0).toFixed(9)),
    components: rounded,
  };
}

function normalizeBindingList(input, kind) {
  if (!Array.isArray(input)) return [];
  return input.map((item, index) => {
    if (!item || typeof item !== "object") fail(`${kind}_${index}_invalid`);
    if (kind === "project_binding") {
      return {
        cwd_prefix: normalizePath(boundedString(item.cwd_prefix, `project_binding_${index}_cwd`, { max: 1024 })),
        project_id: safeId(item.project_id, `project_binding_${index}_project_id`),
        team_id: item.team_id ? safeId(item.team_id, `project_binding_${index}_team_id`) : null,
      };
    }
    return {
      thread_id: safeId(item.thread_id, `work_binding_${index}_thread_id`),
      turn_id: item.turn_id ? safeId(item.turn_id, `work_binding_${index}_turn_id`) : null,
      work_id: safeId(item.work_id, `work_binding_${index}_work_id`),
      project_id: item.project_id ? safeId(item.project_id, `work_binding_${index}_project_id`) : null,
      team_id: item.team_id ? safeId(item.team_id, `work_binding_${index}_team_id`) : null,
      role: item.role ? boundedString(item.role, `work_binding_${index}_role`, { max: 120 }) : null,
    };
  });
}

export function normalizeConfig(input = {}) {
  if (input.schema_version && input.schema_version !== USAGE_CONFIG_SCHEMA) fail("config_schema_invalid");
  const serviceTier = input.service_tier ?? "standard";
  return {
    schema_version: USAGE_CONFIG_SCHEMA,
    organization_id: safeId(input.organization_id, "organization_id", "unassigned"),
    default_team_id: safeId(input.default_team_id, "default_team_id", "unassigned"),
    default_project_id: safeId(input.default_project_id, "default_project_id", "unassigned"),
    node_id: safeId(input.node_id, "node_id", "local-node"),
    service_tier: safeId(serviceTier, "service_tier"),
    project_bindings: normalizeBindingList(input.project_bindings, "project_binding"),
    work_bindings: normalizeBindingList(input.work_bindings, "work_binding"),
  };
}

export async function loadConfig(filePath) {
  if (!filePath) return normalizeConfig();
  return normalizeConfig(JSON.parse(await readFile(filePath, "utf8")));
}

function projectBinding(cwd, config) {
  if (!cwd) return null;
  const matches = config.project_bindings
    .filter((item) => pathWithin(cwd, item.cwd_prefix))
    .sort((a, b) => b.cwd_prefix.length - a.cwd_prefix.length);
  return matches[0] ?? null;
}

function exactWorkBinding(threadId, turnId, config) {
  return config.work_bindings.find((item) => (
    item.thread_id === threadId && item.turn_id === turnId
  )) ?? config.work_bindings.find((item) => (
    item.thread_id === threadId && item.turn_id === null
  )) ?? null;
}

function collapseLineageTurnObservations(parents) {
  const groups = new Map();
  for (const parent of parents) {
    for (const turn of parent.turns) {
      const observations = groups.get(turn.turn_id) ?? [];
      observations.push({ session: parent, turn });
      groups.set(turn.turn_id, observations);
    }
  }
  const rank = { active: 0, observed_at_stop: 1, complete: 2 };
  const dominates = (left, right) => {
    const usageFields = [
      "input_tokens", "cached_input_tokens", "cache_write_input_tokens", "output_tokens",
      "reasoning_output_tokens", "total_tokens",
    ];
    return usageFields.every((field) => Number(left.turn.usage[field] ?? 0) >= Number(right.turn.usage[field] ?? 0))
      && left.turn.model_invocation_count >= right.turn.model_invocation_count
      && left.turn.max_invocation_input_tokens >= right.turn.max_invocation_input_tokens;
  };
  const collapsed = [];
  for (const observations of groups.values()) {
    if (new Set(observations.map(({ turn }) => turn.started_at)).size !== 1) continue;
    const strongestRank = Math.max(...observations.map(({ turn }) => rank[turn.status] ?? -1));
    const strongest = observations.filter(({ turn }) => (rank[turn.status] ?? -1) === strongestRank);
    if (strongestRank === rank.complete
      && new Set(strongest.map(({ turn }) => turn.completed_at)).size !== 1) continue;
    const representative = strongest.find((candidate) => (
      observations.every((observation) => dominates(candidate, observation))
    ));
    if (representative) collapsed.push(representative);
  }
  return collapsed;
}

function parentTurnForSession(session, sessionsById) {
  if (!session.parent_thread_id) return null;
  const parents = sessionsById.get(session.parent_thread_id) ?? [];
  const at = session.started_at ?? "";
  const bounded = collapseLineageTurnObservations(parents)
    .filter(({ turn }) => turn.started_at <= at && (!turn.completed_at || at <= turn.completed_at))
    .sort((left, right) => (
      left.turn.started_at.localeCompare(right.turn.started_at, "en")
      || usageSum(left.turn.usage) - usageSum(right.turn.usage)
    ));
  return bounded.at(-1) ?? null;
}

function lineageFor(session, turn, sessionsById) {
  let currentSession = session;
  let currentTurn = turn;
  const visited = new Set();
  while (currentSession.parent_thread_id && !visited.has(currentSession.thread_id)) {
    visited.add(currentSession.thread_id);
    const parent = parentTurnForSession(currentSession, sessionsById);
    if (!parent) break;
    currentSession = parent.session;
    currentTurn = parent.turn;
  }
  return {
    root_thread_id: currentSession.thread_id,
    root_turn_id: currentTurn.turn_id,
  };
}

function eventId(threadId, turnId) {
  return `aue_${createHash("sha256").update(`codex:${threadId}:${turnId}`).digest("hex")}`;
}

export function validateUsageEvent(event) {
  exactObject(event, "usage_event", [
    "schema_version", "event_id", "organization_id", "team_id", "project_id", "work_id",
    "thread_id", "turn_id", "parent_thread_id", "root_thread_id", "root_turn_id", "source",
    "actor", "model", "usage", "credits", "time", "rate_limit_snapshot", "measurement", "privacy",
  ]);
  if (event.schema_version !== USAGE_EVENT_SCHEMA) fail("usage_event_schema_invalid");
  for (const field of [
    "event_id", "organization_id", "team_id", "project_id", "work_id", "thread_id", "turn_id",
    "root_thread_id", "root_turn_id",
  ]) {
    safeId(event[field], field);
  }
  if (event.parent_thread_id !== null) safeId(event.parent_thread_id, "parent_thread_id");

  exactObject(event.source, "usage_event_source", ["kind", "source_ref", "originator"]);
  if (!Object.hasOwn(USAGE_EVENT_TOKEN_CONFIDENCE_BY_SOURCE_KIND, event.source.kind)) {
    fail("usage_event_source_kind_invalid");
  }
  boundedString(event.source.source_ref, "usage_event_source_ref");
  nullableText(event.source.originator, "usage_event_source_originator");

  exactObject(event.actor, "usage_event_actor", ["node_id", "agent_id", "agent_depth", "role"]);
  safeId(event.actor.node_id, "usage_event_actor_node_id");
  boundedString(event.actor.agent_id, "usage_event_actor_agent_id");
  eventInteger(event.actor.agent_depth, "usage_event_actor_depth");
  nullableText(event.actor.role, "usage_event_actor_role", 120);

  exactObject(event.model, "usage_event_model", ["id", "reasoning_effort", "service_tier", "context_window"]);
  boundedString(event.model.id, "usage_event_model_id");
  nullableText(event.model.reasoning_effort, "usage_event_reasoning_effort", 120);
  safeId(event.model.service_tier, "usage_event_service_tier");
  eventInteger(event.model.context_window, "usage_event_context_window", { allowNull: true });

  const usageFields = [
    "input_tokens", "cached_input_tokens", "cache_write_input_tokens", "output_tokens",
    "reasoning_output_tokens", "total_tokens", "uncached_input_tokens", "model_invocation_count",
    "max_invocation_input_tokens",
  ];
  exactObject(event.usage, "usage_event_usage", usageFields);
  for (const field of usageFields) eventInteger(event.usage[field], `usage_event_${field}`);
  if (event.usage.cached_input_tokens + event.usage.cache_write_input_tokens > event.usage.input_tokens) {
    fail("usage_event_input_partition_invalid");
  }
  if (event.usage.reasoning_output_tokens > event.usage.output_tokens) {
    fail("usage_event_output_partition_invalid");
  }
  if (event.usage.total_tokens !== event.usage.input_tokens + event.usage.output_tokens) {
    fail("usage_event_total_tokens_invalid");
  }
  if (event.usage.uncached_input_tokens !== event.usage.input_tokens
    - event.usage.cached_input_tokens
    - event.usage.cache_write_input_tokens) {
    fail("usage_event_uncached_input_invalid");
  }

  exactObject(event.credits, "usage_event_credits", ["status", "rate_card_id", "service_tier", "total", "components"]);
  if (!new Set(["calculated", "rate_unknown"]).has(event.credits.status)) fail("usage_event_credit_status_invalid");
  boundedString(event.credits.rate_card_id, "usage_event_rate_card_id");
  safeId(event.credits.service_tier, "usage_event_credit_service_tier");
  nonnegativeNumber(event.credits.total, "usage_event_credit_total", { allowNull: true });
  if (event.credits.components !== null) {
    exactObject(event.credits.components, "usage_event_credit_components", [
      "uncached_input", "cached_input", "cache_write_input", "output",
    ]);
    for (const field of ["uncached_input", "cached_input", "cache_write_input", "output"]) {
      nonnegativeNumber(event.credits.components[field], `usage_event_credit_${field}`);
    }
  }
  if (event.credits.status === "calculated" && (event.credits.total === null || event.credits.components === null)) {
    fail("usage_event_calculated_credit_invalid");
  }
  if (event.credits.status === "rate_unknown" && (event.credits.total !== null || event.credits.components !== null)) {
    fail("usage_event_unknown_credit_invalid");
  }
  if (event.credits.service_tier !== event.model.service_tier) fail("usage_event_credit_service_tier_mismatch");
  if (event.credits.components !== null) {
    const componentTotal = Number(Object.values(event.credits.components)
      .reduce((sum, value) => sum + value, 0).toFixed(9));
    if (event.credits.total !== componentTotal) fail("usage_event_credit_total_mismatch");
  }

  exactObject(event.time, "usage_event_time", ["started_at", "completed_at", "duration_ms"]);
  eventTimestamp(event.time.started_at, "usage_event_started_at");
  eventTimestamp(event.time.completed_at, "usage_event_completed_at", { allowNull: true });
  eventInteger(event.time.duration_ms, "usage_event_duration_ms", { allowNull: true });
  if (event.time.completed_at !== null && Date.parse(event.time.completed_at) < Date.parse(event.time.started_at)) {
    fail("usage_event_completion_time_invalid");
  }

  if (event.rate_limit_snapshot !== null) {
    exactObject(event.rate_limit_snapshot, "usage_event_rate_limit_snapshot", [
      "limit_id", "used_percent", "window_minutes", "resets_at_epoch_s", "plan_type",
    ]);
    boundedString(event.rate_limit_snapshot.limit_id, "usage_event_rate_limit_id", { max: 120 });
    nonnegativeNumber(event.rate_limit_snapshot.used_percent, "usage_event_rate_limit_used_percent");
    eventInteger(event.rate_limit_snapshot.window_minutes, "usage_event_rate_limit_window_minutes", { allowNull: true });
    eventInteger(event.rate_limit_snapshot.resets_at_epoch_s, "usage_event_rate_limit_resets_at", { allowNull: true });
    nullableText(event.rate_limit_snapshot.plan_type, "usage_event_rate_limit_plan_type", 120);
  }

  exactObject(event.measurement, "usage_event_measurement", [
    "status", "token_confidence", "attribution_confidence",
  ]);
  if (!new Set(["complete", "active", "observed_at_stop"]).has(event.measurement.status)) {
    fail("usage_event_measurement_status_invalid");
  }
  if (event.measurement.token_confidence !== USAGE_EVENT_TOKEN_CONFIDENCE_BY_SOURCE_KIND[event.source.kind]) {
    fail("usage_event_token_confidence_invalid");
  }
  if (!new Set(["explicit_binding", "derived_lineage"]).has(event.measurement.attribution_confidence)) {
    fail("usage_event_attribution_confidence_invalid");
  }
  if (event.measurement.status === "complete" && event.time.completed_at === null) {
    fail("usage_event_completion_missing");
  }

  exactObject(event.privacy, "usage_event_privacy", [
    "metadata_only", "prompt_captured", "reasoning_captured", "tool_payload_captured",
  ]);
  if (event.privacy.metadata_only !== true
    || event.privacy.prompt_captured !== false
    || event.privacy.reasoning_captured !== false
    || event.privacy.tool_payload_captured !== false) {
    fail("usage_event_privacy_boundary_invalid");
  }
  return event;
}

function usageEventsFromSessions(sessions, normalizedConfig, rateCard) {
  const sessionsById = new Map();
  for (const session of sessions) {
    const observations = sessionsById.get(session.thread_id) ?? [];
    observations.push(session);
    sessionsById.set(session.thread_id, observations);
  }
  const events = [];
  for (const session of sessions) {
    for (const turn of session.turns) {
      const lineage = lineageFor(session, turn, sessionsById);
      const directBinding = exactWorkBinding(session.thread_id, turn.turn_id, normalizedConfig);
      const rootBinding = exactWorkBinding(lineage.root_thread_id, lineage.root_turn_id, normalizedConfig);
      const workBinding = directBinding ?? rootBinding;
      const project = projectBinding(session.cwd, normalizedConfig);
      const projectId = workBinding?.project_id ?? project?.project_id ?? normalizedConfig.default_project_id;
      const teamId = workBinding?.team_id ?? project?.team_id ?? normalizedConfig.default_team_id;
      const workId = workBinding?.work_id ?? `codex.${lineage.root_turn_id}`;
      const model = turn.model ?? "unknown";
      const credits = calculateCredits(
        turn.usage,
        model,
        rateCard,
        normalizedConfig.service_tier,
        turn.started_at,
      );
      const event = {
        schema_version: USAGE_EVENT_SCHEMA,
        event_id: eventId(session.thread_id, turn.turn_id),
        organization_id: normalizedConfig.organization_id,
        team_id: teamId,
        project_id: projectId,
        work_id: workId,
        thread_id: session.thread_id,
        turn_id: turn.turn_id,
        parent_thread_id: session.parent_thread_id,
        root_thread_id: lineage.root_thread_id,
        root_turn_id: lineage.root_turn_id,
        source: {
          kind: "codex_session_jsonl",
          source_ref: turn.source_file,
          originator: turn.originator,
        },
        actor: {
          node_id: normalizedConfig.node_id,
          agent_id: turn.agent_path ?? turn.agent_nickname ?? "root",
          agent_depth: turn.depth,
          role: workBinding?.role ?? null,
        },
        model: {
          id: model,
          reasoning_effort: turn.effort,
          service_tier: normalizedConfig.service_tier,
          context_window: turn.context_window,
        },
        usage: {
          ...turn.usage,
          uncached_input_tokens: turn.usage.input_tokens
            - turn.usage.cached_input_tokens
            - turn.usage.cache_write_input_tokens,
          model_invocation_count: turn.model_invocation_count,
          max_invocation_input_tokens: turn.max_invocation_input_tokens,
        },
        credits,
        time: {
          started_at: turn.started_at,
          completed_at: turn.completed_at,
          duration_ms: turn.duration_ms,
        },
        rate_limit_snapshot: turn.rate_limit_snapshot,
        measurement: {
          status: turn.status,
          token_confidence: "exact_cumulative_delta",
          attribution_confidence: workBinding ? "explicit_binding" : "derived_lineage",
        },
        privacy: {
          metadata_only: true,
          prompt_captured: false,
          reasoning_captured: false,
          tool_payload_captured: false,
        },
      };
      events.push(validateUsageEvent(event));
    }
  }
  return events.sort((a, b) => (
    (a.time.started_at ?? "").localeCompare(b.time.started_at ?? "", "en")
    || a.event_id.localeCompare(b.event_id, "en")
  ));
}

function mergeUsageEventObservations(existing, next, rateCard) {
  if (!rateCard) return null;
  const counterFields = [
    "input_tokens", "cached_input_tokens", "cache_write_input_tokens", "output_tokens",
    "reasoning_output_tokens", "total_tokens", "model_invocation_count", "max_invocation_input_tokens",
  ];
  const dominates = (left, right) => counterFields.every((field) => (
    Number(left.usage[field] ?? 0) >= Number(right.usage[field] ?? 0)
  ));
  const existingDominates = dominates(existing, next);
  const nextDominates = dominates(next, existing);
  if (!existingDominates && !nextDominates) return null;
  const rank = { active: 0, observed_at_stop: 1, complete: 2 };
  let base = existing;
  let other = next;
  if (nextDominates && (!existingDominates
    || (rank[next.measurement.status] ?? -1) > (rank[existing.measurement.status] ?? -1))) {
    base = next;
    other = existing;
  }
  if ((rank[base.measurement.status] ?? -1) < (rank[other.measurement.status] ?? -1)) return null;
  if (base.model.service_tier !== other.model.service_tier
    || base.source.kind !== other.source.kind) return null;
  const chooseEnriched = (left, right, missing) => {
    const leftMissing = missing(left);
    const rightMissing = missing(right);
    if (!leftMissing && !rightMissing && left !== right) return undefined;
    return leftMissing && !rightMissing ? right : left;
  };
  const modelId = chooseEnriched(base.model.id, other.model.id, (value) => value === "unknown");
  const effort = chooseEnriched(base.model.reasoning_effort, other.model.reasoning_effort, (value) => value === null);
  const contextWindow = chooseEnriched(base.model.context_window, other.model.context_window, (value) => value === null);
  const originator = chooseEnriched(base.source.originator, other.source.originator, (value) => value === null);
  if (modelId === undefined || effort === undefined || contextWindow === undefined || originator === undefined) {
    return null;
  }
  const candidate = structuredClone(base);
  const modelSource = base.model.id === "unknown" && other.model.id !== "unknown" ? other : base;
  candidate.source = { ...modelSource.source, originator };
  candidate.model = { ...base.model, id: modelId, reasoning_effort: effort, context_window: contextWindow };
  candidate.credits = calculateCredits(
    candidate.usage,
    candidate.model.id,
    rateCard,
    candidate.model.service_tier,
    candidate.time.started_at,
  );
  validateUsageEvent(candidate);
  return usageEventUpgradeAllowed(existing, candidate, { allowSourceRefChange: true })
    && usageEventUpgradeAllowed(next, candidate, { allowSourceRefChange: true })
    ? candidate
    : null;
}

function collapseUsageEventObservations(events, { rateCard = null } = {}) {
  const current = new Map();
  let duplicateCount = 0;
  for (const event of events) {
    const existing = current.get(event.event_id);
    if (!existing) {
      current.set(event.event_id, event);
      continue;
    }
    duplicateCount += 1;
    if (canonicalJson(existing) === canonicalJson(event)) continue;
    const merged = mergeUsageEventObservations(existing, event, rateCard);
    if (merged) {
      current.set(event.event_id, merged);
      continue;
    }
    const lineageMerged = mergeAncestorPreservingSelfRootUpgrade(existing, event)
      ?? mergeAncestorPreservingSelfRootUpgrade(event, existing);
    if (lineageMerged) {
      current.set(event.event_id, lineageMerged);
      continue;
    }
    if (usageEventUpgradeAllowed(existing, event, { allowSourceRefChange: true })) {
      current.set(event.event_id, event);
      continue;
    }
    if (usageEventUpgradeAllowed(event, existing, { allowSourceRefChange: true })) continue;
    fail("usage_event_duplicate_conflict");
  }
  return {
    events: [...current.values()].sort((a, b) => (
      (a.time.started_at ?? "").localeCompare(b.time.started_at ?? "", "en")
      || a.event_id.localeCompare(b.event_id, "en")
    )),
    duplicate_count: duplicateCount,
  };
}

export async function collectUsageEvents({
  sessionFiles,
  config,
  rateCard,
  includeActive = false,
  forcedComplete = {},
  sourceRoot = null,
  continueOnError = false,
}) {
  const normalizedConfig = normalizeConfig(config);
  const sessions = [];
  const issues = [];
  const effectiveSourceRoot = sourceRoot ?? forcedComplete.sourceRoot ?? null;
  for (const filePath of [...new Set(sessionFiles.map((item) => path.resolve(item)))].sort()) {
    try {
      sessions.push(await parseCodexSessionFile(filePath, {
        includeActive,
        forcedCompleteTurnIds: forcedComplete[filePath] ?? forcedComplete[path.resolve(filePath)] ?? [],
        sourceRoot: effectiveSourceRoot,
      }));
    } catch (error) {
      if (!continueOnError) throw error;
      issues.push({
        source_ref: effectiveSourceRoot && pathWithin(filePath, effectiveSourceRoot)
          ? path.relative(path.resolve(effectiveSourceRoot), filePath).replaceAll("\\", "/")
          : path.basename(filePath),
        code: String(error?.code || error?.message || "session_parse_failed").slice(0, 120),
      });
    }
  }
  const observedEvents = usageEventsFromSessions(sessions, normalizedConfig, rateCard);
  const collapsed = collapseUsageEventObservations(observedEvents, { rateCard });
  return {
    events: collapsed.events,
    issues: issues.sort((a, b) => a.source_ref.localeCompare(b.source_ref, "en")),
    parsed_session_count: sessions.length,
    observed_event_count: observedEvents.length,
    duplicate_event_observation_count: collapsed.duplicate_count,
  };
}

export async function buildUsageEvents(options) {
  return (await collectUsageEvents(options)).events;
}

async function walk(root, predicate, output = []) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return output;
    throw error;
  }
  entries.sort((a, b) => a.name.localeCompare(b.name, "en"));
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) await walk(full, predicate, output);
    else if (entry.isFile() && predicate(full)) output.push(full);
  }
  return output;
}

export async function findCodexSessionFiles(sessionsRoot) {
  return walk(path.resolve(sessionsRoot), (file) => (
    path.basename(file).startsWith("rollout-") && file.endsWith(".jsonl")
  ));
}

export async function findSessionFileById(sessionsRoot, sessionId) {
  return (await findSessionFilesById(sessionsRoot, sessionId))[0] ?? null;
}

export async function findSessionFilesById(sessionsRoot, sessionId) {
  const suffix = `-${safeId(sessionId, "session_id")}.jsonl`;
  return walk(path.resolve(sessionsRoot), (file) => file.endsWith(suffix));
}

async function writeJsonAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${randomBytes(6).toString("hex")}`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await rename(temporary, filePath);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== "ESRCH";
  }
}

async function tryAcquireLedgerLock(lockPath) {
  const owner = {
    pid: process.pid,
    started_at: new Date().toISOString(),
    token: randomBytes(12).toString("hex"),
  };
  try {
    const handle = await open(lockPath, "wx");
    await handle.writeFile(`${JSON.stringify(owner)}\n`, "utf8");
    return { handle, owner, stalePath: null };
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  let existing = null;
  try {
    existing = JSON.parse(await readFile(lockPath, "utf8"));
  } catch {
    existing = null;
  }
  const age = Date.now() - Date.parse(existing?.started_at ?? "");
  if (Number.isSafeInteger(existing?.pid) && processAlive(existing.pid) && Number.isFinite(age) && age <= 900_000) {
    return null;
  }
  const stalePath = `${lockPath}.stale-${owner.token}`;
  try {
    await rename(lockPath, stalePath);
    const handle = await open(lockPath, "wx");
    await handle.writeFile(`${JSON.stringify(owner)}\n`, "utf8");
    return { handle, owner, stalePath };
  } catch (error) {
    await rename(stalePath, lockPath).catch(() => {});
    if (error?.code === "EEXIST" || error?.code === "ENOENT" || error?.code === "EPERM") return null;
    throw error;
  }
}

async function withLedgerLock(root, callback, onBusy = null) {
  await mkdir(root, { recursive: true });
  const lockPath = path.join(root, "ledger.lock");
  let lock = null;
  for (let attempt = 0; attempt < 40 && !lock; attempt += 1) {
    lock = await tryAcquireLedgerLock(lockPath);
    if (!lock) await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (!lock) {
    if (onBusy) return onBusy();
    fail("usage_ledger_busy");
  }
  try {
    return await callback();
  } finally {
    await lock.handle.close().catch(() => {});
    try {
      const current = JSON.parse(await readFile(lockPath, "utf8"));
      if (current?.token === lock.owner.token) await rm(lockPath, { force: true });
    } catch {
      // A missing lock is already released; another owner must not be removed.
    }
    if (lock.stalePath) await rm(lock.stalePath, { force: true }).catch(() => {});
  }
}

function selfRootToAncestorUpgrade(existing, next) {
  return existing.parent_thread_id !== null
    && existing.root_thread_id === existing.thread_id
    && existing.root_turn_id === existing.turn_id
    && (next.root_thread_id !== existing.root_thread_id || next.root_turn_id !== existing.root_turn_id);
}

function usageEventUpgradeAllowed(existing, next, { allowSourceRefChange = false } = {}) {
  const identityFields = [
    "schema_version", "event_id", "organization_id", "thread_id", "turn_id", "parent_thread_id",
  ];
  if (identityFields.some((field) => existing[field] !== next[field])) return false;
  const lineageUnchanged = existing.root_thread_id === next.root_thread_id
    && existing.root_turn_id === next.root_turn_id;
  const lineageEnriched = selfRootToAncestorUpgrade(existing, next);
  if (!lineageUnchanged && !lineageEnriched) return false;
  const modelMetadataEnriched = (existing.model.id === "unknown" && next.model.id !== "unknown")
    || (existing.model.reasoning_effort === null && next.model.reasoning_effort !== null)
    || (existing.model.context_window === null && next.model.context_window !== null);
  const usageFields = [
    "input_tokens",
    "cached_input_tokens",
    "cache_write_input_tokens",
    "output_tokens",
    "reasoning_output_tokens",
    "total_tokens",
    "model_invocation_count",
    "max_invocation_input_tokens",
  ];
  if (usageFields.some((field) => Number(next.usage[field] ?? 0) < Number(existing.usage[field] ?? 0))) {
    return false;
  }
  const usageAdvanced = usageFields.some((field) => (
    Number(next.usage[field] ?? 0) > Number(existing.usage[field] ?? 0)
  ));
  const rank = { active: 0, observed_at_stop: 1, complete: 2 };
  const existingStatusRank = rank[existing.measurement.status] ?? -1;
  const nextStatusRank = rank[next.measurement.status] ?? -1;
  if (nextStatusRank < existingStatusRank) return false;
  const statusAdvanced = nextStatusRank > existingStatusRank;
  const sourceUpgradeAllowed = existing.source.kind === next.source.kind
    && (allowSourceRefChange
      || existing.source.source_ref === next.source.source_ref
      || modelMetadataEnriched
      || usageAdvanced
      || statusAdvanced)
    && (existing.source.originator === next.source.originator
      || (existing.source.originator === null && next.source.originator !== null));
  const modelUpgradeAllowed = existing.model.service_tier === next.model.service_tier
    && (existing.model.id === next.model.id
      || (existing.model.id === "unknown" && next.model.id !== "unknown"))
    && (existing.model.reasoning_effort === next.model.reasoning_effort
      || (existing.model.reasoning_effort === null && next.model.reasoning_effort !== null))
    && (existing.model.context_window === next.model.context_window
      || (existing.model.context_window === null && next.model.context_window !== null));
  if (!sourceUpgradeAllowed
    || !modelUpgradeAllowed
    || canonicalJson(existing.privacy) !== canonicalJson(next.privacy)
    || existing.time.started_at !== next.time.started_at
    || existing.measurement.token_confidence !== next.measurement.token_confidence) {
    return false;
  }
  const existingActorIdentity = { ...existing.actor, role: null };
  const nextActorIdentity = { ...next.actor, role: null };
  if (canonicalJson(existingActorIdentity) !== canonicalJson(nextActorIdentity)) return false;

  const attributionChanged = existing.team_id !== next.team_id
    || existing.project_id !== next.project_id
    || existing.work_id !== next.work_id
    || existing.actor.role !== next.actor.role
    || existing.measurement.attribution_confidence !== next.measurement.attribution_confidence;
  if (attributionChanged
    && next.measurement.attribution_confidence !== "explicit_binding"
    && !lineageEnriched) return false;

  if (existing.time.completed_at !== null && existing.time.completed_at !== next.time.completed_at) return false;
  if (existing.time.duration_ms !== null && existing.time.duration_ms !== next.time.duration_ms) return false;
  return true;
}

function mergeAncestorPreservingSelfRootUpgrade(ancestor, selfRoot) {
  if (!selfRootToAncestorUpgrade(selfRoot, ancestor)) return null;
  const candidate = structuredClone(selfRoot);
  candidate.root_thread_id = ancestor.root_thread_id;
  candidate.root_turn_id = ancestor.root_turn_id;
  candidate.team_id = ancestor.team_id;
  candidate.project_id = ancestor.project_id;
  candidate.work_id = ancestor.work_id;
  candidate.actor.role = ancestor.actor.role;
  candidate.measurement.attribution_confidence = ancestor.measurement.attribution_confidence;
  validateUsageEvent(candidate);
  return usageEventUpgradeAllowed(ancestor, candidate)
    && usageEventUpgradeAllowed(selfRoot, candidate, { allowSourceRefChange: true })
    ? candidate
    : null;
}

async function writeUsageEvent(filePath, revisionsRoot, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  let handle;
  try {
    handle = await open(filePath, "wx");
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    return "created";
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const existing = JSON.parse(await readFile(filePath, "utf8"));
    if (canonicalJson(existing) === canonicalJson(value)) return "replayed";
    if (!usageEventUpgradeAllowed(existing, value)) fail("usage_event_conflict");
    const revisionDigest = sha256(canonicalJson(existing)).slice("sha256:".length);
    const revisionPath = path.join(revisionsRoot, value.event_id, `${revisionDigest}.json`);
    await writeNewJson(revisionPath, existing);
    await writeJsonAtomic(filePath, value);
    return "updated";
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function writeNewJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  let handle;
  try {
    handle = await open(filePath, "wx");
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    return "created";
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const existing = JSON.parse(await readFile(filePath, "utf8"));
    if (canonicalJson(existing) !== canonicalJson(value)) fail("usage_event_conflict");
    return "replayed";
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function writePendingUsageEvents(root, events) {
  const pendingFiles = [];
  for (const event of events) {
    const pendingPath = path.join(
      root,
      "pending",
      event.event_id,
      `${Date.now()}-${process.pid}-${randomBytes(8).toString("hex")}.json`,
    );
    await writeJsonAtomic(pendingPath, event);
    pendingFiles.push(pendingPath);
  }
  return pendingFiles;
}

async function loadPendingUsageEvents(root) {
  const files = await walk(path.join(root, "pending"), (file) => file.endsWith(".json"));
  const events = [];
  for (const file of files) {
    events.push(validateUsageEvent(JSON.parse(await readFile(file, "utf8"))));
  }
  return { files, events };
}

async function loadLedgerEventIndex(root) {
  const files = await walk(path.join(root, "events"), (file) => file.endsWith(".json"));
  const index = new Map();
  for (const file of files) {
    const event = validateUsageEvent(JSON.parse(await readFile(file, "utf8")));
    if (index.has(event.event_id)) fail("usage_event_duplicate_persisted");
    index.set(event.event_id, { file, event });
  }
  return index;
}

export async function persistUsageEvents(stateRoot, events) {
  const root = path.resolve(stateRoot);
  if (!Array.isArray(events)) fail("usage_events_invalid");
  const acceptedEvents = events.map((event) => validateUsageEvent(event));
  return withLedgerLock(root, async () => {
    const pending = await loadPendingUsageEvents(root);
    const observations = collapseUsageEventObservations([...pending.events, ...acceptedEvents]).events;
    const ledgerIndex = await loadLedgerEventIndex(root);
    const effectiveObservations = observations.map((event) => {
      const indexed = ledgerIndex.get(event.event_id);
      if (!indexed || canonicalJson(indexed.event) === canonicalJson(event)) return event;
      if (usageEventUpgradeAllowed(indexed.event, event)) return event;
      const lineageMerged = mergeAncestorPreservingSelfRootUpgrade(indexed.event, event);
      if (lineageMerged) return lineageMerged;
      if (selfRootToAncestorUpgrade(event, indexed.event)
        && usageEventUpgradeAllowed(event, indexed.event)) return indexed.event;
      fail("usage_event_conflict");
    });
    const receipt = { created: 0, updated: 0, replayed: 0, event_ids: [] };
    for (const event of effectiveObservations) {
      const month = (event.time.started_at ?? "unknown").slice(0, 7);
      const indexed = ledgerIndex.get(event.event_id);
      const target = indexed?.file ?? path.join(root, "events", month, `${event.event_id}.json`);
      const status = await writeUsageEvent(target, path.join(root, "revisions"), event);
      receipt[status] += 1;
      receipt.event_ids.push(event.event_id);
      ledgerIndex.set(event.event_id, { file: target, event });
    }
    receipt.event_ids.sort((a, b) => a.localeCompare(b, "en"));
    const all = await loadPersistedUsageEvents(root);
    const summary = summarizeUsageEvents(all);
    await writeJsonAtomic(path.join(root, "current.json"), {
      schema_version: "soulforge.ai_usage_meter_snapshot.v1",
      generated_at: new Date().toISOString(),
      event_count: all.length,
      events_digest: sha256(canonicalJson(all.map((event) => event.event_id))),
      summary,
    });
    await Promise.all(pending.files.map((file) => rm(file, { force: true })));
    return { ...receipt, total_event_count: all.length, state_root: root };
  }, async () => {
    const pendingFiles = await writePendingUsageEvents(root, acceptedEvents);
    return {
      created: 0,
      updated: 0,
      replayed: 0,
      pending: pendingFiles.length,
      event_ids: acceptedEvents.map((event) => event.event_id).sort((a, b) => a.localeCompare(b, "en")),
      total_event_count: null,
      state_root: root,
    };
  });
}

export async function loadPersistedUsageEvents(stateRoot) {
  const root = path.join(path.resolve(stateRoot), "events");
  const files = await walk(root, (file) => file.endsWith(".json"));
  const events = [];
  for (const file of files) {
    const event = JSON.parse(await readFile(file, "utf8"));
    events.push(validateUsageEvent(event));
  }
  return events.sort((a, b) => (
    (a.time.started_at ?? "").localeCompare(b.time.started_at ?? "", "en")
    || a.event_id.localeCompare(b.event_id, "en")
  ));
}

function aggregateRows(events, field) {
  const rows = new Map();
  for (const event of events) {
    const key = field === "model" ? event.model.id
      : field === "agent" ? event.actor.agent_id
        : field === "node" ? event.actor.node_id
          : field === "role" ? event.actor.role ?? "unassigned"
            : field === "reasoning_effort" ? event.model.reasoning_effort ?? "unassigned"
              : field === "attribution" ? event.measurement.attribution_confidence
                : field === "measurement" ? event.measurement.status
        : event[`${field}_id`] ?? "unassigned";
    const row = rows.get(key) ?? {
      key,
      turns: 0,
      input_tokens: 0,
      cached_input_tokens: 0,
      output_tokens: 0,
      credits: 0,
      credit_unknown_turns: 0,
      model_invocations: 0,
    };
    row.turns += 1;
    row.input_tokens += event.usage.input_tokens;
    row.cached_input_tokens += event.usage.cached_input_tokens;
    row.output_tokens += event.usage.output_tokens;
    row.model_invocations += event.usage.model_invocation_count;
    if (event.credits.total === null) row.credit_unknown_turns += 1;
    else row.credits += event.credits.total;
    rows.set(key, row);
  }
  return [...rows.values()]
    .map((row) => ({ ...row, credits: Number(row.credits.toFixed(9)) }))
    .sort((a, b) => b.credits - a.credits || a.key.localeCompare(b.key, "en"));
}

export function summarizeUsageEvents(events) {
  const totals = {
    turns: events.length,
    input_tokens: 0,
    cached_input_tokens: 0,
    cache_write_input_tokens: 0,
    uncached_input_tokens: 0,
    output_tokens: 0,
    reasoning_output_tokens: 0,
    model_invocations: 0,
    credits: 0,
    credit_unknown_turns: 0,
    explicit_binding_turns: 0,
    derived_lineage_turns: 0,
    unassigned_project_turns: 0,
    incomplete_measurement_turns: 0,
  };
  for (const event of events) {
    totals.input_tokens += event.usage.input_tokens;
    totals.cached_input_tokens += event.usage.cached_input_tokens;
    totals.cache_write_input_tokens += event.usage.cache_write_input_tokens;
    totals.uncached_input_tokens += event.usage.uncached_input_tokens;
    totals.output_tokens += event.usage.output_tokens;
    totals.reasoning_output_tokens += event.usage.reasoning_output_tokens;
    totals.model_invocations += event.usage.model_invocation_count;
    if (event.credits.total === null) totals.credit_unknown_turns += 1;
    else totals.credits += event.credits.total;
    if (event.measurement.attribution_confidence === "explicit_binding") totals.explicit_binding_turns += 1;
    else totals.derived_lineage_turns += 1;
    if (event.project_id === "unassigned") totals.unassigned_project_turns += 1;
    if (event.measurement.status !== "complete") totals.incomplete_measurement_turns += 1;
  }
  totals.credits = Number(totals.credits.toFixed(9));
  totals.cached_input_ratio = totals.input_tokens
    ? Number((totals.cached_input_tokens / totals.input_tokens).toFixed(6))
    : 0;
  return {
    schema_version: "soulforge.ai_usage_summary.v1",
    totals,
    by_organization: aggregateRows(events, "organization"),
    by_team: aggregateRows(events, "team"),
    by_project: aggregateRows(events, "project"),
    by_work: aggregateRows(events, "work"),
    by_model: aggregateRows(events, "model"),
    by_agent: aggregateRows(events, "agent"),
    by_node: aggregateRows(events, "node"),
    by_role: aggregateRows(events, "role"),
    by_reasoning_effort: aggregateRows(events, "reasoning_effort"),
    by_attribution: aggregateRows(events, "attribution"),
    by_measurement: aggregateRows(events, "measurement"),
  };
}

export async function sessionFileLooksUsable(filePath) {
  try {
    const info = await stat(filePath);
    return info.isFile() && info.size > 0 && filePath.endsWith(".jsonl");
  } catch {
    return false;
  }
}
