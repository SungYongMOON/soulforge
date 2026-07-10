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
- MVP automation may apply context links and task creation. Assignee and due
  date changes remain review/proposal items.
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

## Minimum Project-Local State

Future project-local live metadata should live under:

```text
_workmeta/<project_code>/project_context/
```

Recommended files:

- `sources.csv`
- `nodes.csv`
- `edges.csv`
- `judgments.csv`
- `review_queue.csv`
- `summaries/project_summary.md`
- `summaries/branch_summaries.csv`

The same shape may be projected into dev-ERP SQLite tables later. The CSV shape
comes first so another PC can inspect and recover the state.

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
itself.

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
- `task`
- `fruit`
- `milestone`
- `actor`
- `entity`
- `source_ref`

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

Task:

```text
candidate -> open -> in_progress | waiting | blocked -> done | cancelled | merged
```

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
