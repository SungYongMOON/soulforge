// Engineering MCP read-only facade — pure in-memory dispatch, no server.
//
// This is the first executable surface over the v0 contract: it binds
// injected read providers to contract tools and enforces the contract's
// authority discipline at the boundary. It opens no socket, registers no MCP
// server, and is OFF unless constructed with `enabled: true` exactly.
//
// Outward, a client sees exactly four outcomes: an ok result, facade_disabled,
// request_shape_invalid, or the uniform denial. Everything not servable —
// unknown tool, mutate tool, missing provider, provider failure, out-of-scope
// project, egress violation — collapses into the ONE uniform code so absence,
// denial, and breakage are indistinguishable from outside. The precise cause
// is recorded only in the facade's append-only log (tool + outcome, never
// arguments or payloads).

import { UNIFORM_DENIAL_CODE, FORBIDDEN_FIELD_NAMES, getContractTool } from "./contract.mjs";

export const FACADE_SCHEMA = "soulforge.engineering_mcp_read_facade.v0";
export const FACADE_DISABLED_CODE = "facade_disabled";
export const REQUEST_SHAPE_INVALID_CODE = "request_shape_invalid";

// Module-private brand. Schema strings and similarly-shaped objects are not
// proof that a caller received the facade through this constructor.
const READ_FACADES = new WeakSet();

export function isEngineeringMcpReadFacade(candidate) {
  return Boolean(candidate) && typeof candidate === "object" && READ_FACADES.has(candidate);
}

const REF = /^[a-z][a-z0-9_.:-]{1,120}$/;
// Pagination fields are the only optional request fields in v0.
const OPTIONAL_REQUEST_FIELDS = new Set(["limit", "cursor"]);
const FORBIDDEN = new Set(FORBIDDEN_FIELD_NAMES.map((name) => name.toLowerCase()));
const MAX_STRING_ARG = 200;

function fail(code, detail) {
  const error = new Error(detail ? `${code}: ${detail}` : code);
  error.code = code;
  return error;
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

// Bounded, printable-ASCII-only label for the append-only log. Attacker-
// chosen tool strings never enter the log verbatim: control characters and
// non-ASCII are replaced and length is clamped, on every path including the
// disabled one.
const MAX_LOG_LABEL = 80;
function logLabel(name) {
  const cleaned = name.replace(/[^\x21-\x7e]/g, "?");
  if (cleaned.length === 0) return "(empty)";
  return cleaned.length > MAX_LOG_LABEL ? `${cleaned.slice(0, MAX_LOG_LABEL)}(+trunc)` : cleaned;
}

// True when any own key anywhere in the (already JSON-round-tripped, hence
// acyclic) structure matches a forbidden field name, case-insensitively.
function containsForbiddenKey(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((entry) => containsForbiddenKey(entry));
  for (const key of Object.keys(value)) {
    if (FORBIDDEN.has(key.toLowerCase())) return true;
    if (containsForbiddenKey(value[key])) return true;
  }
  return false;
}

export function createEngineeringMcpReadFacade(config) {
  if (!config || typeof config !== "object") throw fail("config_shape_invalid");
  const { enabled, actor, providers, clock } = config;
  if (typeof clock !== "function") throw fail("config_clock_invalid");
  if (!providers || typeof providers !== "object" || Array.isArray(providers)) throw fail("config_providers_invalid");
  if (!actor || typeof actor !== "object" || typeof actor.actor_ref !== "string" || !REF.test(actor.actor_ref)) {
    throw fail("config_actor_invalid");
  }
  if (!Array.isArray(actor.project_scopes)
    || actor.project_scopes.some((scope) => typeof scope !== "string" || !REF.test(scope))) {
    throw fail("config_actor_scopes_invalid");
  }
  // `enabled` is deliberately NOT normalized here: anything but boolean true
  // fails closed on every dispatch, so a truthy mis-set flag never opens it.

  const scopes = Object.freeze([...actor.project_scopes]);
  const actorContext = Object.freeze({ actor_ref: actor.actor_ref, project_scopes: scopes });
  const log = [];
  let sequence = 0;

  function record(tool, outcome) {
    sequence += 1;
    log.push(Object.freeze({ seq: sequence, at: clock(), tool, outcome }));
  }

  function deny(tool, outcome, code) {
    record(tool, outcome);
    return Object.freeze({ ok: false, code });
  }

  function dispatch(request) {
    // Shape is tracked as a boolean, never an in-band sentinel value: a real
    // request whose tool happens to be any particular string must stay in the
    // ordinary unknown-tool path (uniform denial), not a distinguishable one.
    const shapeOk = Boolean(request) && typeof request === "object" && typeof request.tool === "string";
    const rawName = shapeOk ? request.tool : null;
    // The log label is bounded and control-character-free; the raw name is
    // used only for exact contract lookup and provider addressing.
    const label = shapeOk ? logLabel(rawName) : "(malformed)";
    if (enabled !== true) return deny(label, "denied_disabled", FACADE_DISABLED_CODE);
    if (!shapeOk) return deny(label, "denied_shape", REQUEST_SHAPE_INVALID_CODE);

    const tool = getContractTool(rawName);
    if (!tool) return deny(label, "denied_unknown_tool", UNIFORM_DENIAL_CODE);
    if (tool.kind !== "read") return deny(label, "denied_mutate_tool", UNIFORM_DENIAL_CODE);
    const requestedName = tool.name;

    const args = request.args === undefined ? {} : request.args;
    if (!args || typeof args !== "object" || Array.isArray(args)) {
      return deny(requestedName, "denied_shape", REQUEST_SHAPE_INVALID_CODE);
    }
    const declared = new Set(tool.request_fields);
    for (const key of Object.keys(args)) {
      if (!declared.has(key)) return deny(requestedName, "denied_shape", REQUEST_SHAPE_INVALID_CODE);
      const value = args[key];
      const type = typeof value;
      if (type !== "string" && type !== "number" && type !== "boolean") {
        return deny(requestedName, "denied_shape", REQUEST_SHAPE_INVALID_CODE);
      }
      if (type === "number" && !Number.isFinite(value)) {
        return deny(requestedName, "denied_shape", REQUEST_SHAPE_INVALID_CODE);
      }
      if (type === "string" && (value.length === 0 || value.length > MAX_STRING_ARG || value.includes("\u0000"))) {
        return deny(requestedName, "denied_shape", REQUEST_SHAPE_INVALID_CODE);
      }
    }
    for (const field of tool.request_fields) {
      if (!OPTIONAL_REQUEST_FIELDS.has(field) && !(field in args)) {
        return deny(requestedName, "denied_shape", REQUEST_SHAPE_INVALID_CODE);
      }
    }

    // Explicit-scope precondition: a tool that names a project must name one
    // of the caller's granted scopes; out-of-scope never reaches a provider.
    if (declared.has("project_ref") && !scopes.includes(args.project_ref)) {
      return deny(requestedName, "denied_scope", UNIFORM_DENIAL_CODE);
    }

    const provider = providers[requestedName];
    if (typeof provider !== "function") return deny(requestedName, "denied_no_provider", UNIFORM_DENIAL_CODE);

    let produced;
    try {
      produced = provider(Object.freeze({ ...args }), actorContext);
    } catch {
      // The provider's failure detail stays with the provider; the log keeps
      // only the outcome class and the client sees the uniform denial.
      return deny(requestedName, "provider_error", UNIFORM_DENIAL_CODE);
    }

    // Egress: the client receives a JSON round-trip COPY, never the
    // provider's own object. Non-JSON results (cycles, BigInt, thenables)
    // fail closed; the copy is what gets scanned, so what is checked is
    // exactly what leaves.
    if (!produced || typeof produced !== "object" || Array.isArray(produced) || typeof produced.then === "function") {
      return deny(requestedName, "egress_shape_invalid", UNIFORM_DENIAL_CODE);
    }
    let egress;
    try {
      egress = JSON.parse(JSON.stringify(produced));
    } catch {
      return deny(requestedName, "egress_shape_invalid", UNIFORM_DENIAL_CODE);
    }
    if (!egress || typeof egress !== "object" || Array.isArray(egress)) {
      return deny(requestedName, "egress_shape_invalid", UNIFORM_DENIAL_CODE);
    }
    const allowed = new Set(tool.response_fields);
    for (const key of Object.keys(egress)) {
      if (!allowed.has(key)) return deny(requestedName, "egress_unexpected_field", UNIFORM_DENIAL_CODE);
    }
    if (containsForbiddenKey(egress)) {
      return deny(requestedName, "egress_forbidden_field", UNIFORM_DENIAL_CODE);
    }

    record(requestedName, "dispatch_ok");
    return deepFreeze({ ok: true, tool: requestedName, result: egress });
  }

  function readLog() {
    return Object.freeze([...log]);
  }

  const facade = Object.freeze({ schema: FACADE_SCHEMA, dispatch, readLog });
  READ_FACADES.add(facade);
  return facade;
}
