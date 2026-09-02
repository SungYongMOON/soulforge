import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveSoulforgeStateRoot } from "../../../../../guild_hall/shared/soulforge_state_root.mjs";
import {
  createEmptyThreadResultGateRegistry,
  isThreadResultGateDisabled,
  normalizeThreadResultGateRegistry,
  validateThreadResultGateRegistry
} from "./live-thread-projection.mjs";
import { isTeamOpsBoardReadOnlyPilot } from "./team-ops-board-read-only-pilot.mjs";

export {
  createEmptyThreadResultGateRegistry,
  isThreadResultGateDisabled,
  validateThreadResultGateRegistry
} from "./live-thread-projection.mjs";

// Default registry: this checkout's guild_hall/state unless SOULFORGE_STATE_ROOT
// / SOULFORGE_OWNER_ROOT redirect the state root (an invalid value throws).
export function defaultThreadResultGateRegistryPath(env = process.env) {
  const here = dirname(fileURLToPath(import.meta.url));
  const stateRoot = resolveSoulforgeStateRoot(env, () => resolve(here, "..", "..", "..", "..", "..", "guild_hall", "state"));
  return join(stateRoot, "operations", "team_ops_board", "thread_result_gate.v1.json");
}

export async function readThreadResultGateRegistry(path, { env = process.env } = {}) {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    const registry = normalizeThreadResultGateRegistry(parsed);
    if (!registry) return { status: "invalid", registry: null };
    return { status: isThreadResultGateDisabled({ registry, env }) ? "disabled" : "available", registry };
  } catch (error) {
    if (error?.code === "ENOENT") return { status: "missing", registry: null };
    return { status: "invalid", registry: null };
  }
}

export async function writeThreadResultGateRegistryAtomic(path, registryInput, { env = process.env, allowDisabled = false } = {}) {
  const registry = normalizeThreadResultGateRegistry(registryInput);
  if (!registry) throw new Error("invalid_result_gate_registry");
  if (isTeamOpsBoardReadOnlyPilot(env)) throw new Error("thread_result_gate_disabled");
  if (isThreadResultGateDisabled({ registry: null, env })) throw new Error("thread_result_gate_disabled");
  if (registry.disabled && allowDisabled !== true) throw new Error("thread_result_gate_disabled");
  const directory = dirname(path);
  const temporaryPath = join(directory, `.${Math.random().toString(16).slice(2)}.${process.pid}.thread_result_gate.tmp`);
  await mkdir(directory, { recursive: true });
  let handle = null;
  try {
    handle = await open(temporaryPath, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify(registry, null, 2)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporaryPath, path);
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    await unlink(temporaryPath).catch(() => {});
    throw error;
  }
  return registry;
}
