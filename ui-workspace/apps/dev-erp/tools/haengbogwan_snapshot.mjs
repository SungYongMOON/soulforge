#!/usr/bin/env node
// Metadata-only haengbogwan snapshot.
// This v0 intentionally reads only project report ledgers and never follows raw
// mail, attachment, workspace, secret, or credential pointers.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  haengbogwanMailReceiptPathForTaskCsv,
  readHandledReceiptKeys,
} from "./mail_to_task_pending.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..", "..");
const DEFAULT_WORKMETA_ROOT = join(REPO, "_workmeta");

const MAIL_REL = join("reports", "메일_이력", "메일_이력.csv");
const TASK_REL = join("reports", "할일_장부", "할일_장부.csv");

const SAFE_PROJECT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_ITEM_LIMIT = 20;
const DEFAULT_RAW_SKIP_LIMIT = 20;
const MAILTASK_RE = /^mailtask:(.+?)(?::\d+)?$/;
const MAILTASK_GLOBAL_RE = /mailtask:([^,\s]+?)(?::\d+)?(?=$|[,\s])/g;
const MAILCSV_GLOBAL_RE = /mailcsv:([^,\s]+)/g;
const MAILHISTORY_LINEAGE_RE = /mailhistory:[^#\s,]+#([^@\s,]+)/g;

const MAIL_KEY_FIELDS = ["이력키", "history_key", "메일이력키", "mail_history_key"];
const MAIL_SOURCE_FIELDS = ["메일소스ID", "source_id", "mail_source_id", "소스ID"];
const TASK_KEY_FIELDS = ["할일키", "task_key", "id"];
const TITLE_FIELDS = ["할일명", "title", "제목"];
const STATUS_FIELDS = ["상태", "status"];
const REVIEW_STATUS_FIELDS = ["검토상태", "review_status"];
const WORK_TYPE_FIELDS = ["업무유형", "work_type"];
const COMPLETION_FIELDS = ["완료기준", "completion_criteria"];
const DUE_FIELDS = ["마감일", "due", "due_date", "기한"];
const ASSIGNEE_FIELDS = ["담당자", "assignee_ref", "assignee"];
const SUGGESTED_ASSIGNEE_FIELDS = ["제안담당자", "suggested_assignee_ref", "suggested_assignee"];
const ROUTE_FIELDS = ["라우트후보", "route_candidate", "route_ref"];
const SOURCE_REF_FIELDS = ["소스메일키", "관련메일이력키", "source_mail_ref", "소스후보키", "source_candidate_ref"];
const SOURCE_ID_FIELDS = ["관련메일소스ID", "소스메일소스ID", "source_mail_source_id", "mail_source_id"];
const RELATED_MAIL_FIELDS = ["관련메일이력키", "소스메일키", "source_mail_ref", "origin_mail_id"];
const ANCHOR_STAGE_FIELDS = ["SE단계", "anchor_stage_code", "stage_code"];
const LINK_KIND_FIELDS = ["연결유형", "link_kind"];
const LINK_REF_FIELDS = ["연결대상", "link_ref", "산출물참조"];
const DONE_AT_FIELDS = ["완료일", "완료시각", "done_at", "completed_at"];
const CREATED_AT_FIELDS = ["기록일", "created_at"];

const CLOSED_RE = /(done|closed|complete|completed|cancelled|canceled|dismissed|rejected|reference_only|완료|종결|취소|기각)/i;
const UNCLASSIFIED_RE = /(unclassified|needs[_ -]?review|미분류|분류필요|검토필요|검토 필요)/i;
const BLOCKED_RE = /(blocked|blocker|stuck|막힘|차단|블록|진행불가)/i;
const WAITING_RE = /(waiting|wait|pending|on_hold|hold|대기|보류|응답대기|결정대기|확인대기)/i;
const REFERENCE_LIKELY_RE = /(reference|reference_only|참조|자료용|for your information|fyi)/i;

const RAW_FIELD_RE = /(본문|원문|raw|body|attachment|첨부|payload|secret|token|password|credential|cookie|\.env)/i;
const POINTER_FIELD_RE = /(경로|path|ref|참조|연결|대상|source|소스|메일키|이력키|산출물|attachment|첨부|payload|원문)/i;
const SECRET_REF_RE = /(^|[/\\])\.env($|[/\\])|secret|token|password|credential|cookie/i;
const WORKSPACE_REF_RE = /(^|[/\\])_workspaces([/\\]|$)/i;
const RAW_FILE_EXT_RE = /\.(hwp|hwpx|docx?|xlsx?|pptx?|pdf|zip|eml|msg)$/i;

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else if (c === "\r") {
      if (text[i + 1] !== "\n") {
        row.push(cur);
        rows.push(row);
        row = [];
        cur = "";
      }
    } else {
      cur += c;
    }
  }
  if (cur !== "" || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

function readCsvObjects(filePath) {
  if (!existsSync(filePath)) return { headers: [], rows: [] };
  const records = parseCsv(readFileSync(filePath, "utf8").replace(/^\uFEFF/, "").normalize("NFC"))
    .filter((row) => row.some((cell) => String(cell).trim() !== ""));
  if (!records.length) return { headers: [], rows: [] };
  const headers = records[0].map((header) => String(header ?? "").trim().normalize("NFC"));
  const rows = records.slice(1).map((record) => {
    const row = {};
    headers.forEach((header, index) => {
      row[header] = String(record[index] ?? "").trim();
    });
    return row;
  });
  return { headers, rows };
}

function pick(row, names, fallback = "") {
  for (const name of names) {
    const value = row?.[name];
    if (value != null && String(value).trim() !== "") return String(value).trim();
  }
  return fallback;
}

function normalizeDateOnly(value) {
  const raw = String(value ?? "").trim();
  const direct = raw.slice(0, 10);
  return DATE_RE.test(direct) ? direct : "";
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function validateToday(today) {
  const normalized = String(today || todayIso()).trim();
  if (!DATE_RE.test(normalized)) throw new Error(`invalid_today:${today}`);
  return normalized;
}

function validateLimit(value, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error(`invalid_${label}:${value}`);
  return n;
}

function safeProjectRoot(workmetaRoot, projectId) {
  const project = String(projectId ?? "").trim();
  if (!project || !SAFE_PROJECT_RE.test(project) || project.includes("..")) {
    throw new Error(`unsafe_project_id:${project || "(empty)"}`);
  }
  const root = resolve(workmetaRoot);
  const target = resolve(root, project);
  const rootPrefix = root.endsWith(sep) ? root : `${root}${sep}`;
  if (!target.startsWith(rootPrefix)) throw new Error(`project_path_escape:${project}`);
  return target;
}

function discoverProjects(workmetaRoot) {
  const root = resolve(workmetaRoot);
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((entry) => SAFE_PROJECT_RE.test(entry) && !entry.includes(".."))
    .filter((entry) => {
      const projectRoot = resolve(root, entry);
      try {
        if (!statSync(projectRoot).isDirectory()) return false;
      } catch {
        return false;
      }
      return existsSync(join(projectRoot, MAIL_REL)) || existsSync(join(projectRoot, TASK_REL));
    })
    .sort((a, b) => a.localeCompare(b));
}

function addMailKeyFromRef(convertedMailKeys, value, knownMailKeys) {
  const raw = String(value ?? "").trim();
  if (!raw) return;
  const taskMatch = MAILTASK_RE.exec(raw);
  if (taskMatch) {
    convertedMailKeys.add(taskMatch[1]);
    return;
  }
  if (raw.startsWith("mailcsv:")) {
    convertedMailKeys.add(raw.slice("mailcsv:".length));
    return;
  }
  if (knownMailKeys.has(raw)) convertedMailKeys.add(raw);
}

function collectConvertedMailRefs(taskRows, mailRows) {
  const knownMailKeys = new Set(mailRows.map((row) => pick(row, MAIL_KEY_FIELDS)).filter(Boolean));
  const convertedMailKeys = new Set();
  const convertedSourceIds = new Set();

  for (const task of taskRows) {
    addMailKeyFromRef(convertedMailKeys, pick(task, TASK_KEY_FIELDS), knownMailKeys);
    for (const field of RELATED_MAIL_FIELDS) addMailKeyFromRef(convertedMailKeys, task[field], knownMailKeys);
    for (const field of SOURCE_ID_FIELDS) {
      const sourceId = String(task[field] ?? "").trim();
      if (sourceId) convertedSourceIds.add(sourceId);
    }
    for (const value of Object.values(task)) {
      const text = String(value ?? "");
      for (const match of text.matchAll(MAILTASK_GLOBAL_RE)) convertedMailKeys.add(match[1]);
      for (const match of text.matchAll(MAILCSV_GLOBAL_RE)) convertedMailKeys.add(match[1]);
      for (const match of text.matchAll(MAILHISTORY_LINEAGE_RE)) convertedMailKeys.add(match[1]);
    }
  }

  return { convertedMailKeys, convertedSourceIds };
}

function isClosedTask(row) {
  return CLOSED_RE.test(`${pick(row, STATUS_FIELDS)} ${pick(row, REVIEW_STATUS_FIELDS)}`);
}

function isUnclassifiedTask(row) {
  const statusText = `${pick(row, STATUS_FIELDS)} ${pick(row, REVIEW_STATUS_FIELDS)}`;
  if (UNCLASSIFIED_RE.test(statusText)) return true;
  return !pick(row, WORK_TYPE_FIELDS) || !pick(row, COMPLETION_FIELDS);
}

function isBlockedTask(row) {
  return BLOCKED_RE.test(`${pick(row, STATUS_FIELDS)} ${pick(row, REVIEW_STATUS_FIELDS)}`);
}

function isWaitingTask(row) {
  return WAITING_RE.test(`${pick(row, STATUS_FIELDS)} ${pick(row, REVIEW_STATUS_FIELDS)}`);
}

function isApprovedTask(row) {
  return String(pick(row, REVIEW_STATUS_FIELDS)).trim().toLowerCase() === "approved";
}

function isReferenceLikelyTask(row) {
  return REFERENCE_LIKELY_RE.test(`${pick(row, STATUS_FIELDS)} ${pick(row, REVIEW_STATUS_FIELDS)} ${row["검토사유"] ?? ""} ${row["비고"] ?? ""}`);
}

function rawPointerReason(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (isAbsolute(raw) || /^[A-Za-z]:[\\/]/.test(raw) || /^\\\\/.test(raw)) return "absolute_path_not_read";
  if (SECRET_REF_RE.test(raw)) return "secret_like_ref_not_read";
  if (WORKSPACE_REF_RE.test(raw)) return "workspace_payload_not_read";
  if (RAW_FILE_EXT_RE.test(raw)) return "raw_payload_file_not_read";
  return "";
}

function safeAssigneeRef(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^P\d{2}-\d{3}\b/.test(raw)) return "";
  if (rawPointerReason(raw)) return "";
  if (/(^|[/\\])_workmeta([/\\]|$)/i.test(raw)) return "";
  if (/[\\/]/.test(raw)) return "";
  return raw;
}

function pickAssignee(row) {
  for (const field of [...ASSIGNEE_FIELDS, ...SUGGESTED_ASSIGNEE_FIELDS]) {
    const value = safeAssigneeRef(row?.[field]);
    if (value) return value;
  }
  return "";
}

function rowRef(row, fallbackPrefix, index) {
  return pick(row, TASK_KEY_FIELDS) || pick(row, MAIL_KEY_FIELDS) || `${fallbackPrefix}:${index + 1}`;
}

function collectRawBoundarySkips(source, rows) {
  const skips = [];
  const seen = new Set();
  rows.forEach((row, rowIndex) => {
    const ref = rowRef(row, source, rowIndex);
    for (const [field, value] of Object.entries(row)) {
      if (String(value ?? "").trim() === "") continue;
      const reason = RAW_FIELD_RE.test(field) ? "raw_or_secret_field_not_used" : (POINTER_FIELD_RE.test(field) ? rawPointerReason(value) : "");
      if (!reason) continue;
      const key = `${source}\0${ref}\0${field}\0${reason}`;
      if (seen.has(key)) continue;
      seen.add(key);
      skips.push({ source, row_ref: ref, field, reason });
    }
  });
  return skips;
}

function taskSummary(row, extra = {}) {
  const assignee = pickAssignee(row);
  const sourceRef = pick(row, SOURCE_REF_FIELDS);
  return {
    task_key: pick(row, TASK_KEY_FIELDS),
    title: pick(row, TITLE_FIELDS),
    status: pick(row, STATUS_FIELDS),
    review_status: pick(row, REVIEW_STATUS_FIELDS),
    due: normalizeDateOnly(pick(row, DUE_FIELDS)),
    assignee,
    source_ref: rawPointerReason(sourceRef) ? "" : sourceRef,
    anchor_stage_code: pick(row, ANCHOR_STAGE_FIELDS),
    link_kind: pick(row, LINK_KIND_FIELDS),
    link_ref: pick(row, LINK_REF_FIELDS),
    done_at: pick(row, DONE_AT_FIELDS),
    created_at: pick(row, CREATED_AT_FIELDS),
    ...extra,
  };
}

function compareTaskSummaries(a, b) {
  return (a.due || "9999-99-99").localeCompare(b.due || "9999-99-99")
    || (a.task_key || "").localeCompare(b.task_key || "")
    || (a.title || "").localeCompare(b.title || "");
}

function quickTriageReasons(row) {
  const reasons = [];
  if (isUnclassifiedTask(row)) reasons.push("unclassified");
  if (!normalizeDateOnly(pick(row, DUE_FIELDS))) reasons.push("missing_due");
  if (!pickAssignee(row)) reasons.push("missing_assignee");
  if (isReferenceLikelyTask(row) && !isClosedTask(row)) reasons.push("reference_likely");
  return [...new Set(reasons)];
}

function buildNextActions(snapshot, quickTriageTotal) {
  const actions = [];
  const overdueCount = snapshot.overdue_count ?? snapshot.overdue.length;
  const dueTodayCount = snapshot.due_today_count ?? snapshot.due_today.length;
  const blockedCount = snapshot.blocked_count ?? snapshot.blocked.length;
  const waitingCount = snapshot.waiting_count ?? snapshot.waiting.length;
  if (overdueCount) actions.push(`overdue:${overdueCount}:review_due_owner`);
  if (dueTodayCount) actions.push(`due_today:${dueTodayCount}:confirm_completion_plan`);
  if (snapshot.pending_mail_count) actions.push(`pending_mail:${snapshot.pending_mail_count}:classify_mail_to_task`);
  if (snapshot.unclassified_task_count) actions.push(`unclassified:${snapshot.unclassified_task_count}:fill_work_type_and_completion_criteria`);
  if (blockedCount) actions.push(`blocked:${blockedCount}:clear_blocker_or_mark_owner_decision`);
  if (waitingCount) actions.push(`waiting:${waitingCount}:check_response_or_snooze`);
  if (quickTriageTotal) actions.push(`quick_triage:${quickTriageTotal}:resolve_top_items`);
  if (!actions.length) actions.push("snapshot_clear:no_immediate_metadata_risk");
  return actions;
}

export function buildSnapshotForProject({
  workmetaRoot = DEFAULT_WORKMETA_ROOT,
  projectId,
  today = todayIso(),
  itemLimit = DEFAULT_ITEM_LIMIT,
  rawSkipLimit = DEFAULT_RAW_SKIP_LIMIT,
}) {
  const checkedToday = validateToday(today);
  const checkedItemLimit = validateLimit(itemLimit, "item_limit");
  const checkedRawSkipLimit = validateLimit(rawSkipLimit, "raw_skip_limit");
  const projectRoot = safeProjectRoot(workmetaRoot, projectId);
  const mail = readCsvObjects(join(projectRoot, MAIL_REL));
  const taskPath = join(projectRoot, TASK_REL);
  const task = readCsvObjects(taskPath);
  const { convertedMailKeys, convertedSourceIds } = collectConvertedMailRefs(task.rows, mail.rows);
  for (const key of readHandledReceiptKeys(haengbogwanMailReceiptPathForTaskCsv(taskPath))) convertedMailKeys.add(key);

  const pendingMailRows = mail.rows.filter((row) => {
    const key = pick(row, MAIL_KEY_FIELDS);
    const sourceId = pick(row, MAIL_SOURCE_FIELDS);
    return !(key && convertedMailKeys.has(key)) && !(sourceId && convertedSourceIds.has(sourceId));
  });

  const activeTaskRows = task.rows.filter((row) => !isClosedTask(row));
  const unclassifiedTaskRows = activeTaskRows.filter(isUnclassifiedTask);

  const dueToday = [];
  const overdue = [];
  for (const row of activeTaskRows) {
    const due = normalizeDateOnly(pick(row, DUE_FIELDS));
    if (!due) continue;
    if (due === checkedToday) dueToday.push(taskSummary(row));
    else if (due < checkedToday) overdue.push(taskSummary(row));
  }

  const blocked = activeTaskRows.filter(isBlockedTask).map((row) => taskSummary(row));
  const waiting = activeTaskRows.filter((row) => isWaitingTask(row) && !isBlockedTask(row)).map((row) => taskSummary(row));
  const quickTriageRows = [];
  for (const row of activeTaskRows) {
    const reasons = quickTriageReasons(row);
    if (reasons.length) quickTriageRows.push(taskSummary(row, { reasons }));
  }
  const approvedWorkItems = task.rows
    .filter(isApprovedTask)
    .map((row) => taskSummary(row))
    .sort(compareTaskSummaries);
  quickTriageRows.sort(compareTaskSummaries);
  const sortedDueToday = dueToday.sort(compareTaskSummaries);
  const sortedOverdue = overdue.sort(compareTaskSummaries);
  const sortedBlocked = blocked.sort(compareTaskSummaries);
  const sortedWaiting = waiting.sort(compareTaskSummaries);
  const rawBoundarySkips = [
    ...collectRawBoundarySkips("mail_history", mail.rows),
    ...collectRawBoundarySkips("task_ledger", task.rows),
  ];

  const snapshot = {
    project_id: String(projectId),
    pending_mail_count: pendingMailRows.length,
    unclassified_task_count: unclassifiedTaskRows.length,
    due_today_count: sortedDueToday.length,
    overdue_count: sortedOverdue.length,
    blocked_count: sortedBlocked.length,
    waiting_count: sortedWaiting.length,
    needs_quick_triage_count: quickTriageRows.length,
    approved_work_item_count: approvedWorkItems.length,
    raw_boundary_skip_count: rawBoundarySkips.length,
    due_today: sortedDueToday.slice(0, checkedItemLimit),
    overdue: sortedOverdue.slice(0, checkedItemLimit),
    blocked: sortedBlocked.slice(0, checkedItemLimit),
    waiting: sortedWaiting.slice(0, checkedItemLimit),
    needs_quick_triage: quickTriageRows.slice(0, Math.min(checkedItemLimit, 5)),
    approved_work_items: approvedWorkItems,
    raw_boundary_skips: rawBoundarySkips.slice(0, checkedRawSkipLimit),
    next_actions: [],
  };
  snapshot.next_actions = buildNextActions(snapshot, quickTriageRows.length);
  return snapshot;
}

export function buildSnapshots({
  workmetaRoot = DEFAULT_WORKMETA_ROOT,
  projects = [],
  today = todayIso(),
  itemLimit = DEFAULT_ITEM_LIMIT,
  rawSkipLimit = DEFAULT_RAW_SKIP_LIMIT,
} = {}) {
  const targetProjects = projects.length ? projects : discoverProjects(workmetaRoot);
  return targetProjects.map((projectId) => buildSnapshotForProject({
    workmetaRoot,
    projectId,
    today,
    itemLimit,
    rawSkipLimit,
  }));
}

function parseArgs(argv) {
  const opts = {
    workmetaRoot: DEFAULT_WORKMETA_ROOT,
    projects: [],
    today: todayIso(),
    itemLimit: DEFAULT_ITEM_LIMIT,
    rawSkipLimit: DEFAULT_RAW_SKIP_LIMIT,
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--help" || token === "-h") {
      opts.help = true;
    } else if (token === "--json") {
      opts.json = true;
    } else if (token === "--workmeta-root" || token === "--workmeta") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) throw new Error(`${token}_requires_value`);
      opts.workmetaRoot = value;
      i += 1;
    } else if (token === "--project") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) throw new Error("--project_requires_value");
      opts.projects.push(...value.split(",").map((part) => part.trim()).filter(Boolean));
      i += 1;
    } else if (token === "--today") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) throw new Error("--today_requires_value");
      opts.today = value;
      i += 1;
    } else if (token === "--item-limit") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) throw new Error("--item-limit_requires_value");
      opts.itemLimit = validateLimit(value, "item_limit");
      i += 1;
    } else if (token === "--raw-skip-limit") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) throw new Error("--raw-skip-limit_requires_value");
      opts.rawSkipLimit = validateLimit(value, "raw_skip_limit");
      i += 1;
    } else {
      throw new Error(`unknown_arg:${token}`);
    }
  }
  opts.today = validateToday(opts.today);
  return opts;
}

function usage() {
  return [
    "Usage: node tools/haengbogwan_snapshot.mjs --workmeta-root <path> --project <code>[,<code>] [--project <code>] [--today YYYY-MM-DD] [--item-limit N] [--raw-skip-limit N] [--json]",
    "",
    "Outputs a metadata-only JSON array of per-project haengbogwan snapshots.",
  ].join("\n");
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.help) {
      process.stdout.write(`${usage()}\n`);
      process.exit(0);
    }
    const snapshots = buildSnapshots(opts);
    process.stdout.write(`${JSON.stringify(snapshots, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`[haengbogwan_snapshot] ${error.message}\n`);
    process.exit(2);
  }
}
