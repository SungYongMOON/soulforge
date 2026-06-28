#!/usr/bin/env node
// Metadata-only haengbogwan context packet builder.
// Reads project mail/task ledgers only; raw mail, attachments, workspace
// payloads, secrets, and memory/role/actor sources are intentionally not loaded.
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { Store } from "../src/store.mjs";
import { buildSnapshotForProject } from "./haengbogwan_snapshot.mjs";
import { pendingForProject } from "./mail_to_task_pending.mjs";
import { buildProjectKnowledgeOverlay } from "./haengbogwan_project_knowledge_overlay.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..");
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

function resolveDbPath(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  const candidates = [resolve(process.cwd(), value), resolve(APP, value)];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error("db_not_found");
}

function compactCapabilities(capabilities, limit) {
  return (Array.isArray(capabilities) ? capabilities : [])
    .slice(0, limit)
    .map((cap) => ({
      capability: String(cap.capability ?? "").trim(),
      label: String(cap.label ?? "").trim(),
    }))
    .filter((cap) => cap.capability);
}

function loadDbProjectionOverlay({ dbPath = "", projectId, limit = DEFAULT_LIMIT } = {}) {
  const resolvedDbPath = resolveDbPath(dbPath);
  if (!resolvedDbPath) {
    return {
      role_overlay: [],
      actor_overlay: [],
      roles: { loaded: false },
      actors: { loaded: false },
    };
  }

  const checkedLimit = validateLimit(limit, "overlay_limit");
  const db = new DatabaseSync(resolvedDbPath, { readOnly: true });
  const store = new Store(db);
  try {
    const orgUnits = store.listRoleOrgUnits();
    const capabilitiesByOrg = new Map(orgUnits.map((org) => [
      org.org_unit_ref,
      compactCapabilities(org.capabilities, checkedLimit),
    ]));
    const projectAssignments = store.listRoleProjectAssignments({
      project_code: String(projectId ?? "").trim(),
      active_only: true,
    });
    const actors = store.listRoleActors({ active_only: true });
    const role_overlay = projectAssignments.slice(0, checkedLimit).map((row) => ({
      project_code: row.project_code,
      role_area: row.role_area,
      role_ref: `${row.project_code}:${row.role_area}`,
      team_ref: row.owning_org_unit_ref ?? "",
      owning_org_unit_ref: row.owning_org_unit_ref ?? "",
      primary_person_ref: row.primary_person_ref ?? "",
      backup_person_refs: Array.isArray(row.backup_person_refs) ? row.backup_person_refs : [],
      confidence: row.confidence ?? "",
      status: row.status ?? "",
      capabilities: capabilitiesByOrg.get(row.owning_org_unit_ref) ?? [],
    }));
    const actor_overlay = actors.slice(0, checkedLimit).map((actor) => ({
      actor_ref: actor.actor_ref,
      kind: actor.actor_type,
      actor_type: actor.actor_type,
      name: actor.display_name,
      team_ref: actor.team_ref ?? "",
      authority: actor.authority ?? "",
      approval_required: actor.approval_required === true,
      handoff_to_ref: actor.handoff_to_ref ?? "",
      status: actor.status ?? "",
      capabilities: compactCapabilities(actor.capabilities, checkedLimit),
      forbidden_action_refs: (Array.isArray(actor.forbidden_actions) ? actor.forbidden_actions : [])
        .slice(0, checkedLimit)
        .map((action) => String(action ?? "").trim())
        .filter(Boolean),
    }));
    return {
      role_overlay,
      actor_overlay,
      roles: { loaded: true, count: role_overlay.length, total: projectAssignments.length },
      actors: { loaded: true, count: actor_overlay.length, total: actors.length },
    };
  } finally {
    db.close();
  }
}

function notLoadedNotes({ roles = { loaded: false }, actors = { loaded: false } } = {}) {
  return {
    roles: roles.loaded ? {
      status: "loaded_from_db_projection",
      count: roles.count ?? 0,
      total_available: roles.total ?? roles.count ?? 0,
      reason: "role routing overlay was read from dev-ERP metadata projection tables",
    } : {
      status: "not_loaded",
      reason: "role routing overlay is outside this slice",
    },
    actors: actors.loaded ? {
      status: "loaded_from_db_projection",
      count: actors.count ?? 0,
      total_available: actors.total ?? actors.count ?? 0,
      reason: "actor routing overlay was read from dev-ERP metadata projection tables",
    } : {
      status: "not_loaded",
      reason: "actor assignment overlay is outside this slice",
    },
    memory: {
      status: "not_loaded",
      reason: "persistent memory lookup is outside this metadata-only slice",
    },
  };
}

export function enrichContextPacketWithDbProjection(contextPacket, {
  dbPath = "",
  limit = DEFAULT_LIMIT,
} = {}) {
  if (!dbPath) return contextPacket;
  const projectId = String(contextPacket?.project_id ?? "").trim();
  if (!projectId) throw new Error("context_project_required_for_db_projection");
  const overlay = loadDbProjectionOverlay({ dbPath, projectId, limit });
  return {
    ...contextPacket,
    role_overlay: overlay.role_overlay,
    actor_overlay: overlay.actor_overlay,
    not_loaded: notLoadedNotes({ roles: overlay.roles, actors: overlay.actors }),
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
  repoRoot = REPO,
  projectId,
  limit = DEFAULT_LIMIT,
  today = todayIso(),
  generatedAt = new Date().toISOString(),
  dbPath = "",
  includeKnowledge = true,
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

  const packet = {
    project_id: String(projectId),
    generated_at: generatedAt,
    source_events: sourceEvents,
    snapshot_summary: compactSnapshotSummary(snapshot),
    open_tasks_summary: openTaskSummary(snapshot, checkedLimit),
    recent_mail_refs: sourceEvents.map(recentMailRef).slice(0, checkedLimit),
    boundary: metadataBoundary(projectId, snapshot),
    not_loaded: notLoadedNotes(),
  };
  if (includeKnowledge) {
    packet.knowledge_context = buildProjectKnowledgeOverlay({
      repoRoot,
      dbPath,
      projectId,
      queryTerms: [
        String(projectId),
        ...sourceEvents.map((event) => event.subject),
        ...openTaskSummary(snapshot, checkedLimit).map((task) => task.title),
      ],
      limit: checkedLimit,
      generatedAt,
    });
    packet.boundary.project_knowledge_overlay_loaded = true;
  }
  return dbPath
    ? enrichContextPacketWithDbProjection(packet, { dbPath, limit: checkedLimit })
    : packet;
}

function parseArgs(argv) {
  const opts = {
    workmetaRoot: DEFAULT_WORKMETA_ROOT,
    repoRoot: REPO,
    projectId: "",
    limit: DEFAULT_LIMIT,
    today: todayIso(),
    dbPath: "",
    includeKnowledge: true,
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
    } else if (token === "--repo-root") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) throw new Error("--repo-root_requires_value");
      opts.repoRoot = value;
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
    } else if (token === "--db") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) throw new Error("--db_requires_value");
      opts.dbPath = value;
      i += 1;
    } else if (token === "--no-knowledge") {
      opts.includeKnowledge = false;
    } else {
      throw new Error(`unknown_arg:${token}`);
    }
  }
  opts.today = validateToday(opts.today);
  return opts;
}

function usage() {
  return [
    "Usage: node tools/haengbogwan_context_packet.mjs --workmeta-root <path> --project <code> [--repo-root <dir>] [--limit N] [--today YYYY-MM-DD] [--db <dev-erp.db>] [--json]",
    "",
    "Builds a metadata-only source_event/context packet from mail/task ledgers.",
    "Optional --db loads role/actor routing metadata from dev-ERP projection tables only.",
    "Adds metadata-only project knowledge overlay by default. Use --no-knowledge to skip it.",
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
