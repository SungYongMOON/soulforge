#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import { collectWorkspaceProjectNames } from "./runtime_corrections.mjs";
import { openStore, SCHEMA_VERSION, Store } from "../src/store.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..");
const REPO = resolve(APP, "..", "..", "..");
const SCHEMA = "dev_erp.runtime_release_audit.v1";
const RELEASE_SKINS = [
  "main.png",
  ...Array.from({ length: 11 }, (_, i) => `dungeons/_p${i + 1}.png`),
];

const PROJECT_HEALTHS = ["ok", "watch", "risk", "stopped"];
const PROJECT_CLASSES = ["active", "inbox", "internal", "archive"];
const DATA_LABELS = ["real", "synthetic", "meta"];

function cleanObject(value) {
  const out = {};
  for (const [k, v] of Object.entries(value ?? {})) {
    if (v !== undefined && v !== null) out[k] = v;
  }
  return out;
}

function add(result, level, code, message, details = {}) {
  const issue = cleanObject({ level, code, message, ...details });
  if (level === "blocker") result.blockers.push(issue);
  else if (level === "warning") result.warnings.push(issue);
  else result.info.push(issue);
  return issue;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256File(path) {
  const hash = createHash("sha256");
  hash.update(readFileSync(path));
  return hash.digest("hex");
}

function safeStat(path) {
  try {
    return existsSync(path) ? statSync(path) : null;
  } catch {
    return null;
  }
}

function safeExec(command, args, { cwd } = {}) {
  try {
    return {
      ok: true,
      stdout: execFileSync(command, args, {
        cwd,
        encoding: "utf8",
        timeout: 5000,
        windowsHide: true,
      }),
    };
  } catch (err) {
    return { ok: false, error: String(err.message ?? err).slice(0, 300) };
  }
}

function safeCount(db, sql, params = []) {
  try {
    const row = db.prepare(sql).get(...params);
    return Number(row?.n ?? row?.c ?? 0);
  } catch {
    return null;
  }
}

function tableExists(db, table) {
  return !!db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?").get(table);
}

function columnExists(db, table, column) {
  if (!tableExists(db, table)) return false;
  return db.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all().some((row) => row.name === column);
}

function quoteIdent(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function tableIds(db, table, column = "id") {
  if (!tableExists(db, table)) return [];
  return db.prepare(`SELECT ${quoteIdent(column)} AS id FROM ${quoteIdent(table)} ORDER BY ${quoteIdent(column)}`).all()
    .map((row) => String(row.id));
}

function setDiff(left, right) {
  const b = new Set(right);
  return left.filter((x) => !b.has(x));
}

function normalizeComparable(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "boolean") return value ? "1" : "0";
  return String(value);
}

function codeOnlyTitle(title, id) {
  const v = String(title ?? "").trim();
  return !v || v === id;
}

function collectShape(db) {
  const tables = db.prepare(
    "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all().map((row) => row.name);
  const columns = {};
  for (const table of tables) {
    columns[table] = db.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all().map((row) => row.name);
  }
  const indexes = db.prepare(
    "SELECT name,tbl_name FROM sqlite_schema WHERE type='index' AND name NOT LIKE 'sqlite_autoindex%' ORDER BY name"
  ).all().map((row) => ({ name: row.name, table: row.tbl_name }));
  return { tables, columns, indexes };
}

function expectedShape() {
  const store = openStore(":memory:");
  try {
    return collectShape(store.db);
  } finally {
    store.db.close();
  }
}

function defaultNasRoot() {
  const candidate = process.env.DEV_ERP_NAS_ROOT;
  return candidate && existsSync(candidate) ? candidate : null;
}

export function resolveAuditPaths(options = {}) {
  const sourceRoot = resolve(options.sourceRoot ?? options.root ?? REPO);
  const runtimeRoot = resolve(options.runtimeRoot ?? sourceRoot);
  const appRoot = resolve(options.appRoot ?? join(runtimeRoot, "ui-workspace", "apps", "dev-erp"));
  const dbPath = resolve(options.dbPath ?? join(appRoot, "data", "dev-erp.db"));
  const metaPath = resolve(options.metaPath ?? join(appRoot, "data", "real_meta.json"));
  const workspacesDir = resolve(options.workspacesDir ?? join(sourceRoot, "_workspaces"));
  const nasRoot = options.nasRoot === false
    ? null
    : (options.nasRoot ? resolve(options.nasRoot) : defaultNasRoot());
  const skinRoots = (options.skinRoots?.length ? options.skinRoots : [
    join(runtimeRoot, "_workspaces", "system", "dev-erp", "skins"),
    join(appRoot, "static", "skins"),
  ]).map((p) => resolve(p));
  return { sourceRoot, runtimeRoot, appRoot, dbPath, metaPath, workspacesDir, nasRoot, skinRoots };
}

function checkGit(result, root, id, { skipGit = false, required = false } = {}) {
  if (skipGit) return;
  if (!existsSync(join(root, ".git"))) {
    add(result, required ? "blocker" : "warning", `${id}_git_missing`, `${id} is not a git checkout`, { root });
    return;
  }
  const status = safeExec("git", ["status", "--short", "--branch"], { cwd: root });
  if (!status.ok) {
    add(result, required ? "blocker" : "warning", `${id}_git_status_failed`, `${id} git status failed`, { root });
    return;
  }
  const lines = status.stdout.split(/\r?\n/).filter(Boolean);
  const dirty = lines.filter((line) => !line.startsWith("##"));
  const head = safeExec("git", ["rev-parse", "--short", "HEAD"], { cwd: root });
  const divergence = safeExec("git", ["rev-list", "--left-right", "--count", "HEAD...origin/main"], { cwd: root });
  result.checks.git[id] = {
    root,
    head: head.ok ? head.stdout.trim() : null,
    status: lines[0] ?? "",
    dirty_count: dirty.length,
    origin_main_divergence: divergence.ok ? divergence.stdout.trim() : null,
  };
  if (dirty.length) add(result, required ? "blocker" : "warning", `${id}_git_dirty`, `${id} checkout is dirty`, { root, dirty_count: dirty.length });
  if (divergence.ok && divergence.stdout.trim() !== "0\t0") {
    add(result, "warning", `${id}_git_not_at_origin_main`, `${id} differs from origin/main`, { divergence: divergence.stdout.trim() });
  }
}

function checkDbAndSchema(result, paths) {
  const { dbPath } = paths;
  result.checks.db = { path: dbPath, exists: existsSync(dbPath) };
  if (!existsSync(dbPath)) {
    add(result, "blocker", "db_missing", "Runtime DB file is missing", { dbPath });
    return null;
  }

  const dbStat = safeStat(dbPath);
  const walStat = safeStat(`${dbPath}-wal`);
  result.checks.db.bytes = dbStat?.size ?? null;
  result.checks.db.mtime_ms = dbStat?.mtimeMs ?? null;
  result.checks.db.wal_bytes = walStat?.size ?? 0;
  if (walStat?.size) {
    add(result, "warning", "db_wal_present", "SQLite WAL file exists; backups must use SQLite backup/VACUUM, not raw DB copy", { wal_bytes: walStat.size });
  }

  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const integrity = db.prepare("PRAGMA integrity_check").get()?.integrity_check ?? null;
    const fkRows = db.prepare("PRAGMA foreign_key_check").all();
    result.checks.db.integrity_check = integrity;
    result.checks.db.foreign_key_violations = fkRows.length;
    if (integrity !== "ok") add(result, "blocker", "db_integrity_failed", "SQLite integrity_check failed", { integrity });
    if (fkRows.length) add(result, "blocker", "db_foreign_key_violations", "SQLite foreign_key_check reports violations", { count: fkRows.length });

    const schemaVersion = tableExists(db, "meta")
      ? db.prepare("SELECT value FROM meta WHERE key='schema_version'").get()?.value
      : null;
    result.checks.db.schema_version = schemaVersion;
    if (schemaVersion !== SCHEMA_VERSION) {
      add(result, "blocker", "db_schema_version_mismatch", "DB schema_version is not the expected dev-ERP schema", { actual: schemaVersion, expected: SCHEMA_VERSION });
    }

    const expected = expectedShape();
    const actual = collectShape(db);
    const missingTables = setDiff(expected.tables, actual.tables);
    const missingColumns = [];
    for (const table of expected.tables) {
      if (!actual.columns[table]) continue;
      for (const column of expected.columns[table]) {
        if (!actual.columns[table].includes(column)) missingColumns.push({ table, column });
      }
    }
    const actualIndexNames = new Set(actual.indexes.map((idx) => idx.name));
    const missingIndexes = expected.indexes.filter((idx) => !actualIndexNames.has(idx.name));
    result.checks.schema = {
      missing_tables: missingTables,
      missing_columns: missingColumns,
      missing_indexes: missingIndexes,
    };
    if (missingTables.length || missingColumns.length || missingIndexes.length) {
      add(result, "blocker", "db_schema_shape_drift", "Live DB schema is missing tables, columns, or indexes from current code", {
        missing_tables: missingTables.length,
        missing_columns: missingColumns.length,
        missing_indexes: missingIndexes.length,
      });
    }

    const counts = {};
    for (const table of [
      "core_project",
      "core_item",
      "core_mail",
      "core_artifact",
      "core_deliverable",
      "core_knowledge",
      "core_account",
      "auth_session",
      "rbac_role",
      "rbac_account_role",
      "rbac_permission",
      "event_log",
    ]) counts[table] = safeCount(db, `SELECT COUNT(*) AS n FROM ${quoteIdent(table)}`);
    result.checks.db.counts = counts;

    checkDbInvariants(result, db);
    checkAccountsAndTeam(result, db);
    return db;
  } catch (err) {
    add(result, "blocker", "db_audit_failed", "DB audit failed", { error: String(err.message ?? err).slice(0, 200) });
    db.close();
    return null;
  }
}

function checkDbInvariants(result, db) {
  const invalids = {
    project_health: safeCount(db, `SELECT COUNT(*) AS n FROM core_project WHERE health NOT IN (${PROJECT_HEALTHS.map(() => "?").join(",")})`, PROJECT_HEALTHS),
    project_class: safeCount(db, `SELECT COUNT(*) AS n FROM core_project WHERE class NOT IN (${PROJECT_CLASSES.map(() => "?").join(",")})`, PROJECT_CLASSES),
    project_data_label: safeCount(db, `SELECT COUNT(*) AS n FROM core_project WHERE data_label NOT IN (${DATA_LABELS.map(() => "?").join(",")})`, DATA_LABELS),
    item_status: safeCount(db, `SELECT COUNT(*) AS n FROM core_item WHERE status NOT IN (${Store.ITEM_STATUSES.map(() => "?").join(",")})`, Store.ITEM_STATUSES),
    item_data_label: safeCount(db, `SELECT COUNT(*) AS n FROM core_item WHERE data_label NOT IN (${DATA_LABELS.map(() => "?").join(",")})`, DATA_LABELS),
    mail_direction: safeCount(db, "SELECT COUNT(*) AS n FROM core_mail WHERE direction NOT IN ('in','out')"),
    mail_data_label: safeCount(db, `SELECT COUNT(*) AS n FROM core_mail WHERE data_label NOT IN (${DATA_LABELS.map(() => "?").join(",")})`, DATA_LABELS),
    account_status: tableExists(db, "core_account") ? safeCount(db, "SELECT COUNT(*) AS n FROM core_account WHERE status NOT IN ('active','disabled')") : null,
    mailbox_provider: tableExists(db, "core_account") ? safeCount(db, `SELECT COUNT(*) AS n FROM core_account WHERE mailbox_provider NOT IN (${Store.MAILBOX_PROVIDERS.map(() => "?").join(",")})`, Store.MAILBOX_PROVIDERS) : null,
    mailbox_status: tableExists(db, "core_account") ? safeCount(db, `SELECT COUNT(*) AS n FROM core_account WHERE mailbox_status NOT IN (${Store.MAILBOX_STATUSES.map(() => "?").join(",")})`, Store.MAILBOX_STATUSES) : null,
  };
  result.checks.invariants = invalids;
  for (const [code, count] of Object.entries(invalids)) {
    if (count > 0) add(result, "blocker", `invalid_${code}`, `Invalid DB invariant values found: ${code}`, { count });
  }

  const synthetic = {
    projects: safeCount(db, "SELECT COUNT(*) AS n FROM core_project WHERE data_label='synthetic'"),
    items: safeCount(db, "SELECT COUNT(*) AS n FROM core_item WHERE data_label='synthetic'"),
    mail: safeCount(db, "SELECT COUNT(*) AS n FROM core_mail WHERE data_label='synthetic'"),
    artifacts: safeCount(db, "SELECT COUNT(*) AS n FROM core_artifact WHERE data_label='synthetic'"),
  };
  result.checks.synthetic = synthetic;
  if (synthetic.projects > 0 || synthetic.mail > 0) {
    add(result, "blocker", "synthetic_release_data_present", "Synthetic/demo project or mail rows remain in the release DB", synthetic);
  } else if (synthetic.items > 0 || synthetic.artifacts > 0) {
    add(result, "warning", "synthetic_secondary_data_present", "Synthetic item/artifact rows remain in the release DB", synthetic);
  }

  const conflicts = tableExists(db, "core_item") && columnExists(db, "core_item", "sync_state")
    ? safeCount(db, "SELECT COUNT(*) AS n FROM core_item WHERE sync_state='conflict'")
    : null;
  if (conflicts > 0) add(result, "warning", "task_sync_conflicts", "Task ledger sync conflicts exist", { count: conflicts });

  const unsafePointers = [
    tableExists(db, "core_mail") ? safeCount(db, "SELECT COUNT(*) AS n FROM core_mail WHERE pointer_ref IS NOT NULL AND (instr(pointer_ref, char(10))>0 OR instr(pointer_ref, char(13))>0 OR instr(pointer_ref, char(0))>0)") : 0,
    tableExists(db, "core_artifact") ? safeCount(db, "SELECT COUNT(*) AS n FROM core_artifact WHERE pointer IS NOT NULL AND (instr(pointer, char(10))>0 OR instr(pointer, char(13))>0 OR instr(pointer, char(0))>0)") : 0,
    tableExists(db, "core_deliverable") ? safeCount(db, "SELECT COUNT(*) AS n FROM core_deliverable WHERE (out_pointer IS NOT NULL AND (instr(out_pointer, char(10))>0 OR instr(out_pointer, char(13))>0 OR instr(out_pointer, char(0))>0)) OR (in_pointer IS NOT NULL AND (instr(in_pointer, char(10))>0 OR instr(in_pointer, char(13))>0 OR instr(in_pointer, char(0))>0))") : 0,
  ].reduce((a, b) => a + (b ?? 0), 0);
  result.checks.pointer_health = { unsafe_pointer_count: unsafePointers };
  if (unsafePointers > 0) add(result, "blocker", "unsafe_pointer_refs", "Pointer refs contain control characters", { count: unsafePointers });
}

function checkAccountsAndTeam(result, db) {
  if (!tableExists(db, "core_account")) return;
  const accountCount = safeCount(db, "SELECT COUNT(*) AS n FROM core_account");
  const activeAccounts = safeCount(db, "SELECT COUNT(*) AS n FROM core_account WHERE status='active'");
  const activeAdmins = safeCount(
    db,
    "SELECT COUNT(*) AS n FROM core_account a JOIN rbac_account_role r ON r.account_id=a.id AND r.role_id='admin' WHERE a.status='active'"
  );
  const activeMembers = safeCount(
    db,
    "SELECT COUNT(*) AS n FROM core_account a WHERE a.status='active' AND NOT EXISTS (SELECT 1 FROM rbac_account_role r WHERE r.account_id=a.id AND r.role_id='admin')"
  );
  const expiredSessions = tableExists(db, "auth_session")
    ? safeCount(db, "SELECT COUNT(*) AS n FROM auth_session WHERE expires_at < datetime('now')")
    : 0;
  const configuredMailboxes = safeCount(
    db,
    "SELECT COUNT(*) AS n FROM core_account WHERE status='active' AND mailbox_enabled=1 AND mailbox_provider<>'none' AND mailbox_env_ref IS NOT NULL AND mailbox_env_ref<>''"
  );
  const fetchSeen = safeCount(
    db,
    "SELECT COUNT(*) AS n FROM core_account WHERE status='active' AND mailbox_enabled=1 AND mailbox_last_fetch_at IS NOT NULL"
  );
  const secretLikeEnvRef = safeCount(
    db,
    "SELECT COUNT(*) AS n FROM core_account WHERE lower(coalesce(mailbox_env_ref,'')) LIKE '%password%' OR lower(coalesce(mailbox_env_ref,'')) LIKE '%token%' OR lower(coalesce(mailbox_env_ref,'')) LIKE '%secret%' OR lower(coalesce(mailbox_env_ref,'')) LIKE '%credential%'"
  );
  const mailRows = tableExists(db, "core_mail") ? safeCount(db, "SELECT COUNT(*) AS n FROM core_mail") : 0;
  const blankMailboxRows = tableExists(db, "core_mail") && columnExists(db, "core_mail", "mailbox")
    ? safeCount(db, "SELECT COUNT(*) AS n FROM core_mail WHERE mailbox IS NULL OR mailbox=''")
    : null;
  result.checks.accounts = {
    account_count: accountCount,
    active_accounts: activeAccounts,
    active_admins: activeAdmins,
    active_members: activeMembers,
    expired_sessions: expiredSessions,
    configured_mailboxes: configuredMailboxes,
    mailbox_fetch_seen: fetchSeen,
    secret_like_env_ref_count: secretLikeEnvRef,
    blank_mailbox_rows: blankMailboxRows,
  };
  if (accountCount === 0) add(result, "blocker", "auth_anonymous_mode", "No accounts exist; server will run in anonymous compatibility mode");
  if (accountCount > 0 && activeAdmins === 0) add(result, "blocker", "active_admin_missing", "No active admin account exists");
  if (expiredSessions > 0) add(result, "warning", "expired_sessions_present", "Expired auth sessions are still present", { count: expiredSessions });
  if (secretLikeEnvRef > 0) add(result, "warning", "mailbox_env_ref_secret_like", "Mailbox env refs contain secret-like words; verify they are metadata paths only", { count: secretLikeEnvRef });
  if (activeMembers > 0 && configuredMailboxes < activeMembers) {
    add(result, "warning", "member_mailboxes_not_fully_configured", "Some active members do not have mailbox metadata configured", { expected: activeMembers, actual: configuredMailboxes });
  }
  if (configuredMailboxes > 0 && fetchSeen < configuredMailboxes) {
    add(result, "warning", "mailbox_fetch_not_observed", "Configured mailboxes exist but not all have observed fetch timestamps", { expected: configuredMailboxes, actual: fetchSeen });
  }
  if (activeMembers > 0 && mailRows > 0 && blankMailboxRows === mailRows) {
    add(result, "warning", "mailbox_attribution_missing", "All mail rows have blank mailbox attribution while team members exist", { mail_rows: mailRows });
  }
}

function checkRealMeta(result, paths, db) {
  const { metaPath, dbPath } = paths;
  const releaseTestPath = join(dirname(metaPath), "real_meta.release-test.json");
  result.checks.real_meta = { path: metaPath, exists: existsSync(metaPath) };
  if (!existsSync(metaPath)) {
    add(
      result,
      "blocker",
      existsSync(releaseTestPath) ? "real_meta_missing_release_test_only" : "real_meta_missing",
      "data/real_meta.json is missing for the runtime DB",
      { metaPath, release_test_exists: existsSync(releaseTestPath) }
    );
    return;
  }

  let meta;
  try {
    meta = readJson(metaPath);
  } catch (err) {
    add(result, "blocker", "real_meta_json_invalid", "real_meta.json is not valid JSON", { error: String(err.message ?? err).slice(0, 160) });
    return;
  }

  const stat = safeStat(metaPath);
  result.checks.real_meta.bytes = stat?.size ?? null;
  result.checks.real_meta.mtime_ms = stat?.mtimeMs ?? null;
  result.checks.real_meta.sha256 = sha256File(metaPath);
  result.checks.real_meta.counts = {
    projects: Array.isArray(meta.projects) ? meta.projects.length : null,
    items: Array.isArray(meta.items) ? meta.items.length : null,
    mail: Array.isArray(meta.mail) ? meta.mail.length : null,
    artifacts: Array.isArray(meta.artifacts) ? meta.artifacts.length : null,
  };
  if (!Array.isArray(meta.projects)) add(result, "blocker", "real_meta_projects_missing", "real_meta.projects must be an array");
  if (!Array.isArray(meta.mail)) add(result, "warning", "real_meta_mail_missing", "real_meta.mail is not an array");
  if (!db) return;

  try {
    const ingested = tableExists(db, "meta")
      ? db.prepare("SELECT value FROM meta WHERE key='real_ingest_mtime'").get()?.value
      : null;
    result.checks.real_meta.db_real_ingest_mtime = ingested ?? null;
    if (stat?.mtimeMs && ingested !== undefined && ingested !== null) {
      const delta = Math.abs(Number(ingested) - Number(stat.mtimeMs));
      if (!Number.isFinite(delta) || delta > 1) {
        add(result, "warning", "real_meta_ingest_mtime_stale", "DB real_ingest_mtime differs from real_meta.json mtime", { db_value: ingested, file_mtime_ms: stat.mtimeMs });
      }
    } else {
      add(result, "warning", "real_meta_ingest_marker_missing", "DB has no real_ingest_mtime marker");
    }

    const metaProjectIds = (meta.projects ?? []).map((p) => String(p?.id ?? "")).filter(Boolean).sort();
    const dbProjectIds = tableIds(db, "core_project");
    const metaOnlyProjects = setDiff(metaProjectIds, dbProjectIds);
    const dbOnlyProjects = setDiff(dbProjectIds, metaProjectIds);
    const metaMailIds = (meta.mail ?? []).map((m) => String(m?.id ?? "")).filter(Boolean).sort();
    const dbMailIds = tableIds(db, "core_mail");
    const metaOnlyMail = setDiff(metaMailIds, dbMailIds);
    const dbOnlyMail = setDiff(dbMailIds, metaMailIds);
    result.checks.real_meta.project_id_diff = { meta_only: metaOnlyProjects.length, db_only: dbOnlyProjects.length };
    result.checks.real_meta.mail_id_diff = { meta_only: metaOnlyMail.length, db_only: dbOnlyMail.length };
    if (metaOnlyProjects.length || dbOnlyProjects.length) {
      add(result, "blocker", "project_set_drift", "DB and real_meta project id sets differ", {
        meta_only: metaOnlyProjects.slice(0, 10),
        db_only: dbOnlyProjects.slice(0, 10),
        meta_only_count: metaOnlyProjects.length,
        db_only_count: dbOnlyProjects.length,
      });
    }
    if (metaOnlyMail.length || dbOnlyMail.length) {
      add(result, "blocker", "mail_set_drift", "DB and real_meta mail id sets differ", {
        meta_only_count: metaOnlyMail.length,
        db_only_count: dbOnlyMail.length,
      });
    }

    const metaProjects = new Map((meta.projects ?? []).filter((p) => p?.id).map((p) => [String(p.id), p]));
    const commonProjectRows = db.prepare("SELECT id,title,health,class,stage_current,start_year,provisional,source_ref FROM core_project").all()
      .filter((row) => metaProjects.has(row.id));
    const fieldMismatches = [];
    for (const row of commonProjectRows) {
      const p = metaProjects.get(row.id);
      for (const field of ["title", "health", "class", "stage_current", "start_year", "provisional", "source_ref"]) {
        if (p[field] === undefined) continue;
        if (normalizeComparable(p[field]) !== normalizeComparable(row[field])) fieldMismatches.push({ id: row.id, field });
      }
    }
    result.checks.real_meta.project_field_mismatches = fieldMismatches.length;
    if (fieldMismatches.length) {
      add(result, "warning", "project_field_drift", "DB project fields differ from real_meta.json", {
        count: fieldMismatches.length,
        examples: fieldMismatches.slice(0, 10),
      });
    }

    const knownProjectIds = new Set(dbProjectIds);
    const dbMailOrphans = tableExists(db, "core_mail")
      ? db.prepare("SELECT id,project_id FROM core_mail WHERE project_id IS NOT NULL AND project_id<>''").all()
        .filter((row) => !knownProjectIds.has(row.project_id))
      : [];
    const metaProjectSet = new Set(metaProjectIds);
    const metaMailOrphans = (meta.mail ?? [])
      .filter((m) => m?.project_id && !metaProjectSet.has(String(m.project_id)));
    result.checks.real_meta.mail_project_orphans = { db: dbMailOrphans.length, meta: metaMailOrphans.length };
    if (dbMailOrphans.length || metaMailOrphans.length) {
      add(result, "blocker", "mail_project_orphans", "Mail rows reference projects absent from their project set", {
        db_count: dbMailOrphans.length,
        meta_count: metaMailOrphans.length,
      });
    }
  } catch (err) {
    add(result, "blocker", "real_meta_compare_failed", "Failed to compare real_meta with DB", { dbPath, error: String(err.message ?? err).slice(0, 160) });
  }
}

function checkWorkspaceProjects(result, paths, db) {
  const names = collectWorkspaceProjectNames(paths.workspacesDir);
  const ids = Object.keys(names).sort();
  result.checks.workspace_projects = { path: paths.workspacesDir, count: ids.length };
  if (!ids.length) {
    add(result, "warning", "workspace_project_names_missing", "No Pxx-xxx workspace project names were found", { workspacesDir: paths.workspacesDir });
    return;
  }
  if (!db || !tableExists(db, "core_project")) return;
  const rows = db.prepare(`SELECT id,title,class FROM core_project WHERE id IN (${ids.map(() => "?").join(",")})`).all(...ids);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const missing = ids.filter((id) => !byId.has(id));
  const titleCandidates = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (row && row.title !== names[id] && codeOnlyTitle(row.title, id)) {
      titleCandidates.push({ id, target: names[id] });
    }
  }
  result.checks.workspace_projects.db_missing = missing.length;
  result.checks.workspace_projects.title_correction_candidates = titleCandidates.length;
  if (missing.length) add(result, "warning", "workspace_projects_missing_in_db", "Workspace project folders exist but DB has no matching project rows", { count: missing.length, examples: missing.slice(0, 10) });
  if (titleCandidates.length) add(result, "warning", "project_name_correction_candidates", "DB has code-only project titles that can be corrected from workspace names", { count: titleCandidates.length, examples: titleCandidates.slice(0, 10) });
}

function checkStaticAssets(result, paths) {
  const indexPath = join(paths.appRoot, "static", "index.html");
  const stylePath = join(paths.appRoot, "static", "style.css");
  result.checks.assets = {
    style_css_exists: existsSync(stylePath),
    index_html_exists: existsSync(indexPath),
    skin_roots: [],
  };
  if (!existsSync(stylePath)) add(result, "blocker", "style_css_missing", "static/style.css is missing");
  if (existsSync(indexPath)) {
    const html = readFileSync(indexPath, "utf8");
    if (!html.includes('/style.css')) add(result, "warning", "index_style_ref_unexpected", "index.html does not reference /style.css");
    if (html.includes('/styles.css')) add(result, "warning", "index_styles_plural_ref", "index.html references /styles.css, but app uses /style.css");
  }

  for (const root of paths.skinRoots) {
    const info = { path: root, exists: existsSync(root), present: 0, missing: [] };
    if (info.exists) {
      for (const rel of RELEASE_SKINS) {
        const p = join(root, ...rel.split("/"));
        if (existsSync(p)) info.present += 1;
        else info.missing.push(rel);
      }
      const mainPath = join(root, "main.png");
      if (existsSync(mainPath)) info.main_png = { bytes: statSync(mainPath).size, sha256: sha256File(mainPath) };
    }
    result.checks.assets.skin_roots.push(info);
  }
  const selected = result.checks.assets.skin_roots.find((root) => root.exists);
  if (!selected) {
    add(result, "warning", "skin_root_missing", "No runtime skin root exists; fantasy UI will use SVG fallbacks only");
  } else if (selected.missing.length) {
    add(result, "warning", "skin_manifest_incomplete", "Selected runtime skin root is missing expected fantasy PNG assets", {
      root: selected.path,
      missing_count: selected.missing.length,
      examples: selected.missing.slice(0, 10),
    });
  }
}

function listDirNames(path) {
  try {
    return existsSync(path) ? readdirSync(path, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : [];
  } catch {
    return [];
  }
}

function checkNasBackup(result, paths, { skipNas = false } = {}) {
  if (skipNas) return;
  const nasRoot = paths.nasRoot;
  result.checks.nas_backup = { root: nasRoot, configured: !!nasRoot };
  if (!nasRoot) {
    add(result, "warning", "nas_root_not_configured", "NAS root was not provided and default NAS path was not found");
    return;
  }
  if (!existsSync(nasRoot)) {
    add(result, "blocker", "nas_root_missing", "NAS root does not exist", { nasRoot });
    return;
  }
  const namespaces = ["DB_BACKUP", "01_db_backups", "RESTORE_TEST", "02_restore_tests", "RELEASE", "03_release_snapshots"]
    .filter((name) => existsSync(join(nasRoot, name)));
  result.checks.nas_backup.namespaces = namespaces;
  if (namespaces.includes("DB_BACKUP") && namespaces.includes("01_db_backups")) {
    add(result, "warning", "nas_backup_namespace_drift", "Both DB_BACKUP and 01_db_backups exist; choose one canonical backup namespace", { namespaces });
  }

  const latestCandidates = [
    join(nasRoot, "DB_BACKUP", "latest", "runtime_live", "dev-erp.db"),
    join(nasRoot, "01_db_backups", "latest", "runtime_live", "dev-erp.db"),
  ].filter((p) => existsSync(p));
  result.checks.nas_backup.latest_candidates = latestCandidates;
  const dbStat = safeStat(paths.dbPath);
  const walStat = safeStat(`${paths.dbPath}-wal`);
  const liveMtimeMs = Math.max(dbStat?.mtimeMs ?? 0, walStat?.mtimeMs ?? 0);
  if (!latestCandidates.length) {
    add(result, "blocker", "nas_latest_db_backup_missing", "No latest NAS runtime DB backup was found", { nasRoot });
  } else if (dbStat) {
    const latest = latestCandidates
      .map((p) => ({ path: p, stat: statSync(p) }))
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)[0];
    result.checks.nas_backup.latest = {
      path: latest.path,
      bytes: latest.stat.size,
      mtime_ms: latest.stat.mtimeMs,
      live_mtime_ms: liveMtimeMs,
      db_mtime_ms: dbStat?.mtimeMs ?? null,
      wal_mtime_ms: walStat?.mtimeMs ?? null,
    };
    if (latest.stat.mtimeMs + 1000 < liveMtimeMs) {
      add(result, "blocker", "nas_latest_db_backup_stale", "Latest NAS DB backup is older than the live DB/WAL state", {
        latest_backup: latest.path,
        backup_mtime_ms: latest.stat.mtimeMs,
        live_mtime_ms: liveMtimeMs,
        db_mtime_ms: dbStat?.mtimeMs ?? null,
        wal_mtime_ms: walStat?.mtimeMs ?? null,
      });
    }
  }

  const restoreDirs = [join(nasRoot, "RESTORE_TEST"), join(nasRoot, "02_restore_tests")].filter((p) => existsSync(p));
  const restoreEntries = restoreDirs.flatMap((p) => listDirNames(p).map((name) => join(p, name)));
  result.checks.nas_backup.restore_test_entries = restoreEntries.length;
  if (!restoreEntries.length) add(result, "warning", "restore_test_missing", "No NAS restore-test entry was found");
}

async function checkLiveServer(result, { live = false, requireLive = false, port = 4300, allowLanHttp = false } = {}) {
  result.checks.live_server = { checked: Boolean(live || requireLive), port };
  if (live || requireLive) {
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 1500);
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: ctrl.signal });
      clearTimeout(timeout);
      const body = await response.json();
      result.checks.live_server.health = body;
      if (!body.ok) add(result, "blocker", "live_health_not_ok", "Live /api/health did not return ok=true");
    } catch {
      add(result, requireLive ? "blocker" : "warning", "live_health_unreachable", "Live /api/health is unreachable on localhost", { port });
    }
  }

  const netstat = safeExec("netstat", ["-ano", "-p", "tcp"]);
  if (netstat.ok) {
    const listeners = netstat.stdout.split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.includes(`:${port}`) && /\bLISTENING\b/i.test(line))
      .map((line) => line.split(/\s+/)[1] ?? line);
    result.checks.live_server.listeners = listeners;
    const broad = listeners.filter((addr) => addr.startsWith("0.0.0.0:") || addr.startsWith("[::]:") || addr.startsWith(":::"));
    if (broad.length && !allowLanHttp) {
      add(result, "warning", "lan_http_exposure_observed", "Server appears to listen on a broad LAN address; pass --allow-lan-http only for owner-approved LAN pilot", { listeners: broad });
    }
  }
}

function recommendedCommands(paths) {
  return [
    `npm.cmd run dev-erp:audit-runtime -- --runtime-root ${paths.runtimeRoot} --workspaces ${paths.workspacesDir} --nas-root ${paths.nasRoot ?? "<nas-root>"}`,
    `npm.cmd run dev-erp:correct-runtime -- --dry-run --workspaces ${paths.workspacesDir} --db ${paths.dbPath} --meta ${paths.metaPath}`,
    "npm.cmd run guild-hall:snapshot:check-fresh",
    "npm.cmd run guild-hall:workspace-junction:audit -- --json",
    "npm.cmd run guild-hall:workspace-system:inventory -- --json",
    `npm.cmd run dev-erp:team-preflight -- --db ${paths.dbPath}`,
  ];
}

export async function runRuntimeReleaseAudit(options = {}) {
  const paths = resolveAuditPaths(options);
  const result = {
    schema_version: SCHEMA,
    generated_at: new Date().toISOString(),
    ok: false,
    paths,
    checks: { git: {} },
    blockers: [],
    warnings: [],
    info: [],
    recommended_commands: recommendedCommands(paths),
  };

  checkGit(result, paths.sourceRoot, "source", { skipGit: options.skipGit });
  if (paths.runtimeRoot !== paths.sourceRoot) checkGit(result, paths.runtimeRoot, "runtime", { skipGit: options.skipGit, required: true });

  const db = checkDbAndSchema(result, paths);
  try {
    checkRealMeta(result, paths, db);
    checkWorkspaceProjects(result, paths, db);
    checkStaticAssets(result, paths);
    checkNasBackup(result, paths, { skipNas: options.skipNas });
    await checkLiveServer(result, options);
  } finally {
    db?.close();
  }

  const targetMembers = Number(options.targetMembers ?? 0);
  if (targetMembers > 0) {
    const activeMembers = result.checks.accounts?.active_members ?? 0;
    if (activeMembers < targetMembers) {
      add(result, "blocker", "target_members_short", "Active non-admin member count is below the release target", { expected: targetMembers, actual: activeMembers });
    }
  }

  result.ok = result.blockers.length === 0;
  return result;
}

function parseCli(argv) {
  const value = (name, fallback) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
  };
  const list = (name) => {
    const values = [];
    for (let i = 0; i < argv.length; i += 1) {
      if (argv[i] === `--${name}` && argv[i + 1] && !argv[i + 1].startsWith("--")) values.push(argv[i + 1]);
    }
    return values;
  };
  return {
    help: argv.includes("--help") || argv.includes("-h"),
    json: argv.includes("--json"),
    root: value("root", undefined),
    sourceRoot: value("source-root", undefined),
    runtimeRoot: value("runtime-root", undefined),
    appRoot: value("app", undefined),
    dbPath: value("db", undefined),
    metaPath: value("meta", undefined),
    workspacesDir: value("workspaces", undefined),
    nasRoot: argv.includes("--no-nas") ? false : value("nas-root", undefined),
    skinRoots: list("skin-root"),
    skipGit: argv.includes("--skip-git"),
    skipNas: argv.includes("--skip-nas") || argv.includes("--no-nas"),
    live: argv.includes("--live"),
    requireLive: argv.includes("--require-live"),
    allowLanHttp: argv.includes("--allow-lan-http"),
    port: Number(value("port", "4300")),
    targetMembers: Number(value("target-members", "0")),
  };
}

function printHelp() {
  console.log(`Usage:
  node tools/runtime_release_audit.mjs [--json]
  node tools/runtime_release_audit.mjs --runtime-root <runtime-checkout> --workspaces <dev-checkout>\\_workspaces --nas-root <nas-root> --live --allow-lan-http

Purpose:
  Read-only release gate for the company-PC dev-ERP runtime. It checks the
  runtime DB, real_meta sync, schema drift, accounts/RBAC readiness, WAL and
  NAS backup posture, static assets/skins, source/runtime git state, and live
  local health. It does not read raw project files, mail bodies, or secret env
  values, and it never writes to the DB.

Common options:
  --runtime-root <path>   Runtime checkout root. Defaults to the current repo.
  --source-root <path>    Development/source checkout root for _workspaces.
  --db <path>             Runtime SQLite DB path.
  --meta <path>           Runtime data/real_meta.json path.
  --workspaces <path>     Approved _workspaces root for project labels.
  --nas-root <path>       NAS backup root. Use --no-nas to skip.
  --target-members <n>    Block unless at least n active non-admin users exist.
  --live                  Check http://127.0.0.1:<port>/api/health.
  --require-live          Same as --live, but unreachable health is a blocker.
  --allow-lan-http        Treat broad 0.0.0.0 LAN listening as owner-approved.
`);
}

function printHuman(result) {
  console.log(`[dev-erp runtime release audit] ${result.ok ? "OK" : "BLOCKED"}`);
  console.log(`  db: ${result.paths.dbPath}`);
  console.log(`  meta: ${result.paths.metaPath}`);
  console.log(`  workspaces: ${result.paths.workspacesDir}`);
  if (result.paths.nasRoot) console.log(`  nas: ${result.paths.nasRoot}`);
  console.log(`  blockers: ${result.blockers.length}, warnings: ${result.warnings.length}`);
  for (const issue of result.blockers) console.log(`  BLOCKER ${issue.code}: ${issue.message}`);
  for (const issue of result.warnings) console.log(`  warning ${issue.code}: ${issue.message}`);
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const result = await runRuntimeReleaseAudit(options);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else printHuman(result);
  if (!result.ok) process.exitCode = 1;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`[dev-erp runtime release audit] error: ${err.message}`);
    process.exitCode = 1;
  });
}
