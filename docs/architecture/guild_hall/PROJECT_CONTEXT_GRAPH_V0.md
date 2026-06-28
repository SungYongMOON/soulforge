# Project Context Graph Projection v0

## Purpose

Project Context Graph Projection v0 defines how `guild_hall` and dev-ERP
consume the workspace-level project context graph model.

The workspace source/boundary contract is
[`../workspace/PROJECT_CONTEXT_GRAPH_MODEL_V0.md`](../workspace/PROJECT_CONTEXT_GRAPH_MODEL_V0.md).
This document focuses on the cross-project operating projection: how
haengbogwan loads graph context, asks Codex for bounded judgment, and emits
reviewable task/edge/fruit proposals.

The goal is not to make a decorative AI dashboard. The goal is to let the
haengbogwan engine answer one practical question:

> When a new event arrives, which project branch does it belong to, what work
> does it change, and what task or result should be created?

## Tree Metaphor

The human-facing view is a tree.

```text
project trunk
  -> context branch
     -> event leaf
        -> task fruit
```

- `project trunk`: the project mission, scope, current SE stage, and active
  project identity.
- `context branch`: a running work line such as document response, test,
  quality, delivery, meeting, schedule, procurement, risk, or customer response.
- `event leaf`: an incoming mail, voice note, meeting note, schedule change,
  deliverable update, or manual owner note.
- `task fruit`: a task, decision, accepted deliverable result, closure evidence,
  or completed response that proves the branch produced something.

The workspace model owns project-local ledgers. The `guild_hall` projection is
rebuildable from those ledgers plus dev-ERP metadata and approved source refs.

## Authority Split

Codex may read local source text in an approved private runtime and suggest
meaning. Code owns durable identity and apply authority.

| Owner | Owns |
| --- | --- |
| Codex judgment | Meaning extraction, branch suggestion, task/fruit proposal, short redacted rationale. |
| Deterministic code | IDs, deduplication, source refs, graph mutation, ledger writes, existing-task preservation, redaction checks. |
| Owner/team | Final business decision, external send, final assignee confirmation, source truth acceptance. |

The graph is an operational index with provenance. It is not source truth by
itself.

## Owner Decision Defaults

Captured from the 2026-06-28 owner grill-me decisions:

- Use a hybrid axis: schedule/milestone lines plus work branches.
- When branch placement is ambiguous, prefer a new branch candidate over a
  forced merge.
- The engine may apply safe context links and create task candidates or tasks
  when action is needed. Assignee and due date changes stay review/proposal
  items.
- Every input becomes graph context before task projection; inputs that do not
  require action remain context-only events.
- Context loading is layered as L0 index, L1 project graph summary, L2 branch
  summary, L3 related event detail, and L4 source layer.
- Related branch summaries refresh immediately. The project-wide summary
  refreshes daily in the MVP; change-volume refresh can be added later.
- Milestones are independent nodes linked to the relevant work branches.
- People, teams, and bots are actor nodes. Team edges may be automatic; person
  and bot edges require high confidence or stay candidates.
- Fruits are either small fruits or representative fruits. Fruit creation emits
  a close candidate instead of automatically closing a task.
- Human ERP/graph views must support drag-and-drop branch merge and move.

## Node Types

| Type | Meaning |
| --- | --- |
| `project_trunk` | One project root, keyed by `project_code`. |
| `context_branch` | A continuing work line inside a project. |
| `event_leaf` | A mail, voice, schedule, deliverable, meeting, or manual event. |
| `task` | A task candidate or confirmed task. |
| `fruit` | A completed result, decision, accepted response, submitted deliverable, or closure evidence. |
| `milestone` | A schedule or milestone node connected to affected work branches. |
| `actor` | A person, team, or bot that participates in work. |
| `entity` | An organization, deliverable, requirement, quality item, or external counterpart. |
| `source_ref` | Metadata pointer to the real source payload. |

Recommended branch seeds:

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

## Edge Types

| Edge | Meaning |
| --- | --- |
| `belongs_to` | Node belongs to a project trunk. |
| `on_branch` | Event/task/fruit is attached to a context branch. |
| `derived_from` | Node was derived from a source ref or judgment. |
| `mentions` | Event mentions an entity, milestone, deliverable, or task. |
| `creates_task` | Event creates a task candidate or task. |
| `updates_task` | Event updates an existing task. |
| `closes_task` | Event or fruit closes a task. |
| `close_candidate` | Event or fruit suggests task closure for review. |
| `produces_fruit` | Task produces a result/decision/deliverable/response. |
| `milestone_for` | Milestone is connected to a work branch or task. |
| `merged_into` | Branch, task, or event context has been merged into another node. |
| `moved_to_branch` | Human or code moved a node from one branch to another. |
| `blocks` / `unblocks` | Event or task changes blocking state. |
| `depends_on` | Task or branch depends on another node. |
| `duplicates` | Event or task is a duplicate of another node. |
| `supersedes` | New event/result replaces a previous event/result. |

## Lifecycle States

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

Authority status is recorded separately:

- `llm_suggested`
- `code_applied`
- `owner_confirmed`
- `rejected`

## Source Boundary

Raw mail bodies, attachments, audio, transcripts, office documents, credential
files, and provider raw payloads are not stored in public architecture docs or
`_workmeta` reports.

Allowed persisted graph evidence:

- source pointer
- source kind
- external id or hash
- occurred time
- project code
- body/content hash
- redacted label
- judgment id
- confidence
- short redacted rationale
- task/branch/fruit proposal

The source payload remains in `_workspaces/**`, `private-state/**`, runtime
mailbox state, or another owner-approved source store.

## Minimal Data Contract

The first implementation can live in SQLite projection tables or metadata CSVs.
The contract is table-shaped on purpose so it can later be exported to Neo4j,
GraphRAG, or another graph engine without changing the business model.

`context_source`

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

`context_node`

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

`context_edge`

- `edge_id`
- `project_code`
- `from_node_id`
- `to_node_id`
- `edge_type`
- `state`
- `confidence`
- `judgment_id`
- `evidence_source_ids`

`context_judgment`

- `judgment_id`
- `project_code`
- `tool_model`
- `context_pack_hash`
- `input_event_node_id`
- `proposal_json`
- `rationale_redacted`
- `confidence`
- `created_at`

`context_review_queue`

- `review_id`
- `project_code`
- `proposal_type`
- `reason`
- `risk_level`
- `owner_decision`
- `applied_at`

## Event Intake

Every input becomes an `event_leaf` before it becomes a task.

Mail:

- source kind: `mail`
- stable refs: message id, provider source id, thread id, mailbox/account ref,
  received time, source hash
- content: private runtime only

Voice:

- source kind: `voice`
- stable refs: session id, captured time, duration, transcript hash, source
  pointer
- content: private runtime only

SE schedule:

- source kind: `se_schedule`
- stable refs: milestone id, calendar/event id when available, old/new date
  hash, affected deliverable/stage

Deliverable or quality input:

- source kind: `deliverable`, `quality`, or `test`
- stable refs: deliverable id, evidence pointer, version/hash, stage

## Algorithm

1. `ingest`: put the source payload in the approved source store and create
   metadata/hash/pointer rows.
2. `fingerprint`: compute duplicate and thread candidates from source refs,
   hashes, time, counterpart, and project hints.
3. `project resolve`: attach the event to a project trunk or to a review inbox
   if the project is unclear.
4. `branch retrieve`: load only the relevant trunk, candidate branches, open
   tasks, recent fruits, important schedule items, and actor/role hints.
5. `semantic judge`: Codex proposes one or more operations:
   `connect_branch`, `new_branch_candidate`, `merge_branch`, `move_branch`,
   `new_task`, `update_task`, `close_candidate`, `fruit`, `ignore`, or
   `needs_owner`.
6. `deterministic gate`: code validates schema, hashes, source refs, forbidden
   raw fields, duplicate risk, branch existence, and authority.
7. `apply or queue`: safe low-risk graph edges, high-confidence branch merge,
   and action-needed task creation can be applied; ambiguous task creation,
   low-confidence branch merge/move, task close, due changes, final assignee,
   quality/delivery decisions, and external-send actions go to a review/proposal
   queue.
8. `fruit pass`: when work is completed, create or accept a fruit node linked
   to the task and evidence source refs.

## Context Loading

Codex should not receive the whole project every time. It receives a bounded
context pack.

For one event, load progressively:

- `L0 index`: source id, project hint, thread/group ids, event time, mailbox or
  capture refs, hashes, and prior conversion refs.
- `L1 project graph summary`: project trunk, current milestones, open branch
  list, risk/deadline summary, and accepted representative fruits.
- `L2 branch summaries`: candidate branch summaries, active tasks on those
  branches, actor hints, branch-level blockers, and recent small fruits.
- `L3 related event detail`: recent event leaves on the same thread, milestone,
  branch, or source group; this layer may include redacted excerpts only when
  the runtime boundary allows it.
- `L4 source layer`: raw mail body, transcript, meeting note, or attachment
  derived text only inside an approved private runtime. This layer is used
  often during initial graph construction, then less often as L1-L3 summaries
  become trustworthy.

The context pack may include local source text only in a private runtime lane.
Persisted packs and reports must be redacted.

Summary refresh policy:

- Update L0 and the affected event/edge rows for every input.
- Refresh related L2 branch summaries immediately after classification.
- Refresh the L1 project-wide summary once per day in the MVP.
- Add change-volume based project summary refresh later when branch/event counts
  make daily refresh too stale.

## Weekend MVP

First build a metadata-only graph triage MVP.

Scope:

- one project
- synthetic/redacted fixtures
- mail events plus manual voice/schedule stubs
- no raw payload persistence
- dry-run by default
- four MVP views: mail reading queue, per-project work tree, today task board,
  and graph visualization

Implementation order:

1. Add graph fixtures for one project trunk, three branches, several event
   leaves, open tasks, and fruits.
2. Add table/CSV contract helpers for `context_source`, `context_node`,
   `context_edge`, `context_judgment`, and `context_review_queue`.
3. Teach the current haengbogwan reading output `work_context_groups[]` and
   `context_key` to become `context_branch` suggestions.
4. Add a context pack builder that loads branch-local tasks/fruits/events.
5. Add L0-L4 context pack layers and summary-refresh metadata.
6. Add a Codex judgment JSON shape for graph operations.
7. Add a dry-run graph planner that emits suggested edges, task candidates,
   fruit candidates, merge/move operations, and review queue rows.
8. Add tests proving new task, existing task update, branch connection, fruit
   candidate, duplicate suppression, and raw-payload rejection.

Success criteria:

- Given ten incoming redacted/synthetic events, the engine can classify each as
  new task, update existing task, branch context update, fruit candidate,
  ignore, or needs owner.
- Context links and action-needed task creation can be automated in dry-run;
  assignee changes, due date changes, and close candidates are reviewable.
- No raw body, transcript, attachment payload, local source path, or secret
  appears in persisted output.
- The result can be reviewed as a tree while remaining exportable as graph
  edges.

## MVP Views

All views read the same graph projection. They must not fork separate state.

- `mail reading queue`: shows incoming events, their branch/task judgment, and
  review reasons.
- `per-project work tree`: shows project trunk, milestone nodes, work branches,
  event leaves, tasks, and fruits.
- `today task board`: shows due, overdue, blocked, waiting, review-needed, and
  action-needed tasks from the graph/task projection.
- `graph visualization`: shows nodes and edges for context investigation,
  including merge/move history.

## Existing Soulforge Fit

This design extends existing surfaces instead of replacing them.

- `haengbogwan_reading_context_packet.mjs`: mail body-aware source-event input.
- `haengbogwan_reading_candidate_judge.mjs`: current `context_key` and
  `work_context_groups[]` become branch seeds.
- `haengbogwan_reading_codex_judge.mjs`: Codex judgment stays bounded JSON.
- `haengbogwan_context_packet.mjs`: metadata-only context lane remains useful
  for non-body or pre-filtered graph context.
- `haengbogwan_snapshot.mjs` / `haengbogwan_run.mjs`: can later summarize graph
  branches, overdue fruits, and review queues.
- `role_*` / actor overlay tables: supply team/person/bot hints.
- `core_item` and task ledgers: remain the task projection and task write path.
- `ai_proposal`: remains the safer landing surface for review-before-mutation.

## Non-goals

- Do not adopt Neo4j or another graph database in v0.
- Do not make the graph the source truth.
- Do not let Codex own ID, deduplication, final apply, final assignee, or
  external send.
- Do not store raw source payloads in public repo or `_workmeta`.
- Do not create a decorative multi-agent dashboard.
- Do not close tasks automatically just because a fruit was created.
- Do not close quality/delivery/schedule decisions automatically.
