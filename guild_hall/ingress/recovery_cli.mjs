#!/usr/bin/env node
import {
  createIngressRecoverySnapshot,
  IngressRecoveryError,
  INGRESS_RECOVERY_RESULT_SCHEMA,
  verifyIngressRecoveryRestore,
} from "./recovery.mjs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const VALUE_OPTIONS = new Set([
  "source-root",
  "backup-root",
  "recovery-policy",
  "sqlite-db",
  "generation-id",
  "restore-root",
  "expected-source-identity",
  "expected-source-digest",
  "expected-manifest-sha256",
  "approval-ref",
]);
const FLAG_OPTIONS = new Set(["apply", "help"]);

function fail(code) {
  throw new IngressRecoveryError(code);
}

function parseArguments(argv) {
  const command = argv[0];
  if (!new Set(["snapshot", "restore-test", "help", "--help", "-h"]).has(command)) {
    fail("recovery_cli_command_invalid");
  }
  if (new Set(["help", "--help", "-h"]).has(command)) return { command: "help" };
  const values = new Map();
  const flags = new Set();
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) fail("recovery_cli_argument_invalid");
    const name = token.slice(2);
    if (FLAG_OPTIONS.has(name)) {
      if (flags.has(name)) fail("recovery_cli_argument_duplicate");
      flags.add(name);
      continue;
    }
    if (!VALUE_OPTIONS.has(name) || values.has(name)) fail("recovery_cli_argument_invalid");
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) fail("recovery_cli_value_missing");
    values.set(name, value);
    index += 1;
  }
  const allowed = command === "snapshot"
    ? new Set([
      "source-root",
      "backup-root",
      "recovery-policy",
      "sqlite-db",
      "generation-id",
      "expected-source-identity",
      "expected-source-digest",
      "approval-ref",
    ])
    : new Set([
      "backup-root",
      "recovery-policy",
      "generation-id",
      "restore-root",
      "expected-source-identity",
      "expected-source-digest",
      "expected-manifest-sha256",
      "approval-ref",
    ]);
  for (const name of values.keys()) if (!allowed.has(name)) fail("recovery_cli_argument_invalid");
  return {
    command,
    apply: flags.has("apply"),
    help: flags.has("help"),
    sourceRoot: values.get("source-root"),
    backupRoot: values.get("backup-root"),
    recoveryPolicyPath: values.get("recovery-policy"),
    sqlitePath: values.get("sqlite-db"),
    generationId: values.get("generation-id"),
    restoreRoot: values.get("restore-root"),
    expectedSourceIdentity: values.get("expected-source-identity"),
    expectedSourceDigest: values.get("expected-source-digest"),
    expectedManifestSha256: values.get("expected-manifest-sha256"),
    approvalRef: values.get("approval-ref"),
  };
}

function helpResult() {
  return {
    schema_version: INGRESS_RECOVERY_RESULT_SCHEMA,
    ok: true,
    operation: "help",
    status: "no_write",
    usage: [
      "recovery snapshot --source-root <absolute> --backup-root <absolute> --recovery-policy <absolute> [--sqlite-db <absolute>]",
      "recovery snapshot --source-root <absolute> --backup-root <absolute> --recovery-policy <absolute> [--sqlite-db <absolute>] --apply --expected-source-identity <sha256> --expected-source-digest <sha256> --approval-ref <opaque-id>",
      "recovery restore-test --backup-root <absolute> --generation-id <id> --restore-root <absolute> --recovery-policy <absolute>",
      "recovery restore-test --backup-root <absolute> --generation-id <id> --restore-root <absolute> --recovery-policy <absolute> --apply --expected-manifest-sha256 <sha256> --expected-source-identity <sha256> --expected-source-digest <sha256> --approval-ref <opaque-id>",
    ],
    dry_run_default: true,
    output: "sanitized_json_only",
  };
}

export async function runRecoveryCli(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.command === "help" || options.help) return helpResult();
  if (options.command === "snapshot") return createIngressRecoverySnapshot(options);
  return verifyIngressRecoveryRestore(options);
}

function sanitizedFailure(error, command) {
  return {
    schema_version: INGRESS_RECOVERY_RESULT_SCHEMA,
    ok: false,
    operation: new Set(["snapshot", "restore-test"]).has(command) ? command.replace("-", "_") : "unknown",
    status: error?.mutationStatus && error.mutationStatus !== "no_write_claim"
      ? `blocked_${error.mutationStatus}`
      : "blocked_no_write_claim",
    code: error instanceof IngressRecoveryError ? error.code : "recovery_internal_failure",
  };
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  const command = process.argv[2];
  try {
    const result = await runRecoveryCli();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify(sanitizedFailure(error, command))}\n`);
    process.exitCode = 1;
  }
}
