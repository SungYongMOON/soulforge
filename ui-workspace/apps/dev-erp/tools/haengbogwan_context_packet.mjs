#!/usr/bin/env node
// Metadata-only haengbogwan context packet builder.
// Reads project mail/task ledgers only; raw mail, attachments, workspace
// payloads, secrets, and memory/role/actor sources are intentionally not loaded.
import { existsSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { buildSnapshotForProject } from "./haengbogwan_snapshot.mjs";
import { pendingForProject } from "./mail_to_task_pending.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..", "..");
const DEFAULT_WORKMETA_ROOT = join(REPO, "_workmeta");
const SAFE_PROJECT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_LIMIT = 20;

export const MAIL_LEDGER_RELATIVE_PATH = join("reports", "메일_이력", "메일_이력.csv");
export const TASK_LEDGER_RELATIVE_PATH = join("reports", "할일_장부", "할일_장부.csv");

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function validateToday(today) {
  const normalized = String(today || todayIso()).trim();
  if (!DATE_RE.test(normalized)) throw new Error(`invalid_today:${today}`);
  return normalized;
}

function validateLimit(value, label = "limit") {
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

function compareMailRefs(a, b) {
  return String(b.received_at || "").localeCompare(String(a.received_at || ""))
    || String(a.history_key || "").localeCompare(String(b.history_key || ""));
}

function compactSnapshotSummary(snapshot) {
  return {
    pending_mail_count: snapshot.pending_mail_count ?? 0,
    unclassified_task_count: snapshot.unclassified_task_count ?? 0,
    due_today_count: snapshot.due_today_count ?? 0,
    overdue_count: snapshot.overdue_count ?? 0,
    blocked_count: snapshot.blocked_count ?? 0,
    waiting_count: snapshot.waiting_count ?? 0,
    needs_quick_triage_count: snapshot.needs_quick_triage_count ?? 0,
    raw_boundary_skip_count: snapshot.raw_boundary_skip_count ?? 0,
    next_actions: Array.isArray(snapshot.next_actions) ? snapshot.next_actions : [],
  };
}

function openTaskSummary(snapshot, limit) {
  const buckets = [
    ["overdue", snapshot.overdue],
    ["due_today", snapshot.due_today],
    ["blocked", snapshot.blocked],
    ["waiting", snapshot.waiting],
    ["needs_quick_triage", snapshot.needs_quick_triage],
  ];
  const rows = [];
  for (const [bucket, items] of buckets) {
    for (const item of Array.isArray(items) ? items : []) {
      rows.push({
        bucket,
        task_key: item.task_key || "",
        title: item.title || "",
        status: item.status || "",
        review_status: item.review_status || "",
        due: item.due || "",
        assignee: item.assignee || "",
        source_ref: item.source_ref || "",
        reasons: Array.isArray(item.reasons) ? item.reasons : [],
      });
    }
  }
  return rows.slice(0, limit);
}

function mailLineageRef(projectId, historyKey) {
  return `mailhistory:${projectId}/${MAIL_LEDGER_RELATIVE_PATH.replaceAll("\\", "/")}#${historyKey}`;
}

function mailSourceEvent(projectId, mailRef) {
  const historyKey = String(mailRef.history_key || "").trim();
  const sourceLineageRef = mailLineageRef(projectId, historyKey);
  return {
    event_ref: `mailhistory:${projectId}:${historyKey}`,
    idempotency_key: `mailtask:${historyKey}`,
    project_id: projectId,
    history_key: historyKey,
    event_type: "mail_history.pending_metadata",
    body_access: "metadata_only",
    subject: mailRef.subject || "",
    from_ref: mailRef.from || "",
    received_at: mailRef.received_at || "",
    mailbox_ref: mailRef.mailbox || "",
    due_hint: mailRef.due_hint || "",
    source_refs: {
      mail_history_ref: `mailcsv:${historyKey}`,
      mail_history_path: MAIL_LEDGER_RELATIVE_PATH.replaceAll("\\", "/"),
      source_mail_source_id: mailRef.source_id || "",
      source_lineage_ref: sourceLineageRef,
    },
  };
}

function recentMailRef(event) {
  return {
    history_key: event.history_key,
    event_ref: event.event_ref,
    received_at: event.received_at,
    subject: event.subject,
    mailbox_ref: event.mailbox_ref,
    source_refs: event.source_refs,
    body_access: event.body_access,
  };
}

function metadataBoundary(projectId, snapshot) {
  return {
    metadata_only: true,
    raw_body_loaded: false,
    attachments_loaded: false,
    workspace_payload_loaded: false,
    secret_loaded: false,
    allowed_ledger_refs: [
      join("_workmeta", String(projectId), MAIL_LEDGER_RELATIVE_PATH).replaceAll("\\", "/"),
      join("_workmeta", String(projectId), TASK_LEDGER_RELATIVE_PATH).replaceAll("\\", "/"),
    ],
    raw_boundary_skip_count: snapshot.raw_boundary_skip_count ?? 0,
    raw_boundary_skips: Array.isArray(snapshot.raw_boundary_skips) ? snapshot.raw_boundary_skips : [],
  };
}

function notLoadedNotes() {
  return {
    roles: {
      status: "not_loaded",
      reason: "role routing overlay is outside this slice",
    },
    actors: {
      status: "not_loaded",
      reason: "actor assignment overlay is outside this slice",
    },
    memory: {
      status: "not_loaded",
      reason: "persistent memory lookup is outside this metadata-only slice",
    },
  };
}

export function buildSourceEventsForProject({
  workmetaRoot = DEFAULT_WORKMETA_ROOT,
  projectId,
  limit = DEFAULT_LIMIT,
} = {}) {
  const checkedLimit = validateLimit(limit);
  const projectRoot = safeProjectRoot(workmetaRoot, projectId);
  const mailCsv = join(projectRoot, MAIL_LEDGER_RELATIVE_PATH);
  const taskCsv = join(projectRoot, TASK_LEDGER_RELATIVE_PATH);
  const pending = existsSync(mailCsv) ? pendingForProject(mailCsv, taskCsv) : [];
  return pending
    .filter((mailRef) => String(mailRef.history_key || "").trim())
    .sort(compareMailRefs)
    .slice(0, checkedLimit)
    .map((mailRef) => mailSourceEvent(String(projectId), mailRef));
}

export function buildContextPacketForProject({
  workmetaRoot = DEFAULT_WORKMETA_ROOT,
  projectId,
  limit = DEFAULT_LIMIT,
  today = todayIso(),
  generatedAt = new Date().toISOString(),
} = {}) {
  const checkedToday = validateToday(today);
  const checkedLimit = validateLimit(limit);
  safeProjectRoot(workmetaRoot, projectId);
  const sourceEvents = buildSourceEventsForProject({
    workmetaRoot,
    projectId,
    limit: checkedLimit,
  });
  const snapshot = buildSnapshotForProject({
    workmetaRoot,
    projectId,
    today: checkedToday,
    itemLimit: checkedLimit,
    rawSkipLimit: checkedLimit,
  });

  return {
    project_id: String(projectId),
    generated_at: generatedAt,
    source_events: sourceEvents,
    snapshot_summary: compactSnapshotSummary(snapshot),
    open_tasks_summary: openTaskSummary(snapshot, checkedLimit),
    recent_mail_refs: sourceEvents.map(recentMailRef).slice(0, checkedLimit),
    boundary: metadataBoundary(projectId, snapshot),
    not_loaded: notLoadedNotes(),
  };
}

function parseArgs(argv) {
  const opts = {
    workmetaRoot: DEFAULT_WORKMETA_ROOT,
    projectId: "",
    limit: DEFAULT_LIMIT,
    today: todayIso(),
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
      opts.projectId = value;
      i += 1;
    } else if (token === "--limit") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) throw new Error("--limit_requires_value");
      opts.limit = validateLimit(value);
      i += 1;
    } else if (token === "--today") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) throw new Error("--today_requires_value");
      opts.today = value;
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
    "Usage: node tools/haengbogwan_context_packet.mjs --workmeta-root <path> --project <code> [--limit N] [--today YYYY-MM-DD] [--json]",
    "",
    "Builds a metadata-only source_event/context packet from mail/task ledgers.",
  ].join("\n");
}

export function main(argv = process.argv.slice(2), { stdout = process.stdout, stderr = process.stderr } = {}) {
  try {
    const opts = parseArgs(argv);
    if (opts.help) {
      stdout.write(`${usage()}\n`);
      return 0;
    }
    if (!opts.projectId) throw new Error("--project_required");
    const packet = buildContextPacketForProject(opts);
    stdout.write(`${JSON.stringify(packet, null, 2)}\n`);
    return 0;
  } catch (error) {
    stderr.write(`[haengbogwan_context_packet] ${error.message}\n`);
    return 2;
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  process.exitCode = main();
}
