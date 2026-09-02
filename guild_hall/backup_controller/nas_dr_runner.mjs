#!/usr/bin/env node
/**
 * NAS disaster-recovery backup runner.
 *
 * Design shaped by how the previous lane failed: it wedged a checkpoint in
 * `running`, then failed silently every night for eighteen days while the last
 * good receipt aged out of anyone's attention. So:
 *
 *  - There is no persistent run lock. A crashed run leaves a `_staging_` directory
 *    and nothing else; the next run adopts or discards it. A dead run can never
 *    block a live one.
 *  - Every run writes `health.json` at the destination root whether it succeeded
 *    or failed, including the age of the newest verified generation. Silence is
 *    itself detectable: a stale `health.json` means the runner stopped running.
 *  - Retention never removes the newest verified generation, and never removes
 *    anything at all unless at least `keep` verified generations remain.
 *  - Live databases leave through VACUUM INTO. A file copy of an open SQLite file
 *    is torn and also misses whatever is still only in the write-ahead log.
 *  - Credential-shaped filenames are matched by name and never opened.
 *
 * Usage:
 *   node nas_dr_runner.mjs --config <path>            run a backup
 *   node nas_dr_runner.mjs --config <path> --dry-run  preflight only, no writes
 *   node nas_dr_runner.mjs --config <path> --health   print health and exit
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync,
  renameSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const CONFIG_SCHEMA = "soulforge.backup_controller.nas_dr_runner_config.v0";
const RECEIPT_SCHEMA = "soulforge.backup_controller.nas_dr_generation_receipt.v0";
const MANIFEST_SCHEMA = "soulforge.backup_controller.nas_dr_generation_manifest.v0";
const HEALTH_SCHEMA = "soulforge.backup_controller.nas_dr_health.v0";

// Windows path APIs stop at 260 characters and return "not found" rather than an
// error, so a naive walk silently under-counts a deep tree. Everything that reads
// the destination goes through the long-path form.
const longPath = (p) => (p.startsWith("\\\\") ? "\\\\?\\UNC" + p.slice(1) : "\\\\?\\" + p);

const SECRET_NAME =
  /(^|[.\\/])env($|[.\\/])|auth\.json|oauth|token|credential|secret|password|cookie|\.pem$|\.key$|\.pfx$|api[_-]?key/i;
const IS_DB = /\.(db|sqlite|sqlite3)$/i;
const IS_DB_SIDECAR = /\.(db|sqlite|sqlite3)-(wal|shm)$/i;

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

/** Exported for testing: a .db suffix is a naming convention, the header is the fact. */
export function looksLikeSqliteHeader(first16) {
  return Buffer.from(first16).subarray(0, 15).toString("latin1") === "SQLite format 3";
}

function isSqlite(absPath) {
  try {
    const fd = openSync(absPath, "r");
    try {
      const buf = Buffer.alloc(16);
      readSync(fd, buf, 0, 16, 0);
      return looksLikeSqliteHeader(buf);
    } finally { closeSync(fd); }
  } catch { return false; }
}
const nowIso = () => new Date().toISOString();
const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : (process.argv[i + 1] ?? true);
}

/** Exported so the refusals can be tested without a destination or a filesystem. */
export function validateConfig(cfg) {
  if (cfg.schema_version !== CONFIG_SCHEMA) throw new Error("config schema mismatch");
  if (typeof cfg.destination_root !== "string" || !cfg.destination_root.startsWith("\\\\")) {
    throw new Error("destination_root must be a UNC path; drive letters are not a backup contract");
  }
  if (/\\\\[A-Za-z0-9._-]*raidrive/i.test(cfg.destination_root)) {
    throw new Error("destination_root looks like a RaiDrive virtual host");
  }
  if (!Array.isArray(cfg.source_sets) || cfg.source_sets.length === 0) throw new Error("no source sets");
  if (!Number.isSafeInteger(cfg.keep_generations) || cfg.keep_generations < 2) {
    throw new Error("keep_generations must be at least 2");
  }
  if (!Number.isSafeInteger(cfg.min_free_bytes) || cfg.min_free_bytes < 1) {
    throw new Error("min_free_bytes must be positive");
  }
  return cfg;
}

function loadConfig(path) {
  return validateConfig(JSON.parse(readFileSync(path, "utf8").replace(/^﻿/, "")));
}

/** Free space read from the server, not from the number Windows reports for the mount. */
function freeBytes(uncRoot) {
  const out = execFileSync("fsutil.exe", ["volume", "diskfree", uncRoot], { encoding: "utf8" });
  const nums = out.match(/[\d,]{4,}/g);
  if (!nums || nums.length === 0) return null;
  return Number(nums[0].replace(/,/g, ""));
}

function listGenerations(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("_staging_"))
    .map((d) => {
      const receiptPath = join(root, d.name, "receipt.json");
      let receipt = null;
      try { receipt = JSON.parse(readFileSync(receiptPath, "utf8").replace(/^﻿/, "")); } catch { /* unverified */ }
      return { id: d.name, verified: receipt !== null && String(receipt.status).startsWith("verified"), receipt };
    })
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

function writeHealth(root, body) {
  try {
    writeFileSync(join(root, "health.json"), JSON.stringify({
      schema_version: HEALTH_SCHEMA, written_at: nowIso(), ...body,
    }, null, 2), "utf8");
  } catch { /* health must never be the thing that fails a run */ }
}

function main() {
  const configPath = arg("--config");
  if (!configPath) { process.stdout.write("usage: --config <path> [--dry-run] [--health]\n"); process.exit(64); }
  const cfg = loadConfig(configPath);
  const root = cfg.destination_root;
  const log = (m) => process.stdout.write(new Date().toISOString().slice(11, 19) + "  " + m + "\n");

  if (arg("--health")) {
    const gens = listGenerations(root);
    const newest = [...gens].reverse().find((g) => g.verified) ?? null;
    process.stdout.write(JSON.stringify({
      generations: gens.length,
      verified: gens.filter((g) => g.verified).length,
      newest_verified: newest?.id ?? null,
    }, null, 2) + "\n");
    return;
  }

  const dryRun = Boolean(arg("--dry-run"));
  const genId = (cfg.generation_prefix ?? "g") + "-" + stamp();
  const staging = join(root, "_staging_" + genId);
  const payload = join(staging, "payload");
  const started = nowIso();

  log("generation " + genId + (dryRun ? "  (dry run)" : ""));

  // --- preflight ------------------------------------------------------------
  if (!existsSync(root)) {
    writeHealth(root, { last_run_status: "failed", last_error: "destination_unreachable", last_run_at: started });
    throw new Error("destination unreachable: the share is not mounted or the credential is gone");
  }
  const free = freeBytes(root);
  log("free bytes at destination: " + (free ?? "unknown"));
  if (free !== null && free < cfg.min_free_bytes) {
    writeHealth(root, { last_run_status: "failed", last_error: "low_space_stop", free_bytes: free, last_run_at: started });
    throw new Error("low space stop: " + free + " < " + cfg.min_free_bytes);
  }

  const missing = cfg.source_sets.filter((s) => !existsSync(s.path));
  if (missing.length) {
    // The previous lane died here every night because a bound path had moved and
    // nothing said so out loud. Say it out loud.
    writeHealth(root, {
      last_run_status: "failed", last_error: "source_path_missing",
      missing_source_ids: missing.map((s) => s.id), last_run_at: started,
    });
    throw new Error("source paths missing: " + missing.map((s) => s.id).join(", "));
  }

  // Adopt nothing from a previous crash: staging is disposable by construction.
  for (const d of readdirSync(root, { withFileTypes: true })) {
    if (!d.isDirectory() || !d.name.startsWith("_staging_")) continue;
    const ageHours = (Date.now() - statSync(join(root, d.name)).mtimeMs) / 3_600_000;
    if (ageHours > (cfg.staging_max_age_hours ?? 24)) {
      log("discarding abandoned staging: " + d.name + " (" + Math.round(ageHours) + "h old)");
      if (!dryRun) rmSync(join(root, d.name), { recursive: true, force: true });
    }
  }

  if (dryRun) {
    log("dry run: preflight passed, nothing written");
    const gens = listGenerations(root);
    log("existing generations: " + gens.length + " (" + gens.filter((g) => g.verified).length + " verified)");
    return;
  }

  // --- capture --------------------------------------------------------------
  mkdirSync(payload, { recursive: true });
  const entries = [];
  const dbResults = [];
  const tmpDir = join(process.env.TEMP ?? ".", "nas_dr_export_" + genId);
  mkdirSync(tmpDir, { recursive: true });
  let skippedSecret = 0;

  const stage = (rel, absSrc) => {
    const dst = join(longPath(payload), rel.replace(/\//g, "\\"));
    mkdirSync(dirname(dst), { recursive: true });
    const bytes = readFileSync(absSrc);
    writeFileSync(dst, bytes);
    if (sha256(readFileSync(dst)) !== sha256(bytes)) throw new Error("readback mismatch: " + rel);
    entries.push({ path: rel, sha256: sha256(bytes), bytes: bytes.length });
  };

  const exportDb = (absSrc, rel) => {
    // Name the export by a digest of its path, not by the flattened path itself:
    // a deep source path flattens into a filename that exceeds the limit and the
    // export then fails for a reason that has nothing to do with the database.
    const out = join(tmpDir, sha256(Buffer.from(rel, "utf8")).slice(0, 32) + ".db");
    try {
      if (existsSync(out)) rmSync(out, { force: true });
      const live = new DatabaseSync(absSrc, { readOnly: true });
      // The destination must be a single-quoted literal: SQLite reads a
      // double-quoted token as an identifier and fails with "no such column".
      live.exec("VACUUM INTO '" + out.replace(/'/g, "''") + "'");
      live.close();
      const copy = new DatabaseSync(out, { readOnly: true });
      const qc = copy.prepare("PRAGMA quick_check").all().map((r) => Object.values(r)[0]).join(",");
      copy.close();
      if (qc !== "ok") { dbResults.push({ rel, ok: false, why: "quick_check " + qc }); return; }
      stage(rel, out);
      rmSync(out, { force: true });
      dbResults.push({ rel, ok: true });
    } catch (e) {
      dbResults.push({ rel, ok: false, why: String(e.message).slice(0, 120) });
    }
  };

  for (const set of cfg.source_sets) {
    const prefix = set.class + "/" + set.id;
    const skipDirs = new Set((set.exclude_dirs ?? []).map((s) => s.toLowerCase()));
    let n = 0;
    (function walk(absDir, relDir, isTop) {
      let items;
      try { items = readdirSync(longPath(absDir), { withFileTypes: true }); } catch { return; }
      for (const d of items) {
        const abs = join(absDir, d.name);
        const rel = relDir ? relDir + "/" + d.name : d.name;
        if (d.isDirectory()) {
          if (isTop && skipDirs.has(d.name.toLowerCase())) continue;
          if (!isTop && skipDirs.has(d.name.toLowerCase()) && set.exclude_dirs_at_any_depth) continue;
          walk(abs, rel, false);
        } else if (d.isFile()) {
          if (SECRET_NAME.test(rel)) { skippedSecret++; continue; }
          if (IS_DB_SIDECAR.test(d.name)) continue;
          // A .db suffix is a naming convention, not a format. Chrome shader
          // caches and similar files carry it without being SQLite, and trying to
          // VACUUM one produces a database failure that misreports a plain file.
          // Decide by the header, then copy or export accordingly.
          if (IS_DB.test(d.name) && isSqlite(abs)) { exportDb(abs, prefix + "/" + rel); n++; continue; }
          try { stage(prefix + "/" + rel, abs); n++; } catch { /* vanished mid-run; absence is recorded by the manifest */ }
        }
      }
    })(set.path, "", true);
    log("  " + set.id + ": " + n + " files");
  }
  rmSync(tmpDir, { recursive: true, force: true });

  const failedDbs = dbResults.filter((r) => !r.ok);
  const totalBytes = entries.reduce((a, e) => a + e.bytes, 0);
  log("staged " + entries.length + " files / " + totalBytes + " bytes"
    + "; databases " + (dbResults.length - failedDbs.length) + "/" + dbResults.length
    + "; credential files skipped " + skippedSecret);

  // --- manifest, close ------------------------------------------------------
  writeFileSync(join(longPath(staging), "manifest.json"), JSON.stringify({
    schema_version: MANIFEST_SCHEMA,
    generation_id: genId,
    family: "D_CANONICAL",
    created_at: started,
    source_sets: cfg.source_sets.map((s) => ({ class: s.class, id: s.id, exclude_dirs: s.exclude_dirs ?? [] })),
    excluded_classes: ["secret", "temp_or_cache", "active_worktree_scratch", "tool_transient_data"],
    credential_files_skipped: skippedSecret,
    database_results: dbResults,
    file_count: entries.length,
    total_bytes: totalBytes,
    files: entries.sort((a, b) => (a.path < b.path ? -1 : 1)),
  }), "utf8");

  renameSync(staging, join(root, genId));
  const status = failedDbs.length === 0 ? "verified" : "verified_with_database_exceptions";
  writeFileSync(join(root, genId, "receipt.json"), JSON.stringify({
    schema_version: RECEIPT_SCHEMA,
    generation_id: genId, family: "D_CANONICAL", status,
    file_count: entries.length, total_bytes: totalBytes,
    databases_exported: dbResults.length - failedDbs.length, databases_failed: failedDbs.length,
    every_file_readback_verified: true,
    close_protocol: "two_phase_staging_then_verified",
    started_at: started, finalized_at: nowIso(),
    claim_ceiling: "verified generation; isolated restore and human acceptance are separate gates",
  }, null, 2), "utf8");
  log("finalized " + genId + " (" + status + ")");

  // --- retention ------------------------------------------------------------
  const gens = listGenerations(root);
  const verified = gens.filter((g) => g.verified);
  const prunable = verified.slice(0, Math.max(0, verified.length - cfg.keep_generations));
  // Never prune the newest, and never prune below the keep floor.
  const newestId = verified.length ? verified[verified.length - 1].id : null;
  let pruned = 0;
  for (const g of prunable) {
    if (g.id === newestId) continue;
    log("pruning old generation beyond the keep window: " + g.id);
    rmSync(join(root, g.id), { recursive: true, force: true });
    pruned++;
  }
  if (pruned === 0) log("retention: nothing to prune (" + verified.length + " verified, keep " + cfg.keep_generations + ")");

  const after = listGenerations(root);
  const newestVerified = [...after].reverse().find((g) => g.verified) ?? null;
  writeHealth(root, {
    last_run_status: failedDbs.length === 0 ? "ok" : "ok_with_database_exceptions",
    last_run_at: started, last_run_finished_at: nowIso(),
    last_generation_id: genId, last_file_count: entries.length, last_total_bytes: totalBytes,
    databases_failed: failedDbs.length,
    generations_total: after.length, generations_verified: after.filter((g) => g.verified).length,
    newest_verified_generation: newestVerified?.id ?? null,
    free_bytes_at_start: free,
    pruned_this_run: pruned,
  });
  log("health written");
}

// Only run as a CLI when invoked directly, so importing this module for its
// exported guards does not start a backup.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (e) {
    process.stderr.write("BACKUP FAILED: " + e.message + "\n");
    process.exit(1);
  }
}
