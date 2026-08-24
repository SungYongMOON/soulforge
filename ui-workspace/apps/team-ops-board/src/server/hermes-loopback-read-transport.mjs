import { request as httpRequest } from "node:http";

export const HERMES_AGENT_RUNTIME_ACTIVE_SESSIONS_PATH = "/api/agent-runtime/active-sessions";

const ACTIVE_SESSIONS_SCHEMA = "hermes.agent_runtime_active_sessions.v1";
const DEFAULT_MAX_RESPONSE_BYTES = 262_144;
const ROOT_FIELDS = new Set(["schema_version", "read_only", "sessions", "truncated"]);
const ROW_FIELDS = new Set([
  "id",
  "session_key",
  "status",
  "started_at",
  "last_active",
  "message_count",
  "model",
]);
const OBSERVED_STATES = new Set(["idle", "starting", "working", "waiting"]);
const FIXED_TRANSPORT_CODES = new Set([
  "AGENT_RUNTIME_RESPONSE_MALFORMED",
  "AGENT_RUNTIME_RESPONSE_OVERSIZE",
  "AGENT_RUNTIME_TIMEOUT",
  "DISCONNECTED",
]);

function fixedConfigurationError() {
  const error = new Error("agent runtime transport configuration invalid");
  error.code = "AGENT_RUNTIME_TRANSPORT_CONFIGURATION_INVALID";
  return error;
}

function fixedResponseError(code = "AGENT_RUNTIME_RESPONSE_MALFORMED", message = "agent runtime response malformed") {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value, expected) {
  return isPlainObject(value)
    && Object.keys(value).length === expected.size
    && Object.keys(value).every((key) => expected.has(key));
}

function isBoundedString(value, maximum = 512) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maximum
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function validSessionRow(row) {
  return hasExactKeys(row, ROW_FIELDS)
    && isBoundedString(row.id)
    && isBoundedString(row.session_key)
    && OBSERVED_STATES.has(row.status)
    && (row.started_at === null || typeof row.started_at === "number" || isBoundedString(row.started_at))
    && (row.last_active === null || typeof row.last_active === "number" || isBoundedString(row.last_active))
    && Number.isSafeInteger(row.message_count)
    && row.message_count >= 0
    && (row.model === null || isBoundedString(row.model));
}

function validateOutboundFrame(rawFrame) {
  let frame;
  try {
    frame = JSON.parse(rawFrame);
  } catch {
    throw fixedResponseError();
  }
  if (
    !hasExactKeys(frame, new Set(["id", "method", "params"]))
    || !Number.isSafeInteger(frame.id)
    || frame.id < 1
    || frame.method !== "session.active_list"
    || !hasExactKeys(frame.params, new Set(["metadata_only"]))
    || frame.params.metadata_only !== true
  ) {
    throw fixedResponseError();
  }
  return frame;
}

function headerValue(headers, name) {
  const value = headers?.[name];
  return typeof value === "string" ? value : null;
}

async function readBoundedBody(body, maximum) {
  if (typeof body === "string" || Buffer.isBuffer(body) || body instanceof Uint8Array) {
    const bytes = Buffer.from(body);
    if (bytes.byteLength > maximum) {
      throw fixedResponseError("AGENT_RUNTIME_RESPONSE_OVERSIZE", "agent runtime response oversized");
    }
    return bytes;
  }
  if (body === null || body === undefined || typeof body[Symbol.asyncIterator] !== "function") {
    throw fixedResponseError();
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of body) {
    if (!(typeof chunk === "string" || Buffer.isBuffer(chunk) || chunk instanceof Uint8Array)) {
      throw fixedResponseError();
    }
    const bytes = Buffer.from(chunk);
    total += bytes.byteLength;
    if (total > maximum) {
      throw fixedResponseError("AGENT_RUNTIME_RESPONSE_OVERSIZE", "agent runtime response oversized");
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, total);
}

function validateResponseEnvelope(value) {
  if (
    !hasExactKeys(value, ROOT_FIELDS)
    || value.schema_version !== ACTIVE_SESSIONS_SCHEMA
    || value.read_only !== true
    || value.truncated !== false
    || !Array.isArray(value.sessions)
    || value.sessions.length > 64
    || !value.sessions.every(validSessionRow)
  ) {
    throw fixedResponseError();
  }
  return value.sessions.map((row) => ({ ...row }));
}

function defaultHttpGet(options) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(options, (response) => resolve({
      statusCode: response.statusCode,
      headers: response.headers,
      body: response,
    }));
    request.once("error", reject);
    request.end();
  });
}

function validateLoopbackUrl(value) {
  if (typeof value !== "string" || value.length === 0) throw fixedConfigurationError();
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw fixedConfigurationError();
  }
  const port = Number(parsed.port);
  if (
    parsed.href !== value
    || value.includes("?")
    || value.includes("#")
    || parsed.protocol !== "http:"
    || (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "[::1]")
    || parsed.username !== ""
    || parsed.password !== ""
    || parsed.pathname !== HERMES_AGENT_RUNTIME_ACTIVE_SESSIONS_PATH
    || parsed.search !== ""
    || parsed.hash !== ""
    || parsed.port === ""
    || !Number.isSafeInteger(port)
    || port < 1_024
    || port > 65_535
  ) {
    throw fixedConfigurationError();
  }
  return parsed;
}

export function createHermesLoopbackReadTransport({
  url,
  httpGet = defaultHttpGet,
  maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
  timeoutMs = 2_000,
} = {}) {
  const parsed = validateLoopbackUrl(url);
  const maximum = Number.isSafeInteger(maxResponseBytes)
    && maxResponseBytes > 0
    && maxResponseBytes <= 1_048_576
    ? maxResponseBytes
    : DEFAULT_MAX_RESPONSE_BYTES;
  const timeout = Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 30_000
    ? timeoutMs
    : 2_000;
  if (typeof httpGet !== "function") throw fixedConfigurationError();
  const invalidationListeners = new Set();
  const invalidate = () => {
    for (const listener of invalidationListeners) listener();
  };

  return Object.freeze({
    async exchangeFrame(rawFrame) {
      const outbound = validateOutboundFrame(rawFrame);
      const controller = new AbortController();
      let timer;
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(fixedResponseError("AGENT_RUNTIME_TIMEOUT", "agent runtime read timeout"));
        }, timeout);
      });
      const readOperation = (async () => {
        let response;
        try {
          response = await httpGet({
            method: "GET",
            protocol: "http:",
            hostname: parsed.hostname === "[::1]" ? "::1" : parsed.hostname,
            port: Number(parsed.port),
            path: HERMES_AGENT_RUNTIME_ACTIVE_SESSIONS_PATH,
            headers: { Accept: "application/json" },
            signal: controller.signal,
          });
        } catch {
          throw fixedResponseError("DISCONNECTED", "agent runtime disconnected");
        }
        if (
          response?.statusCode !== 200
          || !/^application\/json(?:;\s*charset=utf-8)?$/iu.test(headerValue(response.headers, "content-type") ?? "")
          || headerValue(response.headers, "cache-control") !== "no-store"
          || headerValue(response.headers, "x-content-type-options") !== "nosniff"
        ) {
          throw fixedResponseError();
        }
        const bytes = await readBoundedBody(response.body, maximum);
        let envelope;
        try {
          envelope = JSON.parse(bytes.toString("utf8"));
        } catch {
          throw fixedResponseError();
        }
        const sessions = validateResponseEnvelope(envelope);
        return JSON.stringify({ id: outbound.id, result: { sessions } });
      })();
      try {
        return await Promise.race([readOperation, timeoutPromise]);
      } catch (error) {
        invalidate();
        if (FIXED_TRANSPORT_CODES.has(error?.code)) throw error;
        throw fixedResponseError();
      } finally {
        clearTimeout(timer);
      }
    },
    onTransportInvalidated(listener) {
      if (typeof listener === "function") invalidationListeners.add(listener);
    },
  });
}
