const SCHEMA_VERSION = "soulforge.agent_runtime_read_projection.v1";
const SOURCE_KIND = "agent_runtime_gateway_active_sessions";
const OBSERVED_STATES = new Set(["working", "starting", "waiting", "idle"]);
const SESSION_FIELDS = new Set([
  "id",
  "session_key",
  "status",
  "started_at",
  "last_active",
  "message_count",
  "model",
]);
const BINDING_FIELDS = new Set([
  "bot_id",
  "agent_id",
  "display_label",
  "hermes_session_key",
]);

const DEFAULT_LIMITS = Object.freeze({
  cache_ms: 0,
  max_bindings: 100,
  max_response_bytes: 262_144,
  max_rows: 100,
});

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isBoundedString(value, maximum = 512) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maximum
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function hasOnlyKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.has(key));
}

function cloneProjection(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeLimit(value, fallback, minimum, maximum) {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum ? value : fallback;
}

function normalizeLimits(input) {
  const limits = isPlainObject(input) ? input : {};
  return {
    cache_ms: normalizeLimit(limits.cache_ms, DEFAULT_LIMITS.cache_ms, 0, 60_000),
    max_bindings: normalizeLimit(limits.max_bindings, DEFAULT_LIMITS.max_bindings, 1, 1_000),
    max_response_bytes: normalizeLimit(
      limits.max_response_bytes,
      DEFAULT_LIMITS.max_response_bytes,
      1,
      1_048_576,
    ),
    max_rows: normalizeLimit(limits.max_rows, DEFAULT_LIMITS.max_rows, 1, 1_000),
  };
}

function normalizeBindings(bindings, maximum) {
  if (!Array.isArray(bindings) || bindings.length > maximum) {
    return { bindings: [], hold_code: "BINDING_INPUT_INVALID" };
  }

  const normalized = [];
  const botIds = new Set();
  const agentIds = new Set();
  const sessionKeys = new Set();
  let conflict = false;

  for (const binding of bindings) {
    if (
      !isPlainObject(binding)
      || !hasOnlyKeys(binding, BINDING_FIELDS)
      || Object.keys(binding).length !== BINDING_FIELDS.size
      || !isBoundedString(binding.bot_id, 200)
      || !isBoundedString(binding.agent_id, 200)
      || !isBoundedString(binding.display_label, 200)
      || !(binding.hermes_session_key === null || isBoundedString(binding.hermes_session_key))
    ) {
      return { bindings: [], hold_code: "BINDING_INPUT_INVALID" };
    }

    if (botIds.has(binding.bot_id) || agentIds.has(binding.agent_id)) conflict = true;
    if (binding.hermes_session_key !== null && sessionKeys.has(binding.hermes_session_key)) conflict = true;
    botIds.add(binding.bot_id);
    agentIds.add(binding.agent_id);
    if (binding.hermes_session_key !== null) sessionKeys.add(binding.hermes_session_key);
    normalized.push({ ...binding });
  }

  return { bindings: normalized, hold_code: conflict ? "BINDING_CONFLICT" : null };
}

function observedAt(now) {
  let value;
  try {
    value = now();
  } catch {
    return null;
  }
  return Number.isFinite(value) && value >= 0 ? new Date(value).toISOString() : null;
}

function unknownBot(binding, holdCode) {
  return {
    bot_id: binding.bot_id,
    agent_id: binding.agent_id,
    display_label: binding.display_label,
    hermes: {
      durable_session_key: binding.hermes_session_key,
      live_session_id: null,
    },
    state: { kind: "unknown", value: null },
    model: { kind: "unknown", value: null },
    provider: { kind: "unknown", value: null },
    usage: { kind: "unavailable" },
    heartbeat: { kind: "unknown" },
    result: { kind: "unknown" },
    hold_code: holdCode,
  };
}

function projectionEnvelope({ bindings, observed_at, refresh_state, hold_code, sessions = null }) {
  const matchedSessionKeys = new Set();
  const bots = bindings.map((binding) => {
    if (refresh_state !== "ready") return unknownBot(binding, hold_code);
    if (binding.hermes_session_key === null) return unknownBot(binding, "SESSION_BINDING_MISSING");
    const session = sessions.find((entry) => entry.session_key === binding.hermes_session_key);
    if (!session) return unknownBot(binding, "SESSION_NOT_ACTIVE");
    matchedSessionKeys.add(session.session_key);
    return {
      bot_id: binding.bot_id,
      agent_id: binding.agent_id,
      display_label: binding.display_label,
      hermes: {
        durable_session_key: binding.hermes_session_key,
        live_session_id: session.id,
      },
      state: { kind: "observed", value: session.status },
      model: session.model === null
        ? { kind: "unknown", value: null }
        : { kind: "provider_reported", value: session.model },
      provider: { kind: "unknown", value: null },
      usage: { kind: "unavailable" },
      heartbeat: { kind: "unknown" },
      result: { kind: "unknown" },
      hold_code: null,
    };
  });

  const activeCount = sessions?.length ?? 0;
  return {
    schema_version: SCHEMA_VERSION,
    read_only: 1,
    refresh_state,
    observed_at,
    source: { kind: SOURCE_KIND },
    evidence_counts: {
      configured_bots: bindings.length,
      active_sessions: activeCount,
      matched_bots: matchedSessionKeys.size,
      unmatched_active_sessions: Math.max(0, activeCount - matchedSessionKeys.size),
    },
    bots,
    hold_code,
  };
}

function adapterHoldCode(error) {
  if (error?.code === "AGENT_RUNTIME_TIMEOUT") return "GATEWAY_TIMEOUT";
  if (error?.code === "AGENT_RUNTIME_DISCONNECTED") return "GATEWAY_DISCONNECTED";
  if (error?.code === "AGENT_RUNTIME_RESPONSE_OVERSIZE") return "GATEWAY_RESPONSE_OVERSIZE";
  if (error?.code === "AGENT_RUNTIME_RESPONSE_MALFORMED") return "GATEWAY_RESPONSE_MALFORMED";
  return "GATEWAY_READ_FAILED";
}

function validateResponse(response, limits) {
  let serialized;
  try {
    serialized = JSON.stringify(response);
  } catch {
    return { hold_code: "GATEWAY_RESPONSE_MALFORMED" };
  }
  if (typeof serialized !== "string") return { hold_code: "GATEWAY_RESPONSE_MALFORMED" };
  if (Buffer.byteLength(serialized, "utf8") > limits.max_response_bytes) {
    return { hold_code: "GATEWAY_RESPONSE_OVERSIZE" };
  }
  if (!isPlainObject(response) || !hasOnlyKeys(response, new Set(["sessions"])) || !Array.isArray(response.sessions)) {
    return { hold_code: "GATEWAY_RESPONSE_MALFORMED" };
  }
  if (response.sessions.length > limits.max_rows) return { hold_code: "GATEWAY_ROW_LIMIT_EXCEEDED" };

  const liveIds = new Set();
  const sessionKeys = new Set();
  for (const row of response.sessions) {
    if (!isPlainObject(row) || !hasOnlyKeys(row, SESSION_FIELDS)) {
      return { hold_code: "RAW_OR_UNKNOWN_FIELD_FORBIDDEN" };
    }
    if (Object.keys(row).length !== SESSION_FIELDS.size) {
      return { hold_code: "GATEWAY_RESPONSE_MALFORMED" };
    }
    if (
      !isBoundedString(row.id)
      || !isBoundedString(row.session_key)
      || !OBSERVED_STATES.has(row.status)
      || !(row.started_at === null || typeof row.started_at === "number" || isBoundedString(row.started_at))
      || !(row.last_active === null || typeof row.last_active === "number" || isBoundedString(row.last_active))
      || !Number.isSafeInteger(row.message_count)
      || row.message_count < 0
      || !(row.model === null || isBoundedString(row.model))
    ) {
      return { hold_code: "GATEWAY_RESPONSE_MALFORMED" };
    }
    if (liveIds.has(row.id)) return { hold_code: "DUPLICATE_LIVE_SESSION_ID" };
    if (sessionKeys.has(row.session_key)) return { hold_code: "DUPLICATE_DURABLE_SESSION_KEY" };
    liveIds.add(row.id);
    sessionKeys.add(row.session_key);
  }
  return { hold_code: null, sessions: response.sessions };
}

export function createAgentRuntimeReadModule({ adapter, bindings, now = Date.now, limits: inputLimits } = {}) {
  const limits = normalizeLimits(inputLimits);
  const normalized = normalizeBindings(bindings, limits.max_bindings);
  let cache = null;
  let generation = 0;
  let inFlight = null;

  if (typeof adapter?.onInvalidated === "function") {
    adapter.onInvalidated(() => {
      generation += 1;
      cache = null;
      inFlight = null;
    });
  }

  async function refresh(refreshGeneration) {
    const at = observedAt(now);
    if (at === null) {
      return projectionEnvelope({
        bindings: normalized.bindings,
        observed_at: "1970-01-01T00:00:00.000Z",
        refresh_state: "hold",
        hold_code: "MODULE_TIME_INVALID",
      });
    }
    if (normalized.hold_code !== null || typeof adapter?.readActiveSessions !== "function") {
      return projectionEnvelope({
        bindings: normalized.bindings,
        observed_at: at,
        refresh_state: "hold",
        hold_code: normalized.hold_code ?? "ADAPTER_INPUT_INVALID",
      });
    }

    let response;
    try {
      response = await adapter.readActiveSessions();
    } catch (error) {
      return projectionEnvelope({
        bindings: normalized.bindings,
        observed_at: at,
        refresh_state: "hold",
        hold_code: adapterHoldCode(error),
      });
    }
    if (refreshGeneration !== generation) {
      return projectionEnvelope({
        bindings: normalized.bindings,
        observed_at: at,
        refresh_state: "hold",
        hold_code: "GATEWAY_STATE_CHANGED",
      });
    }

    const validated = validateResponse(response, limits);
    if (validated.hold_code !== null) {
      return projectionEnvelope({
        bindings: normalized.bindings,
        observed_at: at,
        refresh_state: "hold",
        hold_code: validated.hold_code,
      });
    }
    return projectionEnvelope({
      bindings: normalized.bindings,
      observed_at: at,
      refresh_state: "ready",
      hold_code: null,
      sessions: validated.sessions,
    });
  }

  return {
    async readProjection() {
      const at = observedAt(now);
      if (cache && at !== null && Date.parse(at) - cache.at < limits.cache_ms) {
        return cloneProjection(cache.value);
      }
      if (inFlight?.generation === generation) return cloneProjection(await inFlight.promise);

      const refreshGeneration = generation;
      const operation = refresh(refreshGeneration).then((projection) => {
        if (projection.refresh_state === "ready" && refreshGeneration === generation && limits.cache_ms > 0) {
          cache = { at: Date.parse(projection.observed_at), value: cloneProjection(projection) };
        }
        return projection;
      }).finally(() => {
        if (inFlight?.promise === operation) inFlight = null;
      });
      inFlight = { generation: refreshGeneration, promise: operation };
      return cloneProjection(await operation);
    },
  };
}

export function createInMemoryAgentRuntimeReadAdapter({ response = { sessions: [] } } = {}) {
  const listeners = new Set();
  let currentResponse = response;
  let disconnected = false;

  const invalidate = () => {
    for (const listener of listeners) listener();
  };

  return {
    async readActiveSessions() {
      if (disconnected) {
        const error = new Error("agent runtime disconnected");
        error.code = "AGENT_RUNTIME_DISCONNECTED";
        throw error;
      }
      return cloneProjection(currentResponse);
    },
    onInvalidated(listener) {
      if (typeof listener === "function") listeners.add(listener);
    },
    disconnect() {
      disconnected = true;
      invalidate();
    },
    restart(nextResponse = { sessions: [] }) {
      currentResponse = nextResponse;
      disconnected = false;
      invalidate();
    },
  };
}
