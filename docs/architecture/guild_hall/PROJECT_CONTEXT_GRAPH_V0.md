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

## Node Types

| Type | Meaning |
| --- | --- |
| `project_trunk` | One project root, keyed by `project_code`. |
| `context_branch` | A continuing work line inside a project. |
| `event_leaf` | A mail, voice, schedule, deliverable, meeting, or manual event. |
| `task` | A task candidate or confirmed task. |
| `fruit` | A completed result, decision, accepted response, submitted deliverable, or closure evidence. |
| `entity` | A person, team, bot, organization, deliverable, milestone, requirement, quality item, or external counterpart. |
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
| `produces_fruit` | Task produces a result/decision/deliverable/response. |
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
   `connect_branch`, `new_task`, `update_task`, `close_task`, `fruit`,
   `ignore`, or `needs_owner`.
6. `deterministic gate`: code validates schema, hashes, source refs, forbidden
   raw fields, duplicate risk, branch existence, and authority.
7. `apply or queue`: safe low-risk graph edges can be applied; task creation,
   task close, due changes, final assignee, quality/delivery decisions, and
   external-send actions go to a review/proposal queue.
8. `fruit pass`: when work is completed, create or accept a fruit node linked
   to the task and evidence source refs.

## Context Loading

Codex should not receive the whole project every time. It receives a bounded
context pack.

For one event, load:

- project trunk summary
- candidate branch summaries
- active tasks on those branches
- recent event leaves on the same thread or branch
- accepted fruits/decisions that constrain current work
- upcoming milestone/deadline hints
- role/actor/bot hints
- source refs and hashes

The context pack may include local source text only in a private runtime lane.
Persisted packs and reports must be redacted.

## Weekend MVP

First build a metadata-only graph triage MVP.

Scope:

- one project
- synthetic/redacted fixtures
- mail events plus manual voice/schedule stubs
- no raw payload persistence
- dry-run by default

Implementation order:

1. Add graph fixtures for one project trunk, three branches, several event
   leaves, open tasks, and fruits.
2. Add table/CSV contract helpers for `context_source`, `context_node`,
   `context_edge`, `context_judgment`, and `context_review_queue`.
3. Teach the current haengbogwan reading output `work_context_groups[]` and
   `context_key` to become `context_branch` suggestions.
4. Add a context pack builder that loads branch-local tasks/fruits/events.
5. Add a Codex judgment JSON shape for graph operations.
6. Add a dry-run graph planner that emits suggested edges, task candidates,
   fruit candidates, and review queue rows.
7. Add tests proving new task, existing task update, branch connection, fruit
   candidate, duplicate suppression, and raw-payload rejection.

Success criteria:

- Given ten incoming redacted/synthetic events, the engine can classify each as
  new task, update existing task, branch context update, fruit candidate,
  ignore, or needs owner.
- No raw body, transcript, attachment payload, local source path, or secret
  appears in persisted output.
- The result can be reviewed as a tree while remaining exportable as graph
  edges.

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
- Do not close quality/delivery/schedule decisions automatically.
