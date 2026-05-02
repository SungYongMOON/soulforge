#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import {
  buildSnapshot,
  defaultSnapshotPath,
  validateSnapshot,
  writeSnapshot,
} from "./producer.mjs";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(args.repoRoot ?? process.cwd());
  const snapshot = await buildSnapshot({ repoRoot });
  const validation = validateSnapshot(snapshot);

  if (!validation.ok) {
    for (const error of validation.errors) {
      process.stderr.write(`snapshot validation error: ${error}\n`);
    }
    process.exitCode = 1;
    return;
  }

  if (args.check) {
    process.stdout.write(`PASS snapshot check: ${snapshot.schema_version}\n`);
    return;
  }

  if (args.json) {
    process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
    return;
  }

  const shouldWrite = args.write || args.out;
  if (shouldWrite) {
    const outputPath = path.resolve(repoRoot, args.out ?? path.relative(repoRoot, defaultSnapshotPath(repoRoot)));
    await writeSnapshot(snapshot, outputPath);
    process.stdout.write(`WROTE ${path.relative(repoRoot, outputPath).split(path.sep).join("/")}\n`);
    printSummary(snapshot);
    return;
  }

  printSummary(snapshot);
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--json") {
      args.json = true;
      continue;
    }
    if (token === "--write") {
      args.write = true;
      continue;
    }
    if (token === "--check") {
      args.check = true;
      continue;
    }
    if (token === "--out") {
      args.out = argv[index + 1];
      index += 1;
      continue;
    }
    if (token.startsWith("--out=")) {
      args.out = token.slice("--out=".length);
      continue;
    }
    if (token === "--repo-root") {
      args.repoRoot = argv[index + 1];
      index += 1;
      continue;
    }
    if (token.startsWith("--repo-root=")) {
      args.repoRoot = token.slice("--repo-root=".length);
    }
  }
  return args;
}

function printSummary(snapshot) {
  const projectCount = snapshot.projects.length;
  const missionCount = snapshot.missions.items.length;
  const gatewayInboxCount = snapshot.gateway.intake_inbox_count;
  const status = snapshot.diagnostics.summary.highest_severity;

  process.stdout.write(
    [
      "Soulforge Snapshot",
      `schema: ${snapshot.schema_version}`,
      `projects: ${projectCount}`,
      `missions: ${missionCount}`,
      `gateway inboxes: ${gatewayInboxCount}`,
      `diagnostics: ${status}`,
    ].join("\n"),
  );
  process.stdout.write("\n");
}

main().catch((error) => {
  const detail = error instanceof Error ? error.message : String(error);
  process.stderr.write(`snapshot fatal: ${detail}\n`);
  process.exitCode = 2;
});
