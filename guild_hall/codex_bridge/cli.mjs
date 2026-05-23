#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { getCodexBridgeStatus, runCodexBridgeAsk } from "./codex_bridge.mjs";

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const repoRoot = path.resolve(args["repo-root"] ?? process.cwd());

  if (command === "status") {
    printJson(getCodexBridgeStatus({ command: args.command }));
    return;
  }

  if (command === "ask") {
    const result = await runCodexBridgeAsk({
      repoRoot,
      command: args.command,
      prompt: args.prompt ?? args._?.join(" "),
      context: args.context,
      mode: args.mode,
      model: args.model,
      profile: args.profile,
      outputRef: args["output-ref"],
      jsonEvents: Boolean(args.json),
    });
    if (args.text) {
      process.stdout.write(`${result.response.text}\n`);
      return;
    }
    printJson(result);
    return;
  }

  printUsageAndExit();
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      args._ = [...(args._ ?? []), token];
      continue;
    }
    const parsed = parseFlagToken(token);
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

function printJson(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function printUsageAndExit() {
  process.stderr.write(
    [
      "Usage:",
      "  node guild_hall/codex_bridge/cli.mjs status",
      "  node guild_hall/codex_bridge/cli.mjs ask --prompt <prompt> [--model <model>] [--profile <profile>] [--output-ref <repo-relative-md>] [--text]",
      "",
      "Notes:",
      "  This bridge wraps `codex exec` and uses the existing Codex/ChatGPT login when available.",
      "  It does not read auth files, does not require an API key, and runs Codex exec in read-only ephemeral mode by default.",
    ].join("\n"),
  );
  process.exit(1);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
