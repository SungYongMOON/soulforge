#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  digestSlackContinuousBinding,
  runSlackContinuousIngress,
} from "./slack_continuous_runner.mjs";
import {
  createSlackWebApiCall,
  createSlackWebApiPollingTransport,
  loadSlackBotToken,
} from "./slack_transport.mjs";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1] ?? null;
}

if (!process.argv.includes("--apply") || !argument("--binding")) {
  console.error("usage: slack_live_cli.mjs --binding <private-binding.json> --apply");
  process.exit(2);
}

try {
  const bindingPath = path.resolve(argument("--binding"));
  const binding = JSON.parse(await readFile(bindingPath, "utf8"));
  const bindingDigest = digestSlackContinuousBinding(binding);
  const botToken = await loadSlackBotToken(binding.credentials, process.env, {
    private_root: binding.private_root,
    data_root: binding.data_root,
    forbidden_roots: binding.forbidden_roots,
  });
  const apiCall = createSlackWebApiCall({ bot_token: botToken });
  const transport = createSlackWebApiPollingTransport({ apiCall, binding });
  const result = await runSlackContinuousIngress({
    binding,
    expected_binding_digest: bindingDigest,
    writer_authority_id: binding.writer.authority_id,
    writer_epoch: binding.writer.epoch,
    transport,
    dry_run: false,
    max_events: 15,
  });
  process.stdout.write(`${JSON.stringify({
    mode: result.mode,
    feature_status: result.feature_status,
    pulled_count: result.pulled_count,
    accepted_count: result.accepted_count,
    held_count: result.held_count,
    revision_count: result.revision_count,
    coverage_gaps: result.coverage_gaps,
  })}\n`);
} catch {
  console.error("slack_live_collection_failed");
  process.exit(1);
}
