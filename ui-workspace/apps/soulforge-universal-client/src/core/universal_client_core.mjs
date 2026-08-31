import { createHash } from "node:crypto";

export const CLIENT_SESSION_SCHEMA = "soulforge.universal_client.session.v0";
export const CLIENT_PROJECTION_SCHEMA = "soulforge.universal_client.projection.v0";
export const CLIENT_STATUS = Object.freeze({ READY: "READY", HOLD: "HOLD" });

const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const VERSION_RANGE = /^>=\d+\.\d+\.\d+ <\d+\.\d+\.\d+$/u;
const SESSION_FIELDS = Object.freeze([
  "schema_version",
  "actor_ref",
  "account_ref",
  "device_ref",
  "agent_ref",
  "project_scopes",
  "capabilities",
  "expires_at",
  "revoked",
  "policy_revision",
  "client_release_range",
  "device_posture_state",
]);
const CAPABILITIES = new Set([
  "assignment.read",
  "material.read",
  "submission.create",
  "buzz.collaborate",
  "operations.read",
  "authority.request",
  "review.submit",
  "acceptance.request",
]);
const ROUTES = Object.freeze([
  { route_id: "assignments", required_all: ["assignment.read"], project_scope_required: true, read_only: true },
  { route_id: "materials", required_all: ["material.read"], project_scope_required: true, read_only: true },
  { route_id: "submission", required_all: ["submission.create"], project_scope_required: true, read_only: false },
  { route_id: "buzz", required_all: ["buzz.collaborate"], project_scope_required: false, read_only: false },
  { route_id: "operations", required_all: ["operations.read"], project_scope_required: false, read_only: true },
  { route_id: "authority_requests", required_all: ["authority.request"], project_scope_required: false, read_only: false },
  { route_id: "reviews", required_all: ["review.submit"], project_scope_required: true, read_only: false },
  { route_id: "acceptance_requests", required_all: ["acceptance.request"], project_scope_required: true, read_only: false },
].map((row) => Object.freeze({ ...row, required_all: Object.freeze([...row.required_all]) })));

const BINARY_POLICY_DIGEST = `sha256:${createHash("sha256")
  .update(JSON.stringify(ROUTES), "utf8")
  .digest("hex")}`;

function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}

function plain(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(code);
  return value;
}

function exactFields(value, fields, code) {
  plain(value, code);
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(code);
}

function safeRef(value, code, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !SAFE_REF.test(value) || value.includes("*")) fail(code);
  return value;
}

function iso(value, code) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) fail(code);
  const millis = Date.parse(value);
  if (!Number.isFinite(millis)) fail(code);
  return millis;
}

function uniqueStrings(value, validator, code) {
  if (!Array.isArray(value) || value.length > 128) fail(code);
  const rows = value.map((entry) => validator(entry, code));
  if (new Set(rows).size !== rows.length) fail(code);
  return rows.sort();
}

function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function validateSession(value, now) {
  exactFields(value, SESSION_FIELDS, "session_fields_invalid");
  if (value.schema_version !== CLIENT_SESSION_SCHEMA) fail("session_schema_invalid");
  const projectScopes = uniqueStrings(value.project_scopes, (entry) => safeRef(entry, "project_scope_invalid"), "project_scope_invalid");
  const capabilities = uniqueStrings(value.capabilities, (entry) => {
    if (typeof entry !== "string" || !CAPABILITIES.has(entry)) fail("capability_invalid");
    return entry;
  }, "capability_invalid");
  if (typeof value.revoked !== "boolean") fail("revoked_invalid");
  if (!VERSION_RANGE.test(value.client_release_range)) fail("client_release_range_invalid");
  if (!["accepted", "rejected", "unknown"].includes(value.device_posture_state)) fail("device_posture_invalid");
  return {
    actorRef: safeRef(value.actor_ref, "actor_ref_invalid"),
    accountRef: safeRef(value.account_ref, "account_ref_invalid"),
    deviceRef: safeRef(value.device_ref, "device_ref_invalid"),
    agentRef: safeRef(value.agent_ref, "agent_ref_invalid", true),
    projectScopes,
    capabilities,
    expiresAt: iso(value.expires_at, "expires_at_invalid"),
    now: iso(now, "now_invalid"),
    revoked: value.revoked,
    policyRevision: safeRef(value.policy_revision, "policy_revision_invalid"),
    clientReleaseRange: value.client_release_range,
    devicePostureState: value.device_posture_state,
  };
}

export function projectUniversalClient(options = {}) {
  exactFields(options, ["session", "now"], "projection_input_invalid");
  const session = validateSession(options.session, options.now);
  const holdCodes = [];
  if (session.revoked) holdCodes.push("SESSION_REVOKED");
  if (session.expiresAt <= session.now) holdCodes.push("SESSION_EXPIRED");
  if (session.devicePostureState !== "accepted") holdCodes.push("DEVICE_POSTURE_NOT_ACCEPTED");
  if (session.projectScopes.length === 0) holdCodes.push("PROJECT_SCOPE_MISSING");
  const held = holdCodes.length > 0;
  const capabilitySet = new Set(session.capabilities);
  const routes = ROUTES.map((policy) => {
    const missing = policy.required_all.filter((capability) => !capabilitySet.has(capability));
    if (policy.project_scope_required && session.projectScopes.length === 0) missing.push("project.scope");
    return {
      route_id: policy.route_id,
      enabled: !held && missing.length === 0,
      read_only: policy.read_only,
      server_recheck_required: true,
      missing_requirements: missing.sort(),
    };
  });
  return freeze({
    schema_version: CLIENT_PROJECTION_SCHEMA,
    status: held ? CLIENT_STATUS.HOLD : CLIENT_STATUS.READY,
    hold_codes: holdCodes.sort(),
    actor_ref: session.actorRef,
    account_ref: session.accountRef,
    device_ref: session.deviceRef,
    agent_ref: session.agentRef,
    project_scopes: session.projectScopes,
    policy_revision: session.policyRevision,
    client_release_range: session.clientReleaseRange,
    binary_policy_digest: BINARY_POLICY_DIGEST,
    routes,
    authority_granted: false,
    official_task_state_written: false,
    external_action_performed: false,
  });
}
