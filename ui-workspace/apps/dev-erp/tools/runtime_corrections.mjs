#!/usr/bin/env node
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import { openStore } from "../src/store.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..");
const REPO = resolve(APP, "..", "..", "..");
const DEFAULT_FIXES = ["project_names"];

function isoStampForFile(now = new Date()) {
  return now.toISOString().replaceAll(/[-:TZ.]/g, "").slice(0, 14);
}

function sqlString(value) {
  return String(value).replaceAll("'", "''");
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function codeOnlyTitle(title, id) {
  const v = String(title ?? "").trim();
  return !v || v === id;
}

function projectNameFromDisplay(display) {
  const match = String(display ?? "").match(/^(P\d{2}-\d{3})\s+(.+)$/);
  if (!match) return null;
  return { id: match[1], title: match[2].trim() };
}

export function collectWorkspaceProjectNames(workspacesDir) {
  const names = {};
  if (!existsSync(workspacesDir)) return names;
  for (const entry of readdirSync(workspacesDir)) {
    const full = join(workspacesDir, entry);
    let display = entry;
    try {
      const st = lstatSync(full);
      if (st.isSymbolicLink()) display = basename(readlinkSync(full));
      else if (!st.isDirectory()) continue;
    } catch {
      continue;
    }
    const parsed = projectNameFromDisplay(display);
    if (parsed) names[parsed.id] = parsed.title;
  }
  return names;
}

function planMetaProjectNames(metaPath, workspaceNames, { overwrite = false } = {}) {
  const result = { exists: existsSync(metaPath), changes: [], skipped_manual_title: [] };
  if (!result.exists) return result;
  const meta = readJson(metaPath);
  for (const project of meta.projects ?? []) {
    const targetTitle = workspaceNames[project.id];
    if (!targetTitle || project.title === targetTitle) continue;
    if (!overwrite && !codeOnlyTitle(project.title, project.id)) {
      result.skipped_manual_title.push({ id: project.id, current: project.title, target: targetTitle });
      continue;
    }
    result.changes.push({ id: project.id, current: project.title ?? "", target: targetTitle });
  }
  return result;
}

function dbProjectRows(dbPath, ids) {
  if (!existsSync(dbPath)) return { exists: false, rows: {}, integrity: null };
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const stmt = db.prepare("SELECT id,title FROM core_project WHERE id=?");
    const rows = {};
    for (const id of ids) {
      const row = stmt.get(id);
      if (row) rows[id] = row;
    }
    const integrity = db.prepare("PRAGMA integrity_check").get()?.integrity_check ?? null;
    return { exists: true, rows, integrity };
  } finally {
    db.close();
  }
}

function planDbProjectNames(dbPath, workspaceNames, { overwrite = false } = {}) {
  const ids = Object.keys(workspaceNames);
  const snapshot = dbProjectRows(dbPath, ids);
  const result = { exists: snapshot.exists, integrity: snapshot.integrity, changes: [], missing: [], skipped_manual_title: [] };
  if (!snapshot.exists) return result;
  for (const id of ids) {
    const row = snapshot.rows[id];
    const targetTitle = workspaceNames[id];
    if (!row) {
      result.missing.push(id);
      continue;
    }
    if (row.title === targetTitle) continue;
    if (!overwrite && !codeOnlyTitle(row.title, id)) {
      result.skipped_manual_title.push({ id, current: row.title, target: targetTitle });
      continue;
    }
    result.changes.push({ id, current: row.title, target: targetTitle });
  }
  return result;
}

export function planRuntimeCorrections(options = {}) {
  const workspacesDir = resolve(options.workspacesDir ?? join(REPO, "_workspaces"));
  const metaPath = resolve(options.metaPath ?? join(APP, "data", "real_meta.json"));
  const dbPath = resolve(options.dbPath ?? join(APP, "data", "dev-erp.db"));
  const backupDir = resolve(options.backupDir ?? join(dirname(dbPath), "backups"));
  const fixes = options.fixes?.length ? options.fixes : DEFAULT_FIXES;
  const overwrite = Boolean(options.overwrite);
  const workspaceNames = collectWorkspaceProjectNames(workspacesDir);
  const errors = [];
  const correctionPlan = {};

  if (!Object.keys(workspaceNames).length) {
    errors.push({ code: "workspace_project_names_missing", path: workspacesDir });
  }

  if (fixes.includes("project_names")) {
    correctionPlan.project_names = {
      workspace_name_count: Object.keys(workspaceNames).length,
      meta: planMetaProjectNames(metaPath, workspaceNames, { overwrite }),
      db: options.noDb ? { skipped: true, reason: "no_db" } : planDbProjectNames(dbPath, workspaceNames, { overwrite }),
    };
  }

  return {
    dry_run: !options.apply,
    apply: Boolean(options.apply),
    workspacesDir,
    metaPath,
    dbPath,
    backupDir,
    overwrite,
    fixes,
    errors,
    plan: correctionPlan,
  };
}

function backupDb(dbPath, backupDir, tag = "runtime_corrections") {
  mkdirSync(backupDir, { recursive: true });
  const base = basename(dbPath, ".db");
  const backupPath = join(backupDir, `${base}.before_${tag}_${isoStampForFile()}.db`);
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(`VACUUM INTO '${sqlString(backupPath)}'`);
  } finally {
    db.close();
  }
  return backupPath;
}

function applyMetaProjectNames(metaPath, changes) {
  if (!changes.length) return 0;
  const targets = new Map(changes.map((c) => [c.id, c.target]));
  const meta = readJson(metaPath);
  let count = 0;
  for (const project of meta.projects ?? []) {
    if (!targets.has(project.id)) continue;
    project.title = targets.get(project.id);
    count += 1;
  }
  writeJson(metaPath, meta);
  return count;
}

function applyDbProjectNames(dbPath, changes, metaPath) {
  if (!changes.length) return { changed: 0, integrity: null };
  const store = openStore(dbPath);
  try {
    store.db.exec("BEGIN IMMEDIATE");
    const update = store.db.prepare("UPDATE core_project SET title=? WHERE id=?");
    let changed = 0;
    for (const change of changes) changed += update.run(change.target, change.id).changes ?? 0;
    store.appendEvent({
      actor_ref: "runtime_corrections",
      actor_kind: "system",
      kind: "project_name_sync",
      to: String(changed),
      used_refs: ["_workspaces", "data/real_meta.json"],
      data_label: "meta",
      note: JSON.stringify({ changed, ids: changes.map((c) => c.id) }),
    });
    if (existsSync(metaPath)) store.setMeta("real_ingest_mtime", String(statSync(metaPath).mtimeMs));
    store.db.exec("COMMIT");
    const integrity = store.db.prepare("PRAGMA integrity_check").get()?.integrity_check ?? null;
    return { changed, integrity };
  } catch (err) {
    try { store.db.exec("ROLLBACK"); } catch { /* ignore rollback failure */ }
    throw err;
  } finally {
    store.db.close();
  }
}

export function applyRuntimeCorrections(options = {}) {
  const planned = planRuntimeCorrections(options);
  const projectPlan = planned.plan.project_names;
  const metaChanges = projectPlan?.meta?.changes ?? [];
  const dbChanges = projectPlan?.db?.changes ?? [];
  const result = { ...planned, applied: false, backup: null, applied_changes: {} };

  if (planned.errors.length || !options.apply) return result;

  if (dbChanges.length && !options.noBackup) {
    result.backup = backupDb(planned.dbPath, planned.backupDir, "runtime_corrections_project_names");
  }

  if (metaChanges.length) {
    result.applied_changes.meta_project_names = applyMetaProjectNames(planned.metaPath, metaChanges);
  }

  if (dbChanges.length) {
    result.applied_changes.db_project_names = applyDbProjectNames(planned.dbPath, dbChanges, planned.metaPath);
  }

  result.applied = true;
  return result;
}

function parseCli(argv) {
  const value = (name, fallback) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
  };
  const list = (name, fallback) => {
    const raw = value(name, null);
    return raw ? raw.split(",").map((x) => x.trim()).filter(Boolean) : fallback;
  };
  return {
    help: argv.includes("--help") || argv.includes("-h"),
    apply: argv.includes("--apply") && !argv.includes("--dry-run"),
    json: argv.includes("--json"),
    overwrite: argv.includes("--overwrite"),
    noBackup: argv.includes("--no-backup"),
    noDb: argv.includes("--no-db"),
    workspacesDir: value("workspaces", undefined),
    metaPath: value("meta", undefined),
    dbPath: value("db", undefined),
    backupDir: value("backup-dir", undefined),
    fixes: list("fix", DEFAULT_FIXES),
  };
}

function printHelp() {
  console.log(`Usage:
  node tools/runtime_corrections.mjs [--dry-run]
  node tools/runtime_corrections.mjs --apply [--workspaces <path>] [--db <path>] [--meta <path>]

Purpose:
  Safely apply deterministic runtime DB corrections derived from approved local metadata.

Defaults:
  --workspaces  <repo>/_workspaces
  --meta        <app>/data/real_meta.json
  --db          <app>/data/dev-erp.db
  --backup-dir  <app>/data/backups
  --fix         project_names

Safety:
  Dry-run is the default. --apply writes changes.
  DB writes create a SQLite VACUUM INTO backup unless --no-backup is passed.
  Project titles are changed only when the current title is blank or the project code.
  Use --overwrite only for an owner-approved deliberate rename.
`);
}

function printHuman(result) {
  const status = result.errors.length ? "blocked" : result.apply ? "applied" : "dry-run";
  console.log(`[runtime-corrections] ${status}`);
  console.log(`  workspaces: ${result.workspacesDir}`);
  console.log(`  meta: ${result.metaPath}`);
  console.log(`  db: ${result.dbPath}`);
  if (result.backup) console.log(`  backup: ${result.backup}`);
  for (const error of result.errors) console.log(`  error: ${error.code} ${error.path ?? ""}`);
  const projectNames = result.plan.project_names;
  if (projectNames) {
    console.log(`  project_names.workspace_names: ${projectNames.workspace_name_count}`);
    console.log(`  project_names.meta_changes: ${projectNames.meta.changes.length}`);
    for (const row of projectNames.meta.changes) console.log(`    meta ${row.id}: ${row.current || "(blank)"} -> ${row.target}`);
    if (!projectNames.db.skipped) {
      console.log(`  project_names.db_changes: ${projectNames.db.changes.length}`);
      for (const row of projectNames.db.changes) console.log(`    db ${row.id}: ${row.current || "(blank)"} -> ${row.target}`);
      if (projectNames.db.skipped_manual_title.length) console.log(`  project_names.db_skipped_manual_title: ${projectNames.db.skipped_manual_title.length}`);
      if (projectNames.db.missing.length) console.log(`  project_names.db_missing: ${projectNames.db.missing.join(", ")}`);
      if (projectNames.db.integrity) console.log(`  db_integrity_before: ${projectNames.db.integrity}`);
    }
  }
  if (result.applied_changes.db_project_names?.integrity) {
    console.log(`  db_integrity_after: ${result.applied_changes.db_project_names.integrity}`);
  }
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const result = applyRuntimeCorrections(options);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else printHuman(result);
  if (result.errors.length) process.exitCode = 1;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`[runtime-corrections] error: ${err.message}`);
    process.exitCode = 1;
  });
}
