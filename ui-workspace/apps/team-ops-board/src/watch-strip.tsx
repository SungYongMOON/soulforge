// Watch strip — default-OFF page surface over the Board's watch-panel
// view-model (guild_hall/watch_panel_contract adoption, page-wiring leaf).
//
// Rendered ONLY when the page URL carries ?watch=1 (see main.tsx) and
// lazy-loaded, so without the flag the default Board loads none of this
// module chain and behaves exactly as before. No evidence
// suppliers are wired yet, so every domain honestly renders the contract's
// `unknown` — missing evidence is attention, never green. This surface is
// display-only: it owns no writer, no probe, and files nothing.

import { useMemo } from "react";
import { buildWatchPanelBoardViewModel } from "./core/watch-panel-view.mjs";

const STATE_COLORS: Record<string, string> = {
  healthy: "#2e7d32",
  degraded: "#f9a825",
  stale: "#ef6c00",
  unavailable: "#c62828",
  unknown: "#607d8b",
  hold: "#6a1b9a",
};

export function WatchStrip() {
  const view = useMemo(
    () => buildWatchPanelBoardViewModel({ now: new Date().toISOString(), evidences: [] }),
    [],
  );
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
      </header>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
        {view.rows.map((row: any) => (
          <span
            key={row.domain}
            data-testid={`watch-row-${row.domain}`}
            title={`${row.domain}: ${row.state} (${row.reason})`}
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
        증거 배선 전 프리뷰 — 모든 domain이 unknown(무증거는 정상이 아님). 표시 전용 표면: probe·writer·요청 filing 없음.
      </small>
    </section>
  );
}
