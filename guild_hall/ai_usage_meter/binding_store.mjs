import { randomBytes } from "node:crypto";
import { mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { canonicalJson, normalizeConfig, sha256 } from "./usage_meter.mjs";

export const USAGE_BINDING_SET_SCHEMA = "soulforge.ai_usage_binding_set.v1";

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function bindingPath(stateRoot) {
  return path.join(path.resolve(stateRoot), "bindings.v1.json");
}

function normalizeBinding(input) {
  return normalizeConfig({ work_bindings: [input] }).work_bindings[0];
}

function normalizeSet(input) {
  if (!input || input.schema_version !== USAGE_BINDING_SET_SCHEMA || !Array.isArray(input.bindings)) {
    fail("usage_binding_set_invalid");
  }
  const bindings = input.bindings.map(normalizeBinding);
  const keys = new Set();
  for (const binding of bindings) {
    const key = `${binding.thread_id}:${binding.turn_id ?? "*"}`;
    if (keys.has(key)) fail("usage_binding_duplicate");
    keys.add(key);
  }
  return {
    schema_version: USAGE_BINDING_SET_SCHEMA,
    bindings: bindings.sort((a, b) => (
      a.thread_id.localeCompare(b.thread_id, "en")
      || (a.turn_id ?? "").localeCompare(b.turn_id ?? "", "en")
    )),
  };
}

async function writeJsonAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${randomBytes(6).toString("hex")}`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await rename(temporary, filePath);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== "ESRCH";
  }
}

async function acquireLock(lockPath) {
  const owner = {
    pid: process.pid,
    started_at: new Date().toISOString(),
    token: randomBytes(16).toString("hex"),
  };
  try {
    const handle = await open(lockPath, "wx");
    await handle.writeFile(`${JSON.stringify(owner)}\n`, "utf8");
    return { handle, stalePath: null, token: owner.token };
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  let existing = null;
  try {
    const info = await stat(lockPath);
    const parsed = JSON.parse(await readFile(lockPath, "utf8"));
    existing = { ...parsed, modified_at: info.mtimeMs };
  } catch {
    existing = null;
  }
  const started = Date.parse(existing?.started_at ?? "");
  const age = Number.isFinite(started) ? Date.now() - started : Number.POSITIVE_INFINITY;
  if (Number.isSafeInteger(existing?.pid) && processAlive(existing.pid) && age <= 300_000) {
    fail("usage_binding_store_busy");
  }
  const stalePath = `${lockPath}.stale-${randomBytes(6).toString("hex")}`;
  try {
    await rename(lockPath, stalePath);
    const handle = await open(lockPath, "wx");
    await handle.writeFile(`${JSON.stringify(owner)}\n`, "utf8");
    return { handle, stalePath, token: owner.token };
  } catch (error) {
    await rename(stalePath, lockPath).catch(() => {});
    if (error?.code === "EEXIST" || error?.code === "ENOENT") fail("usage_binding_store_busy");
    throw error;
  }
}

async function releaseLock(lockPath, lock) {
  await lock.handle.close().catch(() => {});
  try {
    const current = JSON.parse(await readFile(lockPath, "utf8"));
    if (current?.token === lock.token) await rm(lockPath, { force: true }).catch(() => {});
  } catch {
    // A missing, replaced, or unreadable lock is not owned by this holder.
  } finally {
    if (lock.stalePath) await rm(lock.stalePath, { force: true }).catch(() => {});
  }
}

export async function withUsageBindingLock(stateRoot, callback) {
  const root = path.resolve(stateRoot);
  await mkdir(root, { recursive: true });
  const lockPath = path.join(root, "bindings.lock");
  const lock = await acquireLock(lockPath);
  try {
    return await callback();
  } finally {
    await releaseLock(lockPath, lock);
  }
}

export async function loadUsageBindingSet(stateRoot) {
  try {
    return normalizeSet(JSON.parse(await readFile(bindingPath(stateRoot), "utf8")));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { schema_version: USAGE_BINDING_SET_SCHEMA, bindings: [] };
    }
    throw error;
  }
}

export async function upsertUsageBinding(stateRoot, input) {
  const binding = normalizeBinding(input);
  return withUsageBindingLock(stateRoot, async () => {
    const current = await loadUsageBindingSet(stateRoot);
    const keyMatch = (item) => (
      item.thread_id === binding.thread_id && item.turn_id === binding.turn_id
    );
    const index = current.bindings.findIndex(keyMatch);
    let status = "created";
    if (index >= 0) {
      if (canonicalJson(current.bindings[index]) === canonicalJson(binding)) status = "replayed";
      else {
        current.bindings[index] = binding;
        status = "updated";
      }
    } else {
      current.bindings.push(binding);
    }
    const normalized = normalizeSet(current);
    if (status !== "replayed") await writeJsonAtomic(bindingPath(stateRoot), normalized);
    return {
      schema_version: "soulforge.ai_usage_binding_receipt.v1",
      status,
      binding_count: normalized.bindings.length,
      binding_digest: sha256(canonicalJson(binding)),
      thread_id: binding.thread_id,
      turn_id: binding.turn_id,
      work_id: binding.work_id,
    };
  });
}

export function mergeUsageBindings(config, bindingSet) {
  const normalized = normalizeConfig(config);
  return normalizeConfig({
    ...normalized,
    work_bindings: [...normalizeSet(bindingSet).bindings, ...normalized.work_bindings],
  });
}
