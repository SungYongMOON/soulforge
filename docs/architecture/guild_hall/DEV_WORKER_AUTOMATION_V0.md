# DEV_WORKER_AUTOMATION_V0

## Purpose

- This document defines the bounded development worker lane for Soulforge.
- The lane lets a planning PC publish a small task packet, then lets one approved worker PC pull the packet, create a task branch, implement the bounded change, validate it, and push the branch for review.
- It does not make the worker PC a public `main` owner, merge authority, or always-on operations node.

## One-Line Definition

`dev_worker` is a branch-producing automation lane under `guild_hall/dev_worker`; it consumes explicit task packets and stops after a reviewable branch/report, not after merging to `main`.

## Owner Boundary

- `docs/architecture/guild_hall/DEV_WORKER_AUTOMATION_V0.md`
  - tracked policy and output contract for the lane
- `guild_hall/dev_worker/**`
  - deterministic helpers, automation prompt source, and task selection logic
- `.mission/<mission_id>/dev_worker_request.yaml`
  - public-safe task packet for Soulforge code/docs/UI work
- `_workmeta/<project_code>/dev_worker_queue/*.yaml`
  - owner-only task packet for project-local or private-context work
- `_workmeta/<project_code>/dev_worker_candidate_queue/*.yaml`
  - owner-only candidate packet for agent-discovered work that is not yet executable by a worker
- `guild_hall/state/operations/soulforge_activity/**`
  - local activity claim/report surface
- Codex app local automation
  - schedule, account binding, model choice, and ACTIVE/PAUSED state

The task packet is the handoff surface. The worker's local automation setting is not tracked canon and must be recreated per PC.

## Roles

| role | account intent | responsibility |
| --- | --- | --- |
| `portable_dev_pc` | low-cost supervisor account | write/review task packets, inspect worker branches, merge when appropriate |
| `dev_worker_pc` or approved `tool_pc` lane | high-capacity worker account | pull tasks, implement bounded patches, validate, push a branch |
| `always_on_node` | operations account | may monitor activity but must not run this lane by default |

## Current-Default Safety Rules

1. Only one worker automation is `ACTIVE` for a given task queue.
2. Each run handles at most one task packet.
3. The worker starts from clean `main` and creates a branch named `codex/<node-id>-<task-slug>`.
4. The worker may push that task branch after validation, but must not push directly to `main`.
5. The worker must not auto-merge, force-push, reset, stash, or rewrite unrelated files.
6. Public task packets must not contain raw mail, secret values, private runtime paths, or project-local payloads.
7. Private/project task packets live under `_workmeta/**`, not public `Soulforge`.
8. If validation fails, the worker pushes nothing unless the task packet explicitly permits a draft branch; it records the blocker in activity.
9. Protected public contract edits still require explicit owner approval and must be reported when `SOULFORGE_ALLOW_PUBLIC_CONTRACT_EDIT=1` is used.
10. Account tokens are local-only per PC. The task packet can say which lane should run, but must not include token values or account credentials.
11. Agent-generated work starts in `dev_worker_candidate_queue` with `status: proposed` unless the owner has explicitly approved it.
12. A ready task packet with `origin.kind: agent_generated` is not claimable unless `owner_approval.approved: true`.
13. Low-risk agent-generated candidates may be auto-approved only when they explicitly request `auto_approval`, pass the tracked auto-approval policy, and are promoted by the candidate helper.

## Task Packet Shape

Public-safe task packet:

```yaml
schema_version: soulforge.dev_worker_request.v0
task_id: dev_worker_sample_001
status: ready
lane: dev_worker
requested_by: portable_dev_pc
project_code: soulforge_public
summary: Add a narrow validator for a public-safe fixture.
branch_slug: public-fixture-validator
allowed_write_paths:
  - guild_hall/example/**
  - docs/architecture/guild_hall/EXAMPLE.md
acceptance_checks:
  - npm run validate:canon
stop_conditions:
  - secret_or_private_input_required
  - allowed_write_paths_insufficient
notes:
  - Keep the branch reviewable and do not merge to main.
```

Minimum required fields:

- `schema_version`
- `task_id`
- `status`
- `summary`
- `allowed_write_paths`
- `acceptance_checks`

Eligible statuses are `ready`, `queued`, and `open`. Completed, blocked, claimed, or draft packets are not selected by the default claim helper.

Agent-generated ready packets also need:

```yaml
origin:
  kind: agent_generated
owner_approval:
  required: true
  approved: true
  approved_by: owner
  approved_at: 2026-05-17T00:00:00.000Z
```

## Candidate Packet Shape

Agent-discovered work should be written as a candidate first:

```yaml
schema_version: soulforge.dev_worker_request.v0
task_id: improve_daily_packet_candidate
status: proposed
lane: dev_worker
requested_by: codex
project_code: system
summary: Add one missing field to the daily work packet report.
branch_slug: daily-packet-field
allowed_write_paths:
  - guild_hall/night_watch/**
  - guild_hall/dev_worker/**
acceptance_checks:
  - npm run validate:dev-worker
stop_conditions:
  - allowed_write_paths_insufficient
  - public_private_boundary_unclear
origin:
  kind: agent_generated
owner_approval:
  required: true
  approved: false
auto_approval:
  requested: false
notes:
  - Candidate only. Do not run on a worker until approved and promoted.
```

Candidate packets live under:

```text
_workmeta/<project_code>/dev_worker_candidate_queue/*.yaml
```

When the owner approves a candidate, set:

```yaml
status: approved
owner_approval:
  required: true
  approved: true
  approved_by: owner
  approved_at: <ISO timestamp>
```

Then promote it into the executable queue:

```bash
npm run guild-hall:dev-worker:candidates -- --promote-approved --json
```

The helper writes a ready packet under:

```text
_workmeta/<project_code>/dev_worker_queue/<task_id>.yaml
```

and marks the candidate as `status: promoted`.

## Auto-Approval Policy

The auto-approval lane exists so the worker PC can continue on low-risk maintenance work without making the owner manually approve every candidate.
It does not bypass the ready-task claim gate: auto-approved candidates still become ready packets with explicit `owner_approval.approved: true` and `approved_by: auto_policy:dev_worker_auto_approval_policy_v0`.

To be auto-approved, a candidate must:

1. include `auto_approval.requested: true`;
2. have `status: proposed` or `status: open`;
3. have `origin.kind: agent_generated`;
4. declare `risk_level: low` or `auto_approval.risk_level: low` / `routine`;
5. include all required task packet fields;
6. limit `allowed_write_paths` to the current safe set:
   - `docs/architecture/guild_hall/**`
   - `guild_hall/dev_worker/**`
   - `guild_hall/night_watch/**`
   - `CHANGELOG.md`
7. limit `acceptance_checks` to the current safe command set:
   - `git diff --check`
   - `npm run validate*`
   - `npm run done:check`
   - `node --test guild_hall/dev_worker/**`
   - `node --test guild_hall/night_watch/**`

The helper command:

```bash
npm run guild-hall:dev-worker:candidates -- --auto-approve --json
```

updates only eligible candidate packets to `status: approved`.
To approve and immediately promote eligible candidates into the executable ready queue:

```bash
npm run guild-hall:dev-worker:candidates -- --auto-promote --json
```

Auto-approval must not be used for:

- `.registry/**`, `.workflow/**`, `.party/**`, `.mission/**`, or `.unit/**` canon changes;
- foundation, workspace, UI, or public/private boundary contract edits;
- package install or dependency surface changes;
- secret, credential, account, mailbox, raw project payload, or private runtime access;
- worker runner authority, merge authority, force-push, reset, or direct `main` mutation;
- broad self-directed backlog mining without bounded `allowed_write_paths` and acceptance checks.

## Run Flow

1. Preflight sync checks public `Soulforge` and optional companion repos.
   The default doctor command is `public-only --remote` because this lane does not require gateway, town-crier, mailbox, or always-on operator env files; companion repo readiness is checked directly by the dev-worker preflight.
2. Claim helper selects the first eligible task packet by path order.
3. Worker creates `codex/<node-id>-<task-slug>` from `origin/main`.
4. Worker reads only the packet and allowed context needed for the task.
5. Worker edits only the allowed paths unless it stops and reports the mismatch.
6. Worker runs the packet's `acceptance_checks`.
7. Worker records an activity summary with branch, checks, result, and next action.
8. Worker pushes the task branch only when checks pass or when the packet explicitly permits a draft branch.
9. Supervisor reviews the branch and decides whether to merge.

## High-Performance PC Setup

After MacBook or supervisor development is pushed, the high-performance PC should be set up as `dev_worker_pc` or as an approved `tool_pc` using the dev-worker lane.

Required one-time setup:

```bash
git clone https://github.com/SungYongMOON/soulforge.git Soulforge
cd Soulforge
git clone https://github.com/SungYongMOON/soulforge-workmeta.git _workmeta
git clone https://github.com/SungYongMOON/soulforge-private-state.git private-state
npm install
npm install --prefix ui-workspace
npm run validate:dev-worker
npm run guild-hall:dev-worker:preflight -- --local-root "$PWD" --workmeta-root "$PWD/_workmeta" --private-state-root "$PWD/private-state" --json
npm run guild-hall:dev-worker:claim -- --local-root "$PWD" --workmeta-root "$PWD/_workmeta" --json
```

Render the local Codex automation only after the checks pass:

```bash
npm run guild-hall:dev-worker:render -- --install --local-root "$PWD" --workmeta-root "$PWD/_workmeta" --private-state-root "$PWD/private-state"
```

The rendered automation defaults to `PAUSED`. Keep it paused until the owner explicitly activates the worker lane on that PC.

Recurring worker behavior after activation:

1. pull public and private repos by fast-forward only
2. optionally auto-promote low-risk candidates through the tracked policy
3. list approved ready task packets
4. process at most one task
5. create a `codex/<node-id>-<task-slug>` branch
6. run the task's acceptance checks
7. push only the task branch
8. leave an activity report

It must not merge, push to `main`, read secrets, or edit outside `allowed_write_paths`.

## Output Contract

Each run should leave:

- activity event under `guild_hall/state/operations/soulforge_activity/events/YYYY/YYYY-MM.jsonl`
- optional detailed report under `guild_hall/state/operations/soulforge_activity/log/YYYY/YYYY-MM-DD/`
- pushed branch ref when implementation succeeds
- no direct `main` mutation by the worker automation

## Related Paths

- [`../../../guild_hall/dev_worker/README.md`](../../../guild_hall/dev_worker/README.md)
- [`SOULFORGE_ACTIVITY_LOG_V0.md`](SOULFORGE_ACTIVITY_LOG_V0.md)
- [`NIGHT_WATCH_AUTOMATION_V0.md`](NIGHT_WATCH_AUTOMATION_V0.md)
- [`../workspace/MULTI_PC_DEVELOPMENT_V0.md`](../workspace/MULTI_PC_DEVELOPMENT_V0.md)
