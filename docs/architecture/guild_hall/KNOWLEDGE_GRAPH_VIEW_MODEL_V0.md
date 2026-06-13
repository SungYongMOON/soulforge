# Knowledge Graph View Model v0

## Purpose

This document fixes the first visual and data contract for Soulforge knowledge
graph views.

The graph view is a generated navigation surface. It is not source truth,
ontology acceptance, owner approval, archive/retire execution, or canon
promotion.

## Owner Split

| Surface | Role |
| --- | --- |
| `docs/architecture/foundation/ONTOLOGY_MODEL_V0.md` | Defines core ontology entity and relation concepts. |
| `.registry/**`, `.workflow/**`, `.party/**`, `.unit/**`, `.mission/**` | Own reusable canon entries. |
| `guild_hall/knowledge_access/**` | Owns metadata-only access ledger and usage rollup helpers. |
| `guild_hall/knowledge_graph/**` | Owns generated graph view export helpers. |
| `_workspaces/system/knowledge_view/**` | Generated graph, HTML preview, and Obsidian export output under the path-identity controlled system view. PC-local experiments must use `_workspaces/_local/<node_id>/system/knowledge_view/**`. |
| `_workmeta/**` | Private evidence, ledgers, and project-local graph candidates. |

Do not create a new top-level graph or ontology root.

## Graph Scope Contract

Every graph export must declare its scope before computing visual values.

Minimum scope fields:

```yaml
graph_scope:
  time_window:
    starts_at_utc: null
    ends_at_utc: null
  source_surfaces:
    - public_canon
    - explicit_knowledge_access_ledgers
  included_node_types: []
  included_relation_types: []
  ledger_refs: []
  canon_only: false
  metadata_only: true
```

General file reads do not count as usage. Usage is counted only from explicit
metadata rows such as `knowledge_access` ledger entries or imported advisory
metadata rows accepted by the analyzer.

## Node Types

Allowed v0 node types:

| Node type | Meaning | Typical source |
| --- | --- | --- |
| `knowledge` | Reusable knowledge entry. | `.registry/knowledge/<knowledge_id>/knowledge.yaml` |
| `concept` | Extracted or candidate concept. | Sourcebound or private metadata packet. |
| `source` | Public-safe source or source card ref. | Public docs, source cards, or ledger target refs. |
| `project` | Project or project-local scope. | `_workmeta/<project_code>` metadata or project binding. |
| `workflow` | Reusable workflow canon. | `.workflow/<workflow_id>/workflow.yaml` |
| `party` | Reusable workflow-chain loadout. | `.party/<party_id>/party.yaml` |
| `mission` | Held mission plan owner. | `.mission/<mission_id>/mission.yaml` |
| `species` | Species canon. | `.registry/species/<species_id>/species.yaml` |
| `class` | Class canon. | `.registry/classes/<class_id>/class.yaml` |
| `unit` | Active subject/loadout. | `.unit/<unit_id>/unit.yaml` |
| `model_profile` | Model and reasoning profile. | Agent/model attribution metadata. |
| `agent_surface` | Execution surface such as Codex or Antigravity. | Agent/model attribution metadata. |
| `agent_run` | One bounded AI execution/run record. | Agent/model attribution metadata. |
| `validation` | Review or validation result. | Review packet or validation output metadata. |
| `artifact` | Produced or consumed artifact ref. | Mission or project-local metadata. |

Unknown or unsupported nodes must use `unknown_node` only in local/private
outputs. Public examples should avoid unknown nodes.

## Relation Types And Direction

| Relation type | Direction rule |
| --- | --- |
| `uses` | `actor_or_context -> used_ref` |
| `supports` | `source_or_validation -> claim_or_knowledge` |
| `derived_from` | `derived_node -> source_node` |
| `conflicts_with` | Symmetric; no arrow by default. |
| `validates` | `validation -> validated_node` |
| `routes_to` | `router_or_party -> target_workflow_or_route` |
| `recommends` | `profile_or_policy -> recommended_node` |
| `belongs_to` | `member_node -> owner_or_group_node` |
| `produces` | `producer -> artifact` |
| `consumes` | `consumer -> input_artifact` |
| `co_used_with` | Symmetric; no arrow by default. |
| `requires_owner_decision` | `blocked_or_candidate_node -> owner_decision_surface` |
| `has_species` | `unit -> species` |
| `has_class` | `unit -> class` |
| `chains` | `party -> workflow` |

If a relation source/target cannot be resolved from a trusted owner surface or
metadata-only event, do not create the edge unless the export is explicitly a
private candidate view.

## Visual Encoding Contract

One visual variable has exactly one meaning.

| Visual variable | Meaning | Default value source |
| --- | --- | --- |
| Node size | Cumulative node usage. | `usage_rollup.counts_by_target[].total_access_count` |
| Node opacity | Node recency. | `usage_rollup.counts_by_target[].last_access_timestamp_utc` |
| Node color | Node type. | `node_type` |
| Node border color | Trust / claim ceiling. | `claim_ceiling` or owner-surface fallback |
| Node border style | Lifecycle state. | `status` |
| Edge width | Cumulative relationship strength. | edge evidence count or `strength_candidate` |
| Edge opacity | Relationship recency. | latest edge evidence timestamp |
| Edge color | Relation type. | `relation_type` |
| Edge style | Relation state. | `relation_state` |
| Arrow | Directionality. | relation matrix or explicit `directed` |

Do not use color for trust when node color already means node type. Do not use
edge width for recency when edge opacity already means recency.

## Default Metrics

Node size:

| Count | Size |
| --- | --- |
| `0` | `8px` |
| `1` | `14px` |
| `2-4` | `24px` |
| `5-9` | `36px` |
| `10+` | `52px` |

Node and edge opacity:

| Last evidence age | Opacity |
| --- | --- |
| `<= 30 days` | `1.0` |
| `<= 90 days` | `0.7` |
| `<= 180 days` | `0.4` |
| `> 180 days` | `0.2` |
| no evidence | `0.15` |

Edge width:

| Evidence count | Width |
| --- | --- |
| `1` | `1px` |
| `2-4` | `2px` |
| `5-9` | `4px` |
| `10+` | `6px` |

Runtime controls may change thresholds, palettes, visible node types, visible
relation types, and layout preset. They must not change the meaning of each
visual variable.

Interactive previews may expose a node-size basis switch. In `usage` mode, node
size means cumulative access count. In `degree` mode, node size means currently
visible connection count after node and relation filters. The active control
label must make the current meaning visible to the operator.
Interactive previews may also expose display-only global and relative node-size
scale controls. Global scale changes every node radius together; relative scale
changes the visible gap between small and large nodes. These controls do not
change the source metric or graph data.

The 3D operations preview may add interaction state such as focus depth,
selected node, and dimming. Interaction state changes which visible nodes are
emphasized, but it must not reinterpret node color, node size, edge width, or
other declared visual variables.

Runtime connectivity counters in an interactive preview should describe the
currently visible filtered graph. Full-export connectivity remains available in
`graph.json` as a generated diagnostic.

Interactive previews may add background component halos or hulls to make weak
components visible. Component halos mean "currently visible connected
component" and must not replace node color, because node color remains reserved
for node type.
Previews may expose component-halo style controls, such as dotted spherical cloud,
single-line, or stronger-line outlines. These controls change only component
visibility, not component membership or graph data.
If a glow style is used, it should stay boundary-biased enough that the
component reads as a group outline rather than a center-heavy cloud.
Runtime controls may tune halo point spacing, point size, opacity, depth,
inner radius, jitter, and shape. These controls remain presentation-only and
must not change component membership or graph data.
Interactive previews may persist local view settings in browser storage for a
specific export id. Saved settings may restore layout, filters, palettes, node
scale controls, component-halo controls, focus depth, and time thresholds, but
they remain local presentation state and must not alter exported graph JSON,
source refs, component membership, or claim state.

## Trust And Lifecycle

Trust / claim ceiling values:

- `observed`
- `source_supported`
- `validated_private`
- `canon_candidate`
- `canon_entry`
- `rejected_or_blocked`
- `unknown`

Lifecycle values:

- `active`
- `draft`
- `candidate`
- `blocked`
- `superseded`
- `retired`
- `unknown`

When claim values conflict, render the weakest supported claim. When a node
comes directly from an accepted canon owner surface and no weaker claim is
recorded for the same scoped view, the default trust is `canon_entry`.

## Layout Presets

v0 layout presets:

| Layout preset | Meaning |
| --- | --- |
| `force_3d` | Default Three.js spatial force layout for the operations preview. |
| `semantic_shell` | 3D node-type anchor shell plus local force relaxation. |
| `radial_layers` | 3D concentric layers by node type. |
| `force_auto` | Automatic force layout from graph links. |
| `semantic_regions` | Fixed regions by node type. |
| `hybrid_regions_force` | Region anchors plus local force relaxation. |
| `radial_focus` | Selected focus node in the center with related nodes around it. |

The view preset decides what to include. The layout preset decides where to
place it. Visual encoding decides how to read it.

## Export Surface Split

`retrieval_plan_command`:

- reads a metadata-only `graph.json` or builds the same graph in memory;
- returns selected-node-aware `candidate_nodes`, one-hop relation paths, source
  refs, claim ceilings, coded missing-evidence items, coded next-action items,
  and a `detection_card` render contract;
- may run in question-only mode or selected-node mode through an explicit
  `node_ref`; selected-node mode pins the selected node as the primary candidate
  without loading source text or generating an answer;
- fails when an explicit `graph_ref` is requested but not found, instead of
  silently switching to another graph;
- does not load source text, run vector search, query NotebookLM, assemble
  citations, generate answers, mutate graph data, or promote canon;
- is a navigation and sourcebound review planning surface only.

`metadata_rag_manifest`:

- is generated by `guild_hall/rag` from metadata-only graph/canon data;
- carries source handles, graph-node retrieval units, graph bindings, lens
  profile ids, claim ceilings, and validation blockers;
- does not contain source text, chunk text, excerpts, embeddings, vector
  payloads, NotebookLM answers, private projection prose, raw mail, secrets, or
  runtime absolute paths;
- may feed future graph projections and retrieval indexes, but it is not source
  truth, owner approval, ontology acceptance, or canon promotion.

`rag_manifest_projection`:

- is loaded only from explicit `--rag-manifest-ref` inputs;
- embeds a sanitized `rag_projection` block in generated `graph.json`;
- may annotate existing graph nodes with `node.rag` metadata such as readiness,
  allowed answer use, lens profile ids, source-handle counts, validation
  blockers, and weakest claim ceiling;
- may add 3D preview filters for all manifest-linked nodes, answer-ready nodes,
  and named manifest lens profiles;
- must reject unsafe manifest refs, runtime absolute paths, raw source locators,
  and source/body/chunk/vector/NotebookLM/private payload fields;
- does not load source text, query external services, run vector search, mutate
  graph/canon data, or generate answers.

`manifest_answer_command`:

- reads a validated metadata-only `rag_manifest_v0`;
- returns a metadata answer with graph-node/source-handle citations and current
  claim ceiling;
- returns `blocked_insufficient_manifest_evidence` when the manifest does not
  contain enough matching metadata;
- does not load source text, run vector search, query NotebookLM, call an LLM,
  mutate graph data, or promote canon.

`source_slice_card_set`:

- is generated by `guild_hall/rag` from an explicit or generated
  `rag_manifest_v0`;
- records metadata-only source readiness cards for later owner-approved
  source-text preprocessing and index building;
- may carry source handles, safe metadata locators, sensitivity labels,
  approval state, covered graph-node refs, claim ceilings, blocker codes, and
  planned processing status;
- must reject unknown card fields and source/body/chunk/vector/BM25/NotebookLM
  payload fields;
- does not load source text, create chunks, create embeddings, create BM25 or
  vector indexes, assemble citations, generate answers, mutate graph data, or
  promote canon.

`source_slice_triage_register`:

- is generated by `guild_hall/rag` from a validated `source_slice_card_set`;
- applies the existing wiki/source intake criteria before owner-review backlog
  grows;
- may carry registered metadata-knowledge items, owner-review items, blocked
  items, criteria pass/fail labels, claim ceilings, safe locators, graph-node
  refs, and metadata fingerprints;
- may mark public-safe passing cards as `rag_metadata_knowledge_only`;
- treats owner-defined metadata criteria as standing policy for metadata
  registration while keeping stronger permissions false by default;
- must not grant owner approval, source-text retrieval permission, index-build
  permission, NotebookLM packet membership, public canon promotion, source
  truth, or ontology acceptance.

`source_slice_review_queue`:

- is normally generated by `guild_hall/rag` from a validated
  `source_slice_triage_register`;
- prepares metadata-only owner-review items only for triage hold or blocked
  decisions;
- may carry source slice refs, source handles, safe metadata locators,
  sensitivity labels, observed owner-approval labels, claim ceilings, covered
  graph-node refs, blocker codes, recommended decision labels, and metadata
  fingerprints;
- must keep all items `pending_owner_review`, with no applied decision, no
  source-text retrieval permission, and no index-build permission;
- does not approve sources, load source text, create chunks, create embeddings,
  create BM25/vector indexes, assemble citations, generate answers, mutate
  graph data, or promote canon.

`source_slice_triage_projection`:

- is loaded only from explicit `--source-slice-triage-register-ref` inputs;
- may be enriched by explicit `--source-slice-review-queue-ref` inputs;
- embeds a redacted `source_slice_projection` block in generated `graph.json`;
- may annotate existing graph nodes with `node.source_slice` metadata such as
  source-slice counts, metadata registration counts, owner-review counts,
  blocked counts, registration status, weakest claim ceiling, and stronger
  permission default-false state;
- may add 3D preview filters for all nodes, metadata-registered nodes,
  owner-review nodes, blocked nodes, and stronger-permission-needed nodes;
- must reject unsafe refs, wrong schema/kind, missing metadata-only boundaries,
  granted source-text/index/NotebookLM/public-canon permissions, applied owner
  decisions, runtime absolute paths, and source/body/chunk/vector/BM25/
  NotebookLM/private payload fields;
- must not expose source text, source-handle arrays, source locator payloads,
  chunks, indexes, NotebookLM answers, secrets, or applied approval decisions;
- does not approve sources, load source text, create chunks, create embeddings,
  create BM25/vector indexes, query external services, mutate graph/canon data,
  or promote canon.

`obsidian_canon_read_view`:

- generated read-only markdown view;
- canon-backed knowledge notes only by default;
- no raw source payloads, NotebookLM answers, private projection text, secrets,
  or runtime absolute paths.

`operations_graph_view`:

- generated metadata-only graph JSON and HTML preview;
- default HTML preview is a Three.js 3D view, with a generated 2D SVG fallback;
- supports node double-click focus for connected chains and background
  double-click to clear focus;
- may expose a node context menu for local exploration actions such as copying
  a Codex-ready exploration prompt, focusing visible connections, or copying a
  node ref. Prompt contents must remain metadata-only and must not copy raw
  private payloads, secrets, or stronger authority claims;
- may expose `탐지 카드 열기` for a selected node. The browser-side card should
  mirror the retrieval-plan render contract (`candidate_nodes`, one-hop
  `relation_paths`, `source_refs`, `missing_evidence_items`,
  `next_action_items`, `detection_card`) using only the embedded graph metadata.
  It must not call NotebookLM, Codex bridge, vector search, source readers,
  answer generation, graph mutation, or canon promotion;
- may localize display labels and show a palette legend, as long as the
  underlying `node_type` and `relation_type` values remain unchanged in data;
- may include projects, workflows, parties, species, classes, units, model
  metadata, validation metadata, and usage counts when the selected input source
  is allowed;
- candidate signals only until owner/review gates accept stronger claims.

Workflow profile policy extraction:

- `.workflow/*/profile_policy.yaml` `primary_profile.species` emits
  `workflow -> species` as `recommends`.
- `.workflow/*/profile_policy.yaml` `primary_profile.class` emits
  `workflow -> class` as `recommends`.
- These edges mean "the workflow profile policy recommends this execution
  species/class." They do not prove that a real run used that profile.

## Required Source Trace

Each generated node and edge should carry enough source refs to explain the
value without copying payloads:

```yaml
node_ref: ".registry/knowledge/source_criticism"
node_type: knowledge
source_refs:
  node_type: ".registry/knowledge/source_criticism/knowledge.yaml"
  metrics: "<usage_rollup_row_ref>"
  trust: ".registry/knowledge/source_criticism/knowledge.yaml"
  lifecycle: ".registry/knowledge/source_criticism/knowledge.yaml"
```

Refs must be repo-relative, ledger-relative, or abstract metadata refs. Runtime
absolute paths must not be embedded in public graph exports.

## Connectivity Analysis

Each operations graph export should include a generated `connectivity_analysis`
block so sparse or disconnected previews can be checked against the data rather
than judged only by layout.

Minimum fields:

- `weak_component_count`
- `largest_component_size`
- `isolated_count`
- `relation_counts`
- `by_node_type`
- `dangling_edge_refs`
- `source_edge_gap_scout`
- `current_extraction_scope`
- `possible_missing_relation_surfaces`

Connectivity analysis is an observed diagnostic. A high isolated count does not
prove the ontology is wrong by itself. It means the owner should decide whether
those nodes are expected scope exclusions or whether more relation extractors
are needed.

`source_edge_gap_scout` is metadata-only. It may report `source_supported`
knowledge nodes that have source-support metadata but no current `source`
endpoint through `supports` or `derived_from` edges. It must not copy source
refs, load source text, create source nodes, create edges, or promote source
truth, owner approval, ontology acceptance, or canon status.

## Validation Expectations

Minimum v0 checks:

- every visual variable has one declared semantic;
- every node has `node_ref`, `node_type`, `label`, `source_refs`,
  `trust.claim_ceiling`, and `lifecycle.status`;
- every edge has `from_ref`, `to_ref`, `relation_type`, `relation_state`,
  `directed`, and source refs;
- every export reports connectivity diagnostics for weak components, isolated
  nodes, dangling edges, relation counts, and node-type degree rollups;
- graph output is metadata-only and contains no raw payloads;
- Obsidian export is generated/read-only and does not claim authority;
- operations graph output does not execute archive/retire, canon promotion,
  ontology acceptance, source approval, or owner decisions.
