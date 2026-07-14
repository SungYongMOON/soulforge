#!/usr/bin/env node
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createMailSetReconciliation } from "../src/runtime_mail_set_reconciliation.mjs";

function parseCli(argv) {
  const value = (name, fallback = undefined) => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[index + 1] : fallback;
  };
  return {
    help: argv.includes("--help") || argv.includes("-h"),
    apply: argv.includes("--apply"),
    metaPath: value("meta"),
    dbPath: value("db"),
    sourceCommit: value("source-commit"),
    backupRoot: value("backup-root"),
    receiptPath: value("receipt"),
  };
}

function usage() {
  console.log(`Usage:
  node tools/reconcile_runtime_mail_set.mjs --meta <real_meta.json> --db <dev-erp.db> --source-commit <sha> [--apply --backup-root <dir> --receipt <json>]

Dry-run is the default. The tool reads only mail IDs from SQLite, emits no IDs or bodies,
backs up real_meta.json byte-for-byte on apply, and writes a hash/count-only reconciliation receipt.`);
}

export function runCli(argv = process.argv.slice(2)) {
  const options = parseCli(argv);
  if (options.help) {
    usage();
    return 0;
  }
  if (!options.metaPath || !options.dbPath || !options.sourceCommit) throw new Error("meta_db_source_commit_required");
  const result = createMailSetReconciliation({
    metaPath: resolve(options.metaPath),
    dbPath: resolve(options.dbPath),
    sourceCommit: options.sourceCommit,
    backupRoot: options.backupRoot ? resolve(options.backupRoot) : undefined,
    receiptPath: options.receiptPath ? resolve(options.receiptPath) : undefined,
    apply: options.apply,
  });
  console.log(JSON.stringify(result, null, 2));
  return 0;
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (entry === import.meta.url) {
  try { process.exitCode = runCli(); }
  catch (error) {
    console.error(JSON.stringify({ ok: false, error: String(error?.message || error).slice(0, 160) }));
    process.exitCode = 1;
  }
}
