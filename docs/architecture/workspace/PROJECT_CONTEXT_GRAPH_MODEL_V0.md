# Project Context Graph Model v0

## Purpose

This document fixes the workspace-level contract for per-project context.
The graph is one representation of that context, not the purpose by itself. It
describes how project work context is represented without copying raw project
payloads into public canon or `_workmeta` reports.

The graph supports the haengbogwan engine by connecting mail, voice notes,
systems-engineering schedule events, deliverables, tasks, decisions, teams,
people, bots, and completed results.

## Human Model

Use a tree metaphor for the project view.

```text
project trunk
  -> context branch
     -> event leaf
        -> task/result fruit
```

- `project trunk`: project identity, scope, current SE stage, and mission.
- `context branch`: a continuing work stream inside the project.
- `event leaf`: one incoming or observed event.
- `fruit`: a completed task, accepted result, decision, submitted deliverable,
  or closure evidence.

The implementation may store a graph under this tree, because one event can
touch multiple branches.

## Durable Context Layers

The durable project context is not one generated prose file. It is an
append-only chain of exact evidence and reviewed relationships:

```text
source revision
  -> source span
  -> context event
  -> context unit
  -> context branch
  -> project context
  -> reviewed memory candidate
  -> candidate-only TaskIntent
```

- `source span`: an exact metadata locator such as a voice offset range, mail
  part/paragraph, Slack message revision, document page/sheet/cell, or run
  receipt ref. It does not copy source text or bytes.
- `context event`: one proposed or reviewed meaning such as request,
  commitment, decision, change, risk, completion claim, or status update.
- `context unit`: a small bounded episode that links related events, for
  example request -> commitment -> work evidence -> completion claim.
- `context branch`: a medium-lived project workstream or SE concern.
- `project context`: the long-lived project history assembled from accepted
  units, branches, exact source refs, current gaps, and revision lineage.
- `memory candidate`: a reviewed-reuse candidate derived from project context.
  It is not accepted Wiki/RAG knowledge and is not an external agent's private
  preference memory.

Short, medium, and long context therefore mean `context unit`, `context
branch`, and `project context`. They are durable metadata layers; a bounded
query-time context pack selects from them but does not recreate the whole
history from scratch.

## Owner Decision Defaults

These defaults were captured from the 2026-06-28 owner grill-me decisions.

- The organizing axis is a hybrid of schedule/milestone lines and work
  branches.
- If branch placement is ambiguous, create or suggest a new branch first.
- Automatic merge is allowed after deterministic duplicate/confidence checks;
  a person must be able to merge or move branches by drag-and-drop in ERP or
  the graph view.
- Every input is stored as graph context first. A task is created only when the
  event implies action.
- MVP automation may apply context links and task creation only under an exact bounded deterministic
  policy authority. Otherwise it emits a TaskDriver/task candidate. Assignee and due date changes
  remain review/proposal items.
- Context loading uses layers: L0 index, L1 project summary, L2 branch summary,
  L3 related event detail, and L4 source layer.
- Source reading is expected to be frequent early, then reduced as summary
  layers accumulate.
- Summary refresh updates related branch summaries immediately and the whole
  project summary once per day; change-volume based refresh can be added later.
- Milestones are independent nodes connected to work branches by edges.
- People, teams, and bots are actor nodes. Team links may be automatic; person
  and bot links should stay candidates unless confidence is high.
- Fruits may be small fruits or representative fruits. A fruit never closes a
  task automatically; it creates a close candidate for review.
- MVP consumers should expose four views over the same graph state: mail
  reading queue, per-project work tree, today task board, and graph
  visualization.

## Workspace Boundary

Project context is the project-local operational state that helps ERP task
intake, classification, review, and traceability. The graph is the relationship
view over that context. Neither the context ledger nor the graph view is the
source payload or final source truth.

Raw/source payloads stay in approved source stores:

- `_workspaces/<project_code>/**`
- `_workspaces/system/**`
- `private-state/**`
- runtime mailbox state
- another owner-approved shared worksite

`_workmeta/<project_code>/project_context/**` is the live project-context state.
It may store only metadata, hashes, source pointers, redacted labels, graph
nodes/edges, judgments, summaries, review states, and validation receipts.

`_workmeta/<project_code>/reports/context_graph/**` is a report/projection area.
It may store snapshots, review exports, screenshots metadata, or debug reports
derived from `project_context/**`; it is not the live state owner.

Forbidden in `_workmeta` project-context ledgers and reports:

- raw mail body
- attachment payload
- raw audio
- transcript body
- HWP/HWPX/PDF/Office body text copied as payload
- provider raw payload
- local absolute source path when it exposes private host layout
- `.env`, token, password, cookie, session, credential, or secret value

## ERP, MCP, And Client Boundary

`_workmeta/<project_code>/project_context/**` remains the project-context
canon. dev-ERP may build a replaceable read model or accepted-generation index
from it, but the ERP projection is not a second context truth.

```text
_workmeta project_context canon
        -> accepted-generation projector
        -> ERP read model / ACL
        -> ERP UI or MCP
        -> per-PC Codex plugin or optional agent client
```

- ERP owns official task, schedule, assignment, approval, and completion state.
- MCP and client plugins query ERP services; they do not traverse or write
  `_workmeta` directly.
- A client correction, checkpoint, or closeout is a proposal/receipt. The
  authorized project-context writer validates it before appending context
  metadata.
- Binary download uses an authorized source/artifact revision through the
  approved data plane. It never exposes a client-supplied filesystem path.
- The TARGET normal topology has one fenced HPP project-context writer.
  Existing `haengbogwan_project_context.mjs` remains the current compatibility
  writer until a bounded cutover proves replay, generation parity, and
  rollback. Mac mini and work PCs have no normal project-context write
  authority.

## Minimum Project-Local State

Current project-local live metadata lives under:

```text
_workmeta/<project_code>/project_context/
```

Current v0 compatibility files:

- `branches.csv`
- `occurrences.csv`
- `sources.csv`
- `nodes.csv`
- `edges.csv`
- `judgments.csv`
- `review_queue.csv`
- `summaries/project_summary.md`
- `summaries/branch_summaries.csv`

The additive TARGET layout is:

```text
_workmeta/<project_code>/project_context/
├─ source_spans/<YYYY-MM>.jsonl
├─ events/<YYYY-MM>.jsonl
├─ units/<YYYY-MM>.jsonl
├─ memberships/<YYYY-MM>.jsonl
├─ summaries/
│  ├─ project_summary.md
│  ├─ branch_summaries.csv
│  └─ revisions/
│     ├─ unit/<YYYY-MM>.jsonl
│     ├─ branch/<YYYY-MM>.jsonl
│     └─ project/<YYYY-MM>.jsonl
├─ memory_candidates/<YYYY-MM>.jsonl
└─ projections/erp_receipts/<YYYY-MM>.jsonl
```

All TARGET JSONL owners are append-only. Corrections append a new immutable
record with exact predecessor/supersession refs; they never rewrite the source
span, event, unit, summary revision, or memory candidate. Current CSV/Markdown
files remain rebuildable human/read-model projections.

The same accepted generation may be projected into dev-ERP SQLite tables for
query performance. A projection receipt must bind the project, input
generation/digest, output generation/digest, writer epoch, and row counts so
the ERP read model can be rebuilt or rolled back without changing
`project_context/**`.

### Minimum TARGET record responsibilities

| owner | required responsibility |
| --- | --- |
| `source_spans` | exact source/revision/locator refs, native clock/relative offset refs, KST business-event projection, no source text |
| `events` | semantic type, state, evidence span refs, producer/model/policy revision, confidence band, `valid_at`/`known_at`/`recorded_at`, correction lineage |
| `units` | bounded episode identity, current state, branch candidate/confirmed state, event membership digest, review state |
| `memberships` | append-only event-to-unit and unit-to-branch relations with exact evidence/judgment refs |
| `summary revisions` | short/unit, medium/branch, and long/project summaries with input generation and supersession refs |
| `memory_candidates` | reviewed-reuse proposal, scope, evidence refs, reviewer state, revocation/supersession refs; no automatic Wiki/RAG promotion |
| `erp_receipts` | accepted-generation projection/parity/rollback evidence; never context truth |

Report/projection outputs may be written under:

```text
_workmeta/<project_code>/reports/context_graph/
```

Examples:

- `daily_snapshot_<date>.md`
- `review_export_<run_id>.yaml`
- `graph_debug_<run_id>.json`

Reports must be rebuildable from `project_context/**`, dev-ERP task state, and
approved source refs.

## Context Construction And Authority

Programs own IDs, hashes, exact spans, KST normalization, dedupe, append-only
lineage, replay, projection, and parity checks. Deterministic rules may propose
low-risk labels. A local model or Codex may propose semantic events, units,
branch placement, summaries, memory candidates, or TaskIntent candidates only
when its exact input revisions, model/engine revision, policy revision, and
evidence refs are recorded.

If an eligible semantic model is unavailable or the evidence is ambiguous, the
record stays `inference_pending`, `unclassified`, `held_conflict`, or
`human_review_required`. Collection, custody, annotation, and read-only query
continue without inventing context.

Context inference may use only an explicit bounded pack:

1. exact source spans and source-native annotations;
2. accepted project history and current branch/unit summaries;
3. approved common systems-engineering knowledge revision refs;
4. company rules with their normative authority;
5. current ERP task/schedule state as a read-only input.

Common SE knowledge is advisory, company rules are normative, and neither may
overwrite project facts. Project/common scope is explicit and has no implicit
fallback or cross-project leakage.

## Source Rows

`sources.csv`

- `source_id`
- `project_code`
- `source_kind`
- `store_ref`
- `external_ref`
- `content_hash`
- `metadata_hash`
- `occurred_at`
- `ingested_at`
- `redaction_profile`
- `raw_payload_copied` must be `false`

`source_kind` examples:

- `mail`
- `voice`
- `se_schedule`
- `meeting`
- `deliverable`
- `quality`
- `test`
- `manual_note`

For the three-input project lane, use the existing source kinds without
inventing a second context owner:

1. `mail`: mailbox or reviewed project-mail source pointer.
2. `voice`: original recording plus the versioned independent-transcript
   pointer. Provider transcript text is not the independent evidence layer.
3. `se_schedule`: owner-held schedule, milestone, or stage-plan pointer.

The three inputs meet first as event/source metadata. A private runtime may
read approved payloads to suggest a project branch, milestone relation, or task
candidate, but only pointers, hashes, redacted labels, claim state, and review
status persist in `project_context/**`. Missing or conflicting schedule truth
stays an owner question; a voice statement does not change an SE milestone by
itself. A reviewed speaker sidecar may propose an `actor` relation, but raw
enrollment audio or embeddings never enter project context and an unreviewed
voice match never assigns an owner or attendee.

## Node Rows

`nodes.csv`

- `node_id`
- `project_code`
- `node_type`
- `subtype`
- `title_redacted`
- `state`
- `authority_status`
- `claim_ceiling`
- `created_at`
- `updated_at`

Node types:

- `project_trunk`
- `context_branch`
- `event_leaf`
- `context_unit` (TARGET projection of an accepted/reviewed unit)
- `task`
- `task_driver` (TARGET projection; current runtime support claim 아님)
- `fruit`
- `milestone`
- `actor`
- `entity`
- `source_ref`
- `memory_candidate` (TARGET projection; accepted knowledge 아님)

## Edge Rows

`edges.csv`

- `edge_id`
- `project_code`
- `from_node_id`
- `to_node_id`
- `edge_type`
- `state`
- `confidence`
- `judgment_id`
- `evidence_source_ids`
- `raw_payload_copied` must be `false`

Edge types:

- `belongs_to`
- `on_branch`
- `contains_event` (TARGET unit membership projection)
- `contains_unit` (TARGET branch membership projection)
- `supported_by_span` (TARGET exact evidence projection)
- `derived_from`
- `mentions`
- `creates_task`
- `updates_task`
- `closes_task`
- `close_candidate`
- `produces_fruit`
- `milestone_for`
- `merged_into`
- `moved_to_branch`
- `blocks`
- `unblocks`
- `depends_on`
- `duplicates`
- `supersedes`
- `requires_owner_decision`
- `triggered_by`
- `justified_by`
- `justifies`

## Judgment Rows

`judgments.csv`

- `judgment_id`
- `project_code`
- `tool_model`
- `context_pack_hash`
- `input_event_node_id`
- `proposal_ref`
- `rationale_redacted`
- `confidence`
- `created_at`
- `raw_payload_copied` must be `false`

The full Codex runtime input packet may contain local source text only in a
private runtime lane. The persisted judgment record must not copy the source
payload back into `_workmeta`.

## Review Queue

`review_queue.csv`

- `review_id`
- `project_code`
- `proposal_type`
- `reason`
- `risk_level`
- `owner_decision`
- `applied_at`

The following should default to review/proposal instead of direct mutation:

- task creation from ambiguous context
- existing task close
- due date change
- final assignee confirmation
- low-confidence branch merge or move
- quality or delivery decision
- customer-facing response approval
- external send action
- source truth acceptance

High-confidence branch merge may be applied by code after deterministic
duplicate/confidence checks. Human drag-and-drop merge or move actions must be
recorded as graph operations with source/review receipts; they must not rewrite
or erase the original source event.

## Lifecycle

Event leaf:

```text
ingested -> classified -> linked | needs_review -> applied | rejected
```

Task decision/application (TARGET):

```text
candidate -> review_required -> approved -> applied | rejected | superseded
```

Task work status (TARGET):

```text
not_started -> in_progress | waiting | blocked -> done | cancelled | merged -> archived
```

현행 `core_item.status`와 위 두 축의 보수적 crosswalk, TaskDriver authority와 replay 계약은
`PROJECT_TASK_ENGINE_LIFECYCLE_V0.md`가 소유한다. context graph는 이를 표시하는 projection이며
두 번째 task writer가 아니다.

Fruit:

```text
draft -> accepted | superseded
```

Edge:

```text
suggested -> applied | rejected
```

Authority status:

- `llm_suggested`
- `code_applied`
- `owner_confirmed`
- `rejected`

## Branch Seeds

Start with a small set. Do not create a new branch for every subject line.

- `requirements`
- `architecture`
- `design`
- `document_response`
- `test`
- `quality`
- `delivery`
- `schedule`
- `meeting`
- `procurement`
- `risk`
- `customer_response`
- `owner_question`

## Relation To Existing Contracts

- Mail-derived work state remains compatible with `MAIL_WORK_STATUS_V0.md`.
- Voice capture raw/transcript payload boundaries remain governed by
  `VOICE_CAPTURE_MVP_V0.md`.
- Schedule and deadline facts remain compatible with `DEADLINE_WATCH_V0.md`.
- SE stage interpretation remains compatible with `SE_DUNGEON_STAGE_MODEL_V0.md`.
- Cross-project projections and dashboards should read this model rather than
  inventing a separate source-truth graph.
- TaskDriver and two-axis task lifecycle are governed by
  `PROJECT_TASK_ENGINE_LIFECYCLE_V0.md`; this graph only projects their refs and states.
- Cross-lane KST occurrence annotations and correction lineage remain governed
  by `SOURCE_TIMELINE_ANNOTATION_V1.md`.
- Exact source/knowledge revisions, bitemporal cutoff, and knowledge promotion
  remain governed by `TEMPORAL_KNOWLEDGE_ONTOLOGY_V0.md`.
- Personal ERP MCP and Codex plugins consume accepted projections through
  `CODEX_TEAM_WORKSPACE.md` and `ERP-MCP-V0.md`; they are not context writers.
