// Board adoption of the Watch panel contract (program plan 08).
//
// This is the team-ops-board VIEW-MODEL for the Watch health strip, built
// directly ON guild_hall/watch_panel_contract — the contract module is the
// single source of the panel enum, freshness semantics, forbidden-field lint,
// safe pointer shape, and the request-filing surface. This module adds only
// Board display discipline:
//   - FULL COVERAGE: every contract domain renders a row; a domain with no
//     evidence renders as the contract's `unknown`, never as absence (an
//     omitted row would read as "fine").
//   - stable row order (the contract's domain order) and a display-severity
//     summary for the strip header.
// It renders no HTML, probes nothing, stores nothing, and owns no writer:
// filing an approved-action REQUEST through the contract surface is the only
// mutation reachable from here, and a request executes nothing.
//
// Page wiring: consumed by src/watch-strip.tsx behind the default-OFF
// ?watch=1 flag (lazy-loaded, so the default Board never loads this chain).
// Measured on vite 7.3.1: module-graph cross-root imports are served in dev
// without any fs.allow change.

import {
  PANEL_DOMAINS,
  PANEL_STATES,
  WATCH_PANEL_SCHEMA,
  assertNoWriterSurface,
  buildPanel,
  createWatchActionRequests,
} from "../../../../../guild_hall/watch_panel_contract/src/watch_panel_contract.mjs";

export const WATCH_PANEL_BOARD_VIEW_SCHEMA = "soulforge.team_ops_board.watch_panel_view.v0";

// Board default freshness window when the evidence supplier does not declare
// one. A DISPLAY default only — suppliers with faster or slower cadences
// declare their own window per evidence record.
export const DEFAULT_FRESHNESS_WINDOW_SECONDS = 900;

// Display severity, worst first. This orders the strip's attention summary;
// it is a DISPLAY ordering, not a health calculus: `stale` and `unknown`
// rank above `healthy` precisely because old or missing evidence may hide
// anything.
export const DISPLAY_SEVERITY = Object.freeze([
  "hold", "unavailable", "stale", "degraded", "unknown", "healthy",
]);

function fail(code, detail) {
  const error = new Error(detail ? `${code}:${detail}` : code);
  error.code = code;
  throw error;
}

function deepFreeze(value) {
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

// evidences: array of { domain, asserted_state, evidence_at, owner_pointer,
// freshness_window_seconds?, extra_fields? } — caller-supplied observations.
// Every panel decision (unknown/stale/hold semantics, forbidden fields,
// pointer shape) is delegated to the contract's buildPanel.
export function buildWatchPanelBoardViewModel({ now, evidences } = {}) {
  if (typeof now !== "string" || now.length === 0) fail("now_required");
  const supplied = Array.isArray(evidences) ? evidences : [];
  const byDomain = new Map();
  for (const evidence of supplied) {
    const domain = evidence?.domain;
    // Domain validity FIRST, so an invalid domain always reports
    // domain_unknown — never a misleading duplicate code.
    if (!PANEL_DOMAINS.includes(domain)) fail("domain_unknown", String(domain));
    if (byDomain.has(domain)) fail("evidence_duplicate_domain", domain);
    byDomain.set(domain, evidence);
  }

  // Rows project an ALLOWLIST of contract panel fields only. Anything a
  // supplier puts at the evidence top level outside the six consumed fields
  // is dropped (never rendered, never linted) — payloads meant for the
  // forbidden-field lint must ride in `extra_fields`.
  const rows = PANEL_DOMAINS.map((domain, index) => {
    const evidence = byDomain.get(domain);
    const panel = buildPanel(evidence
      ? {
        domain,
        asserted_state: evidence.asserted_state,
        evidence_at: evidence.evidence_at ?? null,
        now,
        freshness_window_seconds: evidence.freshness_window_seconds ?? DEFAULT_FRESHNESS_WINDOW_SECONDS,
        owner_pointer: evidence.owner_pointer,
        extra_fields: evidence.extra_fields ?? {},
      }
      : {
        domain,
        asserted_state: "unknown",
        evidence_at: null,
        now,
        freshness_window_seconds: DEFAULT_FRESHNESS_WINDOW_SECONDS,
        owner_pointer: {
          owner_system: "watchtower",
          record_kind: "panel_domain",
          record_ref: `watch.domain.${domain}`,
        },
      });
    return {
      order: index,
      domain: panel.domain,
      state: panel.state,
      reason: panel.reason,
      asserted_state: panel.asserted_state,
      evidence_at: panel.evidence_at,
      freshness_window_seconds: panel.freshness_window_seconds,
      owner_pointer: panel.owner_pointer,
      // indexOf returns -1 for a state this display does not know (a future
      // contract state): -1 sorts BEFORE hold, i.e. worst-of-all. That
      // direction is deliberate — an unrecognized state demands attention.
      severity_rank: DISPLAY_SEVERITY.indexOf(panel.state),
    };
  });

  const byState = {};
  for (const state of PANEL_STATES) byState[state] = 0;
  for (const row of rows) byState[row.state] += 1;
  // Stable sort (ES2019): among equally-bad rows the first in contract
  // domain order becomes worst_domain.
  const worst = [...rows].sort((a, b) => a.severity_rank - b.severity_rank)[0] ?? null;

  return deepFreeze({
    schema: WATCH_PANEL_BOARD_VIEW_SCHEMA,
    contract_schema: WATCH_PANEL_SCHEMA,
    now,
    rows,
    summary: {
      total: rows.length,
      by_state: byState,
      attention_count: rows.filter((row) => row.state !== "healthy").length,
      worst_state: worst ? worst.state : null,
      worst_domain: worst ? worst.domain : null,
    },
  });
}

// The Board's only mutation surface: the contract's own request registry,
// structurally checked to expose no writer verbs before it is handed out.
export function createBoardWatchActionSurface() {
  const surface = createWatchActionRequests();
  const verdict = assertNoWriterSurface(surface);
  if (!verdict.ok) fail("writer_surface_detected", verdict.problems.join(","));
  return surface;
}
