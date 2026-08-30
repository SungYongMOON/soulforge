// Watch / 4192 coarse-projection contract — pure module (program plan 08).
//
// This pins the typed panel contract every Watch surface must satisfy: the
// six-value panel enum, freshness semantics (missing evidence is unknown,
// never green; stale evidence degrades), the safe deep-link pointer shape,
// the approved-action REQUEST record (a request is not an execution), and a
// structural no-writer guarantee. It renders nothing, probes nothing, and
// stores nothing beyond the in-memory request registry the tests drive.
//
// The live probing/judging owner stays guild_hall/watchtower (W1); this
// module is the CONSUMER-side contract those projections are mapped into.

export const WATCH_PANEL_SCHEMA = "soulforge.watch_panel_contract.v0";

export const PANEL_STATES = Object.freeze([
  "healthy", "degraded", "stale", "unavailable", "unknown", "hold",
]);

// Plan-08 projection domains (coarse, typed; deep records stay source-local).
export const PANEL_DOMAINS = Object.freeze([
  "hpp_host", "buzz_stack", "hermes_runtime", "task_run_aggregate",
  "tool_workshop", "engineering_engine", "cost_usage", "connector_freshness",
  "backup_restore_readiness",
]);

// Field names that may never appear in a panel or pointer: Watch shows
// aggregates and safe pointers, not source bodies, secrets, or transcripts.
export const PANEL_FORBIDDEN_FIELDS = Object.freeze([
  "raw_message", "message_body", "transcript", "memory", "prompt",
  "hidden_reasoning", "secret", "token_value", "password", "cookie",
  "shell_history", "keystrokes", "screen_capture",
]);

export const ACTION_KINDS = Object.freeze(["restart", "isolate", "restore", "rollback"]);

const REF = /^[a-z][a-z0-9_.:-]{1,120}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

function fail(code, detail) {
  const error = new Error(detail ? `${code}:${detail}` : code);
  error.code = code;
  throw error;
}

function assertRef(value, field) {
  if (typeof value !== "string" || !REF.test(value)) fail("ref_invalid", field);
  return value;
}

function assertClock(value, field) {
  if (typeof value !== "string" || !ISO.test(value)) fail("clock_invalid", field);
  return value;
}

function deepFreeze(value) {
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

// A safe deep-link pointer: metadata that lets an AUTHORIZED caller open the
// owning system's own record. It carries no copied content.
export function buildSafePointer({ owner_system, record_kind, record_ref }) {
  return deepFreeze({
    owner_system: assertRef(owner_system, "owner_system"),
    record_kind: assertRef(record_kind, "record_kind"),
    record_ref: assertRef(record_ref, "record_ref"),
  });
}

// Panel construction: the caller supplies the source-asserted state and the
// evidence clock; this contract enforces the freshness semantics.
//   - no evidence            -> unknown (never green)
//   - evidence older than the freshness window -> stale, unless the asserted
//     state is already worse (unavailable/hold stay as asserted)
//   - a `hold` assertion always survives
export function buildPanel(input) {
  const domain = assertRef(input?.domain, "domain");
  if (!PANEL_DOMAINS.includes(domain)) fail("domain_unknown", domain);
  const asserted = input.asserted_state;
  if (!PANEL_STATES.includes(asserted)) fail("state_invalid", asserted);
  const now = assertClock(input.now, "now");
  const freshnessSeconds = Number.isSafeInteger(input.freshness_window_seconds) && input.freshness_window_seconds > 0
    ? input.freshness_window_seconds : fail("freshness_window_invalid", "freshness_window_seconds");
  const ownerPointer = buildSafePointer(input.owner_pointer ?? {});

  let state;
  let reason;
  if (input.evidence_at == null) {
    state = asserted === "hold" ? "hold" : "unknown";
    reason = asserted === "hold" ? "hold_asserted" : "no_evidence";
  } else {
    const evidenceAt = assertClock(input.evidence_at, "evidence_at");
    const ageSeconds = Math.floor((Date.parse(now) - Date.parse(evidenceAt)) / 1000);
    if (ageSeconds < 0) fail("evidence_in_future", "evidence_at");
    if (ageSeconds > freshnessSeconds && !["unavailable", "hold", "unknown"].includes(asserted)) {
      state = "stale";
      reason = "freshness_window_exceeded";
    } else {
      state = asserted;
      reason = "as_asserted";
    }
  }

  const panel = {
    schema: WATCH_PANEL_SCHEMA,
    domain,
    state,
    asserted_state: asserted,
    reason,
    evidence_at: input.evidence_at ?? null,
    freshness_window_seconds: freshnessSeconds,
    owner_pointer: ownerPointer,
  };
  const violations = findForbiddenPanelFields(input.extra_fields ?? {});
  if (violations.length > 0) fail("panel_forbidden_field", violations.join(","));
  return deepFreeze(panel);
}

export function findForbiddenPanelFields(record) {
  const violations = [];
  const walk = (value, path) => {
    if (!value || typeof value !== "object") return;
    for (const key of Object.keys(value)) {
      const lowered = key.toLowerCase();
      if (PANEL_FORBIDDEN_FIELDS.some((banned) => lowered === banned || lowered.endsWith(`_${banned}`) || lowered.startsWith(`${banned}_`))) {
        violations.push(path ? `${path}.${key}` : key);
      }
      walk(value[key], path ? `${path}.${key}` : key);
    }
  };
  walk(record, "");
  return violations;
}

// The Watch approval-request surface: filing a request is the ONLY mutation a
// Watch surface owns, and a filed request executes nothing.
export function createWatchActionRequests() {
  const requests = new Map();
  return Object.freeze({
    fileActionRequest(input) {
      const id = assertRef(input?.request_id, "request_id");
      if (requests.has(id)) fail("request_duplicate", id);
      if (!ACTION_KINDS.includes(input.action_kind)) fail("action_kind_invalid", input.action_kind);
      const record = deepFreeze({
        request_id: id,
        action_kind: input.action_kind,
        target_ref: assertRef(input.target_ref, "target_ref"),
        policy_ref: assertRef(input.policy_ref, "policy_ref"),
        requested_by: assertRef(input.requested_by, "requested_by"),
        expires_at: assertClock(input.expires_at, "expires_at"),
        state: "filed",
      });
      requests.set(id, record);
      return record;
    },
    getRequest(requestId) {
      return requests.get(assertRef(requestId, "request_id")) ?? null;
    },
  });
}

// Structural no-writer proof: a Watch surface object may expose read/file-only
// functions. Anything shaped like an executor or state writer is rejected.
export function assertNoWriterSurface(surface) {
  const forbiddenVerbs = ["execute", "restart", "restore", "rollback", "isolate", "kill",
    "delete", "write", "mutate", "set_state", "mark", "complete", "approve"];
  const problems = [];
  for (const key of Object.keys(surface ?? {})) {
    const lowered = key.toLowerCase();
    if (forbiddenVerbs.some((verb) => lowered === verb || lowered.startsWith(`${verb}_`) || lowered.includes(`_${verb}`))) {
      problems.push(key);
    }
  }
  return { ok: problems.length === 0, problems };
}
