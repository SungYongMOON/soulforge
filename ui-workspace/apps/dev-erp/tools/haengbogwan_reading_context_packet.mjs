#!/usr/bin/env node
// Haengbogwan reading context packet builder.
// This is separate from the metadata-only judge: it may read local mail
// excerpts/event text for classification, but it never writes mail bodies.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { buildProjectKnowledgeOverlay } from "./haengbogwan_project_knowledge_overlay.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..");
const REPO = resolve(HERE, "..", "..", "..", "..");
const DEFAULT_DB = join(APP, "data", "dev-erp.db");
const DEFAULT_LIMIT = 20;
const DEFAULT_MAX_TEXT_CHARS = 12000;
const SAFE_PROJECT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const BODY_MODES = new Set(["subject", "preview", "full", "two_stage"]);

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeWhitespace(value) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function capReadingText(value, maxTextChars = DEFAULT_MAX_TEXT_CHARS) {
  const text = normalizeWhitespace(value);
  const max = Math.max(1, Number(maxTextChars) || DEFAULT_MAX_TEXT_CHARS);
  return {
    text: text.slice(0, max),
    source_len: text.length,
    truncated: text.length > max,
  };
}

function hashText(value) {
  const text = String(value ?? "");
  return text ? createHash("sha256").update(text).digest("hex") : "";
}

function validateLimit(value, label = "limit") {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error(`invalid_${label}:${value}`);
  return n;
}

function validateProjectId(projectId) {
  const project = String(projectId ?? "").trim();
  if (!project) return "";
  if (!SAFE_PROJECT_RE.test(project) || project.includes("..")) {
    throw new Error(`unsafe_project_id:${project}`);
  }
  return project;
}

function validateBodyMode(mode) {
  const value = String(mode ?? "two_stage").trim();
  if (!BODY_MODES.has(value)) throw new Error(`invalid_body_mode:${mode}`);
  return value;
}

function resolveExistingFile(raw, { base = process.cwd(), label = "file" } = {}) {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  const candidate = resolve(base, value);
  if (existsSync(candidate)) return candidate;
  const appCandidate = resolve(APP, value);
  if (existsSync(appCandidate)) return appCandidate;
  throw new Error(`${label}_not_found:${value}`);
}

function isInside(root, target) {
  const rel = relative(resolve(root), resolve(target));
  return rel === "" || (!rel.startsWith("..") && !rel.includes(`..${sep}`));
}

function mailboxEventRoot(repoRoot) {
  return join(resolve(repoRoot), "guild_hall", "state", "gateway", "mailbox");
}

function listEventJsonlFiles(repoRoot) {
  const root = mailboxEventRoot(repoRoot);
  if (!existsSync(root)) return [];
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "attachments" || entry.name === "raw") continue;
        walk(p);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl") && p.split(/[\\/]/).includes("events")) {
        out.push(p);
      }
    }
  };
  walk(root);
  return out.sort();
}

const HTML_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function htmlToText(html) {
  const raw = String(html ?? "");
  if (!raw) return "";
  return raw
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/?(br|p|div|tr|li|h[1-6]|blockquote|table|thead|tbody|ul|ol|hr)\b[^>]*>/gi, "\n")
    .replace(/<\/?(td|th)\b[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, code) => {
      try { return String.fromCodePoint(Number(code)); } catch { return " "; }
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
      try { return String.fromCodePoint(parseInt(code, 16)); } catch { return " "; }
    })
    .replace(/&([a-z]+);/gi, (match, name) => HTML_ENTITIES[name.toLowerCase()] ?? match);
}

export function mailEventText(record, { maxChars = DEFAULT_MAX_TEXT_CHARS } = {}) {
  const text = normalizeWhitespace(record?.body_text || htmlToText(record?.body_html));
  if (!text) return "";
  return text.slice(0, Math.max(1, Number(maxChars) || DEFAULT_MAX_TEXT_CHARS));
}

function sourceRefForRow(row) {
  return String(row?.source_ref ?? "").trim();
}

function shouldReadEventBody(row, { bodyMode = "two_stage" } = {}) {
  const mode = validateBodyMode(bodyMode);
  if (mode === "subject" || mode === "preview") return false;
  const subject = String(row?.subject ?? "");
  const storedBody = String(row?.body_text ?? "");
  if (storedBody.trim()) return false;
  if (mode === "full") return true;
  const preview = String(row?.body_preview ?? "");
  if (!preview.trim()) return true;
  if (preview.length >= 1900) return true;
  return /KVDS|회의|협의|일정|요청|검토|확인|제출|송부|작성|품질|시험|납품|SDD|DD|CSCI|기한|까지/u.test(`${subject}\n${preview}`);
}

function loadEventRecordsById({ repoRoot = REPO, eventIds = [], maxTextChars = DEFAULT_MAX_TEXT_CHARS } = {}) {
  const wanted = new Set(eventIds.map((id) => String(id ?? "").trim()).filter(Boolean));
  const found = new Map();
  if (!wanted.size) return found;

  const root = mailboxEventRoot(repoRoot);
  const files = listEventJsonlFiles(repoRoot);
  for (const file of files) {
    if (!isInside(root, file)) throw new Error("mail_event_path_escape");
    const text = readFileSync(file, "utf8");
    let lineNo = 0;
    for (const line of text.split(/\r?\n/)) {
      lineNo += 1;
      if (!line.trim()) continue;
      let row;
      try {
        row = JSON.parse(line);
      } catch {
        continue;
      }
      const eventId = String(row?.event_id ?? "").trim();
      if (!wanted.has(eventId) || found.has(eventId)) continue;
      const bodyText = mailEventText(row, { maxChars: maxTextChars });
      const rawBodyText = normalizeWhitespace(row?.body_text || htmlToText(row?.body_html));
      found.set(eventId, {
        event_id: eventId,
        event_file: relative(resolve(repoRoot), file).replaceAll("\\", "/"),
        event_line: lineNo,
        record: row,
        body_text: bodyText,
        body_text_hash: hashText(bodyText),
        body_text_len: bodyText.length,
        body_text_source_len: rawBodyText.length,
        body_text_truncated: rawBodyText.length > bodyText.length,
        attachment_count: Array.isArray(row?.attachments) ? row.attachments.length : 0,
      });
      if (found.size === wanted.size) return found;
    }
  }
  return found;
}

function tableColumns(db, tableName) {
  try {
    return new Set(db.prepare(`PRAGMA table_info(${tableName})`).all().map((row) => row.name));
  } catch {
    return new Set();
  }
}

function loadMailRowsFromDb({
  dbPath = DEFAULT_DB,
  projectId = "",
  query = "",
  direction = "",
  mailbox = "",
  includeHidden = false,
  limit = DEFAULT_LIMIT,
} = {}) {
  const resolvedDbPath = resolveExistingFile(dbPath, { base: APP, label: "db" });
  const checkedProject = validateProjectId(projectId);
  const checkedLimit = validateLimit(limit);
  const db = new DatabaseSync(resolvedDbPath, { readOnly: true });
  try {
    const mailColumns = tableColumns(db, "core_mail");
    const hasBodyPreview = mailColumns.has("body_preview");
    const hasBodyText = mailColumns.has("body_text");
    const cond = [];
    const args = [];
    if (!includeHidden) {
      cond.push("COALESCE(hidden,0)=0");
      cond.push("dup_of IS NULL");
    }
    if (checkedProject) {
      cond.push("project_id=?");
      args.push(checkedProject);
    }
    const q = String(query ?? "").trim();
    if (q) {
      const searchColumns = ["subject", "counterpart", "project_id", "id", "pointer_ref", "source_ref"];
      if (hasBodyPreview) searchColumns.push("body_preview");
      if (hasBodyText) searchColumns.push("body_text");
      const searchTerms = searchColumns.map((col) => `${col} LIKE ?`);
      args.push(...Array(searchColumns.length).fill(`%${q}%`));
      if (hasBodyText) {
        searchTerms.push(`EXISTS (
          SELECT 1 FROM core_mail fb
          WHERE fb.id<>core_mail.id
            AND COALESCE(TRIM(fb.body_text),'')<>''
            AND (
              (COALESCE(core_mail.dup_of,'')<>'' AND fb.id=core_mail.dup_of)
              OR (COALESCE(core_mail.source_ref,'')<>'' AND fb.source_ref=core_mail.source_ref)
              OR (COALESCE(core_mail.pointer_ref,'')<>'' AND fb.pointer_ref=core_mail.pointer_ref)
            )
            AND (${hasBodyPreview ? "fb.body_preview LIKE ? OR " : ""}fb.body_text LIKE ?)
        )`);
        if (hasBodyPreview) args.push(`%${q}%`);
        args.push(`%${q}%`);
      }
      cond.push(`(${searchTerms.join(" OR ")})`);
    }
    const dir = String(direction ?? "").trim();
    if (dir) {
      cond.push("direction=?");
      args.push(dir);
    }
    const box = String(mailbox ?? "").trim();
    if (box) {
      cond.push("LOWER(COALESCE(mailbox,''))=LOWER(?)");
      args.push(box);
    }
    const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
    const bodyPreviewExpr = hasBodyPreview ? "body_preview" : "NULL AS body_preview";
    const bodyTextExpr = hasBodyText ? "body_text" : "NULL AS body_text";
    return db.prepare(
      `SELECT id, project_id, at, direction, subject, counterpart, pointer_ref,
              stage_code, source_ref, mailbox, data_label, ${bodyPreviewExpr}, ${bodyTextExpr}, hidden, dup_of
       FROM core_mail ${where}
       ORDER BY at DESC, id DESC
       LIMIT ?`
    ).all(...args, checkedLimit);
  } finally {
    db.close();
  }
}

function inClause(values) {
  const cleaned = [...new Set(values.map((v) => String(v ?? "").trim()).filter(Boolean))];
  if (!cleaned.length) return null;
  return { sql: cleaned.map(() => "?").join(","), args: cleaned };
}

function taskLookupKeysForMailRow(row) {
  const sourceRef = sourceRefForRow(row);
  const historyKey = historyKeyFromMailId(row) || historyKeyFromPointer(row?.pointer_ref);
  return [
    row?.id,
    sourceRef,
    historyKey,
    row?.pointer_ref,
    historyKey ? `mailcsv:${historyKey}` : "",
    sourceRef ? `mailcsv:${sourceRef}` : "",
  ].map((v) => String(v ?? "").trim()).filter(Boolean);
}

function loadExistingTaskRefs({ dbPath = DEFAULT_DB, mailRows = [] } = {}) {
  const resolvedDbPath = resolveExistingFile(dbPath, { base: APP, label: "db" });
  const ids = inClause(mailRows.flatMap(taskLookupKeysForMailRow));
  const sourceIds = inClause(mailRows.map((r) => r.source_ref));
  const sourceMailRefs = inClause(mailRows.flatMap(taskLookupKeysForMailRow));
  const parts = [];
  const args = [];
  if (ids) {
    parts.push(`origin_mail_id IN (${ids.sql})`);
    args.push(...ids.args);
  }
  if (sourceIds) {
    parts.push(`source_mail_source_id IN (${sourceIds.sql})`);
    args.push(...sourceIds.args);
  }
  if (sourceMailRefs) {
    parts.push(`source_mail_ref IN (${sourceMailRefs.sql})`);
    args.push(...sourceMailRefs.args);
  }
  if (!parts.length) return new Map();

  const db = new DatabaseSync(resolvedDbPath, { readOnly: true });
  try {
    const rows = db.prepare(
      `SELECT id, project_id, title, status, origin_mail_id, source_mail_ref,
              source_mail_source_id, source_lineage_ref
       FROM core_item
       WHERE ${parts.join(" OR ")}
       ORDER BY created_at DESC, id DESC`
    ).all(...args);
    const byMail = new Map();
    for (const row of rows) {
      const sourceMailRef = String(row.source_mail_ref ?? "").trim();
      const keys = [
        row.origin_mail_id,
        row.source_mail_source_id,
        sourceMailRef,
        sourceMailRef.replace(/^mailcsv:/, ""),
        row.source_lineage_ref,
      ].map((v) => String(v ?? "").trim()).filter(Boolean);
      for (const key of keys) {
        if (!byMail.has(key)) byMail.set(key, []);
        byMail.get(key).push({
          task_ref: row.id,
          project_id: row.project_id,
          status: row.status,
          title: row.title,
        });
      }
    }
    return byMail;
  } catch {
    return new Map();
  } finally {
    db.close();
  }
}

function loadMailBodyFallbacks({ dbPath = DEFAULT_DB, mailRows = [], includeBodyText = true } = {}) {
  const needingBody = mailRows.filter((row) => !String(row?.body_text ?? "").trim());
  if (!needingBody.length) return new Map();
  const resolvedDbPath = resolveExistingFile(dbPath, { base: APP, label: "db" });
  const db = new DatabaseSync(resolvedDbPath, { readOnly: true });
  try {
    const mailColumns = tableColumns(db, "core_mail");
    if (!mailColumns.has("body_text")) return new Map();
    const hasBodyPreview = mailColumns.has("body_preview");
    const bodyPreviewExpr = hasBodyPreview ? "body_preview" : "NULL AS body_preview";
    const bodyTextExpr = includeBodyText ? "body_text" : "NULL AS body_text";
    const stmt = db.prepare(
      `SELECT id, source_ref, pointer_ref, subject, at, direction, ${bodyPreviewExpr}, ${bodyTextExpr}
       FROM core_mail
       WHERE id<>?
         AND COALESCE(TRIM(body_text),'')<>''
         AND (
           (?<>'' AND id=?)
           OR (?<>'' AND source_ref=?)
           OR (?<>'' AND pointer_ref=?)
         )
       ORDER BY
         CASE
           WHEN ?<>'' AND id=? THEN 0
           WHEN ?<>'' AND source_ref=? THEN 1
           WHEN ?<>'' AND pointer_ref=? THEN 2
           ELSE 3
         END,
         LENGTH(COALESCE(body_text,'')) DESC,
         id
       LIMIT 1`
    );
    const out = new Map();
    for (const row of needingBody) {
      const sourceRef = String(row.source_ref ?? "").trim();
      const pointerRef = String(row.pointer_ref ?? "").trim();
      const dupOf = String(row.dup_of ?? "").trim();
      const fallback = stmt.get(
        row.id,
        dupOf, dupOf,
        sourceRef, sourceRef,
        pointerRef, pointerRef,
        dupOf, dupOf,
        sourceRef, sourceRef,
        pointerRef, pointerRef,
      );
      if (!fallback) continue;
      out.set(row.id, {
        id: fallback.id,
        body_text: normalizeWhitespace(fallback.body_text),
        body_preview: normalizeWhitespace(fallback.body_preview),
      });
    }
    return out;
  } finally {
    db.close();
  }
}

function historyKeyFromPointer(pointerRef) {
  const ref = String(pointerRef ?? "").trim();
  const ix = ref.lastIndexOf("#");
  return ix >= 0 ? ref.slice(ix + 1).trim() : "";
}

function historyKeyFromMailId(row) {
  const id = String(row?.id ?? "").trim();
  const project = String(row?.project_id ?? "").trim();
  const prefix = project ? `${project}:` : "";
  if (!prefix || !id.startsWith(prefix)) return "";
  return id.slice(prefix.length).trim();
}

function emailOf(value) {
  return String(value ?? "").trim().toLowerCase();
}

function addressListContains(list, mailbox) {
  const target = emailOf(mailbox);
  if (!target || !Array.isArray(list)) return false;
  return list.some((entry) => emailOf(entry?.address) === target || emailOf(entry) === target);
}

function recipientRoleFromEvent(row, eventRecord) {
  const mailbox = row?.mailbox;
  const record = eventRecord?.record;
  if (!record) return "unknown";
  if (addressListContains(record.to, mailbox)) return "to";
  if (addressListContains(record.cc, mailbox)) return "cc";
  if (addressListContains(record.from, mailbox)) return "from";
  return "unknown";
}

function buildReadingEvent(row, {
  bodyMode = "two_stage",
  eventRecord = null,
  bodyFallback = null,
  existingTaskMap = new Map(),
  maxTextChars = DEFAULT_MAX_TEXT_CHARS,
  includeText = true,
} = {}) {
  const subject = String(row.subject ?? "").trim();
  const preview = normalizeWhitespace(row.body_preview);
  const storedBody = normalizeWhitespace(row.body_text);
  const fallbackBody = normalizeWhitespace(bodyFallback?.body_text);
  const fallbackPreview = normalizeWhitespace(bodyFallback?.body_preview);
  const sourceRef = sourceRefForRow(row);
  const historyKey = historyKeyFromMailId(row) || historyKeyFromPointer(row.pointer_ref) || sourceRef || row.id;
  const eventBody = eventRecord?.body_text || "";
  const eventWasRead = !!eventRecord;
  const mode = validateBodyMode(bodyMode);
  let selectedText = subject;
  let readingSource = "subject_only";
  if (mode === "preview") {
    if (preview || fallbackPreview) {
      selectedText = preview || fallbackPreview;
      readingSource = "core_mail.body_preview";
    }
  } else if (mode !== "subject") {
    if (eventBody) {
      selectedText = eventBody;
      readingSource = "event_body_text";
    } else if (storedBody) {
      selectedText = storedBody;
      readingSource = "core_mail.body_text";
    } else if (fallbackBody) {
      selectedText = fallbackBody;
      readingSource = "core_mail.body_text_fallback";
    } else if (preview || fallbackPreview) {
      selectedText = preview || fallbackPreview;
      readingSource = "core_mail.body_preview";
    }
  }
  const cappedReading = capReadingText(selectedText, maxTextChars);
  const readingText = cappedReading.text;
  const readingSourceLen = readingSource === "event_body_text"
    ? (eventRecord?.body_text_source_len ?? cappedReading.source_len)
    : cappedReading.source_len;
  const readingTruncated = readingSource === "event_body_text"
    ? Boolean(eventRecord?.body_text_truncated || cappedReading.truncated)
    : cappedReading.truncated;
  const keysForTaskLookup = [
    row.id,
    sourceRef,
    historyKey,
    row.pointer_ref,
    historyKey ? `mailcsv:${historyKey}` : "",
    sourceRef ? `mailcsv:${sourceRef}` : "",
  ].filter(Boolean);
  const existingTaskRefs = [];
  for (const key of keysForTaskLookup) {
    for (const task of existingTaskMap.get(key) ?? []) existingTaskRefs.push(task);
  }
  const uniqueExisting = [];
  const seenTasks = new Set();
  for (const task of existingTaskRefs) {
    if (seenTasks.has(task.task_ref)) continue;
    seenTasks.add(task.task_ref);
    uniqueExisting.push(task);
  }

  const out = {
    mail_ref: row.id,
    ledger_key: historyKey,
    project_id: row.project_id || "",
    received_at: row.at || "",
    direction: row.direction || "",
    subject,
    counterpart: row.counterpart || "",
    mailbox_ref: row.mailbox || "",
    pointer_ref: row.pointer_ref || "",
    source_ref: sourceRef,
    stage_code: row.stage_code || "",
    body_access: readingSource,
    event_body_read: eventWasRead,
    event_found: eventWasRead,
    event_ref: eventRecord?.event_id || "",
    event_file_ref: eventRecord?.event_file || "",
    event_line: eventRecord?.event_line || null,
    recipient_role: recipientRoleFromEvent(row, eventRecord),
    attachment_count: eventRecord?.attachment_count ?? 0,
    body_preview_len: preview.length,
    body_text_len: storedBody.length,
    body_text_fallback_len: fallbackBody.length,
    body_fallback_ref: fallbackBody || fallbackPreview ? String(bodyFallback?.id ?? "") : "",
    reading_text_len: readingText.length,
    reading_text_source_len: readingSourceLen,
    reading_text_truncated: readingTruncated,
    reading_text_hash: hashText(readingText),
    existing_task_refs: uniqueExisting,
  };
  if (includeText) out.reading_text = readingText;
  return out;
}

export function buildReadingContextPacket({
  dbPath = DEFAULT_DB,
  repoRoot = REPO,
  projectId = "",
  query = "",
  direction = "",
  mailbox = "",
  limit = DEFAULT_LIMIT,
  bodyMode = "two_stage",
  maxTextChars = DEFAULT_MAX_TEXT_CHARS,
  includeText = true,
  includeHidden = false,
  includeKnowledge = true,
  includeCommonKnowledge = true,
  commonKnowledgeBindingPath = "",
  knowledgeLimit = DEFAULT_LIMIT,
  generatedAt = new Date().toISOString(),
} = {}) {
  const mode = validateBodyMode(bodyMode);
  const checkedProjectId = validateProjectId(projectId);
  const rows = loadMailRowsFromDb({ dbPath, projectId: checkedProjectId, query, direction, mailbox, limit, includeHidden });
  const existingTaskMap = loadExistingTaskRefs({ dbPath, mailRows: rows });
  const bodyFallbacks = mode === "subject"
    ? new Map()
    : loadMailBodyFallbacks({ dbPath, mailRows: rows, includeBodyText: mode !== "preview" });
  const idsToRead = mode === "subject" || mode === "preview"
    ? []
    : rows.filter((row) => sourceRefForRow(row) && shouldReadEventBody(row, { bodyMode: mode })).map(sourceRefForRow);
  const eventRecords = loadEventRecordsById({ repoRoot, eventIds: idsToRead, maxTextChars });
  const mailEvents = rows.map((row) => buildReadingEvent(row, {
    bodyMode: mode,
    eventRecord: eventRecords.get(sourceRefForRow(row)) || null,
    bodyFallback: bodyFallbacks.get(row.id) || null,
    existingTaskMap,
    maxTextChars,
    includeText,
  }));
  const eventReadCount = mailEvents.filter((event) => event.event_body_read).length;
  const dbBodyCount = mailEvents.filter((event) => event.body_access === "core_mail.body_text").length;
  const dbBodyFallbackCount = mailEvents.filter((event) => event.body_access === "core_mail.body_text_fallback").length;
  const knowledgeContext = includeKnowledge && checkedProjectId
    ? buildProjectKnowledgeOverlay({
      repoRoot,
      dbPath,
      projectId: checkedProjectId,
      queryTerms: [
        query,
        ...mailEvents.map((event) => event.subject),
        ...mailEvents.map((event) => event.counterpart),
      ],
      limit: knowledgeLimit,
      includeCommonKnowledge,
      commonKnowledgeBindingPath,
      generatedAt,
    })
    : null;
  return {
    schema_version: "haengbogwan.reading_context_packet.v1",
    generated_at: generatedAt,
    source: "dev_erp.core_mail",
    db_ref: resolve(dbPath),
    repo_root_ref: resolve(repoRoot),
    project_id: checkedProjectId,
    query: String(query ?? "").trim(),
    body_mode: mode,
    body_access: eventReadCount
      ? "local_event_body_or_db_body_or_preview"
      : (dbBodyCount
        ? "core_mail.body_text"
        : (dbBodyFallbackCount ? "core_mail.body_text_fallback" : (mode === "subject" ? "subject_only" : "core_mail.body_preview"))),
    boundary: {
      metadata_only: false,
      local_event_body_read: eventReadCount > 0,
      raw_body_persisted: false,
      erp_body_text_available: dbBodyCount > 0,
      erp_body_text_fallback_available: dbBodyFallbackCount > 0,
      attachments_loaded: false,
      attachment_payloads_loaded: false,
      secret_loaded: false,
      protected_text_in_packet: includeText,
      output_should_redact_reading_text: true,
      allowed_event_root: relative(resolve(repoRoot), mailboxEventRoot(repoRoot)).replaceAll("\\", "/"),
      project_knowledge_overlay_loaded: Boolean(knowledgeContext),
    },
    counts: {
      mail: mailEvents.length,
      event_body_read: eventReadCount,
      db_body_text: dbBodyCount,
      db_body_text_fallback: dbBodyFallbackCount,
      preview_only: mailEvents.filter((event) => event.body_access === "core_mail.body_preview").length,
      subject_only: mailEvents.filter((event) => event.body_access === "subject_only").length,
      existing_task_linked_mail: mailEvents.filter((event) => event.existing_task_refs.length).length,
      knowledge_roots_present: knowledgeContext?.counts?.present_root_count ?? 0,
      knowledge_refs: knowledgeContext
        ? (knowledgeContext.counts.wiki_page_count
          + knowledgeContext.counts.rag_route_count
          + knowledgeContext.counts.rag_work_card_count
          + knowledgeContext.counts.knowledge_ledger_count
          + knowledgeContext.counts.common_knowledge_ref_count
          + knowledgeContext.counts.core_knowledge_hit_count)
        : 0,
    },
    knowledge_context: knowledgeContext,
    mail_events: mailEvents,
  };
}

export function redactReadingContextPacket(packet) {
  return {
    ...packet,
    boundary: {
      ...packet.boundary,
      protected_text_in_packet: false,
    },
    mail_events: (Array.isArray(packet?.mail_events) ? packet.mail_events : []).map((event) => {
      const { reading_text, ...rest } = event;
      return rest;
    }),
  };
}

function parseArgs(argv) {
  const opts = {
    dbPath: DEFAULT_DB,
    repoRoot: REPO,
    projectId: "",
    query: "",
    direction: "",
    mailbox: "",
    limit: DEFAULT_LIMIT,
    bodyMode: "two_stage",
    maxTextChars: DEFAULT_MAX_TEXT_CHARS,
    includeText: false,
    includeHidden: false,
    includeKnowledge: true,
    includeCommonKnowledge: true,
    commonKnowledgeBindingPath: "",
    knowledgeLimit: DEFAULT_LIMIT,
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--help" || token === "-h") opts.help = true;
    else if (token === "--json") opts.json = true;
    else if (token === "--include-reading-text") throw new Error("include_reading_text_cli_forbidden");
    else if (token === "--include-hidden") opts.includeHidden = true;
    else if (token === "--no-knowledge") opts.includeKnowledge = false;
    else if (token === "--no-common-knowledge") opts.includeCommonKnowledge = false;
    else if (token === "--db") {
      opts.dbPath = argv[++i];
      if (!opts.dbPath || opts.dbPath.startsWith("--")) throw new Error("--db_requires_value");
    } else if (token === "--repo-root") {
      opts.repoRoot = argv[++i];
      if (!opts.repoRoot || opts.repoRoot.startsWith("--")) throw new Error("--repo-root_requires_value");
    } else if (token === "--project") {
      opts.projectId = argv[++i];
      if (!opts.projectId || opts.projectId.startsWith("--")) throw new Error("--project_requires_value");
    } else if (token === "--query" || token === "--q") {
      opts.query = argv[++i];
      if (!opts.query || opts.query.startsWith("--")) throw new Error(`${token}_requires_value`);
    } else if (token === "--direction") {
      opts.direction = argv[++i];
      if (!opts.direction || opts.direction.startsWith("--")) throw new Error("--direction_requires_value");
    } else if (token === "--mailbox") {
      opts.mailbox = argv[++i];
      if (!opts.mailbox || opts.mailbox.startsWith("--")) throw new Error("--mailbox_requires_value");
    } else if (token === "--limit") {
      opts.limit = validateLimit(argv[++i]);
    } else if (token === "--body-mode") {
      opts.bodyMode = validateBodyMode(argv[++i]);
    } else if (token === "--max-text-chars") {
      opts.maxTextChars = validateLimit(argv[++i], "max_text_chars");
    } else if (token === "--knowledge-limit") {
      opts.knowledgeLimit = validateLimit(argv[++i], "knowledge_limit");
    } else if (token === "--common-knowledge") {
      opts.commonKnowledgeBindingPath = argv[++i];
      if (!opts.commonKnowledgeBindingPath || opts.commonKnowledgeBindingPath.startsWith("--")) throw new Error("--common-knowledge_requires_value");
    } else {
      throw new Error(`unknown_arg:${token}`);
    }
  }
  validateProjectId(opts.projectId);
  validateBodyMode(opts.bodyMode);
  return opts;
}

function usage() {
  return [
    "Usage: node tools/haengbogwan_reading_context_packet.mjs --db <dev-erp.db> [--repo-root <runtime-root>] [--project <code>|--query <text>] [--limit N] [--body-mode subject|preview|two_stage|full] [--json]",
    "",
    "Builds a local reading context packet from core_mail. By default CLI output redacts reading_text.",
    "Adds metadata-only project knowledge overlay by default. Use --no-knowledge to skip all knowledge or --no-common-knowledge to skip shared overlays.",
    "No writes. No attachment payloads. No secrets. No wiki bodies or RAG chunks.",
    `Today: ${todayIso()}`,
  ].join("\n");
}

export function main(argv = process.argv.slice(2), { stdout = process.stdout, stderr = process.stderr } = {}) {
  try {
    const opts = parseArgs(argv);
    if (opts.help) {
      stdout.write(`${usage()}\n`);
      return 0;
    }
    const packet = buildReadingContextPacket(opts);
    stdout.write(`${JSON.stringify(opts.includeText ? packet : redactReadingContextPacket(packet), null, 2)}\n`);
    return 0;
  } catch (error) {
    stderr.write(`[haengbogwan_reading_context_packet] ${error.message}\n`);
    return 2;
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  process.exitCode = main();
}
