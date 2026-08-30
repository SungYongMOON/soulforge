import test from "node:test";
import assert from "node:assert/strict";

import {
  PANEL_DOMAINS,
  PANEL_STATES,
} from "../../../../../guild_hall/watch_panel_contract/src/watch_panel_contract.mjs";
import {
  DEFAULT_FRESHNESS_WINDOW_SECONDS,
  DISPLAY_SEVERITY,
  WATCH_PANEL_BOARD_VIEW_SCHEMA,
  buildWatchPanelBoardViewModel,
  createBoardWatchActionSurface,
} from "./watch-panel-view.mjs";

const NOW = "2026-08-30T12:00:00.000Z";
const FRESH_AT = "2026-08-30T11:55:00.000Z";   // 300s old — inside the default window
const OLD_AT = "2026-08-30T10:00:00.000Z";     // 7200s old — far outside it

function pointer(domain) {
  return { owner_system: "watchtower", record_kind: "probe_receipt", record_ref: `receipt.${domain}` };
}

test("full coverage: with zero evidence every contract domain renders unknown, never absence", () => {
  const view = buildWatchPanelBoardViewModel({ now: NOW, evidences: [] });
  assert.equal(view.schema, WATCH_PANEL_BOARD_VIEW_SCHEMA);
  assert.equal(view.rows.length, PANEL_DOMAINS.length);
  assert.deepEqual(view.rows.map((row) => row.domain), [...PANEL_DOMAINS], "rows keep the contract's domain order");
  for (const row of view.rows) {
    assert.equal(row.state, "unknown");
    assert.equal(row.reason, "no_evidence");
    assert.equal(row.evidence_at, null);
    assert.equal(row.freshness_window_seconds, DEFAULT_FRESHNESS_WINDOW_SECONDS);
  }
  assert.equal(view.summary.attention_count, PANEL_DOMAINS.length, "unknown is attention, never green");
  assert.equal(view.summary.worst_state, "unknown");
  assert.equal(view.summary.worst_domain, PANEL_DOMAINS[0], "among tied rows the first in contract order is worst_domain (stable sort)");
  assert.equal(view.summary.by_state.unknown, PANEL_DOMAINS.length);
  assert.equal(view.summary.by_state.healthy, 0);
});

test("mixed evidence: contract freshness semantics decide every row; missing domains stay unknown", () => {
  const view = buildWatchPanelBoardViewModel({
    now: NOW,
    evidences: [
      { domain: "hpp_host", asserted_state: "healthy", evidence_at: FRESH_AT, owner_pointer: pointer("hpp_host") },
      { domain: "buzz_stack", asserted_state: "degraded", evidence_at: FRESH_AT, owner_pointer: pointer("buzz_stack") },
      // asserted healthy but the evidence is old -> the contract degrades it to stale
      { domain: "cost_usage", asserted_state: "healthy", evidence_at: OLD_AT, owner_pointer: pointer("cost_usage") },
      // unavailable stays as asserted even with old evidence
      { domain: "hermes_runtime", asserted_state: "unavailable", evidence_at: OLD_AT, owner_pointer: pointer("hermes_runtime") },
      // a hold assertion survives with no evidence at all
      { domain: "backup_restore_readiness", asserted_state: "hold", evidence_at: null, owner_pointer: pointer("backup_restore_readiness") },
    ],
  });
  const byDomain = Object.fromEntries(view.rows.map((row) => [row.domain, row]));
  assert.equal(byDomain.hpp_host.state, "healthy");
  assert.equal(byDomain.buzz_stack.state, "degraded");
  assert.equal(byDomain.cost_usage.state, "stale");
  assert.equal(byDomain.cost_usage.reason, "freshness_window_exceeded");
  assert.equal(byDomain.cost_usage.asserted_state, "healthy", "the optimistic assertion stays visible next to the degraded state");
  assert.equal(byDomain.hermes_runtime.state, "unavailable");
  assert.equal(byDomain.backup_restore_readiness.state, "hold");
  assert.equal(byDomain.backup_restore_readiness.reason, "hold_asserted");
  assert.equal(byDomain.tool_workshop.state, "unknown", "an unsupplied domain renders unknown");
  assert.equal(view.summary.worst_state, "hold");
  assert.equal(view.summary.worst_domain, "backup_restore_readiness");
  assert.equal(view.summary.attention_count, PANEL_DOMAINS.length - 1, "only the one fresh healthy row is not attention");
});

test("supplier mistakes fail closed: duplicate domains, unknown domains, future evidence", () => {
  const base = { domain: "hpp_host", asserted_state: "healthy", evidence_at: FRESH_AT, owner_pointer: pointer("hpp_host") };
  assert.throws(() => buildWatchPanelBoardViewModel({ now: NOW, evidences: [base, { ...base }] }),
    (error) => error.code === "evidence_duplicate_domain");
  assert.throws(() => buildWatchPanelBoardViewModel({
    now: NOW,
    evidences: [{ ...base, domain: "vibes" }],
  }), (error) => error.code === "domain_unknown");
  // Two evidences sharing the same INVALID domain still report the root
  // cause, never a misleading duplicate code.
  assert.throws(() => buildWatchPanelBoardViewModel({
    now: NOW,
    evidences: [{ ...base, domain: "vibes" }, { ...base, domain: "vibes" }],
  }), (error) => error.code === "domain_unknown");
  assert.throws(() => buildWatchPanelBoardViewModel({
    now: NOW,
    evidences: [{ ...base, evidence_at: "2026-08-30T12:30:00.000Z" }],
  }), (error) => error.code === "evidence_in_future");
  assert.throws(() => buildWatchPanelBoardViewModel({ evidences: [] }), (error) => error.code === "now_required");
});

test("forbidden deep-record fields are rejected through the contract lint and rows are frozen at every depth", () => {
  assert.throws(() => buildWatchPanelBoardViewModel({
    now: NOW,
    evidences: [{
      domain: "hpp_host", asserted_state: "healthy", evidence_at: FRESH_AT,
      owner_pointer: pointer("hpp_host"),
      extra_fields: { probe: { raw_message: "the actual mail body" } },
    }],
  }), (error) => error.code === "panel_forbidden_field");
  const view = buildWatchPanelBoardViewModel({ now: NOW, evidences: [] });
  assert.equal(Object.isFrozen(view), true);
  assert.equal(Object.isFrozen(view.rows), true);
  assert.equal(Object.isFrozen(view.rows[0]), true);
  assert.equal(Object.isFrozen(view.rows[0].owner_pointer), true);
  assert.throws(() => { view.summary.by_state.healthy = 9; }, TypeError);
});

test("the Board owns no writer: the only mutation is filing a request, and a filed request executes nothing", () => {
  const surface = createBoardWatchActionSurface();
  const filed = surface.fileActionRequest({
    request_id: "req.board.1", action_kind: "restart",
    target_ref: "target.buzz_stack", policy_ref: "policy.bastion.restart_v1",
    requested_by: "member.board_operator", expires_at: "2026-08-30T13:00:00.000Z",
  });
  assert.equal(filed.state, "filed");
  assert.equal(surface.getRequest("req.board.1").state, "filed", "filed is the terminal state on this surface — nothing here executes");
  assert.deepEqual(Object.keys(surface).sort(), ["fileActionRequest", "getRequest"], "no other surface exists");
  // The view-model module itself exposes no writer-shaped API either.
  const moduleSurface = { buildWatchPanelBoardViewModel, createBoardWatchActionSurface };
  for (const key of Object.keys(moduleSurface)) {
    assert.equal(/execute|restart|restore|rollback|isolate|kill|delete|write|mutate|set_state/i.test(key), false, key);
  }
});

test("deterministic: identical inputs produce byte-identical view models, and severity order is pinned", () => {
  const evidences = [
    { domain: "hpp_host", asserted_state: "healthy", evidence_at: FRESH_AT, owner_pointer: pointer("hpp_host") },
    { domain: "buzz_stack", asserted_state: "degraded", evidence_at: FRESH_AT, owner_pointer: pointer("buzz_stack") },
  ];
  const first = buildWatchPanelBoardViewModel({ now: NOW, evidences });
  const second = buildWatchPanelBoardViewModel({ now: NOW, evidences });
  assert.equal(JSON.stringify(first), JSON.stringify(second), "byte-identical including key order");
  assert.deepEqual([...DISPLAY_SEVERITY], ["hold", "unavailable", "stale", "degraded", "unknown", "healthy"]);
  // Exact set equality with the contract: a future seventh contract state
  // must fail here and force a deliberate display decision (until then it
  // would rank worst via the documented indexOf -1 fallback).
  assert.equal(DISPLAY_SEVERITY.length, PANEL_STATES.length);
  for (const state of DISPLAY_SEVERITY) assert.equal(PANEL_STATES.includes(state), true, state);
});
