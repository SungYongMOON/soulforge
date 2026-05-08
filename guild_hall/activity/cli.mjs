#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import {
  appendActivityEvent,
  defaultActivityRoot,
  refreshLatestContext,
} from "./activity_log.mjs";

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const repoRoot = path.resolve(args["repo-root"] ?? process.cwd());
  const activityRoot = path.resolve(args["activity-root"] ?? defaultActivityRoot(repoRoot));

  if (command === "log") {
    const result = await appendActivityEvent({
      repoRoot,
      activityRoot,
      input: {
        scope: args.scope,
        project_code: args["project-code"] ?? args.project_code,
        action: args.action,
        result: args.result,
        summary: args.summary,
        refs: mergeRefs(args),
        detail_owner: args["detail-owner"],
        next_action: args["next-action"],
        carry_forward: args["carry-forward"],
        actor: args.actor,
      },
    });
    printResult(args, {
      status: "recorded",
      entry_id: result.event.entry_id,
      event: result.event,
      events_path: result.events_path,
      latest_context_path: result.latest_context_path,
    });
    return;
  }

  if (command === "refresh") {
    const latestContext = await refreshLatestContext({
      activityRoot,
      defaultRecentCount: args["recent-count"],
    });
    printResult(args, {
      status: "refreshed",
      latest_context_path: path.join(activityRoot, "latest_context.json"),
      latest_context: latestContext,
    });
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
    const rawKey = parsedToken.key;
    const inlineValue = parsedToken.value;
    const next = argv[index + 1];
    const value = inlineValue ?? (next && !next.startsWith("--") ? next : true);

    if (inlineValue === undefined && value === next) {
      index += 1;
    }

    if (args[rawKey] === undefined) {
      args[rawKey] = value;
    } else if (Array.isArray(args[rawKey])) {
      args[rawKey].push(value);
    } else {
      args[rawKey] = [args[rawKey], value];
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

function mergeRefs(args) {
  const refs = [];

  for (const key of ["ref", "refs"]) {
    const value = args[key];
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      refs.push(...value);
    } else {
      refs.push(value);
    }
  }

  return refs;
}

function printResult(args, payload) {
  if (args.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  const lines = [`activity ${payload.status}`];
  if (payload.entry_id) {
    lines.push(`entry_id: ${payload.entry_id}`);
  }
  if (payload.events_path) {
    lines.push(`events: ${payload.events_path}`);
  }
  if (payload.latest_context_path) {
    lines.push(`latest_context: ${payload.latest_context_path}`);
  }
  process.stdout.write(`${lines.join("\n")}\n`);
}

function printUsageAndExit() {
  process.stderr.write(
    [
      "Usage:",
      "  node guild_hall/activity/cli.mjs log --scope <scope> --action <action> --summary <summary> [--project-code <code>] [--result <result>] [--ref <path>] [--carry-forward true] [--next-action <text>] [--json]",
      "  node guild_hall/activity/cli.mjs refresh [--recent-count <n>] [--json]",
    ].join("\n"),
  );
  process.exit(1);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
