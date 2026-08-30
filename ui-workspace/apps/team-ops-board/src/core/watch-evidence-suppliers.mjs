// Watch evidence suppliers — declared, source-asserted translations only.
//
// Each supplier maps ONE Board snapshot endpoint's OWN asserted vocabulary
// into a watch-panel evidence record. Nothing here invents a health
// judgment: where a source asserts a status, a pinned table translates it;
// where a source only reports measurements (host-stats), the evidence
// asserts `unknown` with the observation clock — "the feed is alive, nobody
// asserts health" — which renders distinctly from a missing feed
// (reason `as_asserted` vs `no_evidence`). A malformed or unrecognized
// ENVELOPE yields NO evidence at all (the strip's full-coverage rule then
// renders the honest `unknown/no_evidence`), never a fabricated state;
// malformed ROWS inside a well-formed ready envelope degrade (attention),
// they never upgrade.
//
// Covered domains and sources (all three observed live on this machine):
//   connector_freshness <- /receipt-expiry.snapshot.json
//     projection status vocabulary (receipt-expiry-adapter.mjs):
//       ready (all standing receipts current)      -> healthy
//       partial (warning/critical/expired/invalid) -> degraded
//       unavailable (projection cannot see)        -> unknown
//   hpp_host <- /host-stats.snapshot.json (measurements only -> unknown).
//     "Feed alive" means exactly: the endpoint served a parseable snapshot
//     at page load. The adapter may serve a last-good snapshot on sampler
//     failure, so evidence_at can be old — the clock is preserved on the
//     evidence for display; the unknown assertion itself never upgrades.
//
//   hermes_runtime <- /agent-runtime.snapshot.json?read_only=1
//     envelope refresh_state "hold" is a SOURCE-ASSERTED hold -> hold.
//     refresh_state "ready": a binary rule over the source's own per-bot
//     OBSERVABILITY assertion (state.kind) — every bot "observed" ->
//     healthy; any bot NOT observed (incl. a malformed row) -> degraded
//     (the source says it cannot see some bot: a known visibility problem).
//     Bot activity values (working/idle/...) are activity, not health, and
//     never map. Zero configured bots -> unknown (health of nothing is not
//     healthy).
//
//   backup_restore_readiness <- /storage-map.snapshot.json
//     the plan-17 R3 storage-map projection (path_registry owner;
//     schema soulforge.watch_storage_map.v0, projection_kind
//     backup_readiness_overlay). Its summary.aggregate_state is ALREADY the
//     plan-08 panel enum, computed by the R3 contract's deterministic
//     precedence over registry rows + evidence refs — the supplier
//     translates it verbatim and never widens it. A `hold` aggregate
//     survives clock-less (same decided rule as hermes_runtime's asserted
//     hold); any non-hold state without a serving clock supplies nothing.
//     The endpoint itself does not exist until the private
//     binding/ACL-gated runtime emits the snapshot — until then this
//     domain honestly renders unknown/no_evidence. EMITTER OBLIGATION:
//     the projection object alone has no clock, so the serving runtime
//     MUST add a top-level `observed_at` (emission time, ISO-Z) to the
//     served JSON; emitting the projection verbatim keeps every non-hold
//     aggregate rendering unknown (safe, but never activates).
//
// The watchtower topology snapshot (cost_usage candidate) is NOT mapped
// yet: its refresh_state on this machine is "unconfigured" (no binding),
// so the ok-path payload shape is unobservable here — mapping it would be
// speculation. That supplier is a follow-on for an environment where the
// watchtower binding exists.

export const WATCH_EVIDENCE_SUPPLIERS_SCHEMA = "soulforge.team_ops_board.watch_evidence_suppliers.v0";

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

const RECEIPT_EXPIRY_STATUS_TO_PANEL = Object.freeze({
  ready: "healthy",
  partial: "degraded",
  unavailable: "unknown",
});

function isoOrNull(value) {
  return typeof value === "string" && ISO.test(value) ? value : null;
}

// -> evidence record or null (null = supply nothing, render no_evidence).
export function receiptExpiryEvidence(projection) {
  if (!projection || typeof projection !== "object") return null;
  // Own-key check first: a status like "constructor" or "toString" must be
  // an unrecognized value (null), never a prototype-chain hit.
  if (typeof projection.status !== "string"
    || !Object.hasOwn(RECEIPT_EXPIRY_STATUS_TO_PANEL, projection.status)) {
    return null;
  }
  const asserted = RECEIPT_EXPIRY_STATUS_TO_PANEL[projection.status];
  const observedAt = isoOrNull(projection.observed_at);
  if (!observedAt) return null;
  return {
    domain: "connector_freshness",
    asserted_state: asserted,
    evidence_at: observedAt,
    owner_pointer: {
      owner_system: "team_ops_board",
      record_kind: "receipt_expiry_projection",
      record_ref: "endpoint.receipt_expiry.snapshot",
    },
  };
}

export function hostStatsEvidence(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return null;
  const observedAt = isoOrNull(snapshot.observed_at);
  // Presence of the measurement families is the shape check; their values
  // are measurements, not health assertions, so the state stays unknown.
  if (!observedAt || !snapshot.cpu || !snapshot.memory) return null;
  return {
    domain: "hpp_host",
    asserted_state: "unknown",
    evidence_at: observedAt,
    owner_pointer: {
      owner_system: "team_ops_board",
      record_kind: "host_stats_snapshot",
      record_ref: "endpoint.host_stats.snapshot",
    },
  };
}

export function agentRuntimeEvidence(envelope) {
  if (!envelope || typeof envelope !== "object") return null;
  const observedAt = isoOrNull(envelope.observed_at);
  let asserted = null;
  if (envelope.refresh_state === "hold") {
    // A source-asserted hold may carry NO observation clock (the read module
    // emits observed_at: null when configuration itself is unavailable);
    // the panel contract explicitly supports hold without evidence
    // (reason hold_asserted), so the hold survives clock-less. DECIDED, not
    // accidental: a malformed non-null clock is likewise coerced to a
    // clockless hold — hold is the maximally conservative state, and
    // dropping it for a bad clock would soften the signal to no_evidence.
    asserted = "hold";
  } else if (envelope.refresh_state === "ready" && Array.isArray(envelope.bots)) {
    // A READY assertion without a clock is malformed: supply nothing.
    if (!observedAt) return null;
    if (envelope.bots.length === 0) {
      asserted = "unknown";
    } else if (envelope.bots.every((bot) => bot && typeof bot === "object" && bot.state?.kind === "observed")) {
      asserted = "healthy";
    } else {
      asserted = "degraded";
    }
  }
  if (asserted === null) return null;
  return {
    domain: "hermes_runtime",
    asserted_state: asserted,
    evidence_at: observedAt,
    owner_pointer: {
      owner_system: "team_ops_board",
      record_kind: "agent_runtime_snapshot",
      record_ref: "endpoint.agent_runtime.snapshot",
    },
  };
}

const STORAGE_MAP_SCHEMA = "soulforge.watch_storage_map.v0";
const STORAGE_MAP_DIGEST = /^sha256:[0-9a-f]{64}$/;
const STORAGE_MAP_STATES = Object.freeze([
  "healthy", "degraded", "stale", "unavailable", "unknown", "hold",
]);

export function storageMapEvidence(envelope) {
  if (!envelope || typeof envelope !== "object") return null;
  // Shape gate: only a genuine R3 backup-readiness overlay projection is a
  // recognized source; anything else supplies NOTHING (no fabricated state).
  if (envelope.schema !== STORAGE_MAP_SCHEMA
    || envelope.projection_kind !== "backup_readiness_overlay"
    || typeof envelope.registry_snapshot_digest !== "string"
    || !STORAGE_MAP_DIGEST.test(envelope.registry_snapshot_digest)
    || !envelope.summary || typeof envelope.summary !== "object") {
    return null;
  }
  const asserted = envelope.summary.aggregate_state;
  if (typeof asserted !== "string" || !STORAGE_MAP_STATES.includes(asserted)) return null;
  const observedAt = isoOrNull(envelope.observed_at);
  // The R3 aggregate is a source-asserted judgment; a hold survives without
  // a serving clock (the hermes_runtime rule — hold is maximally
  // conservative and must not soften to no_evidence). Every other state
  // requires the serving envelope's observation clock.
  if (asserted !== "hold" && !observedAt) return null;
  return {
    domain: "backup_restore_readiness",
    asserted_state: asserted,
    evidence_at: observedAt,
    owner_pointer: {
      owner_system: "path_registry",
      record_kind: "watch_storage_map_projection",
      record_ref: "endpoint.storage_map.snapshot",
    },
  };
}

// Combine whatever suppliers produced; nulls drop out. The strip feeds this
// straight into buildWatchPanelBoardViewModel, whose full-coverage rule
// renders every unsupplied domain as unknown/no_evidence.
export function collectWatchEvidences({ receiptExpiry, hostStats, agentRuntime, storageMap } = {}) {
  return [
    receiptExpiryEvidence(receiptExpiry),
    hostStatsEvidence(hostStats),
    agentRuntimeEvidence(agentRuntime),
    storageMapEvidence(storageMap),
  ].filter((evidence) => evidence !== null);
}
