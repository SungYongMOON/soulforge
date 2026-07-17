#!/usr/bin/env node
import { syncCopyOnlyMirror } from "./copy_only_mirror.mjs";

function args(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    result[key.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
  }
  return result;
}

const input = args(process.argv.slice(2));
try {
  const result = await syncCopyOnlyMirror({
    sourceRoot: input.source,
    destinationRoot: input.destination,
    legacyRoot: input.legacy,
    stateRoot: input["state-root"],
    checkpointPath: input.checkpoint,
    receiptRoot: input.receipts,
    sourceOwnerRef: input["source-owner-ref"],
    lanes: String(input.lanes || "").split(","),
    maxNewFiles: input["max-new-files"] ? Number(input["max-new-files"]) : undefined,
    maxNewBytes: input["max-new-bytes"] ? Number(input["max-new-bytes"]) : undefined,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.limit_reached ? 1 : 0;
} catch (error) {
  process.stderr.write(`${JSON.stringify({ error: error?.code || "copy_only_mirror_failed" })}\n`);
  process.exitCode = 2;
}
