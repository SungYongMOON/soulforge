#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const ENTRY = join(ROOT, "ui-workspace", "apps", "dev-erp-mcp", "src", "ingress_mtls_client.mjs");
const OUTPUT = join(ROOT, "ui-workspace", "apps", "soulforge-universal-client", "generated", "ingress_mtls_client.bundle.mjs");

const result = await build({
  entryPoints: [ENTRY],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  write: false,
  legalComments: "none",
  sourcemap: false,
  minify: false,
  treeShaking: true,
  logLevel: "silent",
});
const rawText = Buffer.from(result.outputFiles[0].contents).toString("utf8");
const normalizedText = rawText.replace(/[ \t]+(?=\r?$)/gmu, "");
const bytes = Buffer.from(normalizedText, "utf8");

if (process.argv.includes("--check")) {
  let tracked;
  try { tracked = readFileSync(OUTPUT); }
  catch { tracked = null; }
  if (tracked === null || !tracked.equals(bytes)) {
    process.stderr.write("Universal Client transport bundle drifted; rebuild and review it.\n");
    process.exit(1);
  }
  process.stdout.write(`Universal Client transport bundle ok: ${bytes.length} bytes\n`);
} else {
  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, bytes);
  process.stdout.write(`wrote Universal Client transport bundle: ${bytes.length} bytes\n`);
}
