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
npm run guild-hall:knowledge-graph -- export --rag-manifest-ref _workspaces/system/rag/manifests/soulforge_metadata_rag_mvp_20260524/rag_manifest.json --export-id knowledge_graph_rag_lens_v0
npm run guild-hall:knowledge-graph -- export --rag-manifest-ref _workspaces/system/rag/manifests/soulforge_metadata_rag_mvp_20260524/rag_manifest.json --source-slice-triage-register-ref _workmeta/system/reports/rag/source_slice_triage_register/soulforge_source_triage_register_20260524/source_slice_triage_register.json --source-slice-review-queue-ref _workmeta/system/reports/rag/source_slice_review_queue/soulforge_source_review_queue_20260524/source_slice_review_queue.json --export-id knowledge_graph_rag_triage_lens_v0
npm run guild-hall:knowledge-graph -- export --graph-relation-review-queue-ref _workmeta/system/reports/rag/graph_relation_review/dapa_operational_routes_20260528/graph_relation_review_queue.yaml --export-id knowledge_graph_dapa_route_review_overlay_20260528
npm run guild-hall:knowledge-graph -- plan --question "GraphRAG multi-hop source-backed retrieval plan"
npm run guild-hall:knowledge-graph -- plan --node-ref ".registry/knowledge/graph_rag" --question "이 노드 기준으로 탐지 카드"
npm run guild-hall:knowledge-graph -- review --node-ref ".registry/knowledge/graph_rag" --graph-ref _workspaces/system/knowledge_view/graph_export/knowledge_graph_v0/graph.json --model gpt-5.5 --text
npm run validate:knowledge-graph
```

Default output root:

```text
_workspaces/system/knowledge_view/
```

This default is the path-identity controlled system view. For PC-local graph or
Obsidian experiments, pass `--output-root
_workspaces/_local/<node_id>/system/knowledge_view`; do not create a new direct
child under `_workspaces`.

During `_workspaces/system` migration, default system writes are blocked until
the `system` binding is active and the local path is a link view. Run
`npm.cmd run guild-hall:workspace-system:inventory -- --json` first if this PC
may still have a normal `_workspaces/system` folder.

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

When `--rag-manifest-ref` is supplied, the exporter embeds a metadata-only
`rag_projection` block into `graph.json` and annotates matching graph nodes with
RAG readiness, lens profile ids, source-handle counts, blockers, and weakest
claim ceilings from the manifest. The 3D preview exposes a `RAG 렌즈` control so
the owner can inspect all manifest-linked nodes, only answer-ready nodes, or a
specific manifest lens profile. This projection is a view overlay. It does not
load source text, chunk text, NotebookLM answers, vector stores, BM25 indexes,
private payloads, secrets, or runtime absolute paths.

When `--source-slice-triage-register-ref` is supplied, the exporter embeds a
metadata-only `source_slice_projection` block and annotates matching graph nodes
with redacted source-slice registration counts. The 3D preview exposes a
`RAG 등록 상태` control for all nodes, metadata-registered nodes, owner-review
items, blocked items, and stronger-permission-needed nodes. This projection uses
counts and status labels only. It does not expose source text, source locator
payloads, source-handle arrays, indexes, NotebookLM answers, applied owner
decisions, or public canon promotion.

The 3D preview can draw subtle component halos around the largest visible
connected components. These halos express the current component grouping without
reusing node color, which remains reserved for node type.

When `--graph-relation-review-queue-ref` is supplied, the exporter reads a
metadata-only graph relation review queue and adds review-required route edges
through redacted alias nodes. Private/local target refs from the queue are not
copied into `graph.json`; graph edges point back to the review queue as their
source ref. This is a navigation overlay only, not graph truth mutation, default
route mutation, source truth, final answer authority, public canon promotion, or
ontology acceptance.
The halo style is selectable: `연두 윤곽 글로우` for a lime dotted spherical cloud
whose point spacing, point count, point size, opacity, and shell shape can be
tuned in the renderer profile,
`얇은 한 줄` for a restrained single-ring outline, or `굵은 한 줄` for a stronger
single-ring outline.
The preview exposes local sliders for the dotted cloud's point spacing, point
size, brightness, depth, inner radius, and jitter. These sliders affect only the
rendered halo, not graph data or component membership.
The 3D preview also exposes a single `현재 설정 저장` button. It stores the local
view configuration in the browser for the current export id and restores it on
the next open; this is a presentation preference, not graph data.
Right-clicking a 3D node opens a small exploration menu. The menu can copy a
metadata-only `탐지 카드` into the sidebar, copy a Codex-ready exploration
prompt, focus the graph on that node's visible connections, or copy the node
ref. The card mirrors the planner contract shape with `candidate_nodes`,
one-hop `relation_paths`, `source_refs`, `missing_evidence_items`, and
`next_action_items`, but it is built only from the embedded `graph.json` data
already present in the preview. The copied prompt contains only metadata refs,
current filters, visible relation summaries, and boundary reminders. If the
browser blocks clipboard access, the menu exposes the same text in a readonly
manual-copy field.
The card starts with an operator-facing Korean `판정` and `지금 할 일` block so
the owner can tell whether the selected node is only a map cue, needs source
edges, needs retrieval wiring, or needs benchmark validation before it can be
used for any RAG answer workflow.
The card can also copy a terminal command that runs the metadata-only plan
through the Codex bridge with `gpt-5.5`. The browser still does not execute
local commands; it only copies the command so the owner can run the advisory
relation-candidate review deliberately.
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

The `plan` command is a metadata-only retrieval planner. It reads a generated
`graph.json` if present, or builds an in-memory graph from the same public canon
metadata, then returns `candidate_nodes`, one-hop `relation_paths`, `source_refs`,
claim ceilings, `missing_evidence_items`, `next_action_items`, and a
`detection_card` render contract. It supports either question-only mode or
selected-node mode through `--node-ref`. A selected node is pinned as the primary
candidate with `is_selected: true` so future graph UI cards can render the same
shape without inventing extra judgment. If an explicit `--graph-ref` is supplied
and missing, the command fails instead of silently falling back to another graph.
It does not load source text, query NotebookLM, run vector search, or generate an
answer.

The `review` command wraps the same plan in a compact metadata-only request and
sends it to `guild_hall/codex_bridge` for advisory relation-candidate review.
It defaults to `--model gpt-5.5`, writes the last bridge response under ignored
`guild_hall/state/tools/codex_bridge/`, and returns either JSON or plain text
with `--text`. The result may suggest candidate relation shapes, but it cannot
claim source truth, owner approval, validation, ontology acceptance, canon
promotion, or completed implementation.

## Boundary

- Reads public canon metadata and explicit ledger refs/files only.
- Does not scan private roots by default.
- Does not copy raw source text, private packet payloads, NotebookLM answers,
  secrets, credentials, or runtime absolute paths into graph data.
- `--rag-manifest-ref` adds only sanitized manifest projection metadata. It is
  not a source reader, vector search, NotebookLM bridge, or answer engine.
- `--graph-relation-review-queue-ref` adds only redacted review-required
  relation candidates. It does not expose private target refs or apply graph
  truth/default-route mutation.
- The retrieval plan output is a navigation signal and review scope, not answer
  evidence or retrieval quality validation.
- The 3D preview 탐지 카드 is also local and metadata-only: it does not call
  NotebookLM, Codex bridge, vector search, source readers, or graph mutation.
- The copied `review` command is an explicit operator action. It sends only the
  compact metadata plan to the Codex bridge and produces advisory relation
  candidates, not RAG answers or graph mutations.
- Obsidian output is a generated read-only view.
