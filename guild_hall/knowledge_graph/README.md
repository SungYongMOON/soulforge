# guild_hall/knowledge_graph

## Purpose

`knowledge_graph/` generates metadata-only graph views from Soulforge public
canon metadata and explicit knowledge-access ledger analysis.

The generated graph is a navigation and review surface only. It is not source
truth, ontology acceptance, owner approval, archive/retire execution, or canon
promotion.

## Command

```bash
npm run guild-hall:knowledge-graph -- export --export-id knowledge_graph_v0
npm run guild-hall:knowledge-graph -- export --ledger-ref _workmeta/system/reports/knowledge_access/events/2026/2026-05.jsonl --export-id knowledge_graph_live_v0
npm run validate:knowledge-graph
```

Default output root:

```text
_workspaces/system/knowledge_view/
```

Generated outputs:

- `graph_export/<export_id>/graph.json`
- `graph_export/<export_id>/graph_preview.html` (default Three.js 3D view)
- `graph_export/<export_id>/graph_preview_2d.html` (SVG fallback view)
- `graph_export/<export_id>/graph_preview_3d.bundle.js`
- `obsidian_export/<export_id>/**`

`graph.json` includes `connectivity_analysis` with component count, isolated
node count, relation counts, degree rollups by node type, dangling edge refs,
and possible missing relation surfaces. These numbers validate whether a sparse
preview is present in the generated graph data or only caused by layout.

The 3D sidebar recalculates connectivity from the currently visible node and
relation filters. The generated `graph.json` connectivity block remains the
full-export diagnostic.

The 3D preview can draw subtle component halos around the largest visible
connected components. These halos express the current component grouping without
reusing node color, which remains reserved for node type.
The halo style is selectable: `연두 글로우` for a brighter soft lime component cloud
with many evenly spread round particle points,
`얇은 한 줄` for a restrained single-ring outline, or `굵은 한 줄` for a stronger
single-ring outline.
The 3D preview keeps the canvas fixed to the viewport and scrolls the sidebar
independently. Sidebar controls are grouped into collapsible sections so the
graph does not get clipped when the operator moves through longer settings.
Candidate relation lines use short dotted segments, while confirmed relation
lines remain continuous.
When a node focus is active, component glow is hidden for unrelated components
so only the selected focus range keeps its glow.

The 3D preview defaults node size to current visible degree so dense workflow
and profile-policy hubs remain readable even when explicit usage/access ledger
counts are sparse. The sidebar can switch node size back to usage count when the
inspection question is access frequency.
It also exposes global node-scale and relative node-spread sliders so the owner
can tune overall circle size and the visible gap between small and large nodes
without changing the underlying graph data.

The 3D sidebar includes a collapsible visual-rules panel so operators can check
the meaning of node size, color, opacity, edge styling, arrows, and component
halos without leaving the preview.

The exporter reads workflow profile policy recommendations from
`.workflow/*/profile_policy.yaml` and emits `recommends` edges from workflows to
their primary species and class. These edges are profile-policy metadata, not
proof that a workflow executed with that profile in a real run.

In the 3D preview, double-clicking a node focuses its connected chain and dims
the rest of the visible graph. The focus depth is adjustable in the sidebar, and
a background double-click clears the focus. The preview uses Korean display
labels for node and relation filters, with a top-right palette legend for the
currently visible colors.

## Boundary

- Reads public canon metadata and explicit ledger refs/files only.
- Does not scan private roots by default.
- Does not copy raw source text, private packet payloads, NotebookLM answers,
  secrets, credentials, or runtime absolute paths into graph data.
- Obsidian output is a generated read-only view.
