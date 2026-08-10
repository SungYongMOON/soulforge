#!/usr/bin/env node

import { readFile } from "node:fs/promises";

import {
  archiveThreadEnrollmentHistory,
  createEmptyThreadEnrollmentRegistry,
  defaultThreadEnrollmentRegistryPath,
  listThreadEnrollments,
  readThreadEnrollmentRegistry,
  reconcileThreadEnrollment,
  registerExistingThread,
  retireThreadEnrollment,
  rolloverThreadEnrollment,
  validateThreadEnrollmentRegistry,
  writeThreadEnrollmentRegistryAtomic
} from "../core/live-thread-enrollment.mjs";
import { normalizeLiveThreadProjection } from "../core/live-thread-projection.mjs";

const HELP = `Workspace Board exact thread enrollment (local metadata only)

Commands:
  register-existing --thread-id ID --organization-group-id ID --thread-kind manager|task|verifier|continuation --display-label LABEL [--route-id ID] [--work-id ID] [--relationship primary|child|review|handoff|continuation|independent] [--lifecycle pending|accepted|current]
  rollover --from-thread-id ID --to-thread-id ID [--next-lifecycle accepted|current] [metadata fields when not inheriting]
  retire --thread-id ID
  history --thread-id ID
  validate
  list [--lifecycle pending|accepted|current|history|retired]
  reconcile [--snapshot PATH | --live]

All writes use an atomic temporary-file rename. Registration forces metadata_only=true
and every raw flag false; this CLI never creates, deletes, archives, or sends Codex threads.
Set TEAM_OPS_BOARD_LIVE_THREADS_DISABLED=1 or registry disabled=true for emergency read/write disable.
`;

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

function flagValue(flags, key, fallback = undefined) {
  return flags[key] === undefined ? fallback : flags[key];
}

function nullableFlag(flags, key) {
  const value = flagValue(flags, key, null);
  return value === "null" ? null : value;
}

function parseBoolean(value) {
  if (value === undefined) return undefined;
  if (value === true || value === "true") return true;
  if (value === "false") return false;
  return "invalid";
}

function entryOptions(flags, { targetThreadId = undefined } = {}) {
  const rawFlags = Object.fromEntries(
    ["raw-preview", "raw-turns", "raw-messages", "raw-reasoning", "raw-tool-io", "raw-cwd"].map((key) => [
      key.replace(/-([a-z])/gu, (_, letter) => `_${letter}`),
      parseBoolean(flagValue(flags, key))
    ])
  );
  return {
    threadId: targetThreadId ?? flagValue(flags, "thread-id"),
    organizationGroupId: flagValue(flags, "organization-group-id"),
    routeId: nullableFlag(flags, "route-id"),
    workId: nullableFlag(flags, "work-id"),
    threadKind: flagValue(flags, "thread-kind"),
    displayLabel: flagValue(flags, "display-label"),
    relationship: flagValue(flags, "relationship"),
    lifecycle: flagValue(flags, "lifecycle"),
    parentThreadId: nullableFlag(flags, "parent-thread-id"),
    priorThreadHistoryPointer: nullableFlag(flags, "prior-thread-history-pointer"),
    metadata_only: parseBoolean(flagValue(flags, "metadata-only")),
    ...rawFlags
  };
}

function safeOutput(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function loadRegistry(path, { permitMissing = false } = {}) {
  const loaded = await readThreadEnrollmentRegistry(path);
  if (loaded.status === "missing" && permitMissing) return createEmptyThreadEnrollmentRegistry();
  if (!loaded.registry) throw new Error(loaded.status === "missing" ? "enrollment_registry_missing" : "invalid_enrollment_registry");
  return loaded.registry;
}

async function run() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  if (["help", "--help", "-h"].includes(command)) {
    process.stdout.write(HELP);
    return;
  }
  const registryPath = String(process.env.TEAM_OPS_BOARD_THREAD_VISIBILITY_REGISTRY || flagValue(flags, "registry", defaultThreadEnrollmentRegistryPath()));

  if (command === "register-existing") {
    const registry = await loadRegistry(registryPath, { permitMissing: true });
    const result = registerExistingThread(registry, entryOptions(flags));
    if (result.error) throw new Error(result.error);
    if (result.changed) await writeThreadEnrollmentRegistryAtomic(registryPath, result.registry);
    safeOutput({ command, changed: result.changed, entry: result.entry, registry_revision: result.registry.registry_revision });
    return;
  }

  if (command === "rollover") {
    const registry = await loadRegistry(registryPath);
    const targetThreadId = flagValue(flags, "to-thread-id");
    const result = rolloverThreadEnrollment(registry, {
      ...entryOptions(flags, { targetThreadId }),
      priorThreadId: flagValue(flags, "from-thread-id"),
      nextLifecycle: flagValue(flags, "next-lifecycle", "current")
    });
    if (result.error) throw new Error(result.error);
    if (result.changed) await writeThreadEnrollmentRegistryAtomic(registryPath, result.registry);
    safeOutput({ command, changed: result.changed, entry: result.entry, prior: result.prior, registry_revision: result.registry.registry_revision });
    return;
  }

  if (command === "retire" || command === "history") {
    const registry = await loadRegistry(registryPath);
    const result = command === "retire"
      ? retireThreadEnrollment(registry, flagValue(flags, "thread-id"))
      : archiveThreadEnrollmentHistory(registry, flagValue(flags, "thread-id"));
    if (result.error) throw new Error(result.error);
    if (result.changed) await writeThreadEnrollmentRegistryAtomic(registryPath, result.registry);
    safeOutput({ command, changed: result.changed, entry: result.entry, registry_revision: result.registry.registry_revision });
    return;
  }

  if (command === "validate") {
    const registry = await loadRegistry(registryPath);
    const result = validateThreadEnrollmentRegistry(registry);
    safeOutput({ command, valid: result.valid, error: result.error, summary: result.summary ?? null });
    if (!result.valid) process.exitCode = 1;
    return;
  }

  if (command === "list") {
    const registry = await loadRegistry(registryPath);
    const result = listThreadEnrollments(registry, { lifecycle: flagValue(flags, "lifecycle", null) });
    safeOutput({ command, ...result });
    return;
  }

  if (command === "reconcile") {
    const registry = await loadRegistry(registryPath);
    let projection;
    if (flags.snapshot) {
      const parsed = JSON.parse(await readFile(String(flags.snapshot), "utf8"));
      projection = normalizeLiveThreadProjection(parsed);
    } else {
      const { createLiveThreadAdapter } = await import("../server/live-thread-adapter.mjs");
      const adapter = createLiveThreadAdapter({ registryPath });
      projection = await adapter.readProjection({ force: flags.live === true });
    }
    const result = reconcileThreadEnrollment(registry, projection.threads);
    safeOutput({ command, ...result, adapter_health: projection.adapter.health });
    return;
  }

  throw new Error("unknown_command");
}

run().catch((error) => {
  process.stderr.write(`${String(error?.message || "live_thread_enrollment_failed").replace(/[\r\n]+/gu, " ")}\n`);
  process.exitCode = 1;
});
