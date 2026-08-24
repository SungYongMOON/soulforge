import { createAgentRuntimeReadModule } from "./agent-runtime-read-module.mjs";
import { createHermesTuiGatewayReadAdapter } from "./hermes-tui-gateway-read-adapter.mjs";

export const AGENT_RUNTIME_SNAPSHOT_PATH = "/agent-runtime.snapshot.json";

const DEFAULT_MAX_RESPONSE_BYTES = 262_144;

const FIXED_HOLD_PROJECTION = Object.freeze({
  schema_version: "soulforge.agent_runtime_read_projection.v1",
  read_only: 1,
  refresh_state: "hold",
  observed_at: null,
  source: Object.freeze({ kind: "agent_runtime_gateway_active_sessions" }),
  evidence_counts: Object.freeze({
    configured_bots: 0,
    active_sessions: 0,
    matched_bots: 0,
    unmatched_active_sessions: 0,
  }),
  bots: Object.freeze([]),
  hold_code: "AGENT_RUNTIME_CONFIGURATION_UNAVAILABLE",
});

function writeJson(response, projection) {
  response.statusCode = 200;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(JSON.stringify(projection));
}

function isLoopbackAddress(address) {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function fixedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function boundedResponseBytes(value) {
  return Number.isSafeInteger(value) && value > 0 && value <= 1_048_576
    ? value
    : DEFAULT_MAX_RESPONSE_BYTES;
}

export function parseBoundedAgentRuntimeTransportFrame(rawFrame, {
  maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
} = {}) {
  const maximum = boundedResponseBytes(maxResponseBytes);
  let bytes;
  if (typeof rawFrame === "string") bytes = Buffer.from(rawFrame, "utf8");
  else if (Buffer.isBuffer(rawFrame) || rawFrame instanceof Uint8Array) bytes = Buffer.from(rawFrame);
  else throw fixedError("AGENT_RUNTIME_RESPONSE_MALFORMED", "agent runtime response malformed");

  if (bytes.byteLength > maximum) {
    throw fixedError("AGENT_RUNTIME_RESPONSE_OVERSIZE", "agent runtime response oversized");
  }
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw fixedError("AGENT_RUNTIME_RESPONSE_MALFORMED", "agent runtime response malformed");
  }
}

function createConfiguredReadModule({
  bindings,
  exchangeFrame,
  limits,
  maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
  now = Date.now,
  onTransportInvalidated,
  timeoutMs,
} = {}) {
  if (typeof exchangeFrame !== "function" || !Array.isArray(bindings) || bindings.length === 0) {
    return null;
  }
  const maximum = boundedResponseBytes(maxResponseBytes);
  const adapter = createHermesTuiGatewayReadAdapter({
    maxResponseBytes: maximum,
    onTransportInvalidated,
    timeoutMs,
    request: async (message) => {
      const rawFrame = await exchangeFrame(JSON.stringify(message));
      return parseBoundedAgentRuntimeTransportFrame(rawFrame, { maxResponseBytes: maximum });
    },
  });
  return createAgentRuntimeReadModule({ adapter, bindings, limits, now });
}

export function createAgentRuntimeSnapshotAdapterPlugin(options = {}) {
  const readModule = createConfiguredReadModule(options);
  const configure = (server) => {
    server.middlewares.use((request, response, next) => {
      let url;
      try {
        url = new URL(request.url || "/", "http://127.0.0.1");
      } catch {
        response.statusCode = 400;
        response.end();
        return;
      }
      if (url.pathname !== AGENT_RUNTIME_SNAPSHOT_PATH) {
        next();
        return;
      }
      if (request.method !== "GET") {
        response.statusCode = 405;
        response.setHeader("Allow", "GET");
        response.end();
        return;
      }
      if (!isLoopbackAddress(request.socket?.remoteAddress)) {
        response.statusCode = 403;
        response.end();
        return;
      }
      if (url.search !== "?read_only=1") {
        response.statusCode = 400;
        response.end();
        return;
      }
      if (readModule === null) {
        writeJson(response, FIXED_HOLD_PROJECTION);
        return;
      }
      void readModule.readProjection().then(
        (projection) => writeJson(response, projection),
        () => writeJson(response, FIXED_HOLD_PROJECTION),
      );
    });
  };

  return {
    name: "soulforge-agent-runtime-snapshot-adapter",
    configureServer: configure,
    configurePreviewServer: configure,
  };
}
