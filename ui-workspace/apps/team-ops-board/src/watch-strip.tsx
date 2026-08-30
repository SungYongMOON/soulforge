// Watch strip — default-OFF page surface over the Board's watch-panel
// view-model (guild_hall/watch_panel_contract adoption, page-wiring leaf).
//
// Rendered ONLY when the page URL carries ?watch=1 (see main.tsx) and
// lazy-loaded, so without the flag the default Board loads none of this
// module chain and behaves exactly as before. On the flagged path the strip
// performs exactly three read-only same-origin GETs (the Board's own
// receipt-expiry, host-stats, and agent-runtime snapshot endpoints) and translates their
// SOURCE-ASSERTED vocabularies through the declared suppliers; every other
// domain honestly renders the contract's `unknown` — missing evidence is
// attention, never green. This surface stays display-only: it owns no
// writer, no probe, and files nothing.

import { useEffect, useMemo, useState } from "react";
import { buildWatchPanelBoardViewModel } from "./core/watch-panel-view.mjs";
import { collectWatchEvidences } from "./core/watch-evidence-suppliers.mjs";

const STATE_COLORS: Record<string, string> = {
  healthy: "#2e7d32",
  degraded: "#f9a825",
  stale: "#ef6c00",
  unavailable: "#c62828",
  unknown: "#607d8b",
  hold: "#6a1b9a",
};

async function fetchJsonOrNull(url: string) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    // A failed read supplies NOTHING; the affected domain then renders the
    // honest unknown/no_evidence instead of a fabricated state.
    return null;
  }
}

export function WatchStrip() {
  const [sources, setSources] = useState<{ receiptExpiry: any; hostStats: any; agentRuntime: any; storageMap: any }>({
    receiptExpiry: null,
    hostStats: null,
    agentRuntime: null,
    storageMap: null,
  });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [receiptExpiry, hostStats, agentRuntime, storageMap] = await Promise.all([
        fetchJsonOrNull("/receipt-expiry.snapshot.json"),
        fetchJsonOrNull("/host-stats.snapshot.json"),
        fetchJsonOrNull("/agent-runtime.snapshot.json?read_only=1"),
        // Emitted only by the private-binding-gated runtime; absent today,
        // so backup_restore_readiness renders unknown/no_evidence honestly.
        fetchJsonOrNull("/storage-map.snapshot.json"),
      ]);
      if (!cancelled) setSources({ receiptExpiry, hostStats, agentRuntime, storageMap });
    })();
    return () => { cancelled = true; };
  }, []);
  const view = useMemo(() => {
    const now = new Date().toISOString();
    try {
      return buildWatchPanelBoardViewModel({ now, evidences: collectWatchEvidences(sources) });
    } catch {
      // The contract throws fail-closed (e.g. evidence_in_future under
      // forward clock skew on a proxied endpoint). The strip owns the guard:
      // degrade to the all-unknown full-coverage view instead of letting a
      // render throw blank the whole Board page.
      return buildWatchPanelBoardViewModel({ now, evidences: [] });
    }
  }, [sources]);
  return (
    <section
      aria-label="Watch panel strip (preview)"
      data-testid="watch-strip"
      style={{
        margin: "8px",
        padding: "10px 12px",
        border: "1px solid #37474f",
        borderRadius: "8px",
        background: "#111827",
        color: "#e5e7eb",
        fontSize: "13px",
      }}
    >
      <header style={{ display: "flex", gap: "12px", alignItems: "baseline", marginBottom: "8px" }}>
        <strong>Watch</strong>
        <span data-testid="watch-strip-summary">
          attention {view.summary.attention_count}/{view.summary.total} · worst: {view.summary.worst_state}
          {view.summary.worst_domain ? ` (${view.summary.worst_domain})` : ""}
        </span>
        <small style={{ color: "#9ca3af" }}>as of {view.now.slice(11, 19)}Z (1회 스냅샷)</small>
      </header>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
        {view.rows.map((row: any) => (
          <span
            key={row.domain}
            data-testid={`watch-row-${row.domain}`}
            title={`${row.domain}: ${row.state} (${row.reason})${row.evidence_at ? ` evidence_at=${row.evidence_at}` : ""}`}
            style={{
              padding: "3px 8px",
              borderRadius: "6px",
              background: "#1f2937",
              borderLeft: `4px solid ${STATE_COLORS[row.state] ?? STATE_COLORS.unknown}`,
              whiteSpace: "nowrap",
            }}
          >
            {row.domain} <b>{row.state}</b>
          </span>
        ))}
      </div>
      <small style={{ display: "block", marginTop: "6px", color: "#9ca3af" }}>
        증거: connector_freshness·hpp_host·hermes_runtime·backup_restore_readiness는 source-asserted 값(읽기 전용 GET 4건; storage-map은 R3 overlay 집계), 나머지는 unknown(무증거는 정상이 아님).
        표시 전용 표면: probe·writer·요청 filing 없음.
      </small>
    </section>
  );
}
