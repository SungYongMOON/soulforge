// Watch evidence suppliers — declared, source-asserted translations only.
//
// Each supplier maps ONE Board snapshot endpoint's OWN asserted vocabulary
// into a watch-panel evidence record. Nothing here invents a health
// judgment: where a source asserts a status, a pinned table translates it;
// where a source only reports measurements (host-stats), the evidence
// asserts `unknown` with the observation clock — "the feed is alive, nobody
// asserts health" — which renders distinctly from a missing feed
// (reason `as_asserted` vs `no_evidence`). A malformed or unrecognized
// payload yields NO evidence at all (the strip's full-coverage rule then
// renders the honest `unknown/no_evidence`), never a fabricated state.
//
// Covered domains and sources (both observed live on this machine):
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

// Combine whatever suppliers produced; nulls drop out. The strip feeds this
// straight into buildWatchPanelBoardViewModel, whose full-coverage rule
// renders every unsupplied domain as unknown/no_evidence.
export function collectWatchEvidences({ receiptExpiry, hostStats } = {}) {
  return [receiptExpiryEvidence(receiptExpiry), hostStatsEvidence(hostStats)]
    .filter((evidence) => evidence !== null);
}
