import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveSoulforgeStateRoot } from "../../../../../guild_hall/shared/soulforge_state_root.mjs";
import {
  THREAD_ENROLLMENT_SCHEMA,
  createEmptyThreadEnrollmentRegistry,
  normalizeThreadEnrollmentEntry,
  normalizeThreadEnrollmentRegistry,
  validateThreadEnrollmentRegistry as validateCoreThreadEnrollmentRegistry
} from "./live-thread-projection.mjs";
import {
  findOrganizationCatalogGroup,
  normalizeOrganizationCatalog,
  validateOrganizationCatalogEnrollment
} from "./live-organization-catalog.mjs";

export {
  createEmptyThreadEnrollmentRegistry
} from "./live-thread-projection.mjs";

const RAW_FLAG_KEYS = ["raw_preview", "raw_turns", "raw_messages", "raw_reasoning", "raw_tool_io", "raw_cwd"];
const ROLLOVER_SOURCE_LIFECYCLES = new Set(["accepted", "current"]);
const ROLLOVER_CHILD_LIFECYCLES = new Set(["pending", "accepted", "current"]);

function isTruthyEnvironmentValue(value) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

function safeNow(value) {
  const candidate = typeof value === "string" ? value : new Date().toISOString();
  return Number.isNaN(Date.parse(candidate)) ? new Date().toISOString() : candidate;
}

function optionValue(options, camelCase, snakeCase = camelCase.replace(/[A-Z]/gu, (letter) => `_${letter.toLowerCase()}`)) {
  if (Object.prototype.hasOwnProperty.call(options ?? {}, camelCase)) return options[camelCase];
  if (Object.prototype.hasOwnProperty.call(options ?? {}, snakeCase)) return options[snakeCase];
  return undefined;
}

function hasOption(options, camelCase, snakeCase = camelCase.replace(/[A-Z]/gu, (letter) => `_${letter.toLowerCase()}`)) {
  return Object.prototype.hasOwnProperty.call(options ?? {}, camelCase)
    || Object.prototype.hasOwnProperty.call(options ?? {}, snakeCase);
}

function nextRegistry(registry, entries, now) {
  return normalizeThreadEnrollmentRegistry({
    schema_version: THREAD_ENROLLMENT_SCHEMA,
    registry_revision: registry.registry_revision + 1,
    updated_at: safeNow(now),
    disabled: false,
    entries
  });
}

function publicEntryShape(entry) {
  return {
    thread_id: entry.thread_id,
    organization_group_id: entry.organization_group_id,
    route_id: entry.route_id,
    work_id: entry.work_id,
    thread_kind: entry.thread_kind,
    display_label: entry.display_label,
    relationship: entry.relationship,
    lifecycle: entry.lifecycle,
    parent_thread_id: entry.parent_thread_id,
    prior_thread_history_pointer: entry.prior_thread_history_pointer,
    metadata_only: true,
    raw_preview: false,
    raw_turns: false,
    raw_messages: false,
    raw_reasoning: false,
    raw_tool_io: false,
    raw_cwd: false
  };
}

function sameEnrollmentMetadata(left, right) {
  return JSON.stringify(publicEntryShape(left)) === JSON.stringify(publicEntryShape(right));
}

function buildEntry(options, { lifecycle = "current", now = new Date().toISOString(), fallback = null } = {}) {
  const at = safeNow(now);
  const suppliedFlagsAreSafe = RAW_FLAG_KEYS.every((key) => options?.[key] === undefined || options[key] === false);
  if (options?.metadata_only !== undefined && options.metadata_only !== true) return null;
  if (!suppliedFlagsAreSafe) return null;
  const candidate = {
    thread_id: optionValue(options, "threadId"),
    organization_group_id: optionValue(options, "organizationGroupId", "organization_group_id")
      ?? fallback?.organization_group_id,
    route_id: optionValue(options, "routeId", "route_id")
      ?? fallback?.route_id
      ?? null,
    work_id: optionValue(options, "workId", "work_id")
      ?? fallback?.work_id
      ?? null,
    thread_kind: optionValue(options, "threadKind", "thread_kind")
      ?? fallback?.thread_kind
      ?? "continuation",
    display_label: optionValue(options, "displayLabel", "display_label")
      ?? fallback?.display_label,
    relationship: optionValue(options, "relationship")
      ?? fallback?.relationship
      ?? "primary",
    lifecycle,
    parent_thread_id: optionValue(options, "parentThreadId", "parent_thread_id") ?? null,
    prior_thread_history_pointer: optionValue(options, "priorThreadHistoryPointer", "prior_thread_history_pointer") ?? null,
    metadata_only: true,
    raw_preview: false,
    raw_turns: false,
    raw_messages: false,
    raw_reasoning: false,
    raw_tool_io: false,
    raw_cwd: false,
    enrolled_at: at,
    updated_at: at
  };
  return normalizeThreadEnrollmentEntry(candidate);
}

function registryIsMutable(registry, env = process.env) {
  return Boolean(registry) && registry.disabled !== true && !isTruthyEnvironmentValue(env?.TEAM_OPS_BOARD_LIVE_THREADS_DISABLED);
}

function mutationError(registry, env) {
  if (!registry) return "invalid_enrollment_registry";
  if (!registryIsMutable(registry, env)) return "live_thread_enrollment_disabled";
  return null;
}

function organizationCatalogError(entry, organizationCatalog) {
  if (organizationCatalog === null || organizationCatalog === undefined) return null;
  const catalog = normalizeOrganizationCatalog(organizationCatalog);
  if (!catalog) return "invalid_organization_catalog";
  if (catalog.disabled) return "organization_catalog_disabled";
  return findOrganizationCatalogGroup(catalog, entry.organization_group_id, { activeOnly: true })
    ? null
    : "organization_group_not_active";
}

export function isLiveThreadEnrollmentDisabled({ registry = null, env = process.env } = {}) {
  return registry?.disabled === true || isTruthyEnvironmentValue(env?.TEAM_OPS_BOARD_LIVE_THREADS_DISABLED);
}

export function registerExistingThread(registryInput, options = {}, { now = new Date().toISOString(), env = process.env, organizationCatalog = null } = {}) {
  const registry = normalizeThreadEnrollmentRegistry(registryInput);
  const blocked = mutationError(registry, env);
  if (blocked) return { error: blocked, changed: false, registry };
  const entry = buildEntry(options, { lifecycle: optionValue(options, "lifecycle") ?? "current", now });
  if (!entry) return { error: "invalid_enrollment_entry", changed: false, registry };
  const catalogError = organizationCatalogError(entry, organizationCatalog);
  if (catalogError) return { error: catalogError, changed: false, registry };
  const existing = registry.entries.find((item) => item.thread_id === entry.thread_id);
  if (existing) {
    if (sameEnrollmentMetadata(existing, entry)) return { error: null, changed: false, registry, entry: existing };
    return { error: "thread_id_conflict", changed: false, registry };
  }
  const next = nextRegistry(registry, [...registry.entries, entry], now);
  if (!next) return { error: entry.parent_thread_id === null ? "invalid_enrollment_registry" : "parent_thread_not_enrolled", changed: false, registry };
  return { error: null, changed: true, registry: next, entry };
}

export function rolloverThreadEnrollment(registryInput, options = {}, { now = new Date().toISOString(), env = process.env, organizationCatalog = null } = {}) {
  const registry = normalizeThreadEnrollmentRegistry(registryInput);
  const blocked = mutationError(registry, env);
  if (blocked) return { error: blocked, changed: false, registry };
  const priorThreadId = optionValue(options, "priorThreadId", "prior_thread_id");
  const targetThreadId = optionValue(options, "threadId") ?? optionValue(options, "toThreadId", "to_thread_id");
  const source = registry.entries.find((entry) => entry.thread_id === priorThreadId);
  if (typeof targetThreadId !== "string" || targetThreadId === priorThreadId) {
    return { error: "invalid_rollover_target", changed: false, registry };
  }
  const nextLifecycle = optionValue(options, "nextLifecycle", "next_lifecycle") ?? "current";
  if (nextLifecycle !== "accepted" && nextLifecycle !== "current") {
    return { error: "invalid_rollover_lifecycle", changed: false, registry };
  }
  const existingTarget = registry.entries.find((entry) => entry.thread_id === targetThreadId) ?? null;
  const historyPointer = optionValue(options, "priorThreadHistoryPointer", "prior_thread_history_pointer") ?? `history:${priorThreadId}`;
  const isIncompleteCompletedRollover = source?.lifecycle === "history"
    && existingTarget?.lifecycle === nextLifecycle
    && existingTarget.prior_thread_history_pointer === null;
  if (!source || (!ROLLOVER_SOURCE_LIFECYCLES.has(source.lifecycle) && !isIncompleteCompletedRollover)) {
    return { error: "prior_thread_not_rollover_eligible", changed: false, registry };
  }
  const hasExplicitParent = hasOption(options, "parentThreadId", "parent_thread_id");
  const rolloverParentThreadId = hasExplicitParent
    ? optionValue(options, "parentThreadId", "parent_thread_id")
    : source.parent_thread_id;
  let target = existingTarget;
  if (target) {
    if (target.lifecycle === "pending") {
      target = {
        ...target,
        parent_thread_id: rolloverParentThreadId,
        prior_thread_history_pointer: target.prior_thread_history_pointer ?? historyPointer
      };
    } else if (isIncompleteCompletedRollover) {
      if (hasExplicitParent && target.parent_thread_id !== rolloverParentThreadId) {
        return { error: "rollover_target_metadata_conflict", changed: false, registry };
      }
      target = { ...target, prior_thread_history_pointer: historyPointer };
    } else {
      return { error: "rollover_target_not_pending", changed: false, registry };
    }
  } else {
    target = buildEntry(
      {
        ...options,
        threadId: targetThreadId,
        parentThreadId: rolloverParentThreadId,
        priorThreadHistoryPointer: historyPointer,
        threadKind: optionValue(options, "threadKind", "thread_kind") ?? "continuation",
        relationship: optionValue(options, "relationship") ?? "continuation"
      },
      { lifecycle: "pending", now, fallback: source }
    );
    if (!target) return { error: "invalid_enrollment_entry", changed: false, registry };
  }
  const catalogError = organizationCatalogError(target, organizationCatalog);
  if (catalogError) return { error: catalogError, changed: false, registry };
  const promoted = { ...target, lifecycle: nextLifecycle, updated_at: safeNow(now) };
  const retiredSource = { ...source, lifecycle: "history", updated_at: safeNow(now) };
  const next = nextRegistry(
    registry,
    registry.entries.map((entry) => {
      if (entry.thread_id === retiredSource.thread_id) return retiredSource;
      if (entry.thread_id === promoted.thread_id) return promoted;
      if (entry.parent_thread_id === retiredSource.thread_id && ROLLOVER_CHILD_LIFECYCLES.has(entry.lifecycle)) {
        return { ...entry, parent_thread_id: promoted.thread_id, updated_at: safeNow(now) };
      }
      return entry;
    }).concat(existingTarget ? [] : [promoted]),
    now
  );
  if (!next) return { error: "invalid_enrollment_registry", changed: false, registry };
  return { error: null, changed: true, registry: next, entry: promoted, prior: retiredSource };
}

function transitionEnrollmentLifecycle(registryInput, threadId, lifecycle, { now = new Date().toISOString(), env = process.env } = {}) {
  const registry = normalizeThreadEnrollmentRegistry(registryInput);
  const blocked = mutationError(registry, env);
  if (blocked) return { error: blocked, changed: false, registry };
  const entry = registry.entries.find((item) => item.thread_id === threadId);
  if (!entry) return { error: "thread_id_not_enrolled", changed: false, registry };
  if (entry.lifecycle === lifecycle) return { error: null, changed: false, registry, entry };
  const updated = { ...entry, lifecycle, updated_at: safeNow(now) };
  const next = nextRegistry(registry, registry.entries.map((item) => item.thread_id === threadId ? updated : item), now);
  if (!next) return { error: "invalid_enrollment_registry", changed: false, registry };
  return { error: null, changed: true, registry: next, entry: updated };
}

export function retireThreadEnrollment(registryInput, threadId, options = {}) {
  return transitionEnrollmentLifecycle(registryInput, threadId, "retired", options);
}

export function archiveThreadEnrollmentHistory(registryInput, threadId, options = {}) {
  return transitionEnrollmentLifecycle(registryInput, threadId, "history", options);
}

export function listThreadEnrollments(registryInput, { lifecycle = null } = {}) {
  const registry = normalizeThreadEnrollmentRegistry(registryInput);
  if (!registry) return { error: "invalid_enrollment_registry", entries: [] };
  const entries = registry.entries
    .filter((entry) => lifecycle === null || entry.lifecycle === lifecycle)
    .map((entry) => ({ ...entry }));
  return { error: null, entries, disabled: registry.disabled, registry_revision: registry.registry_revision };
}

export function validateThreadEnrollmentRegistry(value, { organizationCatalog = null } = {}) {
  const validation = validateCoreThreadEnrollmentRegistry(value);
  if (!validation.valid || organizationCatalog === null || organizationCatalog === undefined) return validation;
  const organization = validateOrganizationCatalogEnrollment(organizationCatalog, validation.registry);
  if (organization.valid) return { ...validation, organization };
  return {
    valid: false,
    error: organization.error,
    registry: validation.registry,
    summary: validation.summary,
    organization
  };
}

export function reconcileThreadEnrollment(registryInput, projectedThreads = []) {
  const registry = normalizeThreadEnrollmentRegistry(registryInput);
  if (!registry) return { error: "invalid_enrollment_registry", current: 0, observed: 0, missing: 0 };
  const current = registry.entries.filter((entry) => entry.lifecycle === "current" || entry.lifecycle === "accepted");
  const observedIds = new Set(
    (Array.isArray(projectedThreads) ? projectedThreads : [])
      .filter((thread) => thread?.observed === true && typeof thread?.thread_id === "string")
      .map((thread) => thread.thread_id)
  );
  const observed = current.filter((entry) => observedIds.has(entry.thread_id)).length;
  return {
    error: null,
    current: current.length,
    observed,
    missing: current.length - observed,
    disabled: registry.disabled
  };
}

// Default registry: this checkout's guild_hall/state unless SOULFORGE_STATE_ROOT
// / SOULFORGE_OWNER_ROOT redirect the state root (an invalid value throws).
export function defaultThreadEnrollmentRegistryPath(env = process.env) {
  const here = dirname(fileURLToPath(import.meta.url));
  const stateRoot = resolveSoulforgeStateRoot(env, () => resolve(here, "..", "..", "..", "..", "..", "guild_hall", "state"));
  return join(stateRoot, "operations", "team_ops_board", "thread_visibility.v1.json");
}

export async function readThreadEnrollmentRegistry(path) {
  try {
    const text = await readFile(path, "utf8");
    const parsed = JSON.parse(text);
    const registry = normalizeThreadEnrollmentRegistry(parsed);
    if (!registry) return { status: "invalid", registry: null };
    return { status: registry.disabled ? "disabled" : "available", registry };
  } catch (error) {
    if (error?.code === "ENOENT") return { status: "missing", registry: null };
    return { status: "invalid", registry: null };
  }
}

export async function writeThreadEnrollmentRegistryAtomic(path, registryInput, { env = process.env } = {}) {
  const registry = normalizeThreadEnrollmentRegistry(registryInput);
  if (!registry) throw new Error("invalid_enrollment_registry");
  if (isLiveThreadEnrollmentDisabled({ registry, env })) throw new Error("live_thread_enrollment_disabled");
  const directory = dirname(path);
  const temporaryPath = join(directory, `.${Math.random().toString(16).slice(2)}.${process.pid}.thread_visibility.tmp`);
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
