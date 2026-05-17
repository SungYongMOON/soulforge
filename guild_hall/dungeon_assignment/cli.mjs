#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { materializeDungeonAssignment } from "./assignment.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(__dirname, "../..");

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  if (command === "file") {
    const result = await materializeDungeonAssignment({
      repoRoot: args["repo-root"] ? path.resolve(String(args["repo-root"])) : defaultRepoRoot,
      candidateFile: args["candidate-file"] ? String(args["candidate-file"]) : null,
      gatewayMonsterId: args["gateway-monster-id"] ? String(args["gateway-monster-id"]) : null,
      inboxDir: args["inbox-dir"] ? String(args["inbox-dir"]) : null,
      monsterId: args["monster-id"] ? String(args["monster-id"]) : null,
      projectCode: args["project-code"] ? String(args["project-code"]) : null,
      stage: args.stage ? String(args.stage) : null,
      workflowId: args["workflow-id"] ? String(args["workflow-id"]) : null,
      partyId: args["party-id"] ? String(args["party-id"]) : "guild_master_cell",
      missionId: args["mission-id"] ? String(args["mission-id"]) : null,
      emitPrivateMissionHandoff: Boolean(args["emit-private-mission-handoff"]),
      emitPublicMissionDraft: Boolean(args["emit-public-mission-draft"]),
      publicProjectCode: args["public-project-code"] ? String(args["public-project-code"]) : null,
      dryRun: Boolean(args["dry-run"]),
      now: args.now ? String(args.now) : null,
    });
    printJson(result);
    return;
  }

  printUsageAndExit();
}

function parseArgs(argv) {
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }
    flags[key] = next;
    index += 1;
  }
  return flags;
}

function printUsageAndExit() {
  console.error(
    [
      "Usage:",
      "  node guild_hall/dungeon_assignment/cli.mjs file (--inbox-dir <path> --monster-id <id> | --candidate-file <path> --gateway-monster-id <id>) [--project-code <code>] [--stage <stage>] [--emit-private-mission-handoff | --emit-public-mission-draft --public-project-code <safe-code>] [--dry-run]",
    ].join("\n"),
  );
  process.exit(1);
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
