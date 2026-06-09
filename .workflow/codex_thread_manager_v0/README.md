# codex_thread_manager_v0

`codex_thread_manager_v0` is a public-safe pilot-ready workflow package for
making the declared Codex thread the main team lead that manages context
lifecycle and coordinates actual Codex role worker, worktree worker, and
rollover manager threads.

It formalizes the `$soulforge-codex-thread-manager` launcher behavior as a
registered workflow bridge without claiming production readiness, default-route
safety, or party binding.

## Current State

- `output_state: registered`
- `validation_level: private_one_worker_pilot_observed`
- registered in `.workflow/index.yaml`
- registry skill bridge: `.registry/skills/codex_thread_manager/`
- no party package or default route has been created
- no full manager rollover or worktree worker pilot has run
- private live pilot evidence:
  `_workmeta/system/reports/post_development_review/20260608_thread_orchestrator_live_pilot_one_worker.yaml`

## What It Owns

- Goal and boundary declaration for Codex thread orchestration.
- `NIGHT_WORK_HANDOFF` refresh before worker creation, compact, clear, rollover,
  cross-PC/overnight continuation, or substantial closeout.
- Explicit `$soulforge-codex-thread-manager` invocation with an actionable goal
  as authorization for the declared thread to act as main team lead and create
  role worker threads when runtime thread tools are available.
- Selection among current-thread manager plus worker, same thread, fresh manager
  thread, worktree worker thread, and subagent.
- Manager lifecycle and rollover policy.
- Role worker topology, worker prompt packet shape, worker subagent bounds
  policy, and thread id/title recording.
- Cross-worker result routing, integration, and validation closeout.

## Context Lifecycle

- Keep `NIGHT_WORK_HANDOFF` as the structured continuity object for the manager
  and worker team.
- Refresh handoff before creating workers, compacting, clearing, rolling over a
  manager, cross-PC/overnight continuation, or substantial closeout.
- Compact when continuing the same large goal and context pressure, drift, or a
  meaningful unit boundary justifies preserving only durable state.
- Clear or start fresh at phase boundaries when old context is more likely to
  distract than help. Resume from the checkpoint.
- Re-anchor long phases with active goal, completed work, constraints,
  blockers, worker state, and next action.

## Routing Rules

- Use subagents for non-durable side work that can be integrated immediately:
  focused investigation, noisy search, independent review, small verification,
  or parallel analysis.
- Use Codex worker threads for durable lanes that need a title/id, follow-up,
  overnight or cross-PC continuity, a separate phase, long-running execution, or
  manager integration after independent work.
- Split substantial work into role worker threads such as research, synthesis,
  verification, coding, and documentation.
- Use worktree worker threads for file mutation when checkout isolation or
  disjoint write scope is needed.
- Worker threads may create bounded subagents inside their assigned lane by
  default. The count is scope-driven, not fixed. Worker prompts state the
  subagent scope, reporting shape, any count limit or denial, and side-effect
  limits.
- Manager may route bounded result packets between worker threads or ask one
  worker to review another worker's result.
- Fresh manager threads are for rollover, continuity transfer, mission boundary
  changes, context drift, 24-hour span, or explicit user request.

## What It Does Not Own

- Source truth, owner approval, or canon promotion outside this package.
- Raw transcripts, private payloads, NotebookLM answer bodies, or secrets.
- Codex product capability guarantees across accounts or future releases.
- `.workflow/index.yaml` registration.
- `.party` binding or default route switching.
- Production readiness without fresh B/V and workflow-check evidence.

## Operating Summary

1. Bind the goal, workspace scope, boundary, success criteria, and stop
   conditions.
2. Refresh `NIGHT_WORK_HANDOFF`.
3. Treat the declared thread as main team lead by default for actionable skill
   invocations.
4. Plan the thread team topology and context lifecycle.
5. Choose the continuation surface using the subagent-vs-thread routing rules.
6. Prepare role worker, worktree worker, or fresh manager packets with bounded
   scope, handoff context, compact report shape, default bounded subagent
   authority, any count limit or denial, and side-effect limits.
7. Observe thread ids/titles and acceptance results.
8. Route bounded result packets between workers when useful.
9. Integrate worker summaries after checking actual state.
10. Run validators and `$soulforge-workflow-check`.
11. Close out with the claim ceiling, blockers, next action, and knowledge
   trigger result.

## Party Policy

Do not create a `.party` package just because this workflow exists. Create or
bind a party only when several workflows must be chained under a reusable service
surface and an owner explicitly requests that chain.

## Claim Ceiling

This package is a registered public-safe orchestration structure with one
private one-worker pilot observation. It is not a production-ready route, not a
default route, and not evidence that full manager rollover, unbounded worker
subagent fan-out, multi-worker team execution, or worktree worker execution has
been proven.
