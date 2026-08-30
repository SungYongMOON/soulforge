import test from "node:test";
import assert from "node:assert/strict";

import {
  collectWatchEvidences,
  hostStatsEvidence,
  receiptExpiryEvidence,
} from "./watch-evidence-suppliers.mjs";
import { buildWatchPanelBoardViewModel } from "./watch-panel-view.mjs";

const OBSERVED = "2026-08-30T02:31:19.466Z";
const NOW_FRESH = "2026-08-30T02:35:00.000Z";

test("receipt-expiry mapping is the pinned source vocabulary and nothing else", () => {
  const base = { schema_version: "soulforge.team_ops_board.receipt_expiry_projection.v1", observed_at: OBSERVED };
  assert.equal(receiptExpiryEvidence({ ...base, status: "ready" }).asserted_state, "healthy");
  assert.equal(receiptExpiryEvidence({ ...base, status: "partial" }).asserted_state, "degraded");
  // An unavailable projection cannot SEE the connectors; asserting they are
  // down would be an overclaim — the mapping says unknown.
  assert.equal(receiptExpiryEvidence({ ...base, status: "unavailable" }).asserted_state, "unknown");
  // Unrecognized status, missing clock, malformed payload: supply NOTHING.
  assert.equal(receiptExpiryEvidence({ ...base, status: "vibes" }), null);
  // Prototype-chain keys are unrecognized values, not table hits.
  for (const poison of ["constructor", "toString", "hasOwnProperty", "__proto__"]) {
    assert.equal(receiptExpiryEvidence({ ...base, status: poison }), null, poison);
  }
  assert.equal(receiptExpiryEvidence({ ...base, status: 42 }), null);
  assert.equal(receiptExpiryEvidence({ status: "ready" }), null);
  assert.equal(receiptExpiryEvidence({ ...base, status: "ready", observed_at: "yesterday" }), null);
  assert.equal(receiptExpiryEvidence(null), null);
  assert.equal(receiptExpiryEvidence("ready"), null);
  const evidence = receiptExpiryEvidence({ ...base, status: "ready" });
  assert.equal(evidence.domain, "connector_freshness");
  assert.equal(evidence.evidence_at, OBSERVED);
  assert.equal(evidence.owner_pointer.owner_system, "team_ops_board");
});

test("host-stats supplies feed-alive evidence with an unknown assertion, never a health judgment", () => {
  const snapshot = { observed_at: OBSERVED, cpu: { percent: 8.6 }, memory: { percent: 25.8 } };
  const evidence = hostStatsEvidence(snapshot);
  assert.equal(evidence.domain, "hpp_host");
  assert.equal(evidence.asserted_state, "unknown", "measurements are not assertions: 99% CPU and 1% CPU map identically");
  assert.equal(evidence.evidence_at, OBSERVED);
  assert.equal(hostStatsEvidence({ ...snapshot, cpu: undefined }), null);
  assert.equal(hostStatsEvidence({ ...snapshot, observed_at: null }), null);
  assert.equal(hostStatsEvidence(undefined), null);
});

test("collected evidences feed the strip: distinct reasons separate a live-but-unasserted feed from a missing one", () => {
  const evidences = collectWatchEvidences({
    receiptExpiry: { observed_at: OBSERVED, status: "ready" },
    hostStats: { observed_at: OBSERVED, cpu: {}, memory: {} },
  });
  assert.equal(evidences.length, 2);
  const view = buildWatchPanelBoardViewModel({ now: NOW_FRESH, evidences });
  const byDomain = Object.fromEntries(view.rows.map((row) => [row.domain, row]));
  assert.equal(byDomain.connector_freshness.state, "healthy");
  assert.equal(byDomain.connector_freshness.reason, "as_asserted");
  assert.equal(byDomain.hpp_host.state, "unknown");
  assert.equal(byDomain.hpp_host.reason, "as_asserted", "feed alive, health unasserted");
  assert.equal(byDomain.buzz_stack.reason, "no_evidence", "a missing feed stays distinguishable");
  // A stale receipt-expiry feed degrades through the contract's freshness
  // semantics (healthy asserted + old evidence -> stale).
  const staleView = buildWatchPanelBoardViewModel({
    now: "2026-08-30T04:00:00.000Z",
    evidences: collectWatchEvidences({ receiptExpiry: { observed_at: OBSERVED, status: "ready" } }),
  });
  const staleRow = staleView.rows.find((row) => row.domain === "connector_freshness");
  assert.equal(staleRow.state, "stale");
  assert.equal(staleRow.reason, "freshness_window_exceeded");
  // Nothing supplied at all -> both mappers null out.
  assert.deepEqual(collectWatchEvidences({}), []);
  assert.deepEqual(collectWatchEvidences({ receiptExpiry: { status: "vibes" }, hostStats: {} }), []);
});
