#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { defaultPrivateStateRoot, syncPrivateStateRepo } from "./sync.mjs";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(args["repo-root"] ?? process.cwd());
  const privateStateRoot = path.resolve(args["private-state-root"] ?? defaultPrivateStateRoot(repoRoot));
  const result = await syncPrivateStateRepo({
    repoRoot,
    privateStateRoot,
    skipFetch: args["skip-fetch"] === true,
    skipPull: args["skip-pull"] === true,
    skipMirror: args["skip-mirror"] === true,
    skipCommit: args["skip-commit"] === true,
    skipPush: args["skip-push"] === true,
    commitMessage: args["commit-message"],
    maxFileBytes: parseInteger(args["max-file-bytes"]),
  });

  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(
      [
        `private_state_sync: ${result.status}`,
        `reason: ${result.reason}`,
        `copied_files: ${result.mirror.copied_files}`,
        `committed: ${result.private_state.committed ? "yes" : "no"}`,
        `pushed: ${result.private_state.pushed ? "yes" : "no"}`,
      ].join("\n") + "\n",
    );
  }

  if (result.status !== "completed") {
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
    const raw = token.slice(2);
    const separatorIndex = raw.indexOf("=");
    const key = separatorIndex === -1 ? raw : raw.slice(0, separatorIndex);
    const inlineValue = separatorIndex === -1 ? undefined : raw.slice(separatorIndex + 1);
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

function parseInteger(value) {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
