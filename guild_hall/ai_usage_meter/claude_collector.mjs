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

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/u;
const PROJECT_SLUG = /^[a-z0-9][a-z0-9_-]{0,119}$/u;
const DAY_MS = 24 * 60 * 60 * 1_000;

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
} = {}) {
  const normalizedConfig = normalizeConfig(config);
  const binding = await loadClaudeProjectBinding(stateRoot);
  const sessionFiles = await findClaudeSessionFiles(projectsRoot, { maxAgeDays, now });
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
          && `${event.time.started_at} ${event.thread_id}` < `${existing.time.started_at} ${existing.thread_id}`);
      if (better) observations.set(event.event_id, event);
    }
  }
  const events = [...observations.values()].sort((a, b) => (
    (a.time.started_at ?? "").localeCompare(b.time.started_at ?? "", "en")
    || a.event_id.localeCompare(b.event_id, "en")
  ));
  return {
    events,
    issues: issues.sort((a, b) => a.source_ref.localeCompare(b.source_ref, "en")),
    session_file_count: sessionFiles.length,
    parsed_session_count: parsedSessionCount,
    observed_message_count: observedMessageCount,
    duplicate_message_count: duplicateMessageCount,
  };
}
