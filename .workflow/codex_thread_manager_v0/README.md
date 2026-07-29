# codex_thread_manager_v0

`codex_thread_manager_v0` is a public-safe pilot-ready workflow package for
making the declared Codex thread the main team lead that manages context
lifecycle and coordinates subagent-first Codex role worker, worktree worker, and
rollover manager threads while keeping verifier and judge lanes fresh-context.

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
  policy, no-subagent exception policy, thread id/title recording, and compact
  delegation packet minimum fields.
- Fresh-context verifier/judge/reviewer routing for independent acceptance,
  workflow-check, and readiness claims.
- Cross-worker result routing, integration, and validation closeout.
- Project-manager-first work classification, one-primary-owner assignment,
  out-of-scope reclassification, TASK logical roles and start/change/complete
  gates, and new-versus-existing TASK decisions.

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

### Project work assignment and TASK routing

The reusable human-facing contract is
`docs/architecture/guild_hall/PROJECT_WORK_ORGANIZATION_AND_TASK_ROUTING_V0.md`.
Task Engine authority remains owned by
`docs/architecture/workspace/PROJECT_TASK_ENGINE_LIFECYCLE_V0.md`; this workflow
references that boundary and does not redefine it.

This project assignment extension applies only when project scope is confirmed.
`[SYSTEM]`, AX, ERP, COMMON, and other non-project work keep their existing
owner routing. Shared packets record inapplicable project-extension fields as
`not_applicable` instead of inventing a project or project responsibility lane.

- The project CEO or operations manager classifies incoming project work first.
- Record exactly one primary responsibility owner. Other responsibilities are
  collaborators or independent reviewers, never co-primary owners.
- A responsibility owner accepts only in-scope work. Return out-of-scope work
  without performing it, with the reason and a suggested primary owner.
- Escalate unclear or conflicting classification to the project CEO or
  operations manager.
- Record the responsibility owner, executor or agent, independent reviewer, and
  acceptance or approval authority as distinct logical roles. They are not
  necessarily four people; separation is risk-tailored, and an implementer
  self-check is not independent review.
- Start a new TASK for a new deliverable, multi-step execution, separate
  Verification, Validation, independent review, or acceptance. Continue an
  existing TASK only for a small refinement with the same objective, primary
  owner, scope, baseline, interface, approval scope, and acceptance criteria.
- Pass the start gate before creating or executing a TASK. Re-enter
  classification at the change gate when objective, requirements, baseline,
  interface, owner, or acceptance changes. Claim completion only after
  objective evidence and the defined acceptance are present.
- Scope acceptance never finalizes a human assignment or authorizes sending,
  purchasing, payment, contracting, baseline approval, public release, or
  final acceptance, completion approval, or another external side effect.

### Stable manager directory maintenance

- Stable manager route create, rollover, retire maintenance applies only to
  routes already registered in the private stable catalog under the
  `CODEX_WORK_DIRECTORY_V1` contract. Runtime discovery may verify or maintain
  those routes but must not invent a route from a task/thread listing.
- Ephemeral role or worktree workers remain children of the current bounded
  work and do not become permanent manager routes automatically.
- Directory maintenance produces no message-send, execution, party, or
  default-route authority. Ambiguous, stale, retired, unknown, or
  `do_not_route` results fail closed.
- Use subagents for non-durable side work that can be integrated immediately:
  focused investigation, noisy search, small non-acceptance verification, or
  parallel analysis.
- Use Codex worker threads for durable lanes that need a title/id, follow-up,
  overnight or cross-PC continuity, a separate phase, long-running execution, or
  manager integration after independent work.
- Split substantial work into role worker threads such as research, synthesis,
  verification, coding, and documentation.
- Use worktree worker threads for file mutation when checkout isolation or
  disjoint write scope is needed.
- Use fresh-context verifier or judge threads, or fresh bounded subagents when a
  durable thread is unnecessary, for independent review, acceptance judgment,
  workflow-check, readiness claims, or adversarial review. Do not fork or
  continue the implementer for that judgment.
- Treat fork, rollover, and continuation as same-role continuity surfaces, not
  independence evidence. An implementer self-check can find bugs, but it does
  not satisfy independent verification.
- Worker threads are subagent-first lane controllers. For substantive research,
  implementation, analysis, debugging, or review work, workers create fresh
  bounded subagents by default and integrate result packets rather than doing
  the whole lane in their own accumulating context.
- Worker direct execution is allowed only for named no-subagent exceptions:
  lane planning and packet authoring, small deterministic local checks, result
  integration, validator/status commands, manager-authorized narrow mechanical
  edits, unavailable or blocked subagent tools, or cases where a safe minimal
  packet cannot be created without boundary risk. Workers record the exception.
- The worker subagent count is scope-driven, not fixed. Worker prompts state
  objective, context refs, current state, acceptance criteria, allowed
  read/write scope, side-effect limits, subagent-first posture, reporting shape,
  any count limit or denial, execution-contract claim ceiling, stop conditions,
  and no-subagent exceptions.
- Manager may route bounded result packets between worker threads or ask one
  fresh, non-implementer worker to review another worker's result.
- Fresh manager threads are for rollover, continuity transfer, mission boundary
  changes, context drift, 24-hour span, or explicit user request.

## What It Does Not Own

- Stable route source truth or local live binding source truth.
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
4. Classify project work, record one primary owner plus collaboration,
   independent review, and acceptance authority, then return or escalate
   out-of-scope or unclear work.
5. Decide whether the work starts a new TASK or continues an existing TASK, and
   check the start gate.
6. Plan the thread team topology and context lifecycle.
7. Choose the continuation surface using the subagent-vs-thread routing rules.
8. Prepare role worker, worktree worker, or fresh manager packets with bounded
   scope, handoff context, compact report shape, subagent-first bounded
   subagent authority, any count limit or denial, no-subagent exceptions,
   side-effect limits, execution-contract claim ceiling, stop conditions, and
   conflict protocol.
9. Prepare verifier or judge packets from minimal evidence: objective, changed
   refs, acceptance criteria, validators, claims, and risk areas; exclude raw
   transcript and avoid leaking the intended fix except where necessary.
10. Observe thread ids/titles and acceptance results.
11. Apply the change gate when scope or decision inputs change.
12. Route bounded result packets between workers when useful.
13. Integrate worker summaries after checking actual state.
14. Check the complete gate, then run validators and
    `$soulforge-workflow-check`.
15. Close out with the claim ceiling, blockers, next action, and knowledge
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
been proven. The project responsibility-assignment and TASK-gate addition is a
source-supported operating synthesis and has not executed a live assignment or
TASK pilot. It is not an ISO or other standards-conformity claim.
