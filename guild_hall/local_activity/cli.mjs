#!/usr/bin/env node

import { mkdir, open, rm } from "node:fs/promises";
import path from "node:path";

import {
  collectAllProjectLocalActivity,
  readHppLocalActivityBinding,
} from "./local_activity.mjs";

function fail(code, message = code) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}

function parseArgs(argv) {
  const args = { apply: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--apply") {
      args.apply = true;
      continue;
    }
    if (["--binding", "--binding-sha256", "--observed-at"].includes(token)) {
      args[token.slice(2).replaceAll("-", "_")] = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    fail("argument_invalid");
  }
  if (!args.binding || !path.isAbsolute(args.binding)) fail("binding_path_required");
  if (!args.binding_sha256) fail("binding_sha256_required");
  return args;
}

async function withLock(lockPath, callback) {
  let handle;
  try {
    await mkdir(path.dirname(lockPath), { recursive: true });
    handle = await open(lockPath, "wx");
    await handle.writeFile(`${JSON.stringify({
      pid: process.pid,
      started_at: new Date().toISOString(),
    })}\n`, "utf8");
    await handle.sync();
  } catch (error) {
    if (error?.code === "EEXIST") fail("collector_already_running");
    throw error;
  }
  try {
    return await callback();
  } finally {
    await handle?.close().catch(() => {});
    await rm(lockPath, { force: true }).catch(() => {});
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { binding, binding_sha256: bindingSha256 } =
    await readHppLocalActivityBinding(args.binding, args.binding_sha256);
  const run = () => collectAllProjectLocalActivity({
    binding,
    bindingSha256,
    observedAt: args.observed_at ?? new Date().toISOString(),
    apply: args.apply,
  });
  const result = args.apply
    ? await withLock(path.join(binding.state_root, "collector.lock"), run)
    : await run();
  process.stdout.write(`${JSON.stringify({
    ok: true,
    apply: args.apply,
    binding_id: result.binding_id,
    node_id: result.node_id,
    observed_at: result.observed_at,
    project_count: result.project_count,
    totals: result.totals,
    projects: result.projects.map((project) => ({
      status: project.status,
      error_code: project.error_code,
      project_code: project.project_code,
      file_source_availability: project.file_activity.source_availability,
      observed_file_count: project.file_activity.counts?.observed_file_count ?? 0,
      exact_content_count: project.file_activity.counts?.exact_content_count ?? 0,
      bounded_work_source_availability: project.bounded_work.source_availability,
      bounded_work_occurrence_count: project.bounded_work.native_occurrence_count,
      codex_run_relation_count: project.bounded_work.codex_run_relation_count,
      held_conflict_count: project.bounded_work.held_conflict_count,
    })),
    batch_digest: result.batch_digest,
    claim_ceiling: "hpp_local_outbox_collection_only",
  })}\n`);
}

main().catch((error) => {
  process.stderr.write(`hpp_local_activity_rejected:${error?.code ?? "unexpected"}\n`);
  process.exitCode = 1;
});
