#!/usr/bin/env node

import {
  appendThreadResultGateEvent,
  createEmptyThreadResultGateRegistry,
  setThreadResultGateDisabled
} from "../core/live-thread-projection.mjs";
import {
  defaultThreadEnrollmentRegistryPath,
  readThreadEnrollmentRegistry
} from "../core/live-thread-enrollment.mjs";
import {
  defaultThreadResultGateRegistryPath,
  readThreadResultGateRegistry,
  validateThreadResultGateRegistry,
  writeThreadResultGateRegistryAtomic
} from "../core/live-thread-result-gate.mjs";

const HELP = `Workspace Board explicit result gate (local metadata only)

Commands:
  emit --event-id ID --thread-id ID --event-type started|result_ready|accepted|closed --target none|parent|owner --occurred-at ISO [--target-thread-id ID]
  validate
  list
  disable
  enable

` + "`result_ready` reaches only its explicit parent exact ID or the Owner. A Stop/idle observation is not a result gate. "
  + "All writes use atomic replacement and never create, send, archive, or delete Codex threads. "
  + "Set TEAM_OPS_BOARD_RESULT_GATES_DISABLED=1 for emergency fail-closed disable.\n";

function parseArgs(argv) {
  const [command = "help", ...tokens] = argv;
  const flags = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--")) throw new Error("invalid_argument");
    const key = token.slice(2);
    const next = tokens[index + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }
    flags[key] = next;
    index += 1;
  }
  return { command, flags };
}

function nullableFlag(flags, key) {
  const value = flags[key] ?? null;
  return value === "null" ? null : value;
}

function safeOutput(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function loadEnrollment(path) {
  const loaded = await readThreadEnrollmentRegistry(path);
  if (!loaded.registry) throw new Error(loaded.status === "missing" ? "enrollment_registry_missing" : "invalid_enrollment_registry");
  return loaded.registry;
}

async function loadResultGate(path, { permitMissing = false } = {}) {
  const loaded = await readThreadResultGateRegistry(path);
  if (loaded.status === "missing" && permitMissing) return createEmptyThreadResultGateRegistry();
  if (!loaded.registry) throw new Error(loaded.status === "missing" ? "result_gate_registry_missing" : "invalid_result_gate_registry");
  return loaded.registry;
}

function eventFromFlags(flags) {
  return {
    event_id: flags["event-id"],
    thread_id: flags["thread-id"],
    event_type: flags["event-type"],
    target: flags.target,
    target_thread_id: nullableFlag(flags, "target-thread-id"),
    occurred_at: flags["occurred-at"],
    metadata_only: true,
    raw_preview: false,
    raw_turns: false,
    raw_messages: false,
    raw_reasoning: false,
    raw_tool_io: false,
    raw_cwd: false
  };
}

async function run() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  if (["help", "--help", "-h"].includes(command)) {
    process.stdout.write(HELP);
    return;
  }
  const registryPath = String(process.env.TEAM_OPS_BOARD_THREAD_RESULT_GATE_REGISTRY || flags.registry || defaultThreadResultGateRegistryPath());
  const enrollmentPath = String(process.env.TEAM_OPS_BOARD_THREAD_VISIBILITY_REGISTRY || flags["enrollment-registry"] || defaultThreadEnrollmentRegistryPath());
  const enrollmentRegistry = await loadEnrollment(enrollmentPath);

  if (command === "emit") {
    const registry = await loadResultGate(registryPath, { permitMissing: true });
    const result = appendThreadResultGateEvent(registry, eventFromFlags(flags));
    if (result.error) throw new Error(result.error);
    const validation = validateThreadResultGateRegistry(result.registry, { enrollmentRegistry });
    if (!validation.valid) throw new Error(validation.error);
    if (result.changed) await writeThreadResultGateRegistryAtomic(registryPath, result.registry);
    safeOutput({ command, changed: result.changed, event: result.event, registry_revision: result.registry.registry_revision });
    return;
  }

  if (command === "validate") {
    const registry = await loadResultGate(registryPath);
    const result = validateThreadResultGateRegistry(registry, { enrollmentRegistry });
    safeOutput({ command, valid: result.valid, error: result.error, summary: result.summary ?? null });
    if (!result.valid) process.exitCode = 1;
    return;
  }

  if (command === "list") {
    const registry = await loadResultGate(registryPath);
    safeOutput({ command, registry_revision: registry.registry_revision, disabled: registry.disabled, events: registry.events });
    return;
  }

  if (command === "disable" || command === "enable") {
    const registry = await loadResultGate(registryPath, { permitMissing: command === "disable" });
    const result = setThreadResultGateDisabled(registry, command === "disable");
    if (result.error) throw new Error(result.error);
    if (result.changed) {
      await writeThreadResultGateRegistryAtomic(registryPath, result.registry, { allowDisabled: command === "disable" });
    }
    safeOutput({ command, changed: result.changed, disabled: result.registry.disabled, registry_revision: result.registry.registry_revision });
    return;
  }

  throw new Error("unknown_command");
}

run().catch((error) => {
  process.stderr.write(`${String(error?.message || "thread_result_gate_failed").replace(/[\r\n]+/gu, " ")}\n`);
  process.exitCode = 1;
});
