#!/usr/bin/env node

import process from "node:process";
import path from "node:path";
import {
  renderDailyWorklogDraft,
  validateDailyLedgerFiles,
} from "./daily_ledger.mjs";

const FLAGS_BY_COMMAND = {
  validate: new Set(["repo-root", "ledger-file", "ledger-ref", "json"]),
  render: new Set(["repo-root", "ledger-file", "ledger-ref", "expect-ledger", "date", "json"]),
};

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!FLAGS_BY_COMMAND[command]) {
    printUsageAndExit();
  }

  const args = parseArgs(rest, FLAGS_BY_COMMAND[command]);
  const repoRoot = path.resolve(args["repo-root"] ?? process.cwd());

  if (command === "validate") {
    const result = await validateDailyLedgerFiles({
      repoRoot,
      ledgerFiles: args["ledger-file"],
      ledgerRefs: args["ledger-ref"],
    });
    printResult(args, result, "daily ledger validation");
    if (!result.ok) {
      process.exitCode = 1;
    }
    return;
  }

  if (command === "render") {
    const result = await renderDailyWorklogDraft({
      repoRoot,
      ledgerFiles: args["ledger-file"],
      ledgerRefs: args["ledger-ref"],
      expectedLedgerCodes: args["expect-ledger"],
      date: args.date,
    });
    if (args.json) {
      printJson(result);
      return;
    }
    process.stdout.write(result.markdown);
    return;
  }

  printUsageAndExit();
}

function parseArgs(argv, allowedFlags) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      throw new Error(`unexpected_daily_ledger_argument:${token}`);
    }

    const parsed = parseFlagToken(token);
    if (!allowedFlags.has(parsed.key)) {
      throw new Error(`unknown_daily_ledger_flag:${parsed.key}`);
    }

    const next = argv[index + 1];
    const value = parsed.value ?? (next && !next.startsWith("--") ? next : true);
    if (parsed.value === undefined && value === next) {
      index += 1;
    }

    if (args[parsed.key] === undefined) {
      args[parsed.key] = value;
    } else if (Array.isArray(args[parsed.key])) {
      args[parsed.key].push(value);
    } else {
      args[parsed.key] = [args[parsed.key], value];
    }
  }

  return args;
}

function parseFlagToken(token) {
  const raw = token.slice(2);
  const separatorIndex = raw.indexOf("=");
  if (separatorIndex === -1) {
    return { key: raw, value: undefined };
  }
  return {
    key: raw.slice(0, separatorIndex),
    value: raw.slice(separatorIndex + 1),
  };
}

function printResult(args, result, label) {
  if (args.json) {
    printJson(result);
    return;
  }

  process.stdout.write(`${label}\n`);
  process.stdout.write(`ok: ${result.ok ? "yes" : "no"}\n`);
  process.stdout.write(`ledgers: ${result.ledger_count}\n`);
  process.stdout.write(`errors: ${result.error_count}\n`);
  for (const error of result.errors.slice(0, 20)) {
    process.stdout.write(`- ${error.source_ref}: ${error.id} at ${error.path}\n`);
  }
  if (result.errors.length > 20) {
    process.stdout.write(`... ${result.errors.length - 20} more\n`);
  }
}

function printJson(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function printUsageAndExit() {
  process.stderr.write(
    [
      "Usage:",
      "  node guild_hall/daily_ledger/cli.mjs validate (--ledger-file <path> | --ledger-ref <_workmeta/.../daily_ledger/...>)... [--json]",
      "  node guild_hall/daily_ledger/cli.mjs render (--ledger-file <path> | --ledger-ref <_workmeta/.../daily_ledger/...>)... [--expect-ledger <code>] [--date YYYY-MM-DD] [--json]",
      "",
      "Notes:",
      "  validate and render read only explicit daily ledger files or refs.",
      "  --ledger-ref must stay under _workmeta/<project>/daily_ledger/** or _workmeta/system/daily_ledger/<subledger>/**.",
      "  --ledger-file may point at a temp fixture outside the repo for dry-run validation.",
      "  Renderer flags intentionally do not accept mail, git, system-log, raw-source, or attachment refs.",
    ].join("\n"),
  );
  process.exit(1);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
