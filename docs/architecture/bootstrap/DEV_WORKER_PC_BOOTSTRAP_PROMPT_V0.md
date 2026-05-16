# Dev Worker PC Bootstrap Prompt v0

## Purpose

This document is the copy/paste prompt source for setting up a Soulforge PC as a bounded `dev_worker_pc`.

The worker PC consumes explicit task packets, creates reviewable task branches, validates them, and pushes only those branches. It does not become the public `main` owner, the merge authority, or the always-on operations node.

## User-Facing Prompt

```text
docs/architecture/bootstrap/DEV_WORKER_PC_BOOTSTRAP_PROMPT_V0.md 를 읽고 이 PC 를 dev_worker_pc 로 local-only bootstrap 해줘.
```

## Codex Execution Prompt

You are setting up a Soulforge development worker PC.

### Goal

Configure this PC so it can run the `guild_hall/dev_worker` lane:

- sync the public repo and optional owner-only companion repos
- select one ready task packet
- ignore candidate packets until they have been owner-approved or auto-policy-approved and promoted
- create a `codex/<node-id>-<task>` branch
- implement only the bounded packet scope
- run acceptance checks
- push the task branch for supervisor review

### Required Rules

- Read `AGENTS.md` first.
- Read `docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md`.
- Read `docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md`.
- Read `docs/architecture/guild_hall/DEV_WORKER_AUTOMATION_V0.md`.
- Do not read secret, token, credential, cookie, session, raw mailbox, or unrelated private runtime files.
- Do not commit or push local state under `guild_hall/state/**`.
- Do not push to `main`.
- Do not merge, force-push, reset, stash, or rewrite unrelated files.
- Process at most one task packet per run.
- Treat account tokens as local-only PC configuration. Do not write token values into task packets, activity logs, or tracked docs.

### Local Identity

Create or update this local-only file:

```text
guild_hall/state/local/node_identity.yaml
```

Recommended shape:

```yaml
schema_version: soulforge.local_node.v0
node_id: high_perf_dev_worker_01
node_role: dev_worker_pc
bootstrap_profile: owner-with-state

allowed_jobs:
  - dev_worker_run
  - dev_task_claim
  - dev_branch_push
  - validation
  - activity_report

blocked_jobs:
  - gateway_fetch_primary
  - night_watch_active
  - public_repo_auto_push_main
  - public_repo_auto_merge
  - broad_file_rewrite

primary_writer:
  public_repo: conditional
  public_task_branch: true
  workmeta: conditional
  private_state: false
  gateway_fetch: false
  night_watch: false

local_paths:
  soulforge_root: "<actual Soulforge root>"
  workmeta_root: "<actual Soulforge root>/_workmeta"
  private_state_root: "<actual Soulforge root>/private-state"
  local_runtime_root: "<actual Soulforge root>/guild_hall/state"

notes:
  - This file is local-only and must not be committed to public Git.
  - This node may push task branches, never main.
  - Secret values must be created or copied by the human owner only.
```

### Readiness Commands

Use the platform-appropriate `npm` command. On Windows PowerShell, use `npm.cmd` if script execution policy blocks `npm`.

```bash
npm run guild-hall:doctor -- --profile public-only --remote
npm run guild-hall:dev-worker:preflight -- --local-root "<actual Soulforge root>" --workmeta-root "<actual _workmeta root>" --private-state-root "<actual private-state root>" --json
npm run guild-hall:dev-worker:candidates -- --local-root "<actual Soulforge root>" --workmeta-root "<actual _workmeta root>" --json
npm run guild-hall:dev-worker:candidates -- --local-root "<actual Soulforge root>" --workmeta-root "<actual _workmeta root>" --auto-promote --json
npm run validate:dev-worker
```

The dev-worker preflight checks the public repo and any supplied `_workmeta` / `private-state` companion repos directly. Full `owner-with-state` doctor readiness is not required for this branch-producing lane unless the assigned task separately needs gateway, town-crier, mailbox, or other owner-operator runtime env.

### Automation Render

Render the local Codex app automation only after readiness checks pass:

```bash
npm run guild-hall:dev-worker:render -- --local-root "<actual Soulforge root>" --workmeta-root "<actual Soulforge root>/_workmeta" --private-state-root "<actual Soulforge root>/private-state"
```

Keep the rendered automation `PAUSED` until the owner explicitly activates this worker lane.

### First Manual Smoke

```bash
npm run guild-hall:dev-worker:preflight -- --local-root "<actual Soulforge root>" --workmeta-root "<actual _workmeta root>" --private-state-root "<actual private-state root>" --json
npm run guild-hall:dev-worker:candidates -- --local-root "<actual Soulforge root>" --workmeta-root "<actual _workmeta root>" --json
npm run guild-hall:dev-worker:candidates -- --local-root "<actual Soulforge root>" --workmeta-root "<actual _workmeta root>" --auto-promote --json
npm run guild-hall:dev-worker:claim -- --local-root "<actual Soulforge root>" --workmeta-root "<actual _workmeta root>" --json
```

The smoke may return `no_task`; that is acceptable if no ready packet exists.
The candidate smoke may return candidates; that does not mean the worker may run them.
Only owner-approved or auto-policy-approved candidates promoted into ready packets are claimable.

### Report Shape

Report:

```yaml
node_id:
node_role:
bootstrap_profile:
doctor_owner_state:
doctor_remote:
validate_dev_worker:
automation_rendered:
automation_status:
first_preflight:
candidate_queue:
first_claim:
secret_read: false
raw_mail_body_read: false
main_push_allowed: false
task_branch_push_allowed:
next_action:
```
