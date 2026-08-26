#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import process from "node:process";
import YAML from "yaml";
import { evaluateProjectBootstrapPreview } from "./project_bootstrap_preflight.mjs";

function usage() {
  return "Usage: node project_bootstrap_preflight_cli.mjs --request <yaml|json> --register <yaml|json>";
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") return { help: true };
    if (token === "--request" || token === "--register") {
      const value = argv[index + 1];
      if (!value) throw new Error(`missing value for ${token}`);
      result[token.slice(2)] = value;
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${token}`);
  }
  if (!result.request || !result.register) throw new Error("request and register are required");
  return result;
}

async function readStructured(path) {
  return YAML.parse(await readFile(path, "utf8"));
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      process.stdout.write(`${usage()}\n`);
      return;
    }
    const [request, register] = await Promise.all([
      readStructured(args.request),
      readStructured(args.register),
    ]);
    const preview = evaluateProjectBootstrapPreview(request, register);
    process.stdout.write(`${JSON.stringify(preview, null, 2)}\n`);
    if (!preview.ok) process.exitCode = 2;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: "PREFLIGHT_CLI_ERROR", message: String(error.message ?? error) })}\n`);
    process.exitCode = 1;
  }
}

await main();
