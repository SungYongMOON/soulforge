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
