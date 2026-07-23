#!/usr/bin/env node

import process from "node:process";

import {
  SlackContinuousError,
  runSlackContinuousIngress,
} from "./slack_continuous_runner.mjs";
import { createSyntheticSlackTransport } from "./slack_transport.mjs";

if (process.argv.length !== 3 || process.argv[2] !== "--dry-run") {
  console.error("slack_continuous_cli_accepts_only_dry_run");
  process.exit(1);
}

let input = "";
for await (const chunk of process.stdin) input += chunk;
if (!input.trim()) {
  console.error("slack_continuous_cli_requires_stdin");
  process.exit(1);
}

try {
  const request = JSON.parse(input);
  const result = await runSlackContinuousIngress({
    binding: request.binding,
    expected_binding_digest: request.expected_binding_digest,
    writer_authority_id: request.writer_authority_id,
    writer_epoch: request.writer_epoch,
    transport: createSyntheticSlackTransport(request.records),
    dry_run: true,
    max_events: request.max_events ?? 100,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  if (error instanceof SlackContinuousError) {
    console.error(`slack_continuous_rejected:${error.code}:${error.path}`);
  } else {
    console.error("slack_continuous_failed");
  }
  process.exit(1);
}
