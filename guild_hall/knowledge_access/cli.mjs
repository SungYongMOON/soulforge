#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { readKnowledgeRefAndRecord, recordKnowledgeAccess } from "./ledger.mjs";

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const repoRoot = path.resolve(args["repo-root"] ?? process.cwd());
  const commonOptions = {
    repoRoot,
    knowledgeRef: args.ref ?? args["knowledge-ref"],
    ledgerRoot: args["ledger-root"],
    ledgerFile: args["ledger-file"],
    ledgerRef: args["ledger-ref"],
    captureMode: args["capture-mode"],
    actorType: args["actor-type"],
    actorId: args["actor-id"],
    actorRef: args["actor-ref"],
    accessType: args["access-type"],
    reasonUsed: args["reason-used"] ?? args.reason,
    outputRef: args["output-ref"],
    outcomeState: args["outcome-state"],
    taskRef: args["task-ref"],
    runRef: args["run-ref"],
    workflowId: args["workflow-id"],
    skillId: args["skill-id"],
    missionId: args["mission-id"],
    advisoryHandoffRef: args["advisory-handoff-ref"],
    targetType: args["target-type"],
    sourceWorkflowId: args["source-workflow-id"],
    eventSourceRef: args["event-source-ref"],
    manualAgentNote: args["manual-agent-note"],
  };

  if (command === "read") {
    const result = await readKnowledgeRefAndRecord(commonOptions);
    if (args.json) {
      printJson({
        status: "recorded",
        mode: "read",
        content: result.content,
        event: result.event,
        ledger_path: result.ledger_path,
        ledger_ref: result.ledger_ref,
      });
      return;
    }
    process.stdout.write(result.content);
    if (!result.content.endsWith("\n")) {
      process.stdout.write("\n");
    }
    process.stderr.write(`knowledge access recorded: ${result.event.event_id}\n`);
    process.stderr.write(`ledger: ${result.ledger_ref}\n`);
    return;
  }

  if (command === "record") {
    const result = await recordKnowledgeAccess(commonOptions);
    printResult(args, {
      status: "recorded",
      mode: "record",
      event_id: result.event.event_id,
      event: result.event,
      ledger_path: result.ledger_path,
      ledger_ref: result.ledger_ref,
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

function printResult(args, payload) {
  if (args.json) {
    printJson(payload);
    return;
  }
  process.stdout.write(
    [
      `knowledge access ${payload.status}`,
      `mode: ${payload.mode}`,
      `event_id: ${payload.event_id}`,
      `ledger: ${payload.ledger_ref}`,
    ].join("\n") + "\n",
  );
}

function printJson(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function printUsageAndExit() {
  process.stderr.write(
    [
      "Usage:",
      "  node guild_hall/knowledge_access/cli.mjs read --ref <repo-relative-file> (--ledger-root <path> | --ledger-file <path.jsonl>) [--reason-used <text>] [--actor-id <id>] [--json]",
      "  node guild_hall/knowledge_access/cli.mjs record --ref <repo-relative-ref> (--ledger-root <path> | --ledger-file <path.jsonl>) [--access-type <type>] [--reason-used <text>] [--output-ref <ref>] [--json]",
      "",
      "Notes:",
      "  The ledger row is metadata-only. read mode returns file content to stdout/JSON but never stores it in the JSONL ledger.",
      "  Targets must be repo-relative public knowledge refs; secret-like, private, runtime, absolute, and traversal paths are blocked.",
    ].join("\n"),
  );
  process.exit(1);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
