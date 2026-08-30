import test from "node:test";
import assert from "node:assert/strict";

import {
  agentRuntimeEvidence,
  collectWatchEvidences,
  hostStatsEvidence,
  receiptExpiryEvidence,
  storageMapEvidence,
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

test("agent-runtime mapping: source-asserted hold, observability aggregation, activity never maps", () => {
  const bot = (kind) => ({ bot_id: "bot.x", state: { kind, value: kind === "observed" ? "working" : null } });
  const base = { refresh_state: "ready", observed_at: OBSERVED };
  // Source-asserted hold survives directly — including CLOCK-LESS holds
  // (the live read module emits observed_at: null when configuration is
  // unavailable; the panel contract renders hold_asserted without evidence).
  assert.equal(agentRuntimeEvidence({ refresh_state: "hold", observed_at: OBSERVED, bots: [] }).asserted_state, "hold");
  const clockless = agentRuntimeEvidence({ refresh_state: "hold", observed_at: null, hold_code: "AGENT_RUNTIME_CONFIGURATION_UNAVAILABLE", bots: [] });
  assert.equal(clockless.asserted_state, "hold");
  assert.equal(clockless.evidence_at, null);
  const clocklessView = buildWatchPanelBoardViewModel({ now: NOW_FRESH, evidences: [clockless] });
  const holdRow = clocklessView.rows.find((row) => row.domain === "hermes_runtime");
  assert.equal(holdRow.state, "hold");
  assert.equal(holdRow.reason, "hold_asserted");
  // A malformed NON-null clock on a hold is also coerced to a clockless
  // hold (decided: hold is maximally conservative; dropping it for a bad
  // clock would soften the signal to no_evidence).
  const badClockHold = agentRuntimeEvidence({ refresh_state: "hold", observed_at: "yesterday", bots: [] });
  assert.equal(badClockHold.asserted_state, "hold");
  assert.equal(badClockHold.evidence_at, null);
  // Every bot observed -> healthy; activity values (working/idle) are not health.
  assert.equal(agentRuntimeEvidence({ ...base, bots: [bot("observed"), bot("observed")] }).asserted_state, "healthy");
  // Any bot the source cannot observe -> degraded (known visibility problem).
  assert.equal(agentRuntimeEvidence({ ...base, bots: [bot("observed"), bot("unknown")] }).asserted_state, "degraded");
  // Health of nothing is not healthy.
  assert.equal(agentRuntimeEvidence({ ...base, bots: [] }).asserted_state, "unknown");
  // Unrecognized refresh_state, malformed bots, missing clock: supply NOTHING.
  assert.equal(agentRuntimeEvidence({ ...base, refresh_state: "vibes", bots: [] }), null);
  assert.equal(agentRuntimeEvidence({ ...base, bots: "not-a-list" }), null);
  assert.equal(agentRuntimeEvidence({ refresh_state: "ready", bots: [] }), null);
  assert.equal(agentRuntimeEvidence(null), null);
  // Prototype-chain-shaped state kinds are not "observed".
  assert.equal(agentRuntimeEvidence({ ...base, bots: [{ bot_id: "b", state: { kind: "constructor" } }] }).asserted_state, "degraded");
  const evidence = agentRuntimeEvidence({ ...base, bots: [bot("observed")] });
  assert.equal(evidence.domain, "hermes_runtime");
  assert.equal(evidence.evidence_at, OBSERVED);
  // Three-source collection composes; cross-feeding still nulls out safely.
  const evidences = collectWatchEvidences({
    receiptExpiry: { observed_at: OBSERVED, status: "ready" },
    hostStats: { observed_at: OBSERVED, cpu: {}, memory: {} },
    agentRuntime: { ...base, bots: [bot("observed")] },
  });
  assert.equal(evidences.length, 3);
  assert.deepEqual(evidences.map((entry) => entry.domain).sort(),
    ["connector_freshness", "hermes_runtime", "hpp_host"]);
  assert.deepEqual(collectWatchEvidences({ agentRuntime: { observed_at: OBSERVED, status: "ready" } }), [],
    "a receipt-expiry-shaped payload fed into the agent-runtime slot supplies nothing");
});

test("storage-map supplier translates the REAL R3 overlay aggregate verbatim", async () => {
  // Pin against the actual contract, not a hand-shaped fixture: the seed
  // registry's projection is the exact payload a future runtime would serve.
  const { createPathRegistry, registrySnapshot } = await import(
    "../../../../../guild_hall/path_registry/src/path_registry_core.mjs"
  );
  const { buildStorageMap } = await import(
    "../../../../../guild_hall/path_registry/src/storage_map_projection.mjs"
  );
  const { SEED_AUTHORITY, seedRows } = await import(
    "../../../../../guild_hall/path_registry/data/registry_seed_v0.mjs"
  );
  const seedMap = buildStorageMap({
    registry_snapshot: registrySnapshot(createPathRegistry({ authority: SEED_AUTHORITY, rows: seedRows() })),
  });
  assert.equal(seedMap.summary.aggregate_state, "hold", "seed sentinels must aggregate hold");

  // A served hold survives clock-less (the decided hermes rule) and with a clock.
  const clockless = storageMapEvidence(seedMap);
  assert.equal(clockless.domain, "backup_restore_readiness");
  assert.equal(clockless.asserted_state, "hold");
  assert.equal(clockless.evidence_at, null);
  const clocked = storageMapEvidence({ ...seedMap, observed_at: OBSERVED });
  assert.equal(clocked.asserted_state, "hold");
  assert.equal(clocked.evidence_at, OBSERVED);

  // Non-hold states require the serving clock; with one they map verbatim.
  const healthyShape = {
    schema: seedMap.schema,
    projection_kind: seedMap.projection_kind,
    registry_snapshot_digest: seedMap.registry_snapshot_digest,
    summary: { ...seedMap.summary, aggregate_state: "healthy" },
  };
  assert.equal(storageMapEvidence(healthyShape), null, "non-hold without clock supplies nothing");
  assert.equal(storageMapEvidence({ ...healthyShape, observed_at: OBSERVED }).asserted_state, "healthy");
  assert.equal(storageMapEvidence({ ...healthyShape, observed_at: OBSERVED, summary: { aggregate_state: "stale" } }).asserted_state, "stale");

  // Forged or foreign envelopes supply NOTHING — never a fabricated state.
  assert.equal(storageMapEvidence(null), null);
  assert.equal(storageMapEvidence({ ...healthyShape, observed_at: OBSERVED, schema: "forged" }), null);
  assert.equal(storageMapEvidence({ ...healthyShape, observed_at: OBSERVED, projection_kind: "source_display" }), null);
  assert.equal(storageMapEvidence({ ...healthyShape, observed_at: OBSERVED, registry_snapshot_digest: "sha256:short" }), null);
  assert.equal(storageMapEvidence({ ...healthyShape, observed_at: OBSERVED, summary: { aggregate_state: "green" } }), null,
    "a green-like state outside the panel enum is unrecognized");

  // Four-source collection composes and the view-model renders the domain.
  const evidences = collectWatchEvidences({ storageMap: { ...seedMap, observed_at: OBSERVED } });
  assert.equal(evidences.length, 1);
  const view = buildWatchPanelBoardViewModel({ now: NOW_FRESH, evidences });
  const row = view.rows.find((entry) => entry.domain === "backup_restore_readiness");
  assert.equal(row.state, "hold");
});
