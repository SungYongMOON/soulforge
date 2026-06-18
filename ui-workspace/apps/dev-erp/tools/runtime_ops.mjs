#!/usr/bin/env node
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..");
const DEFAULT_DB = join(APP, "data", "dev-erp.db");
const SCHEMA = "dev_erp.runtime_ops.v1";

function isoStamp(now = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return [
    now.getFullYear(),
    p(now.getMonth() + 1),
    p(now.getDate()),
    "_",
    p(now.getHours()),
    p(now.getMinutes()),
    p(now.getSeconds()),
  ].join("");
}

function sqlString(value) {
  return String(value).replaceAll("'", "''");
}

function argValue(argv, name, fallback = null) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
}

function boolArg(argv, name) {
  return argv.includes(`--${name}`);
}

function safeStat(path) {
  try {
    return existsSync(path) ? statSync(path) : null;
  } catch {
    return null;
  }
}

function sha256File(path) {
  const hash = createHash("sha256");
  hash.update(readFileSync(path));
  return hash.digest("hex");
}

function readSchemaVersion(db) {
  try {
    return db.prepare("SELECT value FROM meta WHERE key='schema_version'").get()?.value ?? null;
  } catch {
    return null;
  }
}

export async function runtimeHealthCheck({
  url = "http://127.0.0.1:4300/api/health",
  timeoutMs = 3000,
  fetcher = fetch,
} = {}) {
  const started = Date.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const response = await fetcher(url, { signal: ctl.signal });
    const elapsed_ms = Date.now() - started;
    let body = null;
    try { body = await response.json(); } catch { /* non-json health body */ }
    return {
      schema: SCHEMA,
      kind: "health",
      ok: response.ok && body?.ok === true,
      status: response.ok && body?.ok === true ? "ok" : "degraded",
      url,
      http_status: response.status,
      elapsed_ms,
      body: body ? { ok: body.ok === true, schema: body.schema ?? null } : null,
    };
  } catch (error) {
    return {
      schema: SCHEMA,
      kind: "health",
      ok: false,
      status: "down",
      url,
      error: String(error?.message ?? error).slice(0, 200),
      elapsed_ms: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function backupRuntimeDb({
  dbPath = DEFAULT_DB,
  outDir = join(dirname(dbPath), "backups"),
  latestDir = null,
  tag = "runtime_ops",
  now = new Date(),
} = {}) {
  const source = resolve(dbPath);
  if (!existsSync(source)) {
    return { schema: SCHEMA, kind: "backup_db", ok: false, error: "db_missing", dbPath: source };
  }

  const stamp = isoStamp(now);
  const targetDir = resolve(outDir, `${tag}_${stamp}`);
  mkdirSync(targetDir, { recursive: true });
  const backupPath = join(targetDir, basename(source));
  const tmpPath = `${backupPath}.tmp`;
  rmSync(tmpPath, { force: true });
  rmSync(backupPath, { force: true });

  const db = new DatabaseSync(source);
  let quickCheck = null;
  try {
    db.exec("PRAGMA busy_timeout=5000");
    quickCheck = db.prepare("PRAGMA quick_check").get()?.quick_check ?? null;
    if (quickCheck !== "ok") {
      return {
        schema: SCHEMA,
        kind: "backup_db",
        ok: false,
        error: "quick_check_failed",
        dbPath: source,
        quick_check: quickCheck,
      };
    }
    db.exec(`VACUUM INTO '${sqlString(tmpPath)}'`);
  } finally {
    db.close();
  }

  copyFileSync(tmpPath, backupPath);
  rmSync(tmpPath, { force: true });

  let latestPath = null;
  if (latestDir) {
    const latest = resolve(latestDir);
    mkdirSync(latest, { recursive: true });
    latestPath = join(latest, basename(source));
    copyFileSync(backupPath, latestPath);
  }

  const backupStat = safeStat(backupPath);
  const liveStat = safeStat(source);
  const manifest = {
    schema: SCHEMA,
    kind: "runtime_db_backup_manifest",
    created_at: now.toISOString(),
    dbPath: source,
    backupPath,
    latestPath,
    quick_check: quickCheck,
    backup_bytes: backupStat?.size ?? null,
    backup_mtime_ms: backupStat?.mtimeMs ?? null,
    live_mtime_ms: liveStat?.mtimeMs ?? null,
    sha256: sha256File(backupPath),
  };
  const manifestPath = join(targetDir, "manifest.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  let latestManifestPath = null;
  if (latestDir && latestPath) {
    latestManifestPath = join(resolve(latestDir), `${basename(source, ".db")}.manifest.json`);
    writeFileSync(latestManifestPath, `${JSON.stringify({ ...manifest, latestPath }, null, 2)}\n`);
  }

  return {
    ...manifest,
    schema: SCHEMA,
    kind: "backup_db",
    ok: true,
    manifestPath,
    latestManifestPath,
  };
}

export function restoreTestRuntimeDb({
  backupPath = null,
  nasRoot = null,
  reportDir = null,
  now = new Date(),
} = {}) {
  const candidate = backupPath
    ? resolve(backupPath)
    : nasRoot
      ? join(resolve(nasRoot), "01_db_backups", "latest", "runtime_live", "dev-erp.db")
      : null;
  if (!candidate || !existsSync(candidate)) {
    return { schema: SCHEMA, kind: "restore_test", ok: false, error: "backup_missing", backupPath: candidate };
  }

  const db = new DatabaseSync(candidate, { readOnly: true });
  let quickCheck = null;
  let schemaVersion = null;
  let tableCount = null;
  try {
    quickCheck = db.prepare("PRAGMA quick_check").get()?.quick_check ?? null;
    schemaVersion = readSchemaVersion(db);
    tableCount = db.prepare("SELECT COUNT(*) AS n FROM sqlite_schema WHERE type='table'").get()?.n ?? null;
  } finally {
    db.close();
  }

  const stat = safeStat(candidate);
  const result = {
    schema: SCHEMA,
    kind: "restore_test",
    ok: quickCheck === "ok" && schemaVersion === "dev_erp.v1",
    checked_at: now.toISOString(),
    backupPath: candidate,
    bytes: stat?.size ?? null,
    mtime_ms: stat?.mtimeMs ?? null,
    sha256: sha256File(candidate),
    quick_check: quickCheck,
    schema_version: schemaVersion,
    table_count: tableCount,
  };

  const targetReportDir = reportDir
    ? resolve(reportDir, isoStamp(now))
    : nasRoot
      ? join(resolve(nasRoot), "02_restore_tests", isoStamp(now))
      : null;
  if (targetReportDir) {
    mkdirSync(targetReportDir, { recursive: true });
    result.reportPath = join(targetReportDir, "restore_test.json");
    writeFileSync(result.reportPath, `${JSON.stringify(result, null, 2)}\n`);
  }
  return result;
}

export function parseRuntimeOpsCli(argv = process.argv.slice(2)) {
  const command = argv.find((x) => !x.startsWith("--")) ?? "health";
  const nasRoot = argValue(argv, "nas-root", process.env.DEV_ERP_NAS_ROOT || null);
  return {
    command,
    json: boolArg(argv, "json"),
    url: argValue(argv, "url", "http://127.0.0.1:4300/api/health"),
    timeoutMs: Number(argValue(argv, "timeout-ms", "3000")),
    dbPath: argValue(argv, "db", DEFAULT_DB),
    backupPath: argValue(argv, "backup", null),
    outDir: argValue(argv, "out-dir", nasRoot ? join(nasRoot, "01_db_backups", "scheduled") : undefined),
    latestDir: argValue(argv, "latest-dir", nasRoot ? join(nasRoot, "01_db_backups", "latest", "runtime_live") : null),
    reportDir: argValue(argv, "report-dir", null),
    nasRoot,
    tag: argValue(argv, "tag", "runtime_ops"),
    help: boolArg(argv, "help") || boolArg(argv, "h"),
  };
}

function printHelp() {
  console.log(`Usage:
  node tools/runtime_ops.mjs health [--url <health-url>] [--timeout-ms 3000] [--json]
  node tools/runtime_ops.mjs backup-db [--db data/dev-erp.db] [--out-dir <dir>] [--latest-dir <dir>] [--json]
  node tools/runtime_ops.mjs restore-test [--backup <db>] [--nas-root <nas-root>] [--json]
  node tools/runtime_ops.mjs maintain [--url <health-url>] [--db <db>] [--nas-root <nas-root>] [--json]

Purpose:
  Small runtime operations helpers for dev-ERP.

Notes:
  - health calls /api/health only.
  - backup-db uses SQLite VACUUM INTO, so the copied DB includes WAL content consistently.
  - --nas-root expands to 01_db_backups/scheduled and 01_db_backups/latest/runtime_live.
  - restore-test opens the backup read-only and writes a metadata-only report under 02_restore_tests.
`);
}

function printHuman(result) {
  if (Array.isArray(result)) {
    for (const item of result) printHuman(item);
    return;
  }
  if (result.kind === "health") {
    console.log(`[runtime-ops] health ${result.ok ? "OK" : result.status}`);
    console.log(`  url: ${result.url}`);
    if (result.http_status) console.log(`  http: ${result.http_status}`);
    if (result.error) console.log(`  error: ${result.error}`);
    return;
  }
  if (result.kind === "backup_db") {
    console.log(`[runtime-ops] backup-db ${result.ok ? "OK" : "FAILED"}`);
    console.log(`  db: ${result.dbPath}`);
    if (result.backupPath) console.log(`  backup: ${result.backupPath}`);
    if (result.latestPath) console.log(`  latest: ${result.latestPath}`);
    if (result.error) console.log(`  error: ${result.error}`);
  }
  if (result.kind === "restore_test") {
    console.log(`[runtime-ops] restore-test ${result.ok ? "OK" : "FAILED"}`);
    console.log(`  backup: ${result.backupPath}`);
    console.log(`  quick_check: ${result.quick_check}`);
    console.log(`  schema_version: ${result.schema_version}`);
    if (result.reportPath) console.log(`  report: ${result.reportPath}`);
    if (result.error) console.log(`  error: ${result.error}`);
  }
}

export async function runRuntimeOps(options = parseRuntimeOpsCli()) {
  if (options.command === "health") return runtimeHealthCheck(options);
  if (options.command === "backup-db") return backupRuntimeDb(options);
  if (options.command === "restore-test") return restoreTestRuntimeDb(options);
  if (options.command === "maintain") {
    const health = await runtimeHealthCheck(options);
    const backup = backupRuntimeDb(options);
    const restore = backup.ok ? restoreTestRuntimeDb({ backupPath: backup.backupPath, nasRoot: options.nasRoot, reportDir: options.reportDir }) : null;
    return restore ? [health, backup, restore] : [health, backup];
  }
  return { schema: SCHEMA, ok: false, error: "unknown_command", command: options.command };
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const options = parseRuntimeOpsCli();
  if (options.help) {
    printHelp();
  } else {
    runRuntimeOps(options).then((result) => {
      if (options.json) console.log(JSON.stringify(result, null, 2));
      else printHuman(result);
      const ok = Array.isArray(result) ? result.every((x) => x.ok) : result.ok;
      if (!ok) process.exitCode = 1;
    }).catch((error) => {
      console.error(`[runtime-ops] error: ${error.message}`);
      process.exitCode = 1;
    });
  }
}
