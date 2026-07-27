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
  executeCodexWorkContextOperation,
  readCodexWorkContextBinding,
} from "./codex_work_context.mjs";

const MAX_PARTIAL_LOCK_AGE_MS = 5 * 60 * 1000;
const MAX_LIVE_LOCK_AGE_MS = 15 * 60 * 1000;

function fail(code, message = code) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if ([
      "--binding",
      "--binding-sha256",
      "--operation",
      "--project",
      "--payload-json",
      "--payload-base64",
      "--occurred-at",
      "--event-id",
    ].includes(token)) {
      args[token.slice(2).replaceAll("-", "_")] = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    fail("argument_invalid");
  }
  if (!args.binding || !path.isAbsolute(args.binding)) fail("binding_path_required");
  if (!args.binding_sha256) fail("binding_sha256_required");
  if (!args.operation) fail("operation_required");
  if (!args.project) fail("project_required");
  if (args.payload_json && args.payload_base64) fail("payload_input_conflict");
  return args;
}

function parsePayload(jsonValue, base64Value) {
  if (jsonValue === undefined && base64Value === undefined) return {};
  let value = jsonValue;
  if (base64Value !== undefined) {
    if (
      typeof base64Value !== "string"
      || !/^[A-Za-z0-9+/]+={0,2}$/u.test(base64Value)
    ) {
      fail("payload_base64_invalid");
    }
    value = Buffer.from(base64Value, "base64").toString("utf8");
  }
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    fail("payload_json_invalid");
  }
  if (
    parsed === null
    || typeof parsed !== "object"
    || Array.isArray(parsed)
    || Object.getPrototypeOf(parsed) !== Object.prototype
  ) {
    fail("payload_json_invalid");
  }
  for (const reserved of [
    "operation",
    "project_code",
    "occurred_at",
    "event_id",
  ]) {
    if (Object.hasOwn(parsed, reserved)) fail("payload_reserved_key");
  }
  return parsed;
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
    if (bytes.length > 4096) fail("codex_work_context_lock_invalid");
    parsed = JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/u, ""));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    if (error?.code === "codex_work_context_lock_invalid") throw error;
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
    || typeof parsed.owner_token !== "string"
    || parsed.owner_token.length < 1
    || parsed.owner_token.length > 80
  ) {
    fail("codex_work_context_lock_invalid");
  }
  return parsed;
}

async function acquireLock(lockPath, owner) {
  await mkdir(path.dirname(lockPath), { recursive: true });
  try {
    const handle = await open(lockPath, "wx");
    await handle.writeFile(`${JSON.stringify(owner)}\n`, "utf8");
    await handle.sync();
    return { handle, recovered_path: null };
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  const existing = await readExistingLock(lockPath);
  if (existing === null) return acquireLock(lockPath, owner);
  if (existing.invalid) {
    const age = Date.now() - existing.modified_at_ms;
    if (age < 0) fail("codex_work_context_lock_clock_invalid");
    if (age <= MAX_PARTIAL_LOCK_AGE_MS) {
      fail("codex_work_context_lock_invalid");
    }
  } else {
    const age = Date.now() - Date.parse(existing.started_at);
    if (age < 0) fail("codex_work_context_lock_clock_invalid");
    if (isProcessAlive(existing.pid) && age <= MAX_LIVE_LOCK_AGE_MS) {
      fail("codex_work_context_busy");
    }
  }
  const recoveredPath = `${lockPath}.stale-${owner.owner_token}`;
  try {
    await rename(lockPath, recoveredPath);
  } catch (error) {
    if (error?.code === "ENOENT") return acquireLock(lockPath, owner);
    fail("codex_work_context_lock_recovery_failed");
  }
  try {
    const handle = await open(lockPath, "wx");
    await handle.writeFile(`${JSON.stringify(owner)}\n`, "utf8");
    await handle.sync();
    return { handle, recovered_path: recoveredPath };
  } catch (error) {
    await rename(recoveredPath, lockPath).catch(() => {});
    if (error?.code === "EEXIST") fail("codex_work_context_busy");
    throw error;
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
    await lock.handle.close().catch(() => {});
    const current = await readExistingLock(lockPath).catch(() => null);
    if (current?.owner_token === owner.owner_token) {
      await rm(lockPath, { force: true });
    }
    if (lock.recovered_path) {
      await rm(lock.recovered_path, { force: true }).catch(() => {});
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { binding, binding_sha256: bindingSha256 } =
    await readCodexWorkContextBinding(args.binding, args.binding_sha256);
  const payload = parsePayload(args.payload_json, args.payload_base64);
  if (args.operation === "status" && !Object.hasOwn(payload, "work_id")) {
    payload.work_id = null;
  }
  const input = {
    ...payload,
    operation: args.operation,
    project_code: args.project,
    occurred_at: args.occurred_at ?? new Date().toISOString(),
    event_id: args.event_id ?? randomUUID(),
  };
  const run = () => executeCodexWorkContextOperation({
    binding,
    bindingSha256,
    input,
  });
  const result = args.operation === "status"
    ? await run()
    : await withLock(
      path.join(binding.state_root, "codex_work_context.lock"),
      run,
    );
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((error) => {
  process.stderr.write(
    `hpp_codex_work_context_rejected:${error?.code ?? "unexpected"}\n`,
  );
  process.exitCode = 1;
});
