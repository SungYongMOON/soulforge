# guild_hall/dev_worker

## Purpose

`dev_worker/` owns the bounded branch-producing automation lane for Soulforge development work.

The lane is intentionally narrower than a general autonomous developer. It selects one explicit task packet, prepares enough context for Codex automation, expects a task branch, and records the result for review.

## What Belongs Here

- automation specs and prompt templates
- preflight helpers for clean `main` / fast-forward sync
- task packet discovery and branch-name suggestion helpers
- candidate queue listing and approved-candidate promotion helpers
- low-risk candidate auto-approval policy checks
- tests for deterministic selection and sanitization behavior

## What Does Not Belong Here

- account tokens or credentials
- raw project files
- `_workspaces/**` material
- automatic merge-to-main logic
- broad self-directed backlog mining

## Command Surface

```bash
npm run guild-hall:dev-worker:preflight -- --local-root <Soulforge root>
npm run guild-hall:dev-worker:claim -- --local-root <Soulforge root> --json
npm run guild-hall:dev-worker:candidates -- --local-root <Soulforge root> --workmeta-root <_workmeta root> --json
npm run guild-hall:dev-worker:candidates -- --local-root <Soulforge root> --workmeta-root <_workmeta root> --auto-approve --json
npm run guild-hall:dev-worker:candidates -- --local-root <Soulforge root> --workmeta-root <_workmeta root> --auto-promote --json
npm run guild-hall:dev-worker:candidates -- --local-root <Soulforge root> --workmeta-root <_workmeta root> --promote-approved --json
npm run guild-hall:dev-worker:render -- --local-root <Soulforge root> --workmeta-root <_workmeta root> --private-state-root <private-state root>
```

## Task Sources

- public-safe: `.mission/<mission_id>/dev_worker_request.yaml`
- owner-only: `_workmeta/<project_code>/dev_worker_queue/*.yaml`
- owner-only candidate: `_workmeta/<project_code>/dev_worker_candidate_queue/*.yaml`

The helper only selects packets with `status: ready`, `status: queued`, or `status: open`.
Agent-generated ready packets also require `owner_approval.approved: true`.

Candidate packets are for agent-discovered work. They become executable only after the owner marks them approved and the promotion helper writes a ready packet into `dev_worker_queue`.
Low-risk candidates may request `auto_approval.requested: true`; the candidate helper approves only those that pass the tracked safe-path, safe-check, and risk-level policy before promotion.
