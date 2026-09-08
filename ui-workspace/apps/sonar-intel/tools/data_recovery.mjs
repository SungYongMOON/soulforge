#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { backupData, restoreData, verifyBackup } from "../src/data_recovery.mjs";

export async function runDataRecovery(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === "--help") {
    return "Usage: node tools/data_recovery.mjs backup --data-dir <existing external directory> --backup-dir <new external directory>\n       node tools/data_recovery.mjs verify --backup-dir <generation> [--expected-manifest-sha256 <sha256>]\n       node tools/data_recovery.mjs restore --backup-dir <generation> --data-dir <new external directory> [--expected-manifest-sha256 <sha256>]\nDestination parents must exist. Restore preserves original bytes and disables collection until budget reconciliation; it never starts a service.";
  }
  const [operation, ...flags] = args;
  if (!["backup", "verify", "restore"].includes(operation)) throw new Error("recovery_operation_invalid");
  const allowed = new Set(operation === "backup" ? ["--data-dir", "--backup-dir"] : operation === "verify" ? ["--backup-dir", "--expected-manifest-sha256"] : ["--data-dir", "--backup-dir", "--expected-manifest-sha256"]);
  const values = new Map();
  for (let index = 0; index < flags.length; index += 2) {
    if (!allowed.has(flags[index]) || values.has(flags[index]) || !flags[index + 1] || flags[index + 1].startsWith("--")) throw new Error("recovery_arguments_invalid");
    values.set(flags[index], flags[index + 1]);
  }
  if (!values.has("--backup-dir") || (operation !== "verify" && !values.has("--data-dir"))) throw new Error("recovery_arguments_required");
  const options = { dataDir: values.get("--data-dir"), backupDir: values.get("--backup-dir"), expectedManifestSha256: values.get("--expected-manifest-sha256") };
  const result = operation === "backup" ? await backupData(options) : operation === "restore" ? restoreData(options) : verifyBackup(options);
  return { operation, ok: true, ...result };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runDataRecovery().then((result) => console.log(typeof result === "string" ? result : JSON.stringify(result, null, 2))).catch((error) => {
    // Native filesystem errors can contain private paths; report only bounded codes.
    const code = error.code ?? error.message;
    console.error(JSON.stringify({ ok: false, error: typeof code === "string" && /^[a-zA-Z0-9_]+$/.test(code) ? code : "recovery_failed", ...(Number.isSafeInteger(error.unknownCount) ? { unknownCount: error.unknownCount } : {}) }));
    process.exitCode = 1;
  });
}
