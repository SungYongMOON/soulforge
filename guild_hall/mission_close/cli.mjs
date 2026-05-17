#!/usr/bin/env node

import process from "node:process";
import path from "node:path";
import { closeMissionFromBattleEvent } from "./mission_close.mjs";

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const repoRoot = path.resolve(args["repo-root"] ?? process.cwd());

  if (command === "close") {
    const result = await closeMissionFromBattleEvent({
      repoRoot,
      workmetaRoot: args["workmeta-root"],
      missionId: args["mission-id"] ?? args.mission_id,
      missionSurface: args["mission-surface"] ?? args.mission_surface,
      projectCode: args["project-code"] ?? args.project_code,
      runId: args["run-id"] ?? args.run_id,
      battleEventId: args["battle-event-id"] ?? args.battle_event_id,
      closedAt: args["closed-at"] ?? args.closed_at,
    });
    printResult(args, result);
    return;
  }

  printUsageAndExit();
}

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const parsedToken = parseFlagToken(token);
    const next = argv[index + 1];
    const value = parsedToken.value ?? (next && !next.startsWith("--") ? next : true);

    if (parsedToken.value === undefined && value === next) {
      index += 1;
    }

    args[parsedToken.key] = value;
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

function printResult(args, result) {
  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  const lines = [
    `mission_close ${result.status}`,
    `mission_id: ${result.mission_id}`,
    `project_code: ${result.project_code}`,
    `terminal_result: ${result.terminal_result}`,
    `run_id: ${result.run_id}`,
    `battle_event_id: ${result.battle_event_id}`,
  ];
  if (result.mission_surface !== "public") {
    lines.splice(2, 0, `mission_surface: ${result.mission_surface}`);
  }
  process.stdout.write(
    lines.join("\n") + "\n",
  );
}

function printUsageAndExit() {
  process.stderr.write(
    [
      "Usage:",
      "  node guild_hall/mission_close/cli.mjs close --mission-id <id> --run-id <run> --battle-event-id <event> [--mission-surface public|private] [--project-code <code>] [--workmeta-root <path>] [--closed-at <iso>] [--json]",
      "",
      "The command refuses to close unless the battle event exists in _workmeta/<project_code>/log/events/**",
      "and the run evidence directory exists at _workmeta/<project_code>/runs/<run_id>/.",
      "Private mission surface mode targets _workmeta/<project_code>/missions/<mission_id>/ and requires --project-code.",
    ].join("\n"),
  );
  process.exit(1);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
