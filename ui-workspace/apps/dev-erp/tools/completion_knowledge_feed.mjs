#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildKnowledgeRagCandidate,
  validateKnowledgeRagCandidate,
} from "../../../../guild_hall/knowledge_access/knowledge_rag_candidate_ledger.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..");
const REPO = resolve(HERE, "..", "..", "..", "..");
const DEFAULT_DB = join(APP, "data", "dev-erp.db");
const DEFAULT_WORKMETA = join(REPO, "_workmeta");
const DEFAULT_CURSOR = join(APP, "data", "completion_knowledge_cursor.json");
const CURSOR_SCHEMA = "dev_erp.completion_knowledge_cursor.v0";
// P00-000_INBOX 는 로드맵이 예약한 회사 일반/미분류 코드 — INBOX 완료 지식도 적재 대상.
const PROJECT_RE = /^(?:P\d{2}-\d{3}|P00-000_INBOX)$/;
const FORBIDDEN_HINT_KEYS = new Set([
  "attachment",
  "attachments",
  "body",
  "body_html",
  "body_text",
  "chunk",
  "chunk_text",
  "chunks",
  "content",
  "eml",
  "html",
  "mail_body",
  "payload",
  "private_payload",
  "prompt",
  "question",
  "raw",
  "raw_payload",
  "raw_prompt",
  "source_body",
  "source_chunk",
  "source_chunks",
  "source_content",
  "source_payload",
  "source_text",
  "text",
]);
const SECRET_LIKE_KEY_PATTERN =
  /(^|[._-])(access[_-]?token|api[_-]?key|authorization|bearer|client[_-]?secret|cookie|credential|credentials|id[_-]?token|password|passwd|private[_-]?key|refresh[_-]?token|secret|session|token)([._-]|$)/i;

function argValue(argv, name, fallback) {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[index + 1] : fallback;
}

function hasFlag(argv, name) {
  return argv.includes(`--${name}`);
}

export function parseFeedArgs(argv = process.argv.slice(2)) {
  return {
    apply: hasFlag(argv, "apply"),
    json: hasFlag(argv, "json"),
    dbPath: resolve(argValue(argv, "db", DEFAULT_DB)),
    workmetaRoot: resolve(argValue(argv, "workmeta", DEFAULT_WORKMETA)),
    cursorPath: resolve(argValue(argv, "cursor", DEFAULT_CURSOR)),
    limit: Math.max(1, Number(argValue(argv, "limit", "50")) || 50),
    now: argValue(argv, "now", null),
  };
}

function formatTimestampUtc(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) throw new Error("invalid_now");
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function monthStamp(value) {
  return formatTimestampUtc(value).slice(0, 7);
}

function isInside(parent, child) {
  const rel = relative(resolve(parent), resolve(child));
  return rel === "" || (!rel.startsWith("..") && !rel.includes(`..${sep}`));
}

function toRepoRef(pathValue) {
  const abs = resolve(pathValue);
  if (isInside(REPO, abs)) return relative(REPO, abs).replaceAll("\\", "/");
  return "";
}

export function readCursor(cursorPath = DEFAULT_CURSOR) {
  if (!existsSync(cursorPath)) return { last_id: 0 };
  try {
    const parsed = JSON.parse(readFileSync(cursorPath, "utf8"));
    const lastId = Number(parsed?.last_id ?? 0);
    return { last_id: Number.isInteger(lastId) && lastId > 0 ? lastId : 0 };
  } catch {
    return { last_id: 0 };
  }
}

function writeCursorAtomic(cursorPath, lastId, now) {
  mkdirSync(dirname(cursorPath), { recursive: true });
  const payload = {
    schema_version: CURSOR_SCHEMA,
    last_id: lastId,
    updated_at: formatTimestampUtc(now),
  };
  const tmp = `${cursorPath}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  renameSync(tmp, cursorPath);
}

export function readCompletionRows(dbPath, { afterId = 0, limit = 50 } = {}) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const hasTable = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='completion_log'")
      .get();
    if (!hasTable) return [];
    return db
      .prepare(
        `SELECT id, item_id, project_id, done_at, work_type, summary, knowledge
           FROM completion_log
          WHERE id > ?
            AND knowledge IS NOT NULL
            AND trim(knowledge) != ''
          ORDER BY id
          LIMIT ?`,
      )
      .all(Number(afterId) || 0, Math.max(1, Number(limit) || 50));
  } finally {
    db.close();
  }
}

function parseKnowledge(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { note: text };
  }
}

function safeScalar(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

function collectHintParts(value, parts, prefix = "") {
  if (parts.length >= 12) return;
  if (Array.isArray(value)) {
    for (const child of value) collectHintParts(child, parts, prefix);
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const normalizedKey = key.toLowerCase();
      if (FORBIDDEN_HINT_KEYS.has(normalizedKey) || SECRET_LIKE_KEY_PATTERN.test(normalizedKey)) continue;
      collectHintParts(child, parts, prefix ? `${prefix}.${key}` : key);
    }
    return;
  }
  const scalar = safeScalar(value);
  if (!scalar) return;
  parts.push(prefix ? `${prefix}=${scalar}` : scalar);
}

export function knowledgeHint(rawKnowledge, { maxChars = 300 } = {}) {
  const parsed = parseKnowledge(rawKnowledge);
  const parts = [];
  collectHintParts(parsed, parts);
  const hint = (parts.join("; ") || "metadata knowledge hint present").replace(/\s+/g, " ").trim();
  return hint.length <= maxChars ? hint : `${hint.slice(0, Math.max(0, maxChars - 15))}... [truncated]`;
}

export function candidateLedgerRef(projectCode, generatedAt) {
  return `_workmeta/${projectCode}/knowledge_rag_candidate_ledger/events/${monthStamp(generatedAt)}.jsonl`;
}

export function buildCompletionKnowledgeCandidate(row, { generatedAt } = {}) {
  const sourceContextRef = `completion_log/${row.id}`;
  const hint = knowledgeHint(row.knowledge);
  return buildKnowledgeRagCandidate({
    projectCode: row.project_id,
    createdAt: generatedAt,
    sourceContextRef,
    candidateKind: "completion_knowledge",
    shortReason: `Completion log ${row.id} has metadata-only knowledge hint: ${hint}`,
    suggestedRoute: "sourcebound_review_candidate",
    claimCeiling: "observed",
    missingInputs: ["owner_decision_ref", "sourcebound_packet_ref", "knowledge_source_card"],
    ownerQuestion: `Should completion log ${row.id} for ${row.project_id} be promoted to sourcebound wiki/RAG review?`,
    status: "open",
    itemRef: row.item_id,
    knowledgeHint: hint,
    repeatedUseSignal: {
      count: 1,
      sourceEventCount: 1,
      lastSeenAt: generatedAt,
      signalRef: sourceContextRef,
    },
  });
}

function readExistingCandidateKeys(ledgerPath) {
  const keys = new Set();
  if (!existsSync(ledgerPath)) return keys;
  for (const line of readFileSync(ledgerPath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (row.candidate_id) keys.add(`candidate:${row.candidate_id}`);
      if (row.source_context_ref) keys.add(`source:${row.source_context_ref}`);
    } catch {
      // Validation owns malformed ledger rows; duplicate scan stays best-effort.
    }
  }
  return keys;
}

function appendCandidateIfMissing(ledgerPath, candidate) {
  const keys = readExistingCandidateKeys(ledgerPath);
  if (keys.has(`candidate:${candidate.candidate_id}`) || keys.has(`source:${candidate.source_context_ref}`)) {
    return { appended: false, skipped_reason: "duplicate_source_context_ref" };
  }
  mkdirSync(dirname(ledgerPath), { recursive: true });
  appendFileSync(ledgerPath, `${JSON.stringify(candidate)}\n`, "utf8");
  return { appended: true, skipped_reason: "" };
}

function appendRunEvent(dbPath, summary) {
  if (!existsSync(dbPath)) return false;
  const db = new DatabaseSync(dbPath);
  try {
    const hasTable = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='event_log'")
      .get();
    if (!hasTable) return false;
    db.prepare(
      `INSERT INTO event_log(at,actor_ref,actor_kind,item_ref,kind,from_val,to_val,
        intervention_count,bottleneck_reason,used_refs,data_label,note,project_ref)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      formatTimestampUtc(),
      "erp",
      "system",
      null,
      "knowledge_feed_run",
      null,
      String(summary.written_count),
      null,
      null,
      JSON.stringify(["completion_log"]),
      "meta",
      `scanned=${summary.scanned_count} planned=${summary.planned_count} written=${summary.written_count} skipped=${summary.skipped_count}`,
      null,
    );
    return true;
  } finally {
    db.close();
  }
}

export function planCompletionKnowledgeFeed({
  rows,
  workmetaRoot = DEFAULT_WORKMETA,
  generatedAt = new Date(),
} = {}) {
  const workmeta = resolve(workmetaRoot);
  const planned = [];
  const skipped = [];

  for (const row of rows ?? []) {
    const id = Number(row?.id ?? 0);
    const project = String(row?.project_id ?? "").trim();
    if (!id) {
      skipped.push({ id, project_code: project, reason: "missing_completion_log_id" });
      continue;
    }
    if (!PROJECT_RE.test(project)) {
      skipped.push({ id, project_code: project, reason: "missing_or_invalid_project_code" });
      continue;
    }
    if (!existsSync(join(workmeta, project))) {
      skipped.push({ id, project_code: project, reason: "project_workmeta_folder_missing" });
      continue;
    }

    let candidate;
    try {
      candidate = buildCompletionKnowledgeCandidate(row, { generatedAt });
    } catch (error) {
      skipped.push({ id, project_code: project, reason: `candidate_build_failed:${String(error?.message ?? error)}` });
      continue;
    }
    const validation = validateKnowledgeRagCandidate(candidate);
    if (!validation.ok) {
      skipped.push({ id, project_code: project, reason: `invalid_candidate:${validation.errors.join("+")}` });
      continue;
    }

    const ledgerRef = candidateLedgerRef(project, generatedAt);
    const ledgerPath = resolve(workmeta, project, "knowledge_rag_candidate_ledger", "events", `${monthStamp(generatedAt)}.jsonl`);
    if (!isInside(workmeta, ledgerPath)) {
      skipped.push({ id, project_code: project, reason: "candidate_ledger_path_escape" });
      continue;
    }
    planned.push({ id, project_code: project, ledger_ref: ledgerRef, ledger_path: ledgerPath, candidate });
  }

  return { planned, skipped };
}

export function runCompletionKnowledgeFeed(options = {}) {
  const opts = {
    apply: Boolean(options.apply),
    dbPath: resolve(options.dbPath ?? DEFAULT_DB),
    workmetaRoot: resolve(options.workmetaRoot ?? DEFAULT_WORKMETA),
    cursorPath: resolve(options.cursorPath ?? DEFAULT_CURSOR),
    limit: Math.max(1, Number(options.limit ?? 50) || 50),
    now: options.now ?? new Date(),
  };
  const generatedAt = formatTimestampUtc(opts.now);
  const cursor = readCursor(opts.cursorPath);
  const rows = readCompletionRows(opts.dbPath, { afterId: cursor.last_id, limit: opts.limit });
  const plan = planCompletionKnowledgeFeed({ rows, workmetaRoot: opts.workmetaRoot, generatedAt });
  const summary = {
    ok: true,
    apply: opts.apply,
    cursor_ref: toRepoRef(opts.cursorPath),
    previous_last_id: cursor.last_id,
    next_last_id: rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), cursor.last_id),
    scanned_count: rows.length,
    planned_count: plan.planned.length,
    written_count: 0,
    skipped_count: plan.skipped.length,
    skipped_duplicate_count: 0,
    event_logged: false,
    ledger_refs: [...new Set(plan.planned.map((entry) => entry.ledger_ref))].sort(),
    candidate_ids: plan.planned.map((entry) => entry.candidate.candidate_id).sort(),
    skipped: plan.skipped,
    boundary: {
      metadata_only: true,
      completion_log_only: true,
      raw_mail_body_loaded: false,
      attachments_loaded: false,
      secrets_loaded: false,
      rag_ingestion_executed: false,
      wiki_or_canon_mutated: false,
    },
  };

  if (!opts.apply) return summary;

  for (const entry of plan.planned) {
    const appendResult = appendCandidateIfMissing(entry.ledger_path, entry.candidate);
    if (appendResult.appended) summary.written_count += 1;
    else summary.skipped_duplicate_count += 1;
  }
  if (summary.next_last_id > cursor.last_id) {
    writeCursorAtomic(opts.cursorPath, summary.next_last_id, generatedAt);
  }
  summary.event_logged = appendRunEvent(opts.dbPath, summary);
  return summary;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  try {
    const opts = parseFeedArgs();
    const summary = runCompletionKnowledgeFeed(opts);
    if (opts.json) {
      process.stdout.write(`${JSON.stringify(summary)}\n`);
    } else {
      process.stdout.write(
        `# completion knowledge feed ${summary.apply ? "apply" : "dry-run"} scanned=${summary.scanned_count} planned=${summary.planned_count} written=${summary.written_count} skipped=${summary.skipped_count} duplicates=${summary.skipped_duplicate_count}\n`,
      );
    }
    process.exitCode = summary.ok ? 0 : 1;
  } catch (error) {
    process.stderr.write(`[completion_knowledge_feed] ${String(error?.message ?? error)}\n`);
    process.exitCode = 2;
  }
}
