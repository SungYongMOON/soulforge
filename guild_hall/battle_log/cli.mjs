#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  appendBattleEvent,
  defaultWorkmetaRoot,
  renderBattleLog,
} from "./battle_log.mjs";

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const repoRoot = path.resolve(args["repo-root"] ?? process.cwd());
  const workmetaRoot = path.resolve(args["workmeta-root"] ?? defaultWorkmetaRoot(repoRoot));

  if (command === "append") {
    const input = await loadEventInput(args);
    const result = await appendBattleEvent({
      repoRoot,
      workmetaRoot,
      projectCode: args["project-code"] ?? args.project_code ?? input.project_code,
      input,
      latestCount: args["latest-count"],
    });
    printResult(args, {
      status: "appended",
      event_id: result.event.event_id,
      events_path: result.events_path,
      daily_path: result.daily_path,
      latest_path: result.latest_path,
      event: result.event,
    });
    return;
  }

  if (command === "render") {
    const result = await renderBattleLog({
      repoRoot,
      workmetaRoot,
      projectCode: args["project-code"] ?? args.project_code,
      date: args.date,
      latestCount: args["latest-count"],
    });
    printResult(args, {
      status: "rendered",
      daily_path: result.daily_path,
      latest_path: result.latest_path,
      daily_event_count: result.daily_event_count,
      latest_event_count: result.latest_event_count,
    });
    return;
  }

  printUsageAndExit();
}

async function loadEventInput(args) {
  if (args["event-json"]) {
    return JSON.parse(args["event-json"]);
  }
  if (args["event-file"]) {
    return JSON.parse(await fs.readFile(path.resolve(args["event-file"]), "utf8"));
  }
  const stdin = await readStdin();
  if (stdin.trim()) {
    return JSON.parse(stdin);
  }
  throw new Error("missing_event_input");
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

    if (args[parsedToken.key] === undefined) {
      args[parsedToken.key] = value;
    } else if (Array.isArray(args[parsedToken.key])) {
      args[parsedToken.key].push(value);
    } else {
      args[parsedToken.key] = [args[parsedToken.key], value];
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

async function readStdin() {
  if (process.stdin.isTTY) {
    return "";
  }
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function printResult(args, payload) {
  if (args.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  const lines = [`battle_log ${payload.status}`];
  if (payload.event_id) {
    lines.push(`event_id: ${payload.event_id}`);
  }
  if (payload.daily_event_count !== undefined) {
    lines.push(`daily_events: ${payload.daily_event_count}`);
  }
  if (payload.latest_event_count !== undefined) {
    lines.push(`latest_events: ${payload.latest_event_count}`);
  }
  if (payload.events_path) {
    lines.push(`events: ${payload.events_path}`);
  }
  if (payload.daily_path) {
    lines.push(`daily: ${payload.daily_path}`);
  }
  if (payload.latest_path) {
    lines.push(`latest: ${payload.latest_path}`);
  }
  process.stdout.write(`${lines.join("\n")}\n`);
}

function printUsageAndExit() {
  process.stderr.write(
    [
      "Usage:",
      "  node guild_hall/battle_log/cli.mjs append --project-code <code> --event-file <event.json> [--workmeta-root <path>] [--json]",
      "  node guild_hall/battle_log/cli.mjs append --event-json '<json>' [--workmeta-root <path>] [--json]",
      "  node guild_hall/battle_log/cli.mjs append < event.json",
      "  node guild_hall/battle_log/cli.mjs render --project-code <code> [--date YYYY-MM-DD] [--workmeta-root <path>] [--json]",
    ].join("\n"),
  );
  process.exit(1);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
