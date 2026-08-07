import {
  isLiveThreadEnrollmentDisabled,
  registerExistingThread
} from "./live-thread-enrollment.mjs";
import {
  findOrganizationCatalogGroup,
  normalizeOrganizationCatalog
} from "./live-organization-catalog.mjs";
import { normalizeThreadEnrollmentRegistry } from "./live-thread-projection.mjs";

export const TEAM_OPS_BOARD_AUTO_ENROLLMENT_DISABLED = "TEAM_OPS_BOARD_AUTO_ENROLLMENT_DISABLED";

const ACTIVE_PARENT_LIFECYCLES = new Set(["accepted", "current"]);
const ENROLLABLE_EXACT_CHILD_STATUSES = new Set(["active", "idle"]);
const LINEAGE_KEYS = new Set(["thread_id", "parent_thread_id", "status_type"]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  return isRecord(value) && Object.keys(value).length === keys.size && Object.keys(value).every((key) => keys.has(key));
}

function isTruthyEnvironmentValue(value) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

function exactThreadId(value) {
  if (typeof value !== "string" || value !== value.trim() || value.length === 0 || value.length > 320) return null;
  return /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u.test(value) ? value : null;
}

function exactStatusType(value) {
  if (typeof value !== "string" || value !== value.trim() || value.length === 0 || value.length > 80) return null;
  return /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u.test(value) ? value : null;
}

function safeMalformedCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 1;
}

function emptySummary(malformed = 0) {
  return {
    candidate_count: 0,
    enrolled: 0,
    existing: 0,
    root: 0,
    unlinked: 0,
    inactive_parent_group: 0,
    malformed,
    conflicted: 0,
    unsafe_identity: 0,
    unsupported_status: 0,
    rejected: 0
  };
}

function normalizeLineageCandidate(value) {
  const knownThreadId = exactThreadId(value?.thread_id);
  if (!hasExactKeys(value, LINEAGE_KEYS)) return { kind: "malformed", thread_id: knownThreadId };
  const threadId = exactThreadId(value.thread_id);
  const statusType = exactStatusType(value.status_type);
  if (!threadId || !statusType) return { kind: "malformed", thread_id: threadId };
  // Exact parent_thread_id is the enrollment fact. `idle` is accepted only to
  // close the short-task race where a child starts and finishes between Board
  // polls; it is never converted into completion or result evidence here.
  if (!ENROLLABLE_EXACT_CHILD_STATUSES.has(statusType)) return { kind: "unsupported", thread_id: threadId };
  if (value.parent_thread_id === null) return { kind: "root", thread_id: threadId };
  const parentThreadId = exactThreadId(value.parent_thread_id);
  if (!parentThreadId || parentThreadId === threadId) return { kind: "malformed", thread_id: threadId };
  return {
    kind: "candidate",
    thread_id: threadId,
    parent_thread_id: parentThreadId
  };
}

function currentParents(registry) {
  return new Map(registry.entries
    .filter((entry) => ACTIVE_PARENT_LIFECYCLES.has(entry.lifecycle))
    .map((entry) => [entry.thread_id, entry]));
}

function result({ error = null, status = "available", changed = false, registry, summary }) {
  return { error, status, changed, registry, summary };
}

export function isLiveThreadAutoEnrollmentDisabled({ registry = null, env = process.env } = {}) {
  return isLiveThreadEnrollmentDisabled({ registry, env })
    || isTruthyEnvironmentValue(env?.[TEAM_OPS_BOARD_AUTO_ENROLLMENT_DISABLED]);
}

export function buildAutoEnrollmentDisplayLabel(threadId) {
  const exactId = exactThreadId(threadId);
  if (!exactId) return null;
  const shortId = exactId.length > 16 ? exactId.slice(0, 12) : exactId;
  return `자동 발견 TASK · ${shortId}`;
}

// This is intentionally a one-generation append-only reconciliation. A child
// discovered during this pass cannot itself become an eligible parent until a
// later refresh has read it back from the local registry.
export function reconcileExactParentThreadAutoEnrollment(
  registryInput,
  {
    organizationCatalog = null,
    candidates = [],
    partial = false,
    malformedCount = 0,
    unsafeThreadIds = [],
    now = new Date().toISOString(),
    env = process.env
  } = {}
) {
  const registry = normalizeThreadEnrollmentRegistry(registryInput);
  const summary = emptySummary(safeMalformedCount(malformedCount));
  if (!registry) return result({ error: "invalid_enrollment_registry", status: "hold", registry: null, summary });
  if (isLiveThreadAutoEnrollmentDisabled({ registry, env })) {
    return result({ error: "live_thread_auto_enrollment_disabled", status: "disabled", registry, summary });
  }

  if (organizationCatalog === null || organizationCatalog === undefined) {
    return result({ error: "organization_catalog_unavailable", status: "hold", registry, summary });
  }
  const catalog = normalizeOrganizationCatalog(organizationCatalog);
  if (!catalog) return result({ error: "invalid_organization_catalog", status: "hold", registry, summary });
  if (catalog.disabled) return result({ error: "organization_catalog_disabled", status: "hold", registry, summary });

  const candidatesByThreadId = new Map();
  const conflictedThreadIds = new Set();
  const unsafeIds = new Set();
  if (!Array.isArray(unsafeThreadIds)) {
    summary.malformed += 1;
  } else {
    for (const value of unsafeThreadIds) {
      const unsafeThreadId = exactThreadId(value);
      if (unsafeThreadId) unsafeIds.add(unsafeThreadId);
      else summary.malformed += 1;
    }
  }
  for (const input of Array.isArray(candidates) ? candidates : []) {
    const normalized = normalizeLineageCandidate(input);
    if (normalized.kind === "malformed") {
      summary.malformed += 1;
      if (normalized.thread_id) {
        unsafeIds.add(normalized.thread_id);
        candidatesByThreadId.delete(normalized.thread_id);
      }
      continue;
    }
    if (normalized.kind === "root") {
      summary.root += 1;
      unsafeIds.add(normalized.thread_id);
      candidatesByThreadId.delete(normalized.thread_id);
      continue;
    }
    if (normalized.kind === "unsupported") {
      summary.unsupported_status += 1;
      unsafeIds.add(normalized.thread_id);
      candidatesByThreadId.delete(normalized.thread_id);
      continue;
    }
    if (unsafeIds.has(normalized.thread_id)) continue;
    const existing = candidatesByThreadId.get(normalized.thread_id);
    if (existing && existing.parent_thread_id !== normalized.parent_thread_id) {
      conflictedThreadIds.add(normalized.thread_id);
      unsafeIds.add(normalized.thread_id);
      candidatesByThreadId.delete(normalized.thread_id);
      continue;
    }
    candidatesByThreadId.set(normalized.thread_id, normalized);
  }
  summary.candidate_count = candidatesByThreadId.size;
  summary.conflicted = conflictedThreadIds.size;
  summary.unsafe_identity = unsafeIds.size;

  if (partial === true) {
    return result({ error: "partial_exact_lineage_unsafe", status: "hold", registry, summary });
  }

  const existingThreadIds = new Set(registry.entries.map((entry) => entry.thread_id));
  const currentByThreadId = currentParents(registry);
  const activeParentsByThreadId = new Map(
    [...currentByThreadId.entries()].filter(([, entry]) => (
      findOrganizationCatalogGroup(catalog, entry.organization_group_id, { activeOnly: true }) !== null
    ))
  );
  let nextRegistry = registry;

  for (const candidate of [...candidatesByThreadId.values()].sort((left, right) => left.thread_id.localeCompare(right.thread_id, "en"))) {
    if (existingThreadIds.has(candidate.thread_id)) {
      summary.existing += 1;
      continue;
    }
    const currentParent = currentByThreadId.get(candidate.parent_thread_id);
    if (!currentParent) {
      summary.unlinked += 1;
      continue;
    }
    const activeParent = activeParentsByThreadId.get(candidate.parent_thread_id);
    if (!activeParent) {
      summary.inactive_parent_group += 1;
      continue;
    }
    const displayLabel = buildAutoEnrollmentDisplayLabel(candidate.thread_id);
    if (!displayLabel) {
      summary.rejected += 1;
      continue;
    }
    const registration = registerExistingThread(nextRegistry, {
      threadId: candidate.thread_id,
      organizationGroupId: activeParent.organization_group_id,
      routeId: null,
      workId: null,
      threadKind: "task",
      displayLabel,
      relationship: "child",
      lifecycle: "current",
      parentThreadId: candidate.parent_thread_id,
      metadata_only: true,
      raw_preview: false,
      raw_turns: false,
      raw_messages: false,
      raw_reasoning: false,
      raw_tool_io: false,
      raw_cwd: false
    }, { now, env, organizationCatalog: catalog });
    if (registration.error || !registration.changed) {
      summary.rejected += 1;
      continue;
    }
    nextRegistry = registration.registry;
    summary.enrolled += 1;
  }

  return result({
    changed: summary.enrolled > 0,
    registry: nextRegistry,
    summary
  });
}
