#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";

import {
  collectAllProjectLocalActivity,
  readHppLocalActivityBinding,
} from "./local_activity.mjs";

const MAX_LOCK_AGE_MS = 2 * 60 * 60 * 1000;
const MAX_PARTIAL_LOCK_AGE_MS = 5 * 60 * 1000;

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

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    return true;
  }
}

async function readExistingLock(lockPath) {
  let parsed;
  try {
    const bytes = await readFile(lockPath);
    if (bytes.length > 4096) fail("collector_lock_invalid");
    parsed = JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/u, ""));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    if (error?.code === "collector_lock_invalid") throw error;
    const lockStat = await stat(lockPath).catch((statError) => {
      if (statError?.code === "ENOENT") return null;
      throw statError;
    });
    if (lockStat === null) return null;
    return {
      invalid: true,
      modified_at_ms: lockStat.mtimeMs,
    };
  }
  if (
    parsed === null
    || typeof parsed !== "object"
    || Array.isArray(parsed)
    || !Number.isSafeInteger(parsed.pid)
    || parsed.pid < 1
    || typeof parsed.started_at !== "string"
    || !Number.isFinite(Date.parse(parsed.started_at))
    || (
      parsed.owner_token !== undefined
      && (typeof parsed.owner_token !== "string" || parsed.owner_token.length > 80)
    )
  ) {
    fail("collector_lock_invalid");
  }
  return parsed;
}

async function acquireLock(lockPath, owner) {
  await mkdir(path.dirname(lockPath), { recursive: true });
  try {
    const handle = await open(lockPath, "wx");
    await handle.writeFile(`${JSON.stringify(owner)}\n`, "utf8");
    await handle.sync();
    return { handle, recoveredPath: null };
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }

  const existing = await readExistingLock(lockPath);
  if (existing === null) return acquireLock(lockPath, owner);
  if (existing.invalid) {
    const partialAgeMs = Date.now() - existing.modified_at_ms;
    if (partialAgeMs < 0) fail("collector_lock_clock_invalid");
    if (partialAgeMs <= MAX_PARTIAL_LOCK_AGE_MS) {
      fail("collector_lock_invalid");
    }
  }
  const lockAgeMs = Date.now() - Date.parse(existing.started_at);
  if (!existing.invalid && lockAgeMs < 0) fail("collector_lock_clock_invalid");
  if (!existing.invalid && isProcessAlive(existing.pid)) {
    if (existing.owner_token || lockAgeMs <= MAX_LOCK_AGE_MS) {
      fail("collector_already_running");
    }
  }

  const recoveredPath = `${lockPath}.stale-${owner.owner_token}`;
  try {
    await rename(lockPath, recoveredPath);
  } catch (error) {
    if (error?.code === "ENOENT") return acquireLock(lockPath, owner);
    fail("collector_lock_recovery_failed");
  }
  try {
    const handle = await open(lockPath, "wx");
    await handle.writeFile(`${JSON.stringify(owner)}\n`, "utf8");
    await handle.sync();
    return { handle, recoveredPath };
  } catch (error) {
    const restored = await rename(recoveredPath, lockPath)
      .then(() => true)
      .catch(() => false);
    if (!restored) {
      await rm(recoveredPath, { force: true }).catch(() => {});
    }
    if (error?.code === "EEXIST") fail("collector_already_running");
    throw error;
  }
}

async function releaseLock(lockPath, ownerToken, lock) {
  await lock.handle?.close().catch(() => {});
  try {
    const current = await readExistingLock(lockPath);
    if (current?.owner_token === ownerToken) {
      await rm(lockPath, { force: true });
    }
  } finally {
    if (lock.recoveredPath) {
      await rm(lock.recoveredPath, { force: true }).catch(() => {});
    }
  }
}

async function withLock(lockPath, callback) {
  const owner = {
    pid: process.pid,
    started_at: new Date().toISOString(),
    owner_token: randomUUID(),
  };
  const lock = await acquireLock(lockPath, owner);
  try {
    return await callback();
  } finally {
    await releaseLock(lockPath, owner.owner_token, lock);
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
      changed_file_observation_count:
        project.file_activity.changed_observation_count,
      unchanged_file_observation_count:
        project.file_activity.unchanged_observation_count,
      absence_candidate_count:
        project.file_activity.absence_candidate_count,
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
