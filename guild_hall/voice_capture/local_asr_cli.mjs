#!/usr/bin/env node
import path from "node:path";
import {
  analyzeLocalAsrBacklog,
  analyzeLocalAsrSession,
  analyzeBoundedStrongAsrWindows,
  buildLocalAsrPreflight,
  drainLocalAsrQueue,
  enqueueLocalAsrBacklog,
  loadLocalAsrProfile,
  refreshLocalAsrContextEvents,
  writeDefaultLocalAsrProfile,
} from "./local_asr.mjs";

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const repoRoot = args["repo-root"] ? path.resolve(args["repo-root"]) : process.cwd();
  const profileRef = args.config;
  const common = { repoRoot, profileRef, apply: flag(args, "apply") };
  if (command === "init-config") {
    print(await writeDefaultLocalAsrProfile({ ...common, force: flag(args, "force") }));
    return;
  }
  if (command === "preflight") {
    print(await buildLocalAsrPreflight({ repoRoot, profileRef }));
    return;
  }
  if (command === "analyze-session") {
    print(await analyzeLocalAsrSession({ ...common, sessionDir: required(args, "session-dir") }));
    return;
  }
  if (command === "analyze-bounded-strong") {
    print(await analyzeBoundedStrongAsrWindows({
      ...common,
      requestPath: required(args, "request"),
    }));
    return;
  }
  if (command === "backlog") {
    const result = await analyzeLocalAsrBacklog({ ...common, maxSessions: numberArg(args, "max-sessions") });
    print(result);
    if (result.failed_count > 0) process.exitCode = 75;
    return;
  }
  if (command === "enqueue-backlog") {
    print(await enqueueLocalAsrBacklog(common));
    return;
  }
  if (command === "drain-queue") {
    const { profile } = await loadLocalAsrProfile({ repoRoot, profileRef });
    const result = await drainLocalAsrQueue({ ...common, profile, maxSessions: numberArg(args, "max-sessions") });
    print(result);
    if (result.retry_required) process.exitCode = 75;
    return;
  }
  if (command === "refresh-context-events") {
    print(await refreshLocalAsrContextEvents({ ...common, projectCode: args.project ?? "P00-000_INBOX" }));
    return;
  }
  usage();
  process.exitCode = 1;
}

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) result[key] = true;
    else {
      result[key] = next;
      index += 1;
    }
  }
  return result;
}

function flag(args, name) {
  return args[name] === true || args[name] === "true";
}

function required(args, name) {
  if (!args[name] || args[name] === true) throw new Error(`missing --${name}`);
  return args[name];
}

function numberArg(args, name) {
  return args[name] == null || args[name] === true ? undefined : Number(args[name]);
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function usage() {
  process.stderr.write([
    "Usage:",
    "  node guild_hall/voice_capture/local_asr_cli.mjs init-config [--apply] [--force]",
    "  node guild_hall/voice_capture/local_asr_cli.mjs preflight [--config <path>]",
    "  node guild_hall/voice_capture/local_asr_cli.mjs analyze-session --session-dir <path> [--apply]",
    "  node guild_hall/voice_capture/local_asr_cli.mjs analyze-bounded-strong --request <path> [--apply]",
    "  node guild_hall/voice_capture/local_asr_cli.mjs backlog [--max-sessions <n>] [--apply]",
    "  node guild_hall/voice_capture/local_asr_cli.mjs enqueue-backlog [--apply]",
    "  node guild_hall/voice_capture/local_asr_cli.mjs drain-queue [--max-sessions <n>] [--apply]",
    "  node guild_hall/voice_capture/local_asr_cli.mjs refresh-context-events [--project <code>] [--apply]",
    "",
  ].join("\n"));
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
