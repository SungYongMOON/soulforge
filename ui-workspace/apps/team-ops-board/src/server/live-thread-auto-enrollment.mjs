import {
  reconcileExactParentThreadAutoEnrollment
} from "../core/live-thread-auto-enrollment.mjs";
import {
  readThreadEnrollmentRegistry,
  writeThreadEnrollmentRegistryAtomic
} from "../core/live-thread-enrollment.mjs";

export const DEFAULT_AUTO_ENROLLMENT_DEBOUNCE_MS = 30_000;

const MAX_AUTO_ENROLLMENT_DEBOUNCE_MS = 5 * 60 * 1_000;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactThreadId(value) {
  if (typeof value !== "string" || value !== value.trim() || value.length === 0 || value.length > 320) return null;
  return /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u.test(value) ? value : null;
}

function exactStatusType(value) {
  if (typeof value !== "string" || value !== value.trim() || value.length === 0 || value.length > 80) return null;
  return /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u.test(value) ? value : null;
}

function nonNegativeInteger(value, fallback, maximum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, maximum);
}

function observedNow(value) {
  const candidate = typeof value === "function" ? value() : value;
  return Number.isFinite(candidate) ? Number(candidate) : Date.now();
}

function observedAt(value) {
  const timestamp = observedNow(value);
  const date = new Date(timestamp);
  return Number.isNaN(date.valueOf()) ? new Date().toISOString() : date.toISOString();
}

// Only these three app-server fields are retained in memory for reconciliation.
// In particular, names, titles, previews, turns, paths, and messages are never
// returned from this boundary or written to the enrollment registry.
export function projectExactParentThreadLineage(value) {
  if (!isRecord(value)) return { candidate: null, malformed: true, unsafe_thread_id: null };
  const threadId = exactThreadId(value.id);
  const statusType = exactStatusType(value.status?.type);
  if (!threadId) return { candidate: null, malformed: true, unsafe_thread_id: null };
  if (!statusType) return { candidate: null, malformed: true, unsafe_thread_id: threadId };

  let parentThreadId = null;
  if (value.parentThreadId !== null && value.parentThreadId !== undefined) {
    parentThreadId = exactThreadId(value.parentThreadId);
    if (!parentThreadId) return { candidate: null, malformed: true, unsafe_thread_id: threadId };
  }
  return {
    candidate: {
      thread_id: threadId,
      parent_thread_id: parentThreadId,
      status_type: statusType
    },
    malformed: false,
    unsafe_thread_id: null
  };
}

export function collectExactParentThreadLineage(items) {
  if (!Array.isArray(items)) return { candidates: [], malformed_count: 1, unsafe_thread_ids: [] };
  const candidates = [];
  const unsafeThreadIds = new Set();
  let malformedCount = 0;
  for (const item of items) {
    const projected = projectExactParentThreadLineage(item);
    if (projected.malformed) {
      malformedCount += 1;
      if (projected.unsafe_thread_id) unsafeThreadIds.add(projected.unsafe_thread_id);
      continue;
    }
    candidates.push(projected.candidate);
  }
  return {
    candidates,
    malformed_count: malformedCount,
    unsafe_thread_ids: [...unsafeThreadIds].sort((left, right) => left.localeCompare(right, "en"))
  };
}

function unavailableResult(error, registry = null) {
  return {
    status: "hold",
    error,
    changed: false,
    registry
  };
}

export async function reconcileAndPersistLiveThreadAutoEnrollment({
  registryPath,
  organizationCatalog = null,
  candidates = [],
  partial = false,
  malformedCount = 0,
  unsafeThreadIds = [],
  env = process.env,
  now = Date.now,
  readEnrollmentRegistry = readThreadEnrollmentRegistry,
  writeEnrollmentRegistry = writeThreadEnrollmentRegistryAtomic
} = {}) {
  if (typeof registryPath !== "string" || !registryPath.trim()) return unavailableResult("missing_enrollment_registry_path");
  try {
    // Reload immediately before a possible write so the append-only core works
    // from the most recent local registry rather than an earlier Board read.
    // This is not a cross-process compare-and-swap; another local writer still
    // needs its own authority and coordination boundary.
    const enrollment = await readEnrollmentRegistry(registryPath);
    if (!enrollment?.registry) return unavailableResult("enrollment_registry_unavailable");
    const reconciliation = reconcileExactParentThreadAutoEnrollment(enrollment.registry, {
      organizationCatalog,
      candidates,
      partial,
      malformedCount,
      unsafeThreadIds,
      now: observedAt(now),
      env
    });
    if (!reconciliation.changed) return reconciliation;
    try {
      const written = await writeEnrollmentRegistry(registryPath, reconciliation.registry, { env });
      return { ...reconciliation, status: "available", registry: written };
    } catch {
      return unavailableResult("live_thread_auto_enrollment_write_failed", enrollment.registry);
    }
  } catch {
    return unavailableResult("live_thread_auto_enrollment_failed");
  }
}

// Each adapter owns this small coordinator. It coalesces repeated Board polling
// without starting a process or traversing the Codex session root.
export function createLiveThreadAutoEnrollmentReconciler({
  registryPath,
  env = process.env,
  debounceMs = DEFAULT_AUTO_ENROLLMENT_DEBOUNCE_MS,
  now = Date.now,
  reconcileAndPersist = reconcileAndPersistLiveThreadAutoEnrollment
} = {}) {
  const safeDebounceMs = nonNegativeInteger(
    debounceMs,
    DEFAULT_AUTO_ENROLLMENT_DEBOUNCE_MS,
    MAX_AUTO_ENROLLMENT_DEBOUNCE_MS
  );
  let inFlight = null;
  let lastAttemptAt = null;

  return {
    async reconcile({ organizationCatalog = null, candidates = [], partial = false, malformedCount = 0, unsafeThreadIds = [] } = {}) {
      const timestamp = observedNow(now);
      if (inFlight !== null) return unavailableResult("live_thread_auto_enrollment_inflight");
      if (lastAttemptAt !== null && timestamp - lastAttemptAt < safeDebounceMs) {
        return { status: "debounced", error: null, changed: false, registry: null };
      }
      lastAttemptAt = timestamp;

      // The adapter's refresh single-flight and this coordinator serialize
      // writes for one adapter instance. We deliberately await the local
      // writer: reporting a timeout while an atomic write still runs would
      // make a later mutation invisible to the Board response.
      let operation;
      operation = Promise.resolve().then(() => reconcileAndPersist({
        registryPath,
        organizationCatalog,
        candidates,
        partial,
        malformedCount,
        unsafeThreadIds,
        env,
        now: timestamp
      })).catch(() => unavailableResult("live_thread_auto_enrollment_failed")).finally(() => {
        if (inFlight === operation) inFlight = null;
      });
      inFlight = operation;
      return operation;
    }
  };
}
