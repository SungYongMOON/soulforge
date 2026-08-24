const METHOD = "session.active_list";
const PARAMS = Object.freeze({ metadata_only: true });
const ENVELOPE_FIELDS = new Set(["id", "result"]);
const DISCONNECT_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "EPIPE",
  "ENOTCONN",
  "DISCONNECTED",
]);

function fixedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function safeBoundedInteger(value, fallback, maximum) {
  return Number.isSafeInteger(value) && value > 0 && value <= maximum ? value : fallback;
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function responseSize(response) {
  let serialized;
  try {
    serialized = JSON.stringify(response);
  } catch {
    throw fixedError("AGENT_RUNTIME_RESPONSE_MALFORMED", "agent runtime response malformed");
  }
  if (typeof serialized !== "string") {
    throw fixedError("AGENT_RUNTIME_RESPONSE_MALFORMED", "agent runtime response malformed");
  }
  return Buffer.byteLength(serialized, "utf8");
}

export function createHermesTuiGatewayReadAdapter({
  request,
  timeoutMs = 2_000,
  maxResponseBytes = 262_144,
  onTransportInvalidated,
} = {}) {
  const boundedTimeoutMs = safeBoundedInteger(timeoutMs, 2_000, 30_000);
  const boundedResponseBytes = safeBoundedInteger(maxResponseBytes, 262_144, 1_048_576);
  const listeners = new Set();
  let nextId = 1;

  const invalidate = () => {
    for (const listener of listeners) listener();
  };
  if (typeof onTransportInvalidated === "function") onTransportInvalidated(invalidate);

  return {
    async readActiveSessions() {
      if (typeof request !== "function") {
        throw fixedError("AGENT_RUNTIME_RESPONSE_MALFORMED", "agent runtime response malformed");
      }
      const id = nextId;
      nextId += 1;
      const message = { id, method: METHOD, params: { ...PARAMS } };
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
          invalidate();
          reject(fixedError("AGENT_RUNTIME_TIMEOUT", "agent runtime read timeout"));
        }, boundedTimeoutMs);
      });

      let response;
      try {
        response = await Promise.race([Promise.resolve().then(() => request(message)), timeout]);
      } catch (error) {
        if (error?.code === "AGENT_RUNTIME_TIMEOUT") throw error;
        if (DISCONNECT_CODES.has(error?.code)) {
          invalidate();
          throw fixedError("AGENT_RUNTIME_DISCONNECTED", "agent runtime disconnected");
        }
        throw fixedError("AGENT_RUNTIME_RESPONSE_MALFORMED", "agent runtime response malformed");
      } finally {
        clearTimeout(timer);
      }

      if (responseSize(response) > boundedResponseBytes) {
        throw fixedError("AGENT_RUNTIME_RESPONSE_OVERSIZE", "agent runtime response oversized");
      }
      if (
        !isPlainObject(response)
        || response.id !== id
        || Object.keys(response).length !== ENVELOPE_FIELDS.size
        || !Object.keys(response).every((key) => ENVELOPE_FIELDS.has(key))
        || !isPlainObject(response.result)
      ) {
        throw fixedError("AGENT_RUNTIME_RESPONSE_MALFORMED", "agent runtime response malformed");
      }
      return response.result;
    },
    onInvalidated(listener) {
      if (typeof listener === "function") listeners.add(listener);
    },
  };
}
