#!/usr/bin/env node

import process from "node:process";
import { pathToFileURL } from "node:url";
import { stageIngressFile } from "./collector.mjs";

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function usage() {
  return [
    "Usage:",
    "  npm run guild-hall:ingress:stage -- --lane <team_files|structured_pc_work|run_logs> --source <file> --source-owner-ref <safe-id> --source-key <safe-id> --data-root <absolute-path> [--apply]",
    "",
    "Default mode is dry-run and writes nothing. --apply stages one explicit regular file.",
  ].join("\n");
}

export function parseArgs(argv) {
  const parsed = { apply: false };
  const valueFlags = new Map([
    ["--lane", "lane"],
    ["--source", "source"],
    ["--source-owner-ref", "sourceOwnerRef"],
    ["--source-key", "sourceKey"],
    ["--data-root", "dataRoot"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--apply") {
      if (parsed.apply) fail("duplicate_argument");
      parsed.apply = true;
      continue;
    }
    if (token === "--help") {
      parsed.help = true;
      continue;
    }
    const key = valueFlags.get(token);
    if (!key) fail("invalid_argument");
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) fail("missing_argument_value");
    if (parsed[key] !== undefined) fail("duplicate_argument");
    parsed[key] = value;
    index += 1;
  }
  if (
    !parsed.help
    && (!parsed.lane || !parsed.source || !parsed.sourceOwnerRef || !parsed.sourceKey || !parsed.dataRoot)
  ) fail("missing_required_argument");
  return parsed;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const result = await stageIngressFile(args);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const code = typeof error?.code === "string" && /^[a-z0-9_]+$/.test(error.code)
      ? error.code
      : "unexpected_failure";
    process.stderr.write(`ingress-stage fatal: ${code}\n`);
    process.exitCode = 2;
  });
}
