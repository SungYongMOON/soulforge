// claude_collector.mjs — Claude Code 세션 transcript(<projects-root>/<slug>/<sessionId>.jsonl)를
// 메타데이터 전용 soulforge.ai_usage_event.v1 이벤트로 변환한다. 프롬프트·본문·경로 문자열은
// 이벤트에 절대 넣지 않는다(숫자, ID, 모델 ID, 타임스탬프, cwd leaf에서 파생한 slug만 허용).

import { createReadStream } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { createInterface } from "node:readline";
import os from "node:os";
import path from "node:path";

import {
  USAGE_EVENT_SCHEMA,
  USAGE_EVENT_TOKEN_CONFIDENCE_BY_SOURCE_KIND,
  normalizeConfig,
  validateUsageEvent,
} from "./usage_meter.mjs";

export const CLAUDE_USAGE_SOURCE_KIND = "claude_session_jsonl";
export const DEFAULT_CLAUDE_MAX_AGE_DAYS = 45;
export const CLAUDE_PROJECT_BINDING_FILE = path.join("bindings", "claude_project_binding.json");
// This is an ephemeral, redacted observation envelope. It is intentionally not
// a provider-health, live, E2E, aggregate-health, or completeness assertion.
export const CLAUDE_COLLECTION_ENVELOPE_SCHEMA = "soulforge.ai_usage_claude_collection_projection.v1";
export const CLAUDE_COLLECTION_STATES = Object.freeze([
  "observed",
  "available_empty",
  "missing",
  "partial",
  "error",
  "unknown",
]);
export const CLAUDE_COLLECTION_FRESHNESS_STATES = Object.freeze(["fresh", "stale", "unknown"]);
export const CLAUDE_COLLECTION_EVIDENCE_SCOPE = "collector_attempt_source_observation_only";
export const CLAUDE_COLLECTION_CLAIM_SCOPE = "does_not_prove_provider_availability_health_live_e2e_or_aggregate_health_or_completeness";
export const DEFAULT_CLAUDE_COLLECTION_FRESHNESS_THRESHOLD_SECONDS = 15 * 60;
export const MAX_CLAUDE_COLLECTION_FRESHNESS_THRESHOLD_SECONDS = 7 * 24 * 60 * 60;

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/u;
const PROJECT_SLUG = /^[a-z0-9][a-z0-9_-]{0,119}$/u;
const DAY_MS = 24 * 60 * 60 * 1_000;
const CLAUDE_COLLECTION_COUNT_KEYS = Object.freeze([
  "session_file_count",
  "parsed_session_count",
  "observed_message_count",
  "accepted_event_count",
  "duplicate_message_count",
  "issue_count",
]);
const CLAUDE_COLLECTION_ENVELOPE_KEYS = new Set([
  "schema_version",
  "state",
  "reason",
  "attempted_at",
  "freshness_threshold_seconds",
  "freshness",
  "counts",
  "evidence_scope",
  "claim_scope",
]);
const CLAUDE_COLLECTION_REASON_BY_STATE = Object.freeze({
  observed: new Set(["source_observed"]),
  available_empty: new Set(["source_accessible_empty"]),
  missing: new Set(["projects_root_missing"]),
  partial: new Set(["source_partial"]),
  error: new Set(["collector_error"]),
  unknown: new Set(["attempt_unavailable", "attempt_timestamp_untrusted"]),
});

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

export function defaultClaudeProjectsRoot(env = process.env) {
  const override = env.CLAUDE_PROJECTS_ROOT;
  if (typeof override === "string" && override.trim() !== "") return path.resolve(override);
  return path.join(os.homedir(), ".claude", "projects");
}

function nonnegativeInt(value) {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function isoOrNull(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function isoFromEpochOrNull(value) {
  return Number.isFinite(value) ? new Date(value).toISOString() : null;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  return isRecord(value)
    && Object.keys(value).sort((left, right) => left.localeCompare(right, "en"))
      .join("\u0000") === [...keys].sort((left, right) => left.localeCompare(right, "en")).join("\u0000");
}

function strictNonnegativeInt(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function normalizeFreshnessThresholdSeconds(value) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_CLAUDE_COLLECTION_FRESHNESS_THRESHOLD_SECONDS) {
    fail("claude_collection_freshness_threshold_invalid");
  }
  return parsed;
}

function emptyClaudeCollectionCounts() {
  return Object.fromEntries(CLAUDE_COLLECTION_COUNT_KEYS.map((key) => [key, 0]));
}

function parseClaudeCollectionCounts(value, code) {
  if (!hasExactKeys(value, CLAUDE_COLLECTION_COUNT_KEYS)) fail(code);
  const counts = Object.fromEntries(CLAUDE_COLLECTION_COUNT_KEYS.map((key) => {
    const parsed = strictNonnegativeInt(value[key]);
    if (parsed === null) fail(code);
    return [key, parsed];
  }));
  if (counts.parsed_session_count > counts.session_file_count
    || counts.accepted_event_count > counts.observed_message_count) {
    fail(code);
  }
  return counts;
}

function claudeCollectionFreshness(attemptedAt, referenceAt, thresholdSeconds) {
  if (attemptedAt === null || referenceAt === null) return "unknown";
  const ageMs = Date.parse(referenceAt) - Date.parse(attemptedAt);
  if (!Number.isFinite(ageMs) || ageMs < 0) return "unknown";
  return ageMs > thresholdSeconds * 1_000 ? "stale" : "fresh";
}

function defaultClaudeCollectionReason(state, attemptedAt) {
  if (state === "unknown" && attemptedAt !== null) return "attempt_timestamp_untrusted";
  return [...CLAUDE_COLLECTION_REASON_BY_STATE[state]][0];
}

function collectionStateMatchesCounts(state, counts) {
  if (state === "unknown" || state === "missing") {
    return CLAUDE_COLLECTION_COUNT_KEYS.every((key) => counts[key] === 0);
  }
  if (state === "observed") {
    return counts.accepted_event_count > 0 && counts.issue_count === 0;
  }
  if (state === "available_empty") {
    return counts.accepted_event_count === 0 && counts.issue_count === 0;
  }
  if (state === "partial") {
    return counts.issue_count > 0 && (counts.parsed_session_count > 0 || counts.accepted_event_count > 0);
  }
  return state === "error"
    && counts.issue_count > 0
    && counts.parsed_session_count === 0
    && counts.accepted_event_count === 0;
}

// The envelope may cross a local Board boundary, so it has no root path,
// source reference, raw issue payload, or provider status claim. Its freshness
// is derived only from an explicit collector-attempt timestamp and threshold.
export function validateClaudeCollectionEnvelope(value, { referenceAt = null } = {}) {
  if (!hasExactKeys(value, CLAUDE_COLLECTION_ENVELOPE_KEYS)
    || value.schema_version !== CLAUDE_COLLECTION_ENVELOPE_SCHEMA
    || !CLAUDE_COLLECTION_STATES.includes(value.state)
    || !CLAUDE_COLLECTION_FRESHNESS_STATES.includes(value.freshness)
    || value.evidence_scope !== CLAUDE_COLLECTION_EVIDENCE_SCOPE
    || value.claim_scope !== CLAUDE_COLLECTION_CLAIM_SCOPE
    || !CLAUDE_COLLECTION_REASON_BY_STATE[value.state].has(value.reason)) {
    fail("claude_collection_envelope_invalid");
  }
  const thresholdSeconds = normalizeFreshnessThresholdSeconds(value.freshness_threshold_seconds);
  const attemptedAt = value.attempted_at === null ? null : isoOrNull(value.attempted_at);
  if (value.attempted_at !== null && attemptedAt === null) fail("claude_collection_envelope_invalid");
  const counts = parseClaudeCollectionCounts(value.counts, "claude_collection_envelope_invalid");
  if (!collectionStateMatchesCounts(value.state, counts)
    || (value.state === "unknown" && (attemptedAt !== null || value.freshness !== "unknown"))
    || (value.state !== "unknown" && attemptedAt === null)) {
    fail("claude_collection_envelope_invalid");
  }
  const normalizedReferenceAt = referenceAt === null ? null : isoOrNull(referenceAt);
  if (referenceAt !== null && normalizedReferenceAt === null) fail("claude_collection_reference_time_invalid");
  const freshness = claudeCollectionFreshness(attemptedAt, normalizedReferenceAt, thresholdSeconds);
  if (value.freshness !== freshness
    || (value.state !== "unknown" && freshness === "unknown")) {
    fail("claude_collection_freshness_invalid");
  }
  return {
    schema_version: CLAUDE_COLLECTION_ENVELOPE_SCHEMA,
    state: value.state,
    reason: value.reason,
    attempted_at: attemptedAt,
    freshness_threshold_seconds: thresholdSeconds,
    freshness: value.freshness,
    counts,
    evidence_scope: CLAUDE_COLLECTION_EVIDENCE_SCOPE,
    claim_scope: CLAUDE_COLLECTION_CLAIM_SCOPE,
  };
}

export function createClaudeCollectionEnvelope(input = {}, {
  referenceAt = new Date().toISOString(),
  freshnessThresholdSeconds = DEFAULT_CLAUDE_COLLECTION_FRESHNESS_THRESHOLD_SECONDS,
} = {}) {
  const thresholdSeconds = normalizeFreshnessThresholdSeconds(freshnessThresholdSeconds);
  const normalizedReferenceAt = isoOrNull(referenceAt);
  const requestedState = CLAUDE_COLLECTION_STATES.includes(input?.state) ? input.state : "unknown";
  const attemptedAt = isoOrNull(input?.attempted_at);
  const requestedCounts = input?.counts ?? emptyClaudeCollectionCounts();
  let counts;
  try {
    counts = parseClaudeCollectionCounts(requestedCounts, "claude_collection_envelope_invalid");
  } catch {
    counts = emptyClaudeCollectionCounts();
  }
  const freshness = claudeCollectionFreshness(attemptedAt, normalizedReferenceAt, thresholdSeconds);
  const state = attemptedAt === null || normalizedReferenceAt === null || freshness === "unknown"
    || !collectionStateMatchesCounts(requestedState, counts)
    ? "unknown"
    : requestedState;
  const safeAttemptedAt = state === "unknown" ? null : attemptedAt;
  const safeCounts = state === "unknown" ? emptyClaudeCollectionCounts() : counts;
  const safeFreshness = claudeCollectionFreshness(safeAttemptedAt, normalizedReferenceAt, thresholdSeconds);
  return validateClaudeCollectionEnvelope({
    schema_version: CLAUDE_COLLECTION_ENVELOPE_SCHEMA,
    state,
    reason: defaultClaudeCollectionReason(state, attemptedAt),
    attempted_at: safeAttemptedAt,
    freshness_threshold_seconds: thresholdSeconds,
    freshness: safeFreshness,
    counts: safeCounts,
    evidence_scope: CLAUDE_COLLECTION_EVIDENCE_SCOPE,
    claim_scope: CLAUDE_COLLECTION_CLAIM_SCOPE,
  }, { referenceAt: normalizedReferenceAt });
}

function sanitizeIdentifier(value) {
  const candidate = String(value ?? "").replace(/[^A-Za-z0-9_.-]/gu, "-").slice(0, 100);
  return SAFE_ID.test(candidate) ? candidate : null;
}

// cwd 자체는 이벤트에 절대 남기지 않는다. 마지막 경로 조각만 소문자 slug로 파생한다.
export function deriveClaudeProjectSlug(cwd) {
  if (typeof cwd !== "string" || cwd.trim() === "") return "unassigned";
  const normalized = cwd.replaceAll("\\", "/").replace(/\/+$/u, "");
  const leaf = normalized.split("/").filter((part) => part !== "").at(-1) ?? "";
  const slug = leaf.toLowerCase().replace(/[^a-z0-9_-]/gu, "-").slice(0, 120);
  return PROJECT_SLUG.test(slug) ? slug : "unassigned";
}

export async function loadClaudeProjectBinding(stateRoot) {
  if (!stateRoot) return {};
  let raw;
  try {
    raw = await readFile(path.join(path.resolve(stateRoot), CLAUDE_PROJECT_BINDING_FILE), "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    fail("claude_project_binding_unreadable");
  }
  let parsed;
  try {
    parsed = JSON.parse(raw.replace(/^﻿/u, ""));
  } catch {
    fail("claude_project_binding_invalid");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) fail("claude_project_binding_invalid");
  const binding = {};
  for (const [slug, projectId] of Object.entries(parsed)) {
    if (!PROJECT_SLUG.test(slug) || typeof projectId !== "string" || !SAFE_ID.test(projectId)) {
      fail("claude_project_binding_invalid");
    }
    binding[slug] = projectId;
  }
  return binding;
}

export async function findClaudeSessionFiles(projectsRoot, {
  maxAgeDays = DEFAULT_CLAUDE_MAX_AGE_DAYS,
  now = Date.now(),
} = {}) {
  if (!Number.isSafeInteger(maxAgeDays) || maxAgeDays < 1) fail("claude_max_age_days_invalid");
  const root = path.resolve(projectsRoot);
  const cutoff = now - (maxAgeDays * DAY_MS);
  let slugEntries;
  try {
    slugEntries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const files = [];
  for (const slugEntry of slugEntries.sort((a, b) => a.name.localeCompare(b.name, "en"))) {
    if (!slugEntry.isDirectory()) continue;
    const slugDir = path.join(root, slugEntry.name);
    let entries;
    try {
      entries = await readdir(slugDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
      const full = path.join(slugDir, entry.name);
      try {
        const info = await stat(full);
        if (info.isFile() && info.size > 0 && info.mtimeMs >= cutoff) files.push(full);
      } catch {
        // A file removed mid-scan is simply not part of this collection pass.
      }
    }
  }
  return files;
}

async function inspectClaudeProjectsRoot(projectsRoot) {
  try {
    const info = await stat(path.resolve(projectsRoot));
    return info.isDirectory() ? "available" : "error";
  } catch (error) {
    return error?.code === "ENOENT" ? "missing" : "error";
  }
}

function claudeCollectionResult({
  events = [],
  issues = [],
  sessionFileCount = 0,
  parsedSessionCount = 0,
  observedMessageCount = 0,
  duplicateMessageCount = 0,
  state = "unknown",
  attemptedAt = null,
  freshnessThresholdSeconds = DEFAULT_CLAUDE_COLLECTION_FRESHNESS_THRESHOLD_SECONDS,
} = {}) {
  const sortedIssues = [...issues].sort((left, right) => left.source_ref.localeCompare(right.source_ref, "en"));
  const collection = createClaudeCollectionEnvelope({
    state,
    attempted_at: attemptedAt,
    counts: {
      session_file_count: sessionFileCount,
      parsed_session_count: parsedSessionCount,
      observed_message_count: observedMessageCount,
      accepted_event_count: events.length,
      duplicate_message_count: duplicateMessageCount,
      issue_count: sortedIssues.length,
    },
  }, {
    referenceAt: attemptedAt,
    freshnessThresholdSeconds,
  });
  return {
    events,
    issues: sortedIssues,
    session_file_count: sessionFileCount,
    parsed_session_count: parsedSessionCount,
    observed_message_count: observedMessageCount,
    duplicate_message_count: duplicateMessageCount,
    collection,
  };
}

// 하나의 세션 파일에서 usage가 붙은 assistant 메시지 관측만 추출한다(라인 단위, 원문 미보존).
export async function parseClaudeSessionFile(filePath) {
  const file = path.resolve(filePath);
  const fallbackSessionId = sanitizeIdentifier(path.basename(file, ".jsonl"));
  const records = new Map();
  let duplicateCount = 0;
  const input = createReadStream(file, { encoding: "utf8" });
  const lines = createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.includes('"assistant"') || !line.includes('"usage"')) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (row?.type !== "assistant" || !row?.message || typeof row.message !== "object") continue;
    const usage = row.message.usage;
    if (!usage || typeof usage !== "object") continue;
    const dedupKey = typeof row.message.id === "string" && row.message.id !== ""
      ? row.message.id
      : typeof row.requestId === "string" && row.requestId !== ""
        ? row.requestId
        : null;
    if (dedupKey === null) continue;
    const startedAt = isoOrNull(row.timestamp);
    if (startedAt === null) continue;
    const sessionId = sanitizeIdentifier(row.sessionId) ?? fallbackSessionId;
    if (sessionId === null) fail("claude_session_id_invalid");
    const turnId = sanitizeIdentifier(dedupKey);
    if (turnId === null) continue;
    const record = {
      turn_id: turnId,
      session_id: sessionId,
      started_at: startedAt,
      is_sidechain: row.isSidechain === true,
      model: typeof row.message.model === "string" && row.message.model !== ""
        ? String(row.message.model).slice(0, 120)
        : "unknown",
      effort: typeof row.effort === "string" && row.effort !== ""
        ? String(row.effort).slice(0, 120)
        : null,
      input_tokens: nonnegativeInt(usage.input_tokens),
      output_tokens: nonnegativeInt(usage.output_tokens),
      cache_read_input_tokens: nonnegativeInt(usage.cache_read_input_tokens),
      cache_creation_input_tokens: nonnegativeInt(usage.cache_creation_input_tokens),
      project_slug: deriveClaudeProjectSlug(row.cwd),
    };
    const existing = records.get(dedupKey);
    if (existing === undefined) {
      records.set(dedupKey, record);
      continue;
    }
    duplicateCount += 1;
    const sum = (item) => item.input_tokens + item.output_tokens
      + item.cache_read_input_tokens + item.cache_creation_input_tokens;
    if (sum(record) > sum(existing)) records.set(dedupKey, record);
  }
  return { records: [...records.values()], duplicate_count: duplicateCount };
}

function claudeUsageEvent(record, normalizedConfig, binding) {
  const boundProjectId = Object.hasOwn(binding, record.project_slug) ? binding[record.project_slug] : null;
  const inputTotal = record.input_tokens
    + record.cache_read_input_tokens
    + record.cache_creation_input_tokens;
  return validateUsageEvent({
    schema_version: USAGE_EVENT_SCHEMA,
    event_id: `aue-cl-${record.turn_id}`.slice(0, 120),
    organization_id: normalizedConfig.organization_id,
    team_id: normalizedConfig.default_team_id,
    project_id: boundProjectId ?? record.project_slug,
    work_id: `claude.${record.session_id}`.slice(0, 120),
    thread_id: record.session_id,
    turn_id: record.turn_id,
    parent_thread_id: null,
    root_thread_id: record.session_id,
    root_turn_id: record.turn_id,
    source: {
      kind: CLAUDE_USAGE_SOURCE_KIND,
      // 파일 경로는 이벤트에 저장하지 않는다. 세션 ID가 불투명 참조를 대신한다.
      source_ref: record.session_id,
      originator: null,
    },
    actor: {
      node_id: normalizedConfig.node_id,
      agent_id: record.is_sidechain ? "sidechain" : "root",
      agent_depth: record.is_sidechain ? 1 : 0,
      role: "executor",
    },
    model: {
      id: record.model,
      reasoning_effort: record.effort,
      service_tier: "standard",
      context_window: null,
    },
    usage: {
      input_tokens: inputTotal,
      cached_input_tokens: record.cache_read_input_tokens,
      cache_write_input_tokens: record.cache_creation_input_tokens,
      output_tokens: record.output_tokens,
      reasoning_output_tokens: 0,
      total_tokens: inputTotal + record.output_tokens,
      uncached_input_tokens: record.input_tokens,
      model_invocation_count: 1,
      max_invocation_input_tokens: inputTotal,
    },
    credits: {
      status: "rate_unknown",
      // Claude 토큰 단가는 Codex rate card와 통화가 섞이면 안 되므로 항상 rate_unknown이다.
      rate_card_id: "unpriced",
      service_tier: "standard",
      total: null,
      components: null,
    },
    time: {
      started_at: record.started_at,
      // per-message usage는 이미 종결된 관측이므로 완료 시각을 관측 시각으로 고정한다.
      completed_at: record.started_at,
      duration_ms: null,
    },
    rate_limit_snapshot: null,
    measurement: {
      status: "complete",
      token_confidence: USAGE_EVENT_TOKEN_CONFIDENCE_BY_SOURCE_KIND[CLAUDE_USAGE_SOURCE_KIND],
      attribution_confidence: boundProjectId === null ? "derived_lineage" : "explicit_binding",
    },
    privacy: {
      metadata_only: true,
      prompt_captured: false,
      reasoning_captured: false,
      tool_payload_captured: false,
    },
  });
}

export async function collectClaudeUsageEvents({
  projectsRoot = defaultClaudeProjectsRoot(),
  stateRoot = null,
  maxAgeDays = DEFAULT_CLAUDE_MAX_AGE_DAYS,
  config = {},
  now = Date.now(),
  freshnessThresholdSeconds = DEFAULT_CLAUDE_COLLECTION_FRESHNESS_THRESHOLD_SECONDS,
} = {}) {
  if (!Number.isSafeInteger(maxAgeDays) || maxAgeDays < 1) fail("claude_max_age_days_invalid");
  const attemptedAt = isoFromEpochOrNull(now);
  if (attemptedAt === null) {
    return claudeCollectionResult({
      state: "unknown",
      freshnessThresholdSeconds,
    });
  }
  const normalizedConfig = normalizeConfig(config);
  let binding;
  try {
    binding = await loadClaudeProjectBinding(stateRoot);
  } catch (error) {
    return claudeCollectionResult({
      issues: [{ source_ref: "collector", code: String(error?.code || "claude_binding_failed").slice(0, 120) }],
      state: "error",
      attemptedAt,
      freshnessThresholdSeconds,
    });
  }
  const rootState = await inspectClaudeProjectsRoot(projectsRoot);
  if (rootState === "missing") {
    return claudeCollectionResult({
      state: "missing",
      attemptedAt,
      freshnessThresholdSeconds,
    });
  }
  if (rootState === "error") {
    return claudeCollectionResult({
      issues: [{ source_ref: "collector", code: "claude_projects_root_unreadable" }],
      state: "error",
      attemptedAt,
      freshnessThresholdSeconds,
    });
  }
  let sessionFiles;
  try {
    sessionFiles = await findClaudeSessionFiles(projectsRoot, { maxAgeDays, now });
  } catch (error) {
    return claudeCollectionResult({
      issues: [{ source_ref: "collector", code: String(error?.code || "claude_projects_root_unreadable").slice(0, 120) }],
      state: "error",
      attemptedAt,
      freshnessThresholdSeconds,
    });
  }
  const issues = [];
  const observations = new Map();
  let parsedSessionCount = 0;
  let observedMessageCount = 0;
  let duplicateMessageCount = 0;
  for (const file of sessionFiles) {
    let parsed;
    try {
      parsed = await parseClaudeSessionFile(file);
    } catch (error) {
      issues.push({
        source_ref: path.basename(file),
        code: String(error?.code || error?.message || "claude_session_parse_failed").slice(0, 120),
      });
      continue;
    }
    parsedSessionCount += 1;
    duplicateMessageCount += parsed.duplicate_count;
    for (const record of parsed.records) {
      observedMessageCount += 1;
      let event;
      try {
        event = claudeUsageEvent(record, normalizedConfig, binding);
      } catch (error) {
        issues.push({
          source_ref: record.session_id,
          code: String(error?.code || error?.message || "claude_usage_event_invalid").slice(0, 120),
        });
        continue;
      }
      const existing = observations.get(event.event_id);
      if (existing === undefined) {
        observations.set(event.event_id, event);
        continue;
      }
      duplicateMessageCount += 1;
      // 재개된 세션이 같은 message id를 복제해도 항상 같은 하나의 이벤트만 남긴다.
      const better = event.usage.total_tokens > existing.usage.total_tokens
        || (event.usage.total_tokens === existing.usage.total_tokens
          && `${event.time.started_at}\u0000${event.thread_id}` < `${existing.time.started_at}\u0000${existing.thread_id}`);
      if (better) observations.set(event.event_id, event);
    }
  }
  const events = [...observations.values()].sort((a, b) => (
    (a.time.started_at ?? "").localeCompare(b.time.started_at ?? "", "en")
    || a.event_id.localeCompare(b.event_id, "en")
  ));
  const state = issues.length === 0
    ? events.length > 0 ? "observed" : "available_empty"
    : parsedSessionCount > 0 || events.length > 0 ? "partial" : "error";
  return claudeCollectionResult({
    events,
    issues,
    sessionFileCount: sessionFiles.length,
    parsedSessionCount,
    observedMessageCount,
    duplicateMessageCount,
    state,
    attemptedAt,
    freshnessThresholdSeconds,
  });
}
