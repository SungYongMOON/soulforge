# Forge work generation and review — Internal RC candidate

- Artifact ref: `artifact.manual.forge_work_generation_review.v0_1_0`
- Compatibility: `>=0.1.0 <1.0.0`
- Catalog target: `candidate` / `current` after catalog registration; no verified release or human exercise acceptance is recorded.

## Purpose

Review one bounded work-generation path: accepted-context reference → Work Candidate → immutable TaskIntent → approval record → Official Task writer port → assignment → issued Work Brief. Forge prepares and checks this seam; it is not the Official Task system of record and it does not complete work.

## Prerequisites

- An exact accepted-context reference, Engine-finding references, proposed primary role, and independent review authority are supplied by their owners.
- The requested TaskIntent has an exact digest and expected prior state. No inferred context, newest-record fallback, or free-form work brief is permitted.
- A real task writer, if ever used, is separately approved and pinned; this repository's tracked writer adapter is synthetic only.

## Allowed and forbidden actions

- Allowed: validate the pure Forge contract; prepare and inspect a draft Work Brief; inspect missing critical bindings; review an exact intent/approval/assignment/brief reference chain.
- Forbidden: treating a candidate as an Official Task, writing Linear or another task system without its separate writer gate, selecting a person automatically, issuing an incomplete Work Brief, marking work done, accepting an artifact, or sending an external instruction.

## Exact repo-relative commands and interfaces

```powershell
npm.cmd run validate:forge-intent
npm.cmd run validate:forge-linear-execution-packet-admission
```

- `guild_hall/forge_intent/src/forge_intent_core.mjs` provides `createForgeIntentCore`, `draftWorkBrief`, and `issueWorkBriefFromDraft`.
- `ui-workspace/apps/dev-erp/src/forge_linear_execution_packet_admission.mjs` is the separate admission seam for an already observed Official Task/assignment/issued Work Brief.
- `docs/architecture/foundation/team_member_engineering_program/04_FORGE_AX_SE_WORK_AND_ENGINE.md` owns the work-generation policy.

## Expected readback and evidence

- Exact accepted-context, finding, candidate, intent, intent-digest, approval, assignment, and Work Brief references.
- For a draft, the complete `missing_bindings` view; a draft is not issuable material.
- For an issued brief, all eight required bindings, one primary role, assignment authority/epoch/expiry, and the required review role.
- A writer result only when the separately approved writer returns one; writer success is still not execution, result, review, acceptance, or Official Done.

## HOLD / stop

Stop when accepted context, finding, exact digest, approval, assignment authority/epoch/expiry, writer binding, or any Work Brief critical binding is absent, stale, rejected, held, or mismatched. Stop when a real task writer, project assignment, or automation would be inferred from a label, profile, or conversation.

## Rollback and escalation

Do not rewrite an intent, approval, assignment, or issued Work Brief to hide a mismatch. Preserve the exact reference and escalate to the context/Engine owner, assignment authority, or task-writer owner as appropriate. A rejected or held intent remains blocked; correction requires a new bounded proposal through its owner path.

## Known issues

- Forge is a pure in-memory seam; actual Linear writer binding, accepted-context supply, and physical assignment are held.
- An issued Work Brief is an execution input, not evidence that a worker ran or a result was accepted.
- This candidate has no `last_verified_release` and no exercise receipt, so it cannot release a work-generation workflow.
