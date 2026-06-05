import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

import {
  pathExists,
  readJson,
  relativeToRepo,
} from "../shared/io.mjs";
import {
  defaultMailWorkPriorityLatestFile,
} from "./mail_work_status.mjs";

export const DEADLINE_WATCH_IMPORT_SCHEMA_VERSION = "soulforge.gateway.deadline_watch_import.v0";

export const DEADLINE_REGISTER_HEADERS = [
  "deadline_id",
  "project_code",
  "source_kind",
  "source_ref",
  "subject_hint",
  "action_type",
  "due_at",
  "due_text",
  "confidence",
  "status",
  "owner_or_contact",
  "completion_ref",
  "next_nudge_at",
  "last_nudged_at",
  "nudge_count",
  "snooze_until",
  "claim_ceiling",
  "raw_payload_copied",
  "created_at",
  "updated_at",
];

const TERMINAL_WORK_STATUSES = new Set(["completed", "completed_with_follow_up", "blocked", "failed"]);
const PROJECT_CODE_PATTERN = /^P\d{2}-\d{3}$/u;
const P00_PROJECT_CODE = "P00-000_INBOX";
const ALLOWED_DUE_SOURCES = new Set(["gateway_d_day", "subject"]);
const ALLOWED_DEADLINE_CONFIDENCES = new Set([
  "structured_d_day",
  "subject_full_date",
  "subject_short_year_date",
  "subject_month_day",
]);
const ALLOWED_ACTION_TYPES = new Set(["reply_due", "submit_due", "review_due", "meeting", "confirm", "delivery", "follow_up"]);
const ALLOWED_REGISTER_CONFIDENCES = new Set(["structured", "subject_date", "body_derived_needs_review", "owner_confirmed", "text_only"]);
const ALLOWED_REGISTER_STATUSES = new Set(["open", "waiting", "sent", "blocked", "done", "cancelled", "superseded", "snoozed"]);
const ALLOWED_CLAIM_CEILINGS = new Set(["observed", "owner_confirmed", "completed_by_evidence", "rejected_or_blocked"]);
const ALLOWED_REMINDER_EVENT_TYPES = new Set([
  "ledger_initialized",
  "reminder_candidate_created",
  "reminder_candidate_suppressed",
  "manual_snooze",
  "manual_hold",
  "manual_close",
  "completion_ref_added",
]);
const BANNED_PAYLOAD_MARKER = /body_text|body_html|provider_payload|local_path|provider_attachment_id|password|cookie|secret|token|attachment_url|download_url/iu;

export function defaultDeadlineWatchRoot(repoRoot, projectCode) {
  return path.join(repoRoot, "_workmeta", projectCode, "reports", "deadline_watch");
}

export function defaultDeadlineRegisterFile(repoRoot, projectCode) {
  return path.join(defaultDeadlineWatchRoot(repoRoot, projectCode), "deadline_register.csv");
}

export async function importDueObservationsFromMailPriority({
  repoRoot,
  latestFile = defaultMailWorkPriorityLatestFile(repoRoot),
  workmetaRoot = path.join(repoRoot, "_workmeta"),
  apply = false,
  projectCode = "",
  now = new Date().toISOString(),
} = {}) {
  if (!repoRoot) {
    throw new Error("repoRoot is required");
  }
  if (apply) {
    assertCanonicalWorkmetaRoot({ repoRoot, workmetaRoot });
  }

  const projection = await readJson(latestFile);
  validateMailWorkPriorityProjection(projection);
  const normalizedProjectCode = projectCode ? normalizeProjectCode(projectCode) : "";
  const built = buildDeadlineWatchRowsFromPriorityProjection(projection, {
    now,
    projectCode: normalizedProjectCode,
  });

  let applyResult = {
    written_count: 0,
    duplicate_count: 0,
    written_refs: [],
    skipped_refs: [],
  };

  if (apply) {
    applyResult = await writeDeadlineRows({
      repoRoot,
      workmetaRoot,
      rows: built.rows,
    });
  }

  return {
    schema_version: DEADLINE_WATCH_IMPORT_SCHEMA_VERSION,
    kind: "deadline_watch_due_observation_import",
    status: apply ? "applied" : "dry_run",
    generated_at: now,
    projection_ref: relativeToRepo(repoRoot, latestFile),
    project_filter: normalizedProjectCode || null,
    source_count: built.source_count,
    importable_count: built.rows.length,
    skipped_count: built.skipped.length,
    project_counts: countByProject(built.rows),
    rows: built.rows,
    skipped: built.skipped,
    ...applyResult,
    boundary: {
      raw_payload_copied: false,
      raw_mail_body_read: false,
      raw_html_read: false,
      attachment_payload_read: false,
      apply_requested: Boolean(apply),
    },
  };
}

export async function validateDeadlineWatchLedgers({
  repoRoot,
  workmetaRoot = path.join(repoRoot, "_workmeta"),
} = {}) {
  if (!repoRoot) {
    throw new Error("repoRoot is required");
  }
  assertCanonicalWorkmetaRoot({ repoRoot, workmetaRoot });

  const errors = [];
  let checkedRegisterCount = 0;
  let checkedRowCount = 0;
  let checkedEventLogCount = 0;
  let checkedEventCount = 0;

  if (!(await pathExists(workmetaRoot))) {
    return deadlineValidationResult({ errors, checkedRegisterCount, checkedRowCount, checkedEventLogCount, checkedEventCount });
  }

  const projectEntries = await fs.readdir(workmetaRoot, { withFileTypes: true });
  for (const projectEntry of projectEntries) {
    if (!projectEntry.isDirectory()) {
      continue;
    }
    const projectCode = projectEntry.name;
    const deadlineRoot = path.join(workmetaRoot, projectCode, "reports", "deadline_watch");
    if (!(await pathExists(deadlineRoot))) {
      continue;
    }

    const registerFile = path.join(deadlineRoot, "deadline_register.csv");
    if (await pathExists(registerFile)) {
      checkedRegisterCount += 1;
      const rows = await validateDeadlineRegisterFile({ registerFile, projectCode, errors, repoRoot });
      checkedRowCount += rows.length;
    }

    const eventLogFile = path.join(deadlineRoot, "reminder_event_log.jsonl");
    if (await pathExists(eventLogFile)) {
      checkedEventLogCount += 1;
      checkedEventCount += await validateReminderEventLogFile({ eventLogFile, projectCode, errors, repoRoot });
    }
  }

  return deadlineValidationResult({ errors, checkedRegisterCount, checkedRowCount, checkedEventLogCount, checkedEventCount });
}

export function buildDeadlineWatchRowsFromPriorityProjection(projection, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const projectFilter = options.projectCode ? normalizeProjectCode(options.projectCode) : "";
  const entries = Array.isArray(projection?.entries) ? projection.entries : [];
  const rows = [];
  const skipped = [];

  for (const entry of entries) {
    const decision = buildDeadlineRowFromPriorityEntry(entry, { now });
    if (!decision.row) {
      skipped.push(decision.skipped);
      continue;
    }
    if (projectFilter && decision.row.project_code !== projectFilter) {
      skipped.push({
        source_ref: decision.row.source_ref,
        reason: `project_filter:${projectFilter}`,
      });
      continue;
    }
    rows.push(decision.row);
  }

  rows.sort(compareDeadlineRows);

  return {
    source_count: entries.length,
    rows,
    skipped,
  };
}

function buildDeadlineRowFromPriorityEntry(entry, { now }) {
  const sourceRef = resolveSourceRef(entry);

  if (!entry || typeof entry !== "object") {
    return skip(sourceRef, "invalid_entry");
  }
  if (entry.boundary?.raw_payload_copied === true) {
    return skip(sourceRef, "raw_payload_boundary_failed");
  }
  if (!entry.due_date) {
    return skip(sourceRef, "no_deterministic_due_date");
  }
  if (!ALLOWED_DUE_SOURCES.has(String(entry.due_source ?? ""))) {
    return skip(sourceRef, `unsupported_due_source:${entry.due_source ?? "missing"}`);
  }
  if (!ALLOWED_DEADLINE_CONFIDENCES.has(String(entry.deadline_confidence ?? ""))) {
    return skip(sourceRef, `unsupported_deadline_confidence:${entry.deadline_confidence ?? "missing"}`);
  }
  if (TERMINAL_WORK_STATUSES.has(String(entry.work_status ?? ""))) {
    return skip(sourceRef, "terminal_work_status");
  }
  if (entry.route_candidate === "none/personal" || entry.route_candidate === "none/promo") {
    return skip(sourceRef, `non_project_route:${entry.route_candidate}`);
  }

  const projectCode = resolveTargetProjectCode(entry);
  if (!projectCode) {
    return skip(sourceRef, "route_not_safe_for_deadline_watch");
  }

  const actionType = inferActionType(entry.subject);
  const row = {
    deadline_id: buildDeadlineId(projectCode, sourceRef, entry.due_date, actionType),
    project_code: projectCode,
    source_kind: "mail",
    source_ref: sourceRef,
    subject_hint: truncateText(entry.subject, 160),
    action_type: actionType,
    due_at: entry.due_date,
    due_text: truncateText(entry.due_text, 120),
    confidence: mapDeadlineConfidence(entry),
    status: "open",
    owner_or_contact: "",
    completion_ref: "",
    next_nudge_at: "",
    last_nudged_at: "",
    nudge_count: "0",
    snooze_until: "",
    claim_ceiling: "observed",
    raw_payload_copied: "false",
    created_at: now,
    updated_at: now,
  };

  return { row, skipped: null };
}

function skip(sourceRef, reason) {
  return {
    row: null,
    skipped: {
      source_ref: sourceRef || null,
      reason,
    },
  };
}

function resolveTargetProjectCode(entry) {
  const routeCandidate = String(entry.route_candidate ?? "");
  const routeConfidence = String(entry.route_confidence ?? "");

  if (PROJECT_CODE_PATTERN.test(routeCandidate) && routeConfidence === "exact") {
    return routeCandidate;
  }
  if (routeCandidate === P00_PROJECT_CODE || routeConfidence === "review") {
    return P00_PROJECT_CODE;
  }
  return null;
}

function resolveSourceRef(entry) {
  return firstNonEmpty(
    entry?.refs?.candidate_ref,
    entry?.candidate_id ? `mail_candidate:${entry.candidate_id}` : "",
    entry?.mail_source_ref ? `mail_event:${entry.mail_source_ref}` : "",
  );
}

function inferActionType(subject) {
  const text = String(subject ?? "").toLowerCase();
  if (/회신|답변|reply/u.test(text)) {
    return "reply_due";
  }
  if (/제출|송부|납품|submit|deliver/u.test(text)) {
    return "submit_due";
  }
  if (/검토|확인|review|confirm/u.test(text)) {
    return "review_due";
  }
  return "follow_up";
}

function mapDeadlineConfidence(entry) {
  if (entry.due_source === "gateway_d_day" || entry.deadline_confidence === "structured_d_day") {
    return "structured";
  }
  if (entry.due_source === "subject" || String(entry.deadline_confidence ?? "").startsWith("subject_")) {
    return "subject_date";
  }
  return "text_only";
}

function validateMailWorkPriorityProjection(projection) {
  if (!projection || typeof projection !== "object") {
    throw new Error("mail work priority projection must be an object");
  }
  if (projection.schema_version !== "soulforge.gateway.mail_work_priority.v1") {
    throw new Error("mail work priority projection schema_version mismatch");
  }
  if (projection.kind !== "mail_work_priority_projection") {
    throw new Error("mail work priority projection kind mismatch");
  }
  if (projection.boundary?.raw_payload_copied !== false) {
    throw new Error("mail work priority projection boundary must declare raw_payload_copied=false");
  }
  if (!Array.isArray(projection.entries)) {
    throw new Error("mail work priority projection entries must be an array");
  }
}

async function writeDeadlineRows({ repoRoot, workmetaRoot, rows }) {
  const grouped = groupByProject(rows);
  const writtenRefs = [];
  const skippedRefs = [];
  let writtenCount = 0;
  let duplicateCount = 0;

  for (const [projectCode, projectRows] of grouped.entries()) {
    const registerFile = deadlineRegisterFileForWorkmetaRoot(workmetaRoot, projectCode);
    assertDeadlineRegisterPath({ workmetaRoot, registerFile });

    const existingRows = await readDeadlineRegisterRows(registerFile);
    const existingIds = new Set(existingRows.map((row) => row.deadline_id).filter(Boolean));
    const newRows = [];

    for (const row of projectRows) {
      if (existingIds.has(row.deadline_id)) {
        duplicateCount += 1;
        skippedRefs.push(`${relativeToRepo(repoRoot, registerFile)}#deadline_id=${row.deadline_id}`);
        continue;
      }
      existingIds.add(row.deadline_id);
      newRows.push(row);
    }

    if (newRows.length === 0) {
      continue;
    }

    await fs.mkdir(path.dirname(registerFile), { recursive: true });
    const merged = [...existingRows, ...newRows].sort(compareDeadlineRows);
    await fs.writeFile(registerFile, renderDeadlineRegisterCsv(merged), "utf8");
    writtenCount += newRows.length;
    for (const row of newRows) {
      writtenRefs.push(`${relativeToRepo(repoRoot, registerFile)}#deadline_id=${row.deadline_id}`);
    }
  }

  return {
    written_count: writtenCount,
    duplicate_count: duplicateCount,
    written_refs: writtenRefs,
    skipped_refs: skippedRefs,
  };
}

async function validateDeadlineRegisterFile({ registerFile, projectCode, errors, repoRoot }) {
  let rows = [];
  try {
    rows = await readDeadlineRegisterRows(registerFile);
  } catch (error) {
    errors.push({
      ref: relativeToRepo(repoRoot, registerFile),
      reason: error.message,
    });
    return rows;
  }

  for (const row of rows) {
    const ref = `${relativeToRepo(repoRoot, registerFile)}#deadline_id=${row.deadline_id || "missing"}`;
    if (!row.deadline_id) {
      errors.push({ ref, field: "deadline_id", reason: "missing" });
    }
    if (row.project_code !== projectCode) {
      errors.push({ ref, field: "project_code", reason: "project_code_must_match_folder" });
    }
    if (!ALLOWED_ACTION_TYPES.has(row.action_type)) {
      errors.push({ ref, field: "action_type", reason: "unsupported_action_type" });
    }
    if (!ALLOWED_REGISTER_CONFIDENCES.has(row.confidence)) {
      errors.push({ ref, field: "confidence", reason: "unsupported_confidence" });
    }
    if (!ALLOWED_REGISTER_STATUSES.has(row.status)) {
      errors.push({ ref, field: "status", reason: "unsupported_status" });
    }
    if (!ALLOWED_CLAIM_CEILINGS.has(row.claim_ceiling)) {
      errors.push({ ref, field: "claim_ceiling", reason: "unsupported_claim_ceiling" });
    }
    if (row.raw_payload_copied !== "false") {
      errors.push({ ref, field: "raw_payload_copied", reason: "must_be_false" });
    }
    if (row.due_at && !normalizeDeadlineDate(row.due_at)) {
      errors.push({ ref, field: "due_at", reason: "invalid_due_at" });
    }
    if (row.snooze_until && !normalizeDeadlineDate(row.snooze_until)) {
      errors.push({ ref, field: "snooze_until", reason: "invalid_snooze_until" });
    }
    if (["done", "cancelled", "superseded"].includes(row.status) && !row.completion_ref) {
      errors.push({ ref, field: "completion_ref", reason: "terminal_status_requires_completion_ref" });
    }
    if (row.status === "snoozed" && !row.snooze_until) {
      errors.push({ ref, field: "snooze_until", reason: "snoozed_status_requires_snooze_until" });
    }
    for (const [field, value] of Object.entries(row)) {
      if (BANNED_PAYLOAD_MARKER.test(String(value ?? ""))) {
        errors.push({ ref, field, reason: "banned_payload_or_secret_marker" });
      }
    }
  }

  return rows;
}

async function validateReminderEventLogFile({ eventLogFile, projectCode, errors, repoRoot }) {
  const raw = await fs.readFile(eventLogFile, "utf8");
  const lines = raw.split(/\r?\n/u).filter((line) => line.trim() !== "");
  let checked = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const ref = `${relativeToRepo(repoRoot, eventLogFile)}#L${index + 1}`;
    let event;
    try {
      event = JSON.parse(lines[index]);
    } catch (error) {
      errors.push({ ref, reason: `json_parse_error:${error.message}` });
      continue;
    }
    checked += 1;
    if (!ALLOWED_REMINDER_EVENT_TYPES.has(event.event_type)) {
      errors.push({ ref, field: "event_type", reason: "unsupported_event_type" });
    }
    if (event.project_code !== projectCode) {
      errors.push({ ref, field: "project_code", reason: "project_code_must_match_folder" });
    }
    if (event.raw_payload_copied !== false) {
      errors.push({ ref, field: "raw_payload_copied", reason: "must_be_false" });
    }
    for (const [field, value] of Object.entries(event)) {
      if (BANNED_PAYLOAD_MARKER.test(String(value ?? ""))) {
        errors.push({ ref, field, reason: "banned_payload_or_secret_marker" });
      }
    }
  }

  return checked;
}

function deadlineValidationResult({ errors, checkedRegisterCount, checkedRowCount, checkedEventLogCount, checkedEventCount }) {
  return {
    schema_version: "soulforge.deadline_watch.validation.v0",
    kind: "deadline_watch_validation",
    status: errors.length === 0 ? "pass" : "fail",
    checked_register_count: checkedRegisterCount,
    checked_row_count: checkedRowCount,
    checked_event_log_count: checkedEventLogCount,
    checked_event_count: checkedEventCount,
    error_count: errors.length,
    errors,
    boundary: {
      raw_payload_copied: false,
      raw_mail_body_read: false,
      raw_html_read: false,
      attachment_payload_read: false,
    },
  };
}

function deadlineRegisterFileForWorkmetaRoot(workmetaRoot, projectCode) {
  return path.join(workmetaRoot, projectCode, "reports", "deadline_watch", "deadline_register.csv");
}

function assertCanonicalWorkmetaRoot({ repoRoot, workmetaRoot }) {
  const expectedRoot = path.resolve(repoRoot, "_workmeta");
  const actualRoot = path.resolve(workmetaRoot);
  if (actualRoot !== expectedRoot) {
    throw new Error("deadline watch apply must use the canonical repo _workmeta root");
  }
}

function assertDeadlineRegisterPath({ workmetaRoot, registerFile }) {
  const relative = path.relative(workmetaRoot, registerFile).split(path.sep).join("/");
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("deadline register output must stay under _workmeta");
  }
  if (!/^[^/]+\/reports\/deadline_watch\/deadline_register[.]csv$/u.test(relative)) {
    throw new Error("deadline register output must stay under _workmeta/<project_code>/reports/deadline_watch/deadline_register.csv");
  }
}

function normalizeDeadlineDate(value) {
  const text = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/u.test(text)) {
    return text;
  }
  const parsed = new Date(text);
  if (!Number.isFinite(parsed.getTime())) {
    return "";
  }
  return parsed.toISOString();
}

export async function readDeadlineRegisterRows(registerFile) {
  if (!(await pathExists(registerFile))) {
    return [];
  }

  const raw = await fs.readFile(registerFile, "utf8");
  const lines = raw.replace(/^\uFEFF/u, "").split(/\r?\n/u).filter((line) => line.trim() !== "");
  if (lines.length === 0) {
    return [];
  }

  const header = parseCsvLine(lines[0]);
  if (header.join(",") !== DEADLINE_REGISTER_HEADERS.join(",")) {
    throw new Error(`deadline register header mismatch: ${registerFile}`);
  }

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(DEADLINE_REGISTER_HEADERS.map((column, index) => [column, values[index] ?? ""]));
  });
}

function renderDeadlineRegisterCsv(rows) {
  return [
    DEADLINE_REGISTER_HEADERS.map(csvEscape).join(","),
    ...rows.map((row) => DEADLINE_REGISTER_HEADERS.map((header) => csvEscape(row[header] ?? "")).join(",")),
  ].join("\n") + "\n";
}

function parseCsvLine(line) {
  const cells = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }

  cells.push(cell);
  return cells;
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\r\n]/u.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function buildDeadlineId(projectCode, sourceRef, dueAt, actionType) {
  const digest = createHash("sha256")
    .update(`${projectCode}|${sourceRef}|${dueAt}|${actionType}`)
    .digest("hex")
    .slice(0, 16);
  return `DWL-${projectCode}-${digest}`;
}

function groupByProject(rows) {
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.project_code)) {
      grouped.set(row.project_code, []);
    }
    grouped.get(row.project_code).push(row);
  }
  return grouped;
}

function countByProject(rows) {
  const counts = {};
  for (const row of rows) {
    counts[row.project_code] = Number(counts[row.project_code] ?? 0) + 1;
  }
  return counts;
}

function compareDeadlineRows(left, right) {
  return (
    String(left.project_code).localeCompare(String(right.project_code)) ||
    String(left.due_at).localeCompare(String(right.due_at)) ||
    String(left.source_ref).localeCompare(String(right.source_ref)) ||
    String(left.deadline_id).localeCompare(String(right.deadline_id))
  );
}

function normalizeProjectCode(value) {
  const text = String(value ?? "").trim();
  if (text === P00_PROJECT_CODE || PROJECT_CODE_PATTERN.test(text)) {
    return text;
  }
  throw new Error(`unsupported project code for deadline watch import: ${text}`);
}

function truncateText(value, limit) {
  const text = String(value ?? "");
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, Math.max(0, limit - 3))}...`;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) {
      return text;
    }
  }
  return "";
}
