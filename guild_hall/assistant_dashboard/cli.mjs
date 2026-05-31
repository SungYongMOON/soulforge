#!/usr/bin/env node

import path from "node:path";
import process from "node:process";

import {
  buildAssistantDashboard,
  defaultAssistantDashboardPath,
  resolveAssistantDashboardOutputPath,
  validateAssistantDashboard,
  writeAssistantDashboard,
} from "./dashboard.mjs";
import { readJson } from "../shared/io.mjs";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(args["repo-root"] ?? process.cwd());

  if (args.validate) {
    const dashboardPath = resolveAssistantDashboardOutputPath(
      repoRoot,
      args.dashboard ?? args.out ?? path.relative(repoRoot, defaultAssistantDashboardPath(repoRoot)),
    );
    const dashboard = await readJson(dashboardPath);
    const validation = validateAssistantDashboard(dashboard);
    if (!validation.ok) {
      for (const error of validation.errors) {
        process.stderr.write(`assistant dashboard validation error: ${error}\n`);
      }
      process.exitCode = 1;
      return;
    }
    process.stdout.write(`PASS assistant dashboard: ${dashboard.schema_version}\n`);
    return;
  }

  const dashboard = await buildAssistantDashboard({ repoRoot });

  if (args.json) {
    process.stdout.write(`${JSON.stringify(dashboard, null, 2)}\n`);
    return;
  }

  const outputPath = resolveAssistantDashboardOutputPath(
    repoRoot,
    args.out ?? path.relative(repoRoot, defaultAssistantDashboardPath(repoRoot)),
  );
  await writeAssistantDashboard(dashboard, outputPath, { repoRoot });
  process.stdout.write(`WROTE ${path.relative(repoRoot, outputPath).split(path.sep).join("/")}\n`);
  process.stdout.write(`projects=${dashboard.summary.project_count} active_deadlines=${dashboard.summary.active_deadline_count} open_actions=${dashboard.summary.active_open_action_count} stale=${dashboard.summary.stale_warning_count}\n`);
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--json") {
      args.json = true;
      continue;
    }
    if (token === "--validate") {
      args.validate = true;
      continue;
    }
    if (token === "--out" || token === "--dashboard" || token === "--repo-root") {
      args[token.slice(2)] = argv[index + 1];
      index += 1;
      continue;
    }
    if (token.startsWith("--out=")) {
      args.out = token.slice("--out=".length);
      continue;
    }
    if (token.startsWith("--dashboard=")) {
      args.dashboard = token.slice("--dashboard=".length);
      continue;
    }
    if (token.startsWith("--repo-root=")) {
      args["repo-root"] = token.slice("--repo-root=".length);
      continue;
    }
  }
  return args;
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
