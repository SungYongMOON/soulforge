# Manager coordination and acceptance training — Internal RC candidate

- Artifact ref: `artifact.manual.manager_training.v0_1_0`
- Compatibility: `>=0.1.0 <1.0.0`
- Catalog target: `candidate` / `current` after catalog registration; no verified release or trainee exercise acceptance is recorded.

## Purpose

Train a manager to coordinate work without silently becoming every system's writer or technical accepter: assess evidence, select the accountable owner, request a bounded action, read receipts, route review, and preserve human acceptance boundaries. This manual does not grant task-writer, artifact-acceptance, release, budget, personnel, or external-send authority.

## Prerequisites

- A named manager trainer and a public-safe/synthetic scenario with exact owner pointers are supplied.
- The scenario separates task state, context/evidence, artifact revision, agent/runtime, backup/restore, and external-source ownership.
- Any real escalation is routed to its existing owner; this manual supplies no default route or broad administrative grant.

## Allowed and forbidden actions

- Allowed: interpret a candidate/receipt/HOLD/unknown state; rehearse an owner-specific request; verify a Work Brief's review and escalation bindings; file a bounded Watch/Bastion-style request where its policy allows.
- Forbidden: approving one's own result, treating a Bot response or delivery receipt as consumer acknowledgement, setting Official Done, changing a task/asset/agent/runtime, releasing a product, using staff data, or escalating through an ambiguous/stale route.

## Exact repo-relative commands and interfaces

```powershell
npm.cmd run validate:authority-taxonomy
npm.cmd run validate:forge-intent
npm.cmd run validate:watch-bastion
```

- `guild_hall/authority_taxonomy/README.md` is the public-safe A0–A6 and R0–R4 interpretation guide; it is not a live enforcement writer.
- `guild_hall/forge_intent/src/forge_intent_core.mjs` makes approval, assignment, and Work Brief binding separate steps.
- `guild_hall/watch_panel_contract/src/watch_panel_contract.mjs` and `guild_hall/bastion_action/src/bastion_action_gate.mjs` separate a filed request from an executed action.

## Expected readback and evidence

- The manager can identify the source of truth for a scenario and name the exact owner/writer/reviewer/acceptance role instead of using a general manager label.
- The manager can distinguish a proposal, task state, delivery receipt, consumer acknowledgement, review verdict, human acceptance, and release decision.
- Any exercise output is a training reference only. It grants no action level, risk tier, project access, or production operating authority.

## HOLD / stop

Stop on missing evidence, no safe owner pointer, ambiguous routing, stale/expired/revoked authorization, cross-project scope, self-approval, automatic completion request, or a need for an external effect. Treat `unknown` and `hold` as escalation inputs, never as permission to continue.

## Rollback and escalation

The training path has no automatic rollback side effect. Preserve the scenario/receipt/HOLD references and escalate to the exact task, artifact, runtime, backup, project, or Owner authority. If an action was actually performed outside training, its owning system's independent readback and rollback procedure apply.

## Known issues

- This candidate teaches coordination and acceptance boundaries; it is not a delegation engine, a manager console, or a universal approval surface.
- A manager's review does not replace domain technical acceptance or Owner-reserved decisions.
- This candidate has no `last_verified_release` and no exercise receipt, so it cannot release a manager-training path.
