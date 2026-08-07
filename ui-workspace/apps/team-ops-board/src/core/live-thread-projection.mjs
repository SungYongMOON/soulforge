import { normalizeOrganizationCatalog } from "./live-organization-catalog.mjs";

export const LIVE_THREAD_PROJECTION_SCHEMA = "soulforge.team_ops_board.live_threads.v4";
export const THREAD_ENROLLMENT_SCHEMA = "soulforge.team_ops_board.thread_enrollment.v1";
export const EXACT_THREAD_BINDING_SCHEMA = "soulforge.team_ops_board.exact_thread_binding.v1";
export const THREAD_RESULT_GATE_SCHEMA = "soulforge.team_ops_board.thread_result_gate.v1";

const THREAD_KINDS = new Set(["manager", "task", "verifier", "continuation"]);
const RELATIONSHIPS = new Set(["primary", "child", "review", "handoff", "continuation", "independent"]);
const LIFECYCLES = new Set(["pending", "accepted", "current", "history", "retired"]);
const THREAD_STATUSES = new Set([
  "active",
  "waiting",
  "error",
  "parent_result_ready",
  "owner_attention",
  "accepted_closed",
  "stopped",
  "not_loaded_unknown"
]);
const RUNTIME_THREAD_STATUSES = new Set(["active", "waiting", "error", "stopped", "not_loaded_unknown"]);
const ADAPTER_HEALTH = new Set(["ready", "partial", "unavailable", "error", "disabled"]);
const ADAPTER_COVERAGE = new Set(["partial", "unknown"]);
const TRANSPORTS = new Set(["loopback_local", "unavailable"]);
const ENROLLMENT_HEALTH = new Set(["available", "missing", "invalid", "disabled"]);
const ROUTE_STATES = new Set(["exact", "hold"]);
const RESULT_GATE_HEALTH = new Set(["available", "missing", "invalid", "disabled"]);
const LIFECYCLE_SOURCE_HEALTH = new Set(["available", "hold", "missing", "invalid", "disabled", "stale"]);
const ORGANIZATION_CATALOG_HEALTH = new Set(["available", "hold", "missing", "invalid", "disabled"]);
const RESULT_GATE_EVENT_TYPES = new Set(["started", "result_ready", "accepted", "closed"]);
const RESULT_GATE_TARGETS = new Set(["none", "parent", "owner"]);
const RESULT_STATES = new Set(["none", "started", "delivered_to_parent", "owner_attention", "accepted", "closed"]);
const ATTENTION_TARGETS = new Set(["none", "parent", "owner"]);
const DISPLAY_LABEL_MAX_LENGTH = 120;

const ENROLLMENT_ROOT_KEYS = new Set(["schema_version", "registry_revision", "updated_at", "disabled", "entries"]);
const ENROLLMENT_ENTRY_KEYS = new Set([
  "thread_id",
  "organization_group_id",
  "route_id",
  "work_id",
  "thread_kind",
  "display_label",
  "relationship",
  "lifecycle",
  "parent_thread_id",
  "prior_thread_history_pointer",
  "metadata_only",
  "raw_preview",
  "raw_turns",
  "raw_messages",
  "raw_reasoning",
  "raw_tool_io",
  "raw_cwd",
  "enrolled_at",
  "updated_at"
]);
const BINDING_ROOT_KEYS = new Set(["schema_version", "bindings"]);
const BINDING_ENTRY_KEYS = new Set([
  "thread_id",
  "route_id",
  "binding_id",
  "execution_ready",
  "metadata_only",
  "raw_preview",
  "raw_turns",
  "raw_messages",
  "raw_reasoning",
  "raw_tool_io",
  "raw_cwd"
]);
const RESULT_GATE_ROOT_KEYS = new Set(["schema_version", "registry_revision", "updated_at", "disabled", "events"]);
const RESULT_GATE_EVENT_KEYS = new Set([
  "event_id",
  "thread_id",
  "event_type",
  "target",
  "target_thread_id",
  "occurred_at",
  "metadata_only",
  "raw_preview",
  "raw_turns",
  "raw_messages",
  "raw_reasoning",
  "raw_tool_io",
  "raw_cwd"
]);
const PROJECTION_ROOT_KEYS = new Set(["schema_version", "generated_at", "adapter", "scope", "organization", "threads", "history"]);
const ADAPTER_KEYS = new Set(["health", "coverage", "transport", "last_refresh_at"]);
const SCOPE_KEYS = new Set([
  "enrollment_health",
  "result_gate_health",
  "lifecycle_source_health",
  "lifecycle_exact_identity_count",
  "lifecycle_matched_enrolled_count",
  "included_count",
  "excluded_unregistered_count",
  "unseen_enrolled_count",
  "binding_coverage"
]);
const ORGANIZATION_KEYS = new Set([
  "health",
  "catalog_revision",
  "root_display_label",
  "companies",
  "groups",
  "unknown_enrolled_group_ids"
]);
const ORGANIZATION_COMPANY_KEYS = new Set(["company_id", "display_label", "ceo_group_id", "sort_order"]);
const ORGANIZATION_GROUP_KEYS = new Set([
  "organization_group_id",
  "company_id",
  "display_label",
  "parent_group_id",
  "presentation_role",
  "sort_order"
]);
const THREAD_KEYS = new Set([
  "thread_id",
  "parent_thread_id",
  "organization_group_id",
  "route_id",
  "work_id",
  "thread_kind",
  "display_label",
  "relationship",
  "lifecycle",
  "status",
  "result_state",
  "attention_target",
  "child_result_count",
  "updated_at",
  "observed",
  "stop_observed_at",
  "organization_route_state",
  "execution_ready"
]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  return isRecord(value) && Object.keys(value).length === keys.size && Object.keys(value).every((key) => keys.has(key));
}

function safeToken(value, maxLength = 192) {
  if (typeof value !== "string") return null;
  const token = value.trim();
  if (!token || token.length > maxLength || !/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u.test(token)) return null;
  return token;
}

function safeNullableToken(value, maxLength = 192) {
  return value === null ? null : safeToken(value, maxLength);
}

function safeDisplayLabel(value) {
  if (typeof value !== "string") return null;
  const label = value.normalize("NFKC").trim();
  if (!label || Array.from(label).length > DISPLAY_LABEL_MAX_LENGTH) return null;
  if (/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(label)) return null;
  if (
    /^(?:[A-Za-z]:|[\\/]{1,2}|(?:\.{1,2}|~)[\\/]|(?:https?|ftp|ssh|s3|file|data|javascript):|[A-Za-z][A-Za-z0-9+.-]*:\/\/|www\.)/iu.test(label)
    || /^[^\s\\/]+(?:[\\/][^\s\\/]+)+$/u.test(label)
    || /^[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}(?:[/?#].*)?$/u.test(label)
  ) {
    return null;
  }
  return label;
}

function safeIsoTimestamp(value) {
  if (typeof value !== "string" || value.length > 40 || !/^[0-9T:+.-]+Z?$/u.test(value)) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

function timestampToIso(value) {
  if (typeof value === "string") return safeIsoTimestamp(value);
  if (!Number.isFinite(value)) return null;
  const milliseconds = Math.abs(value) < 100_000_000_000 ? value * 1000 : value;
  if (!Number.isSafeInteger(milliseconds)) return null;
  const date = new Date(milliseconds);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function falseRawFlags(value) {
  return value.metadata_only === true
    && value.raw_preview === false
    && value.raw_turns === false
    && value.raw_messages === false
    && value.raw_reasoning === false
    && value.raw_tool_io === false
    && value.raw_cwd === false;
}

function safeCatalogSortOrder(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000 ? value : null;
}

function safeOrganizationCompany(value) {
  return hasExactKeys(value, ORGANIZATION_COMPANY_KEYS)
    && safeToken(value.company_id, 160) === value.company_id
    && safeDisplayLabel(value.display_label) === value.display_label
    && safeToken(value.ceo_group_id, 160) === value.ceo_group_id
    && safeCatalogSortOrder(value.sort_order) === value.sort_order;
}

function safeOrganizationGroup(value) {
  return hasExactKeys(value, ORGANIZATION_GROUP_KEYS)
    && safeToken(value.organization_group_id, 160) === value.organization_group_id
    && safeToken(value.company_id, 160) === value.company_id
    && safeDisplayLabel(value.display_label) === value.display_label
    && (value.parent_group_id === null || safeToken(value.parent_group_id, 160) === value.parent_group_id)
    && ["ceo", "manager_peers", "group_node"].includes(value.presentation_role)
    && safeCatalogSortOrder(value.sort_order) === value.sort_order;
}

function safeOrganizationProjection(value) {
  if (
    !hasExactKeys(value, ORGANIZATION_KEYS)
    || !ORGANIZATION_CATALOG_HEALTH.has(value.health)
    || !Array.isArray(value.companies)
    || !Array.isArray(value.groups)
    || !Array.isArray(value.unknown_enrolled_group_ids)
    || !value.companies.every(safeOrganizationCompany)
    || !value.groups.every(safeOrganizationGroup)
    || !value.unknown_enrolled_group_ids.every((groupId) => safeToken(groupId, 160) === groupId)
    || new Set(value.unknown_enrolled_group_ids).size !== value.unknown_enrolled_group_ids.length
  ) {
    return false;
  }
  const companyIds = new Set(value.companies.map((company) => company.company_id));
  const groupsById = new Map(value.groups.map((group) => [group.organization_group_id, group]));
  if (groupsById.size !== value.groups.length) return false;
  for (const company of value.companies) {
    const ceoGroup = groupsById.get(company.ceo_group_id);
    if (!ceoGroup || ceoGroup.company_id !== company.company_id || ceoGroup.presentation_role !== "ceo") return false;
  }
  for (const group of value.groups) {
    if (!companyIds.has(group.company_id)) return false;
    if (group.parent_group_id !== null) {
      const parent = groupsById.get(group.parent_group_id);
      if (!parent || parent.company_id !== group.company_id) return false;
    }
  }
  const catalogPresent = value.catalog_revision !== null || value.root_display_label !== null || value.companies.length > 0 || value.groups.length > 0;
  if (catalogPresent) {
    if (!Number.isSafeInteger(value.catalog_revision) || value.catalog_revision < 0 || safeDisplayLabel(value.root_display_label) !== value.root_display_label) return false;
  } else if (value.catalog_revision !== null || value.root_display_label !== null) {
    return false;
  }
  if (value.health === "available" && value.unknown_enrolled_group_ids.length > 0) return false;
  if (["missing", "invalid", "disabled"].includes(value.health) && catalogPresent) return false;
  return true;
}

function currentEnrollmentGroupIds(registry) {
  return [...new Set(
    registry.entries
      .filter((entry) => entry.lifecycle === "current" || entry.lifecycle === "accepted")
      .map((entry) => entry.organization_group_id)
  )].sort();
}

function buildOrganizationProjection({ organizationCatalog = null, organizationCatalogHealth = null, enrollmentRegistry = null } = {}) {
  const registry = normalizeThreadEnrollmentRegistry(enrollmentRegistry);
  const enrolledGroupIds = registry ? currentEnrollmentGroupIds(registry) : [];
  const catalog = normalizeOrganizationCatalog(organizationCatalog);
  const requestedHealth = ORGANIZATION_CATALOG_HEALTH.has(organizationCatalogHealth)
    ? organizationCatalogHealth
    : (catalog?.disabled ? "disabled" : catalog ? "available" : "missing");
  if (!catalog || requestedHealth === "missing" || requestedHealth === "invalid") {
    return {
      health: requestedHealth === "available" ? "invalid" : requestedHealth,
      catalog_revision: null,
      root_display_label: null,
      companies: [],
      groups: [],
      unknown_enrolled_group_ids: enrolledGroupIds
    };
  }
  if (catalog.disabled || requestedHealth === "disabled") {
    return {
      health: "disabled",
      catalog_revision: null,
      root_display_label: null,
      companies: [],
      groups: [],
      unknown_enrolled_group_ids: enrolledGroupIds
    };
  }
  const companies = catalog.companies
    .filter((company) => company.lifecycle === "active")
    .map((company) => ({
      company_id: company.company_id,
      display_label: company.display_label,
      ceo_group_id: company.ceo_group_id,
      sort_order: company.sort_order
    }));
  const groups = catalog.groups
    .filter((group) => group.lifecycle === "active")
    .map((group) => ({
      organization_group_id: group.organization_group_id,
      company_id: group.company_id,
      display_label: group.display_label,
      parent_group_id: group.parent_group_id,
      presentation_role: group.presentation_role,
      sort_order: group.sort_order
    }));
  const activeGroupIds = new Set(groups.map((group) => group.organization_group_id));
  const unknownEnrolledGroupIds = enrolledGroupIds.filter((groupId) => !activeGroupIds.has(groupId));
  return {
    health: unknownEnrolledGroupIds.length > 0 || requestedHealth === "hold" ? "hold" : "available",
    catalog_revision: catalog.catalog_revision,
    root_display_label: catalog.root_display_label,
    companies,
    groups,
    unknown_enrolled_group_ids: unknownEnrolledGroupIds
  };
}

export function normalizeThreadEnrollmentEntry(value) {
  if (!hasExactKeys(value, ENROLLMENT_ENTRY_KEYS) || !falseRawFlags(value)) return null;
  const threadId = safeToken(value.thread_id, 320);
  const organizationGroupId = safeToken(value.organization_group_id, 160);
  const routeId = safeNullableToken(value.route_id, 160);
  const workId = safeNullableToken(value.work_id, 160);
  const displayLabel = safeDisplayLabel(value.display_label);
  const parentThreadId = safeNullableToken(value.parent_thread_id, 320);
  const priorHistoryPointer = safeNullableToken(value.prior_thread_history_pointer, 320);
  const enrolledAt = safeIsoTimestamp(value.enrolled_at);
  const updatedAt = safeIsoTimestamp(value.updated_at);
  if (
    !threadId
    || !organizationGroupId
    || !displayLabel
    || !RELATIONSHIPS.has(value.relationship)
    || !THREAD_KINDS.has(value.thread_kind)
    || !LIFECYCLES.has(value.lifecycle)
    || !enrolledAt
    || !updatedAt
    || parentThreadId === threadId
  ) {
    return null;
  }
  return {
    thread_id: threadId,
    organization_group_id: organizationGroupId,
    route_id: routeId,
    work_id: workId,
    thread_kind: value.thread_kind,
    display_label: displayLabel,
    relationship: value.relationship,
    lifecycle: value.lifecycle,
    parent_thread_id: parentThreadId,
    prior_thread_history_pointer: priorHistoryPointer,
    metadata_only: true,
    raw_preview: false,
    raw_turns: false,
    raw_messages: false,
    raw_reasoning: false,
    raw_tool_io: false,
    raw_cwd: false,
    enrolled_at: enrolledAt,
    updated_at: updatedAt
  };
}

function hasValidParentLineage(entries) {
  const byThreadId = new Map(entries.map((entry) => [entry.thread_id, entry]));
  for (const entry of entries) {
    if (entry.parent_thread_id !== null && !byThreadId.has(entry.parent_thread_id)) return false;
    const visited = new Set([entry.thread_id]);
    let parentThreadId = entry.parent_thread_id;
    while (parentThreadId !== null) {
      if (visited.has(parentThreadId)) return false;
      visited.add(parentThreadId);
      parentThreadId = byThreadId.get(parentThreadId)?.parent_thread_id ?? null;
    }
  }
  return true;
}

export function createEmptyThreadEnrollmentRegistry({ now = new Date().toISOString(), disabled = false } = {}) {
  const updatedAt = safeIsoTimestamp(now) ?? new Date().toISOString();
  return {
    schema_version: THREAD_ENROLLMENT_SCHEMA,
    registry_revision: 0,
    updated_at: updatedAt,
    disabled: disabled === true,
    entries: []
  };
}

export function normalizeThreadEnrollmentRegistry(value) {
  if (
    !hasExactKeys(value, ENROLLMENT_ROOT_KEYS)
    || value.schema_version !== THREAD_ENROLLMENT_SCHEMA
    || !Number.isSafeInteger(value.registry_revision)
    || value.registry_revision < 0
    || typeof value.disabled !== "boolean"
    || safeIsoTimestamp(value.updated_at) === null
    || !Array.isArray(value.entries)
  ) {
    return null;
  }
  const entries = value.entries.map(normalizeThreadEnrollmentEntry);
  if (entries.some((entry) => entry === null)) return null;
  const threadIds = new Set();
  for (const entry of entries) {
    if (threadIds.has(entry.thread_id)) return null;
    threadIds.add(entry.thread_id);
  }
  if (!hasValidParentLineage(entries)) return null;
  return {
    schema_version: THREAD_ENROLLMENT_SCHEMA,
    registry_revision: value.registry_revision,
    updated_at: value.updated_at,
    disabled: value.disabled,
    entries: entries.sort((left, right) => left.thread_id.localeCompare(right.thread_id))
  };
}

export function validateThreadEnrollmentRegistry(value) {
  const registry = normalizeThreadEnrollmentRegistry(value);
  if (!registry) return { valid: false, error: "invalid_enrollment_registry", registry: null };
  return {
    valid: true,
    error: null,
    registry,
    summary: {
      entries: registry.entries.length,
      current: registry.entries.filter((entry) => entry.lifecycle === "current").length,
      disabled: registry.disabled
    }
  };
}

function normalizeExactBindingEntry(value) {
  if (!hasExactKeys(value, BINDING_ENTRY_KEYS) || !falseRawFlags(value)) return null;
  const threadId = safeToken(value.thread_id, 320);
  const routeId = safeToken(value.route_id, 160);
  const bindingId = safeToken(value.binding_id, 192);
  if (!threadId || !routeId || !bindingId || typeof value.execution_ready !== "boolean") return null;
  return {
    thread_id: threadId,
    route_id: routeId,
    binding_id: bindingId,
    execution_ready: value.execution_ready,
    metadata_only: true,
    raw_preview: false,
    raw_turns: false,
    raw_messages: false,
    raw_reasoning: false,
    raw_tool_io: false,
    raw_cwd: false
  };
}

export function normalizeExactThreadBindingRegistry(value) {
  if (!hasExactKeys(value, BINDING_ROOT_KEYS) || value.schema_version !== EXACT_THREAD_BINDING_SCHEMA || !Array.isArray(value.bindings)) {
    return null;
  }
  const bindings = value.bindings.map(normalizeExactBindingEntry);
  if (bindings.some((entry) => entry === null)) return null;
  const seen = new Set();
  for (const entry of bindings) {
    if (seen.has(entry.thread_id)) return null;
    seen.add(entry.thread_id);
  }
  return {
    schema_version: EXACT_THREAD_BINDING_SCHEMA,
    bindings: bindings.sort((left, right) => left.thread_id.localeCompare(right.thread_id))
  };
}

function safeResultGateEventId(value) {
  if (typeof value !== "string") return null;
  const eventId = value.trim();
  if (!eventId || eventId.length > 192 || !/^[A-Za-z0-9][A-Za-z0-9._:@-]*$/u.test(eventId)) return null;
  return eventId;
}

function normalizeThreadResultGateEvent(value) {
  if (!hasExactKeys(value, RESULT_GATE_EVENT_KEYS) || !falseRawFlags(value)) return null;
  const eventId = safeResultGateEventId(value.event_id);
  const threadId = safeToken(value.thread_id, 320);
  const targetThreadId = safeNullableToken(value.target_thread_id, 320);
  const occurredAt = safeIsoTimestamp(value.occurred_at);
  if (
    !eventId
    || !threadId
    || !occurredAt
    || !RESULT_GATE_EVENT_TYPES.has(value.event_type)
    || !RESULT_GATE_TARGETS.has(value.target)
  ) {
    return null;
  }
  if (
    (value.event_type === "started" && (value.target !== "none" || targetThreadId !== null))
    || (value.event_type !== "started" && value.target === "none")
    || (value.target === "owner" && targetThreadId !== null)
    || (value.target === "parent" && targetThreadId === null)
  ) {
    return null;
  }
  return {
    event_id: eventId,
    thread_id: threadId,
    event_type: value.event_type,
    target: value.target,
    target_thread_id: targetThreadId,
    occurred_at: occurredAt,
    metadata_only: true,
    raw_preview: false,
    raw_turns: false,
    raw_messages: false,
    raw_reasoning: false,
    raw_tool_io: false,
    raw_cwd: false
  };
}

export function createEmptyThreadResultGateRegistry({ now = new Date().toISOString(), disabled = false } = {}) {
  return {
    schema_version: THREAD_RESULT_GATE_SCHEMA,
    registry_revision: 0,
    updated_at: safeIsoTimestamp(now) ?? new Date().toISOString(),
    disabled: disabled === true,
    events: []
  };
}

export function normalizeThreadResultGateRegistry(value) {
  if (
    !hasExactKeys(value, RESULT_GATE_ROOT_KEYS)
    || value.schema_version !== THREAD_RESULT_GATE_SCHEMA
    || !Number.isSafeInteger(value.registry_revision)
    || value.registry_revision < 0
    || typeof value.disabled !== "boolean"
    || safeIsoTimestamp(value.updated_at) === null
    || !Array.isArray(value.events)
  ) {
    return null;
  }
  const events = value.events.map(normalizeThreadResultGateEvent);
  if (events.some((event) => event === null)) return null;
  const eventIds = new Set();
  for (const event of events) {
    if (eventIds.has(event.event_id)) return null;
    eventIds.add(event.event_id);
  }
  return {
    schema_version: THREAD_RESULT_GATE_SCHEMA,
    registry_revision: value.registry_revision,
    updated_at: value.updated_at,
    disabled: value.disabled,
    events
  };
}

function isTruthyEnvironmentValue(value) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

export function isThreadResultGateDisabled({ registry = null, env = process.env } = {}) {
  return registry?.disabled === true || isTruthyEnvironmentValue(env?.TEAM_OPS_BOARD_RESULT_GATES_DISABLED);
}

function nextThreadResultGateRegistry(registry, { disabled = registry.disabled, events = registry.events, now = new Date().toISOString() } = {}) {
  return normalizeThreadResultGateRegistry({
    schema_version: THREAD_RESULT_GATE_SCHEMA,
    registry_revision: registry.registry_revision + 1,
    updated_at: safeIsoTimestamp(now) ?? new Date().toISOString(),
    disabled: disabled === true,
    events
  });
}

export function appendThreadResultGateEvent(registryInput, eventInput, { now = new Date().toISOString(), env = process.env } = {}) {
  const registry = normalizeThreadResultGateRegistry(registryInput);
  if (!registry) return { error: "invalid_result_gate_registry", changed: false, registry: null };
  if (isThreadResultGateDisabled({ registry, env })) return { error: "thread_result_gate_disabled", changed: false, registry };
  const event = normalizeThreadResultGateEvent(eventInput);
  if (!event) return { error: "invalid_result_gate_event", changed: false, registry };
  const existing = registry.events.find((item) => item.event_id === event.event_id);
  if (existing) {
    if (JSON.stringify(existing) === JSON.stringify(event)) return { error: null, changed: false, registry, event: existing };
    return { error: "result_gate_event_conflict", changed: false, registry };
  }
  const next = nextThreadResultGateRegistry(registry, { events: [...registry.events, event], now });
  if (!next) return { error: "invalid_result_gate_registry", changed: false, registry };
  return { error: null, changed: true, registry: next, event };
}

export function setThreadResultGateDisabled(registryInput, disabled, { now = new Date().toISOString(), env = process.env } = {}) {
  const registry = normalizeThreadResultGateRegistry(registryInput);
  if (!registry) return { error: "invalid_result_gate_registry", changed: false, registry: null };
  if (isTruthyEnvironmentValue(env?.TEAM_OPS_BOARD_RESULT_GATES_DISABLED)) {
    return { error: "thread_result_gate_disabled", changed: false, registry };
  }
  if (registry.disabled === (disabled === true)) return { error: null, changed: false, registry };
  const next = nextThreadResultGateRegistry(registry, { disabled, now });
  if (!next) return { error: "invalid_result_gate_registry", changed: false, registry };
  return { error: null, changed: true, registry: next };
}

function emptyResultGateState() {
  return {
    stage: "none",
    target: "none",
    target_thread_id: null,
    updated_at: null
  };
}

function resultGateEventMatchesEnrollment(event, entry) {
  if (event.event_type === "started") return event.target === "none" && event.target_thread_id === null;
  if (event.target === "owner") return event.target_thread_id === null;
  return event.target === "parent" && entry.parent_thread_id !== null && event.target_thread_id === entry.parent_thread_id;
}

export function deriveThreadResultGateState({ enrollmentRegistry, resultGateRegistry, disabled = false } = {}) {
  const enrollment = normalizeThreadEnrollmentRegistry(enrollmentRegistry);
  if (!enrollment) return { health: "invalid", by_thread_id: new Map(), child_result_counts: new Map() };
  if (disabled === true) return { health: "disabled", by_thread_id: new Map(), child_result_counts: new Map() };
  if (resultGateRegistry === null || resultGateRegistry === undefined) {
    return { health: "missing", by_thread_id: new Map(), child_result_counts: new Map() };
  }
  const registry = normalizeThreadResultGateRegistry(resultGateRegistry);
  if (!registry) return { health: "invalid", by_thread_id: new Map(), child_result_counts: new Map() };
  if (registry.disabled) return { health: "disabled", by_thread_id: new Map(), child_result_counts: new Map() };

  const entriesByThreadId = new Map(enrollment.entries.map((entry) => [entry.thread_id, entry]));
  const byThreadId = new Map();
  for (const event of registry.events) {
    const entry = entriesByThreadId.get(event.thread_id);
    if (!entry || !resultGateEventMatchesEnrollment(event, entry)) {
      return { health: "invalid", by_thread_id: new Map(), child_result_counts: new Map() };
    }
    const prior = byThreadId.get(event.thread_id) ?? emptyResultGateState();
    if (prior.updated_at !== null && Date.parse(event.occurred_at) < Date.parse(prior.updated_at)) {
      return { health: "invalid", by_thread_id: new Map(), child_result_counts: new Map() };
    }
    if (event.event_type === "started") {
      if (prior.stage !== "none") return { health: "invalid", by_thread_id: new Map(), child_result_counts: new Map() };
      byThreadId.set(event.thread_id, { stage: "started", target: "none", target_thread_id: null, updated_at: event.occurred_at });
      continue;
    }
    if (event.event_type === "result_ready") {
      if (prior.stage !== "started") return { health: "invalid", by_thread_id: new Map(), child_result_counts: new Map() };
      byThreadId.set(event.thread_id, {
        stage: "result_ready",
        target: event.target,
        target_thread_id: event.target_thread_id,
        updated_at: event.occurred_at
      });
      continue;
    }
    if (event.event_type === "accepted") {
      if (prior.stage !== "result_ready" || prior.target !== event.target || prior.target_thread_id !== event.target_thread_id) {
        return { health: "invalid", by_thread_id: new Map(), child_result_counts: new Map() };
      }
      byThreadId.set(event.thread_id, { ...prior, stage: "accepted", updated_at: event.occurred_at });
      continue;
    }
    if (prior.stage !== "accepted" || prior.target !== event.target || prior.target_thread_id !== event.target_thread_id) {
      return { health: "invalid", by_thread_id: new Map(), child_result_counts: new Map() };
    }
    byThreadId.set(event.thread_id, { ...prior, stage: "closed", updated_at: event.occurred_at });
  }

  const childResultCounts = new Map();
  for (const state of byThreadId.values()) {
    if (state.stage === "result_ready" && state.target === "parent" && state.target_thread_id !== null) {
      childResultCounts.set(state.target_thread_id, (childResultCounts.get(state.target_thread_id) ?? 0) + 1);
    }
  }
  return { health: "available", by_thread_id: byThreadId, child_result_counts: childResultCounts };
}

export function validateThreadResultGateRegistry(value, { enrollmentRegistry = null } = {}) {
  const registry = normalizeThreadResultGateRegistry(value);
  if (!registry) return { valid: false, error: "invalid_result_gate_registry", registry: null };
  if (enrollmentRegistry === null) {
    return { valid: true, error: null, registry, summary: { events: registry.events.length, disabled: registry.disabled, lifecycle: "not_checked" } };
  }
  const derived = deriveThreadResultGateState({ enrollmentRegistry, resultGateRegistry: registry });
  if (derived.health === "invalid") return { valid: false, error: "invalid_result_gate_lifecycle", registry: null };
  return {
    valid: true,
    error: null,
    registry,
    summary: { events: registry.events.length, disabled: registry.disabled, lifecycle: derived.health }
  };
}

function projectRuntimeStatus(value) {
  const type = typeof value?.type === "string" ? value.type : "";
  if (type === "active") {
    const flags = Array.isArray(value?.activeFlags) ? value.activeFlags : [];
    return flags.includes("waitingOnUserInput") || flags.includes("waitingOnApproval") ? "waiting" : "active";
  }
  // A stopped or idle turn proves neither a result nor an attention recipient.
  // Only the local explicit result gate can elevate a card beyond this unknown state.
  if (type === "idle") return "not_loaded_unknown";
  if (type === "systemError" || type === "error") return "error";
  return "not_loaded_unknown";
}

// This deliberately reads only protocol fields needed for a safe state projection.
// Names, previews, turns, paths, git information, descriptions, and messages are never copied.
export function projectRuntimeThread(value) {
  if (!isRecord(value)) return null;
  const threadId = safeToken(value.id, 320);
  if (!threadId) return null;
  return {
    thread_id: threadId,
    status: projectRuntimeStatus(value.status),
    updated_at: timestampToIso(value.updatedAt) ?? timestampToIso(value.updated_at),
    stop_observed_at: null
  };
}

function normalizeRuntimeObservation(value) {
  const keys = Object.keys(value ?? {});
  if (
    isRecord(value)
    && safeToken(value.thread_id, 320) === value.thread_id
    && RUNTIME_THREAD_STATUSES.has(value.status)
    && (value.updated_at === null || safeIsoTimestamp(value.updated_at) === value.updated_at)
    && (value.stop_observed_at === undefined || value.stop_observed_at === null || safeIsoTimestamp(value.stop_observed_at) === value.stop_observed_at)
    && (keys.length === 3 || keys.length === 4)
    && keys.every((key) => ["thread_id", "status", "updated_at", "stop_observed_at"].includes(key))
  ) {
    return {
      thread_id: value.thread_id,
      status: value.status,
      updated_at: value.updated_at,
      stop_observed_at: value.stop_observed_at ?? null
    };
  }
  return projectRuntimeThread(value);
}

function normalizeAdapter(value, generatedAt) {
  const health = ADAPTER_HEALTH.has(value?.health) ? value.health : "error";
  const coverage = ADAPTER_COVERAGE.has(value?.coverage) ? value.coverage : "unknown";
  const transport = TRANSPORTS.has(value?.transport) ? value.transport : "unavailable";
  return {
    health,
    coverage,
    transport,
    last_refresh_at: safeIsoTimestamp(value?.last_refresh_at) ?? generatedAt
  };
}

function bindingFor(entry, bindingsByThreadId) {
  const binding = bindingsByThreadId.get(entry.thread_id);
  if (!binding || binding.route_id !== entry.route_id || entry.route_id === null) {
    return { organization_route_state: "hold", execution_ready: false };
  }
  return { organization_route_state: "exact", execution_ready: binding.execution_ready };
}

function latestTimestamp(...values) {
  return values
    .filter((value) => typeof value === "string" && safeIsoTimestamp(value) === value)
    .sort((left, right) => right.localeCompare(left))[0] ?? null;
}

function hasPositiveRuntimeStatus(runtime) {
  return runtime?.status === "active" || runtime?.status === "waiting";
}

function resultStateForGate(gate, runtime) {
  if (gate?.stage === "result_ready" && hasPositiveRuntimeStatus(runtime)) return "none";
  if (gate?.stage === "started") return "started";
  if (gate?.stage === "result_ready" && gate.target === "parent") return "delivered_to_parent";
  if (gate?.stage === "result_ready" && gate.target === "owner") return "owner_attention";
  if (gate?.stage === "accepted") return "accepted";
  if (gate?.stage === "closed") return "closed";
  return "none";
}

function statusForProjectedThread(runtime, gate, childResultCount) {
  if (gate?.stage === "accepted" || gate?.stage === "closed") return "accepted_closed";
  if (hasPositiveRuntimeStatus(runtime)) return runtime.status;
  if (gate?.stage === "result_ready" && gate.target === "owner") return "owner_attention";
  if (childResultCount > 0) return "parent_result_ready";
  return runtime?.status ?? "not_loaded_unknown";
}

function attentionTargetForGate(gate, runtime) {
  if (gate?.stage !== "result_ready" || hasPositiveRuntimeStatus(runtime)) return "none";
  return gate.target;
}

function createProjectedThread(entry, runtime, bindingsByThreadId, gate, childResultCount = 0) {
  const binding = bindingFor(entry, bindingsByThreadId);
  return {
    thread_id: entry.thread_id,
    parent_thread_id: entry.parent_thread_id,
    organization_group_id: entry.organization_group_id,
    route_id: entry.route_id,
    work_id: entry.work_id,
    thread_kind: entry.thread_kind,
    display_label: entry.display_label,
    relationship: entry.relationship,
    lifecycle: entry.lifecycle,
    status: statusForProjectedThread(runtime, gate, childResultCount),
    result_state: resultStateForGate(gate, runtime),
    attention_target: attentionTargetForGate(gate, runtime),
    child_result_count: childResultCount,
    updated_at: latestTimestamp(entry.updated_at, runtime?.updated_at, runtime?.stop_observed_at, gate?.updated_at) ?? entry.updated_at,
    observed: Boolean(runtime),
    stop_observed_at: runtime?.stop_observed_at ?? null,
    organization_route_state: binding.organization_route_state,
    execution_ready: binding.execution_ready
  };
}

function projectionSort(left, right) {
  return right.updated_at.localeCompare(left.updated_at) || left.thread_id.localeCompare(right.thread_id);
}

export function createUnavailableLiveThreadProjection({
  health = "unavailable",
  enrollmentHealth = "missing",
  resultGateHealth = "missing",
  lifecycleSourceHealth = "missing",
  organizationCatalogHealth = "missing"
} = {}) {
  const safeHealth = ADAPTER_HEALTH.has(health) ? health : "unavailable";
  const safeEnrollmentHealth = ENROLLMENT_HEALTH.has(enrollmentHealth) ? enrollmentHealth : "missing";
  const safeResultGateHealth = RESULT_GATE_HEALTH.has(resultGateHealth) ? resultGateHealth : "missing";
  const safeLifecycleSourceHealth = LIFECYCLE_SOURCE_HEALTH.has(lifecycleSourceHealth) ? lifecycleSourceHealth : "missing";
  return {
    schema_version: LIVE_THREAD_PROJECTION_SCHEMA,
    generated_at: null,
    adapter: {
      health: safeHealth,
      coverage: "unknown",
      transport: "unavailable",
      last_refresh_at: null
    },
    scope: {
      enrollment_health: safeEnrollmentHealth,
      result_gate_health: safeResultGateHealth,
      lifecycle_source_health: safeLifecycleSourceHealth,
      lifecycle_exact_identity_count: 0,
      lifecycle_matched_enrolled_count: 0,
      included_count: 0,
      excluded_unregistered_count: 0,
      unseen_enrolled_count: 0,
      binding_coverage: "hold"
    },
    organization: buildOrganizationProjection({ organizationCatalogHealth }),
    threads: [],
    history: []
  };
}

export function buildLiveThreadProjection({
  enrollmentRegistry,
  organizationCatalog = null,
  organizationCatalogHealth = null,
  exactBindingRegistry = null,
  resultGateRegistry = null,
  resultGateHealth = null,
  lifecycleSourceHealth = null,
  lifecycleExactIdentityCount = 0,
  lifecycleMatchedEnrolledCount = 0,
  runtimeThreads = [],
  adapter = {},
  generatedAt = new Date().toISOString()
} = {}) {
  const registry = normalizeThreadEnrollmentRegistry(enrollmentRegistry);
  if (!registry) return createUnavailableLiveThreadProjection({ health: "error", enrollmentHealth: "invalid" });
  if (registry.disabled) return createUnavailableLiveThreadProjection({ health: "disabled", enrollmentHealth: "disabled" });

  const generated_at = safeIsoTimestamp(generatedAt) ?? new Date().toISOString();
  const normalizedBindings = exactBindingRegistry === null ? null : normalizeExactThreadBindingRegistry(exactBindingRegistry);
  const bindingsByThreadId = new Map((normalizedBindings?.bindings ?? []).map((entry) => [entry.thread_id, entry]));
  const derivedResultGates = deriveThreadResultGateState({ enrollmentRegistry: registry, resultGateRegistry });
  const requestedResultGateHealth = RESULT_GATE_HEALTH.has(resultGateHealth) ? resultGateHealth : null;
  const effectiveResultGateHealth = derivedResultGates.health === "invalid"
    ? "invalid"
    : (requestedResultGateHealth === "available" && derivedResultGates.health !== "available"
      ? derivedResultGates.health
      : (requestedResultGateHealth ?? derivedResultGates.health));
  const effectiveLifecycleSourceHealth = LIFECYCLE_SOURCE_HEALTH.has(lifecycleSourceHealth)
    ? lifecycleSourceHealth
    : "missing";
  const safeLifecycleExactIdentityCount = Number.isSafeInteger(lifecycleExactIdentityCount)
    && lifecycleExactIdentityCount >= 0
    ? lifecycleExactIdentityCount
    : 0;
  const safeLifecycleMatchedEnrolledCount = Number.isSafeInteger(lifecycleMatchedEnrolledCount)
    && lifecycleMatchedEnrolledCount >= 0
    && lifecycleMatchedEnrolledCount <= safeLifecycleExactIdentityCount
    ? lifecycleMatchedEnrolledCount
    : 0;
  const resultGatesByThreadId = effectiveResultGateHealth === "available" ? derivedResultGates.by_thread_id : new Map();
  const childResultCounts = effectiveResultGateHealth === "available" ? derivedResultGates.child_result_counts : new Map();
  const normalizedAdapter = normalizeAdapter(adapter, generated_at);
  if (effectiveResultGateHealth === "invalid" && normalizedAdapter.health === "ready") normalizedAdapter.health = "partial";
  const runtimeByThreadId = new Map();
  for (const rawThread of Array.isArray(runtimeThreads) ? runtimeThreads : []) {
    const runtime = normalizeRuntimeObservation(rawThread);
    if (!runtime) continue;
    const previous = runtimeByThreadId.get(runtime.thread_id);
    const positiveSupersedesStopped = hasPositiveRuntimeStatus(runtime) && previous?.status === "stopped";
    const priorPositiveSupersedesStopped = hasPositiveRuntimeStatus(previous) && runtime.status === "stopped";
    if (
      !previous
      || positiveSupersedesStopped
      || (!priorPositiveSupersedesStopped && String(runtime.updated_at ?? "").localeCompare(String(previous.updated_at ?? "")) > 0)
    ) {
      runtimeByThreadId.set(runtime.thread_id, runtime);
    }
  }

  const enrolledThreadIds = new Set(registry.entries.map((entry) => entry.thread_id));
  const excludedUnregisteredCount = [...runtimeByThreadId.keys()].filter((threadId) => !enrolledThreadIds.has(threadId)).length;
  const currentEntries = registry.entries.filter((entry) => entry.lifecycle === "current" || entry.lifecycle === "accepted");
  const historyEntries = registry.entries.filter((entry) => entry.lifecycle !== "current" && entry.lifecycle !== "accepted");
  const currentProjected = currentEntries.map((entry) => createProjectedThread(
    entry,
    runtimeByThreadId.get(entry.thread_id),
    bindingsByThreadId,
    resultGatesByThreadId.get(entry.thread_id),
    childResultCounts.get(entry.thread_id) ?? 0
  ));
  const threads = currentProjected
    .filter((thread) => !["accepted", "closed"].includes(thread.result_state))
    .sort(projectionSort);
  const history = [
    ...historyEntries.map((entry) => createProjectedThread(
      entry,
      runtimeByThreadId.get(entry.thread_id),
      bindingsByThreadId,
      resultGatesByThreadId.get(entry.thread_id),
      childResultCounts.get(entry.thread_id) ?? 0
    )),
    ...currentProjected.filter((thread) => ["accepted", "closed"].includes(thread.result_state))
  ].sort(projectionSort);
  const unseenEnrolledCount = threads.filter((thread) => !thread.observed).length;
  const exactBindingCount = threads.filter((thread) => thread.organization_route_state === "exact").length;
  const organization = buildOrganizationProjection({
    organizationCatalog,
    organizationCatalogHealth,
    enrollmentRegistry: registry
  });

  return {
    schema_version: LIVE_THREAD_PROJECTION_SCHEMA,
    generated_at,
    adapter: normalizedAdapter,
    scope: {
      enrollment_health: "available",
      result_gate_health: effectiveResultGateHealth,
      lifecycle_source_health: effectiveLifecycleSourceHealth,
      lifecycle_exact_identity_count: safeLifecycleExactIdentityCount,
      lifecycle_matched_enrolled_count: safeLifecycleMatchedEnrolledCount,
      included_count: threads.length,
      excluded_unregistered_count: excludedUnregisteredCount,
      unseen_enrolled_count: unseenEnrolledCount,
      binding_coverage: exactBindingCount === threads.length && threads.length > 0 ? "exact" : "hold"
    },
    organization,
    threads,
    history
  };
}

function safeAdapter(value) {
  return hasExactKeys(value, ADAPTER_KEYS)
    && ADAPTER_HEALTH.has(value.health)
    && ADAPTER_COVERAGE.has(value.coverage)
    && TRANSPORTS.has(value.transport)
    && (value.last_refresh_at === null || safeIsoTimestamp(value.last_refresh_at) === value.last_refresh_at);
}

function safeScope(value) {
  return hasExactKeys(value, SCOPE_KEYS)
    && ENROLLMENT_HEALTH.has(value.enrollment_health)
    && RESULT_GATE_HEALTH.has(value.result_gate_health)
    && LIFECYCLE_SOURCE_HEALTH.has(value.lifecycle_source_health)
    && [
      value.lifecycle_exact_identity_count,
      value.lifecycle_matched_enrolled_count,
      value.included_count,
      value.excluded_unregistered_count,
      value.unseen_enrolled_count
    ].every(
      (count) => Number.isSafeInteger(count) && count >= 0
    )
    && value.lifecycle_matched_enrolled_count <= value.lifecycle_exact_identity_count
    && ["exact", "hold"].includes(value.binding_coverage);
}

function hasConsistentResultProjection(value) {
  if (value.status === "owner_attention") {
    return value.result_state === "owner_attention" && value.attention_target === "owner";
  }
  if (value.status === "accepted_closed") {
    return ["accepted", "closed"].includes(value.result_state) && value.attention_target === "none";
  }
  if (value.status === "active" || value.status === "waiting") {
    return ["none", "started"].includes(value.result_state) && value.attention_target === "none";
  }
  if (value.result_state === "delivered_to_parent") return value.attention_target === "parent";
  if (value.result_state === "owner_attention") return false;
  return value.attention_target === "none";
}

function hasValidProjectedParentLineage(threads) {
  const byThreadId = new Map(threads.map((thread) => [thread.thread_id, thread]));
  if (byThreadId.size !== threads.length) return false;
  for (const thread of threads) {
    if (thread.parent_thread_id !== null && !byThreadId.has(thread.parent_thread_id)) return false;
    const visited = new Set([thread.thread_id]);
    let parentThreadId = thread.parent_thread_id;
    while (parentThreadId !== null) {
      if (visited.has(parentThreadId)) return false;
      visited.add(parentThreadId);
      parentThreadId = byThreadId.get(parentThreadId)?.parent_thread_id ?? null;
    }
  }
  return true;
}

function safeProjectedThread(value) {
  return hasExactKeys(value, THREAD_KEYS)
    && safeToken(value.thread_id, 320) === value.thread_id
    && (value.parent_thread_id === null || safeToken(value.parent_thread_id, 320) === value.parent_thread_id)
    && safeToken(value.organization_group_id, 160) === value.organization_group_id
    && (value.route_id === null || safeToken(value.route_id, 160) === value.route_id)
    && (value.work_id === null || safeToken(value.work_id, 160) === value.work_id)
    && THREAD_KINDS.has(value.thread_kind)
    && safeDisplayLabel(value.display_label) === value.display_label
    && RELATIONSHIPS.has(value.relationship)
    && LIFECYCLES.has(value.lifecycle)
    && THREAD_STATUSES.has(value.status)
    && RESULT_STATES.has(value.result_state)
    && ATTENTION_TARGETS.has(value.attention_target)
    && hasConsistentResultProjection(value)
    && Number.isSafeInteger(value.child_result_count)
    && value.child_result_count >= 0
    && safeIsoTimestamp(value.updated_at) === value.updated_at
    && typeof value.observed === "boolean"
    && (value.stop_observed_at === null || safeIsoTimestamp(value.stop_observed_at) === value.stop_observed_at)
    && ROUTE_STATES.has(value.organization_route_state)
    && typeof value.execution_ready === "boolean";
}

export function normalizeLiveThreadProjection(value) {
  if (
    !hasExactKeys(value, PROJECTION_ROOT_KEYS)
    || value.schema_version !== LIVE_THREAD_PROJECTION_SCHEMA
    || (value.generated_at !== null && safeIsoTimestamp(value.generated_at) !== value.generated_at)
    || !safeAdapter(value.adapter)
    || !safeScope(value.scope)
    || !safeOrganizationProjection(value.organization)
    || !Array.isArray(value.threads)
    || !Array.isArray(value.history)
    || ![...value.threads, ...value.history].every(safeProjectedThread)
    || !hasValidProjectedParentLineage([...value.threads, ...value.history])
  ) {
    return createUnavailableLiveThreadProjection({ health: "error", enrollmentHealth: "invalid" });
  }
  return {
    schema_version: LIVE_THREAD_PROJECTION_SCHEMA,
    generated_at: value.generated_at,
    adapter: { ...value.adapter },
    scope: { ...value.scope },
    organization: {
      ...value.organization,
      companies: value.organization.companies.map((company) => ({ ...company })),
      groups: value.organization.groups.map((group) => ({ ...group })),
      unknown_enrolled_group_ids: [...value.organization.unknown_enrolled_group_ids]
    },
    threads: value.threads.map((thread) => ({ ...thread })),
    history: value.history.map((thread) => ({ ...thread }))
  };
}

export function isAcknowledgeableLiveThread(thread) {
  return thread?.status === "owner_attention"
    && thread?.result_state === "owner_attention"
    && thread?.attention_target === "owner"
    && (thread?.lifecycle === "current" || thread?.lifecycle === "accepted");
}

export function organizationGroupLabel(groupId, organization = null) {
  const safeGroupId = safeToken(groupId, 160);
  if (!safeGroupId) return "미할당/보류";
  const group = safeOrganizationProjection(organization)
    ? organization.groups.find((item) => item.organization_group_id === safeGroupId)
    : null;
  return group?.display_label ?? (safeGroupId + " · 미할당/보류");
}

export function liveThreadRoleLabel(threadKind) {
  if (threadKind === "task") return "TASK";
  if (threadKind === "verifier") return "REVIEWER";
  if (threadKind === "manager") return "MANAGER";
  return "CONTINUATION";
}

export function liveThreadStatusLabel(status) {
  const labels = {
    stopped: "응답 종료 · 결과 미확정",
    active: "실행 중",
    waiting: "입력·승인 대기",
    error: "상태 관측 오류",
    parent_result_ready: "하위 응답/결과 도착·취합 중",
    owner_attention: "Owner 응답/결과 확인",
    accepted_closed: "수락·종료 이력",
    not_loaded_unknown: "상태 신호 없음"
  };
  return labels[status] ?? labels.not_loaded_unknown;
}

export function liveThreadStatusPriority(status) {
  const priorities = {
    owner_attention: 0,
    parent_result_ready: 1,
    waiting: 2,
    active: 3,
    stopped: 4,
    not_loaded_unknown: 5,
    error: 6,
    accepted_closed: 7
  };
  return priorities[status] ?? priorities.not_loaded_unknown;
}

export function liveThreadResultStateLabel(resultState) {
  const labels = {
    none: "명시적 결과 게이트 없음",
    started: "시작 수신",
    delivered_to_parent: "정확한 상위 thread 전달 결과",
    owner_attention: "Owner 확인 대상 결과",
    accepted: "수락됨",
    closed: "종료됨"
  };
  return labels[resultState] ?? labels.none;
}
