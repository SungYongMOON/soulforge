# long_thread_handoff_v0

`long_thread_handoff_v0` is the public-safe Soulforge workflow for long-running,
overnight, cross-PC, or context-reset-prone work.

It keeps the main controller focused on goal, boundary, checkpoint, delegation,
integration, validation, context reset, and closeout. Material work should be
delegated to fresh subagents when the runtime and user authorization allow it.

## Current State

- `output_state: registered`
- `validation_level: structure_only_public_safe`
- `registration_policy: owner_requested_registration`
- no pilot execution has run for this workflow package
- no production-ready, default-route, external notification, or unattended
  automation claim is made

## What It Owns

- Goal and scope declaration.
- `NIGHT_WORK_HANDOFF` checkpoint shape.
- Manager context hygiene.
- Fresh subagent delegation packet shape.
- Autonomous handoff refresh, compact, and clear decision policy.
- Integration validation route.
- Conservative closeout and knowledge trigger check.

## What It Does Not Own

- Source truth.
- Private payload storage.
- Secret inspection.
- Owner decisions.
- External notification authorization.
- Default route switching.
- Production readiness without fresh B/V evidence.
- Mutation of upstream workflow outputs.

## Operating Summary

1. Declare the goal, success criteria, stop conditions, and boundary.
2. Create or refresh `NIGHT_WORK_HANDOFF`.
3. Prepare bounded fresh-subagent delegation packets where useful.
4. Integrate returned work by checking actual status, diffs, and files.
5. Run deterministic validators and boundary checks.
6. Decide whether to refresh handoff, compact, clear, or continue.
7. Close out with claim ceiling, blockers, next action, and knowledge trigger.

## Claim Ceiling

This package is a registered public-safe orchestration structure. It is not a
pilot execution record and must not be used to claim production readiness,
default-route safety, owner approval, source truth, or external notification
success.
