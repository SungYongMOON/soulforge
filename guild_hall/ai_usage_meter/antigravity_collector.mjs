// antigravity_collector.mjs — Antigravity CLI 대화 DB(gen_metadata)를 request-count-only
// soulforge.ai_usage_event.v1 이벤트로 변환한다. 토큰 데이터가 로컬에 없으므로 토큰 필드는 전부 0,
// token_confidence는 request_count_only, credits는 rate_unknown으로 고정한다.
// 모든 sqlite는 read-only immutable URI로만 열고 title/preview 컬럼은 절대 읽지 않는다.

import { readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  USAGE_EVENT_SCHEMA,
  USAGE_EVENT_TOKEN_CONFIDENCE_BY_SOURCE_KIND,
  normalizeConfig,
  validateUsageEvent,
} from "./usage_meter.mjs";

export const ANTIGRAVITY_USAGE_SOURCE_KIND = "antigravity_conversation_db";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/u;
const MODEL_RUN = /(?:gemini|claude|gpt)[a-z0-9._-]{2,60}/gu;
const MODEL_ID = /^[a-z0-9][a-z0-9._-]{2,60}$/u;
// 0001-01-01 같은 zero-value datetime을 실제 관측으로 오인하지 않기 위한 하한.
const MIN_VALID_EPOCH_MS = Date.parse("2001-01-01T00:00:00.000Z");

let sqliteModulePromise = null;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function loadSqliteModule() {
  if (sqliteModulePromise === null) sqliteModulePromise = import("node:sqlite");
  return sqliteModulePromise;
}

export function defaultAntigravityCliRoot(env = process.env) {
  const override = env.ANTIGRAVITY_CLI_ROOT;
  if (typeof override === "string" && override.trim() !== "") return path.resolve(override);
  return path.join(os.homedir(), ".gemini", "antigravity-cli");
}

function toImmutableReadOnlyUri(dbPath) {
  return `file:${dbPath.split(path.sep).join("/")}?mode=ro&immutable=1`;
}

// datetime TEXT("2026-07-25 03:32:05.4959863+00:00") 또는 epoch 숫자를 ISO로 정규화한다.
export function antigravityTimestampToIso(value) {
  if (value === null || value === undefined) return null;
  let epochMs = null;
  if (typeof value === "number" && Number.isFinite(value)) {
    epochMs = Math.abs(value) < 100_000_000_000 ? value * 1_000 : value;
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    if (/^-?\d+(?:\.\d+)?$/u.test(trimmed)) {
      const numeric = Number(trimmed);
      epochMs = Math.abs(numeric) < 100_000_000_000 ? numeric * 1_000 : numeric;
    } else {
      const normalized = trimmed
        .replace(" ", "T")
        .replace(/(\.\d{3})\d+/u, "$1");
      const withZone = /(?:Z|[+-]\d{2}:?\d{2})$/u.test(normalized) ? normalized : `${normalized}Z`;
      epochMs = Date.parse(withZone);
    }
  }
  if (epochMs === null || !Number.isFinite(epochMs) || epochMs < MIN_VALID_EPOCH_MS) return null;
  return new Date(epochMs).toISOString();
}

// protobuf blob에서 모델 ID로 보이는 printable ascii run만 방어적으로 스캔한다(proto 전체 파싱 금지).
export function extractAntigravityModelId(blob) {
  if (!(blob instanceof Uint8Array)) return "unknown";
  let run = "";
  const runs = [];
  for (const byte of blob) {
    if (byte >= 0x21 && byte <= 0x7e) {
      run += String.fromCharCode(byte);
    } else if (run !== "") {
      runs.push(run);
      run = "";
    }
  }
  if (run !== "") runs.push(run);
  for (const candidateRun of runs) {
    const matches = candidateRun.toLowerCase().match(MODEL_RUN);
    if (!matches) continue;
    for (const match of matches) {
      if (MODEL_ID.test(match)) return match;
    }
  }
  return "unknown";
}

function readConversationIndex(DatabaseSync, indexPath) {
  const db = new DatabaseSync(toImmutableReadOnlyUri(indexPath), { readOnly: true });
  try {
    // title/preview는 조회 대상에서 제외한다(메타데이터 전용 경계).
    const rows = db.prepare(
      "SELECT conversation_id, step_count, last_modified_time, last_user_input_time, project_id"
      + " FROM conversation_summaries",
    ).all();
    const index = new Map();
    for (const row of rows) {
      const conversationId = typeof row.conversation_id === "string" ? row.conversation_id : null;
      if (conversationId === null || !SAFE_ID.test(conversationId)) continue;
      index.set(conversationId, {
        started_at: antigravityTimestampToIso(row.last_user_input_time)
          ?? antigravityTimestampToIso(row.last_modified_time),
        project_id: typeof row.project_id === "string" && SAFE_ID.test(row.project_id)
          ? row.project_id
          : "unassigned",
      });
    }
    return index;
  } finally {
    try {
      db.close();
    } catch {
      // read-only 핸들의 close 실패는 무시한다.
    }
  }
}

function readGenerationRows(DatabaseSync, dbPath) {
  const db = new DatabaseSync(toImmutableReadOnlyUri(dbPath), { readOnly: true });
  try {
    return db.prepare("SELECT idx, data FROM gen_metadata ORDER BY idx").all();
  } finally {
    try {
      db.close();
    } catch {
      // read-only 핸들의 close 실패는 무시한다.
    }
  }
}

function antigravityUsageEvent(conversationId, idx, modelId, summary, normalizedConfig) {
  return validateUsageEvent({
    schema_version: USAGE_EVENT_SCHEMA,
    event_id: `aue-ag-${conversationId}-${idx}`.slice(0, 120),
    organization_id: normalizedConfig.organization_id,
    team_id: normalizedConfig.default_team_id,
    project_id: summary.project_id,
    work_id: `antigravity.${conversationId}`.slice(0, 120),
    thread_id: conversationId,
    // safe-ID 문법이 콜론을 허용하지 않으므로 turn 구분자는 "."을 사용한다.
    turn_id: `${conversationId}.${idx}`.slice(0, 120),
    parent_thread_id: null,
    root_thread_id: conversationId,
    root_turn_id: `${conversationId}.${idx}`.slice(0, 120),
    source: {
      kind: ANTIGRAVITY_USAGE_SOURCE_KIND,
      source_ref: conversationId,
      originator: null,
    },
    actor: {
      node_id: normalizedConfig.node_id,
      agent_id: "root",
      agent_depth: 0,
      role: "executor",
    },
    model: {
      id: modelId,
      reasoning_effort: null,
      service_tier: "standard",
      context_window: null,
    },
    usage: {
      input_tokens: 0,
      cached_input_tokens: 0,
      cache_write_input_tokens: 0,
      output_tokens: 0,
      reasoning_output_tokens: 0,
      total_tokens: 0,
      uncached_input_tokens: 0,
      model_invocation_count: 1,
      max_invocation_input_tokens: 0,
    },
    credits: {
      status: "rate_unknown",
      // Antigravity 사용량은 로컬 단가가 없으므로 항상 rate_unknown이다(통화 혼합 금지).
      rate_card_id: "unpriced",
      service_tier: "standard",
      total: null,
      components: null,
    },
    time: {
      started_at: summary.started_at,
      completed_at: summary.started_at,
      duration_ms: null,
    },
    rate_limit_snapshot: null,
    measurement: {
      status: "complete",
      token_confidence: USAGE_EVENT_TOKEN_CONFIDENCE_BY_SOURCE_KIND[ANTIGRAVITY_USAGE_SOURCE_KIND],
      attribution_confidence: "derived_lineage",
    },
    privacy: {
      metadata_only: true,
      prompt_captured: false,
      reasoning_captured: false,
      tool_payload_captured: false,
    },
  });
}

export async function collectAntigravityUsageEvents({
  cliRoot = defaultAntigravityCliRoot(),
  config = {},
} = {}) {
  const normalizedConfig = normalizeConfig(config);
  const root = path.resolve(cliRoot);
  const indexPath = path.join(root, "conversation_summaries.db");
  const conversationsDir = path.join(root, "conversations");
  const empty = {
    events: [],
    issues: [],
    conversation_db_count: 0,
    indexed_conversation_count: 0,
    skipped_conversation_count: 0,
    observed_row_count: 0,
  };
  try {
    const info = await stat(indexPath);
    if (!info.isFile()) return empty;
  } catch (error) {
    if (error?.code === "ENOENT") return empty;
    throw error;
  }
  const { DatabaseSync } = await loadSqliteModule();
  let index;
  try {
    index = readConversationIndex(DatabaseSync, indexPath);
  } catch (error) {
    return {
      ...empty,
      issues: [{
        source_ref: "conversation_summaries",
        code: String(error?.code || error?.message || "antigravity_index_unreadable").slice(0, 120),
      }],
    };
  }
  let entries = [];
  try {
    entries = await readdir(conversationsDir, { withFileTypes: true });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const dbFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".db"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "en"));
  const issues = [];
  const events = [];
  let skippedConversationCount = 0;
  let observedRowCount = 0;
  for (const name of dbFiles) {
    const conversationId = name.slice(0, -3);
    if (!SAFE_ID.test(conversationId)) {
      skippedConversationCount += 1;
      continue;
    }
    const summary = index.get(conversationId);
    if (!summary || summary.started_at === null) {
      // 인덱스에 없거나 유효한 관측 시각이 없으면 대화 전체를 건너뛴다.
      skippedConversationCount += 1;
      continue;
    }
    let rows;
    try {
      rows = readGenerationRows(DatabaseSync, path.join(conversationsDir, name));
    } catch (error) {
      issues.push({
        source_ref: conversationId,
        code: String(error?.code || error?.message || "antigravity_conversation_unreadable").slice(0, 120),
      });
      continue;
    }
    for (const row of rows) {
      const idx = Number(row.idx);
      if (!Number.isSafeInteger(idx) || idx < 0) continue;
      observedRowCount += 1;
      const modelId = extractAntigravityModelId(row.data);
      try {
        events.push(antigravityUsageEvent(conversationId, idx, modelId, summary, normalizedConfig));
      } catch (error) {
        issues.push({
          source_ref: conversationId,
          code: String(error?.code || error?.message || "antigravity_usage_event_invalid").slice(0, 120),
        });
      }
    }
  }
  events.sort((a, b) => (
    (a.time.started_at ?? "").localeCompare(b.time.started_at ?? "", "en")
    || a.event_id.localeCompare(b.event_id, "en")
  ));
  return {
    events,
    issues: issues.sort((a, b) => a.source_ref.localeCompare(b.source_ref, "en")),
    conversation_db_count: dbFiles.length,
    indexed_conversation_count: index.size,
    skipped_conversation_count: skippedConversationCount,
    observed_row_count: observedRowCount,
  };
}
