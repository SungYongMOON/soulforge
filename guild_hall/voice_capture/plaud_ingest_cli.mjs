#!/usr/bin/env node
import path from "node:path";
import {
  buildPlaudPreflight,
  drainPlaudMailQueue,
  loadPlaudSyncProfile,
  runPlaudSync,
  writeDefaultPlaudSyncProfile,
  writePlaudLaunchdPlist,
} from "./plaud_ingest.mjs";
import {
  applyPlaudKstMigration,
  buildPlaudKstMigrationPlan,
  describePlaudKstMigrationPlan,
} from "./plaud_kst_migration.mjs";

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const repoRoot = args["repo-root"] ? path.resolve(args["repo-root"]) : process.cwd();
  const profileRef = args.config;

  if (command === "init-config") {
    print(await writeDefaultPlaudSyncProfile({ repoRoot, profileRef, apply: flag(args, "apply"), force: flag(args, "force") }));
    return;
  }
  if (command === "preflight") {
    print(await buildPlaudPreflight({ repoRoot, profileRef }));
    return;
  }
  if (command === "sync") {
    const result = await runPlaudSync({
      repoRoot,
      profileRef,
      apply: flag(args, "apply"),
      producerNode: args["producer-node"],
    });
    print(result);
    if (!result.ok || result.recordings.some((recording) => recording.state === "import_failed_retryable")) {
      process.exitCode = 75;
    }
    return;
  }
  if (command === "drain-mail-queue") {
    const result = await drainPlaudMailQueue({ repoRoot, profileRef, apply: flag(args, "apply") });
    print(result);
    if (result.retry_required) process.exitCode = 75;
    return;
  }
  if (command === "render-launchd") {
    const { profile } = await loadPlaudSyncProfile({ repoRoot, profileRef });
    print(await writePlaudLaunchdPlist({
      repoRoot,
      profile,
      profileRef,
      nodeId: args["node-id"] ?? "home_always_on_01",
      apply: flag(args, "apply"),
    }));
    return;
  }
  if (command === "audit-kst") {
    print(describePlaudKstMigrationPlan(await buildPlaudKstMigrationPlan({ repoRoot })));
    return;
  }
  if (command === "migrate-kst") {
    print(await applyPlaudKstMigration({
      repoRoot,
      apply: flag(args, "apply"),
      receiptRef: args.receipt,
    }));
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

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function usage() {
  process.stderr.write([
    "Usage:",
    "  node guild_hall/voice_capture/plaud_ingest_cli.mjs init-config [--apply] [--force]",
    "  node guild_hall/voice_capture/plaud_ingest_cli.mjs preflight [--config <path>]",
    "  node guild_hall/voice_capture/plaud_ingest_cli.mjs sync [--config <path>] [--producer-node <id>] [--apply]",
    "  node guild_hall/voice_capture/plaud_ingest_cli.mjs drain-mail-queue [--config <path>] [--apply]",
    "  node guild_hall/voice_capture/plaud_ingest_cli.mjs render-launchd [--config <path>] [--node-id <id>] [--apply]",
    "  node guild_hall/voice_capture/plaud_ingest_cli.mjs audit-kst [--repo-root <path>]",
    "  node guild_hall/voice_capture/plaud_ingest_cli.mjs migrate-kst [--repo-root <path>] [--apply] [--receipt <path>]",
    "",
  ].join("\n"));
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
