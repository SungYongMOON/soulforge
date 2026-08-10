export const LIVE_THREAD_PROJECTION_SCHEMA = "soulforge.team_ops_board.live_threads.v1";
export const THREAD_ENROLLMENT_SCHEMA = "soulforge.team_ops_board.thread_enrollment.v1";
export const EXACT_THREAD_BINDING_SCHEMA = "soulforge.team_ops_board.exact_thread_binding.v1";

const THREAD_KINDS = new Set(["manager", "task", "verifier", "continuation"]);
const RELATIONSHIPS = new Set(["primary", "child", "review", "handoff", "continuation", "independent"]);
const LIFECYCLES = new Set(["pending", "accepted", "current", "history", "retired"]);
const THREAD_STATUSES = new Set(["active", "waiting", "error", "idle_result_check", "not_loaded_unknown"]);
const ADAPTER_HEALTH = new Set(["ready", "partial", "unavailable", "error", "disabled"]);
const ADAPTER_COVERAGE = new Set(["partial", "unknown"]);
const TRANSPORTS = new Set(["loopback_local", "unavailable"]);
const ENROLLMENT_HEALTH = new Set(["available", "missing", "invalid", "disabled"]);
const ROUTE_STATES = new Set(["exact", "hold"]);
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
const PROJECTION_ROOT_KEYS = new Set(["schema_version", "generated_at", "adapter", "scope", "threads", "history"]);
const ADAPTER_KEYS = new Set(["health", "coverage", "transport", "last_refresh_at"]);
const SCOPE_KEYS = new Set([
  "enrollment_health",
  "included_count",
  "excluded_unregistered_count",
  "unseen_enrolled_count",
  "binding_coverage"
]);
const THREAD_KEYS = new Set([
  "thread_id",
  "organization_group_id",
  "route_id",
  "work_id",
  "thread_kind",
  "display_label",
  "relationship",
  "lifecycle",
  "status",
  "updated_at",
  "observed",
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

function normalizeEnrollmentEntry(value) {
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
  const entries = value.entries.map(normalizeEnrollmentEntry);
  if (entries.some((entry) => entry === null)) return null;
  const threadIds = new Set();
  for (const entry of entries) {
    if (threadIds.has(entry.thread_id)) return null;
    threadIds.add(entry.thread_id);
  }
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

function projectRuntimeStatus(value) {
  const type = typeof value?.type === "string" ? value.type : "";
  if (type === "active") {
    const flags = Array.isArray(value?.activeFlags) ? value.activeFlags : [];
    return flags.includes("waitingOnUserInput") || flags.includes("waitingOnApproval") ? "waiting" : "active";
  }
  if (type === "idle") return "idle_result_check";
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
    updated_at: timestampToIso(value.updatedAt) ?? timestampToIso(value.updated_at)
  };
}

function normalizeRuntimeObservation(value) {
  if (
    isRecord(value)
    && safeToken(value.thread_id, 320) === value.thread_id
    && THREAD_STATUSES.has(value.status)
    && (value.updated_at === null || safeIsoTimestamp(value.updated_at) === value.updated_at)
    && Object.keys(value).length === 3
    && Object.keys(value).every((key) => ["thread_id", "status", "updated_at"].includes(key))
  ) {
    return {
      thread_id: value.thread_id,
      status: value.status,
      updated_at: value.updated_at
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

function createProjectedThread(entry, runtime, bindingsByThreadId) {
  const binding = bindingFor(entry, bindingsByThreadId);
  return {
    thread_id: entry.thread_id,
    organization_group_id: entry.organization_group_id,
    route_id: entry.route_id,
    work_id: entry.work_id,
    thread_kind: entry.thread_kind,
    display_label: entry.display_label,
    relationship: entry.relationship,
    lifecycle: entry.lifecycle,
    status: runtime?.status ?? "not_loaded_unknown",
    updated_at: runtime?.updated_at ?? entry.updated_at,
    observed: Boolean(runtime),
    organization_route_state: binding.organization_route_state,
    execution_ready: binding.execution_ready
  };
}

function projectionSort(left, right) {
  return right.updated_at.localeCompare(left.updated_at) || left.thread_id.localeCompare(right.thread_id);
}

export function createUnavailableLiveThreadProjection({ health = "unavailable", enrollmentHealth = "missing" } = {}) {
  const safeHealth = ADAPTER_HEALTH.has(health) ? health : "unavailable";
  const safeEnrollmentHealth = ENROLLMENT_HEALTH.has(enrollmentHealth) ? enrollmentHealth : "missing";
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
      included_count: 0,
      excluded_unregistered_count: 0,
      unseen_enrolled_count: 0,
      binding_coverage: "hold"
    },
    threads: [],
    history: []
  };
}

export function buildLiveThreadProjection({
  enrollmentRegistry,
  exactBindingRegistry = null,
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
  const runtimeByThreadId = new Map();
  for (const rawThread of Array.isArray(runtimeThreads) ? runtimeThreads : []) {
    const runtime = normalizeRuntimeObservation(rawThread);
    if (!runtime) continue;
    const previous = runtimeByThreadId.get(runtime.thread_id);
    if (!previous || String(runtime.updated_at ?? "").localeCompare(String(previous.updated_at ?? "")) > 0) {
      runtimeByThreadId.set(runtime.thread_id, runtime);
    }
  }

  const enrolledThreadIds = new Set(registry.entries.map((entry) => entry.thread_id));
  const excludedUnregisteredCount = [...runtimeByThreadId.keys()].filter((threadId) => !enrolledThreadIds.has(threadId)).length;
  const currentEntries = registry.entries.filter((entry) => entry.lifecycle === "current" || entry.lifecycle === "accepted");
  const historyEntries = registry.entries.filter((entry) => entry.lifecycle !== "current" && entry.lifecycle !== "accepted");
  const threads = currentEntries
    .map((entry) => createProjectedThread(entry, runtimeByThreadId.get(entry.thread_id), bindingsByThreadId))
    .sort(projectionSort);
  const history = historyEntries
    .map((entry) => createProjectedThread(entry, runtimeByThreadId.get(entry.thread_id), bindingsByThreadId))
    .sort(projectionSort);
  const unseenEnrolledCount = threads.filter((thread) => !thread.observed).length;
  const exactBindingCount = threads.filter((thread) => thread.organization_route_state === "exact").length;

  return {
    schema_version: LIVE_THREAD_PROJECTION_SCHEMA,
    generated_at,
    adapter: normalizeAdapter(adapter, generated_at),
    scope: {
      enrollment_health: "available",
      included_count: threads.length,
      excluded_unregistered_count: excludedUnregisteredCount,
      unseen_enrolled_count: unseenEnrolledCount,
      binding_coverage: exactBindingCount === threads.length && threads.length > 0 ? "exact" : "hold"
    },
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
    && [value.included_count, value.excluded_unregistered_count, value.unseen_enrolled_count].every(
      (count) => Number.isSafeInteger(count) && count >= 0
    )
    && ["exact", "hold"].includes(value.binding_coverage);
}

function safeProjectedThread(value) {
  return hasExactKeys(value, THREAD_KEYS)
    && safeToken(value.thread_id, 320) === value.thread_id
    && safeToken(value.organization_group_id, 160) === value.organization_group_id
    && (value.route_id === null || safeToken(value.route_id, 160) === value.route_id)
    && (value.work_id === null || safeToken(value.work_id, 160) === value.work_id)
    && THREAD_KINDS.has(value.thread_kind)
    && safeDisplayLabel(value.display_label) === value.display_label
    && RELATIONSHIPS.has(value.relationship)
    && LIFECYCLES.has(value.lifecycle)
    && THREAD_STATUSES.has(value.status)
    && safeIsoTimestamp(value.updated_at) === value.updated_at
    && typeof value.observed === "boolean"
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
    || !Array.isArray(value.threads)
    || !Array.isArray(value.history)
    || ![...value.threads, ...value.history].every(safeProjectedThread)
  ) {
    return createUnavailableLiveThreadProjection({ health: "error", enrollmentHealth: "invalid" });
  }
  return {
    schema_version: LIVE_THREAD_PROJECTION_SCHEMA,
    generated_at: value.generated_at,
    adapter: { ...value.adapter },
    scope: { ...value.scope },
    threads: value.threads.map((thread) => ({ ...thread })),
    history: value.history.map((thread) => ({ ...thread }))
  };
}

export function isAcknowledgeableLiveThread(thread) {
  return ["task", "verifier"].includes(thread?.thread_kind)
    && ["idle_result_check", "not_loaded_unknown"].includes(thread?.status);
}

const ORGANIZATION_GROUP_LABELS = Object.freeze({
  development1_company: "개발1팀 회사",
  development1_ops: "개발1팀 운영실",
  development1_projects: "개발1팀 프로젝트",
  development1_kvds: "KVDS 개발 조직",
  ai_platform_company: "AI 기반시스템 회사",
  ai_platform_ax: "AX 개발 조직",
  ai_platform_erp: "ERP 개발 조직",
  ai_platform_system: "SYSTEM 개발 조직"
});

export function organizationGroupLabel(groupId) {
  return ORGANIZATION_GROUP_LABELS[groupId] ?? groupId;
}

export function liveThreadRoleLabel(threadKind) {
  if (threadKind === "task") return "TASK";
  if (threadKind === "verifier") return "REVIEWER";
  if (threadKind === "manager") return "MANAGER";
  return "CONTINUATION";
}

export function liveThreadStatusLabel(status) {
  const labels = {
    active: "실행 중",
    waiting: "입력·승인 대기",
    error: "관측 오류",
    idle_result_check: "결과 확인 필요",
    not_loaded_unknown: "불러오지 못함 · 미확정"
  };
  return labels[status] ?? labels.not_loaded_unknown;
}
