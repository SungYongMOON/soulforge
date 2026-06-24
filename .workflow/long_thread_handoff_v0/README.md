# long_thread_handoff_v0

`long_thread_handoff_v0` is the public-safe Soulforge workflow for long-running,
overnight, cross-PC, or context-reset-prone work.

`NIGHT_WORK_HANDOFF` is not a default closeout requirement in this workflow. It
is created or refreshed only when unresolved forward-state must cross a context
boundary and is not already captured by commits, validation output, activity
logs, or open threads.

It keeps the main controller focused on goal, boundary, checkpoint, delegation,
integration, validation, context reset, and closeout. Explicit invocation makes
fresh subagent delegation the default for substantive work, subject only to
runtime availability and user authorization boundaries; local manager work
requires a named no-subagent exception.

## Current State

- `output_state: registered`
- `validation_level: structure_only_public_safe`
- `registration_policy: owner_requested_registration`
- no pilot execution has run for this workflow package
- no production-ready, default-route, external notification, or unattended
  automation claim is made

## What It Owns

- Goal and scope declaration.
- Conditional `NIGHT_WORK_HANDOFF` checkpoint shape.
- Manager context hygiene.
- Fresh subagent delegation packet shape, including objective, context refs,
  acceptance criteria, allowed scope, side-effect limits, verification, output
  shape, execution-contract claim ceiling, and stop conditions.
- No-subagent exception policy for cases where direct manager work replaces the
  default fresh-subagent path.
- Autonomous conditional handoff refresh, compact, and clear decision policy.
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
2. Decide whether unresolved forward-state must cross a context boundary; create
   or refresh `NIGHT_WORK_HANDOFF` only when it must.
3. Prepare bounded fresh-subagent delegation packets with objective, context
   refs, current state, acceptance criteria, read/write scope, side-effect
   limits, validators or validation gap, result packet shape, claim ceiling,
   and stop conditions; if direct manager work is used instead, record the
   no-subagent exception.
4. Integrate returned work by checking actual status, diffs, and files.
5. Run deterministic validators and boundary checks.
6. Decide whether to refresh handoff, compact, clear, or continue; clean bounded
   work closed by commit, push, self-verification, and no extra forward-state
   does not need a handoff.
7. Close out with claim ceiling, blockers, next action, and knowledge trigger.

## Claim Ceiling

This package is a registered public-safe orchestration structure. It is not a
pilot execution record and must not be used to claim production readiness,
default-route safety, owner approval, source truth, or external notification
success.
