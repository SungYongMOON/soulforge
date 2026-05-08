#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { defaultActivityRoot } from "../activity/activity_log.mjs";
import { runHealerOnce } from "./healer_run.mjs";

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  if (command !== "run") {
    printUsageAndExit();
  }

  const repoRoot = path.resolve(args["repo-root"] ?? process.cwd());
  const activityRoot = path.resolve(args["activity-root"] ?? defaultActivityRoot(repoRoot));
  const result = await runHealerOnce({
    repoRoot,
    activityRoot,
    skipValidate: args["skip-validate"] === true,
    skipGatewayHealthcheck: args["skip-gateway-healthcheck"] === true,
  });

  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(
      [
        "Soulforge Healer Run",
        `result: ${result.result}`,
        `report: ${result.files.report_path}`,
        `latest_context: ${result.files.latest_context_path}`,
      ].join("\n") + "\n",
    );
  }

  if (result.result !== "completed") {
    process.exitCode = 1;
  }
}

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const parsedToken = parseFlagToken(token);
    const key = parsedToken.key;
    const inlineValue = parsedToken.value;
    const next = argv[index + 1];
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }
    if (next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
      continue;
    }
    args[key] = true;
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

function printUsageAndExit() {
  process.stderr.write(
    [
      "Usage:",
      "  node guild_hall/healer/cli.mjs run [--skip-validate] [--skip-gateway-healthcheck] [--json]",
    ].join("\n"),
  );
  process.exit(1);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
