---
name: soulforge-codex-thread-manager
description: Use when the user explicitly asks for Soulforge Codex thread management, invokes `$soulforge-codex-thread-manager`, says "Codex 스레드 매니저", "스레드파일럿", manager/worker/worktree thread orchestration, durable worker threads, manager rollover, or wants to coordinate actual Codex threads instead of only using subagents while preserving NIGHT_WORK_HANDOFF and public/private boundaries. Treat explicit invocation with an actionable goal as authorization for the current Codex thread to act as manager and create bounded worker Codex threads when thread tools are available. This is the Codex launcher for the registered `.workflow/codex_thread_manager_v0/` workflow.
---

# Soulforge Codex Thread Manager

Use this skill as a launcher for `.workflow/codex_thread_manager_v0`.

The workflow owns the actual procedure: goal binding, `NIGHT_WORK_HANDOFF`
refresh, continuation surface selection, manager lifecycle, worker packet shape,
worktree worker boundary routing, thread id/title recording, integration,
validation, workflow-check posture, and conservative closeout. Do not duplicate
or override that workflow inside this skill.

Use `$soulforge-long-thread-handoff` instead when the user wants the older
contamination-free long-thread handoff through fresh subagents rather than
actual Codex manager, worker, or worktree threads.

## Design Inputs

This skill is not only a video-derived pattern. It combines:

- the owner's operating idea: a declared Codex thread acts as the main team
  lead and creates actual Codex role threads for the work;
- `$soulforge-long-thread-handoff` context-management behavior: structured
  checkpointing, handoff refresh, compact, clear/reset, re-anchor, and manager
  closeout;
- the local context-management video notes as a secondary reference:
  YouTube `https://www.youtube.com/watch?v=NpfBwijf0-Y`.

Use local Codex runtime tools and Soulforge contracts as authority for exact
tool behavior.

## Core Contract

- Treat explicit invocation of this skill with an actionable goal as an
  explicit thread-orchestration request.
- Act as the main team lead in the declared/current Codex thread by default.
  Own goal declaration, context lifecycle, worker-thread assignment,
  inter-thread routing, integration, validation, and final reporting.
- After goal, boundary, and `NIGHT_WORK_HANDOFF` binding, create actual Codex
  worker threads for role lanes such as research, synthesis, verification, and
  coding when thread tools are available.
- Do not create a fresh manager thread by default. Use a fresh manager only for
  rollover, cross-PC/overnight continuity, 24-hour span, mission boundary
  change, context drift, or explicit user request.
- Use fork, rollover, or continuation only for same-role continuity. Do not use
  an implementer, implementer fork, or manager rollover as the independent
  verifier, judge, or acceptance reviewer for that implementer's work.
- For verification, review, judge, workflow-check, or acceptance lanes that can
  affect readiness or approval, create a fresh-context verifier thread or fresh
  bounded subagent from a minimal evidence packet. If that is unavailable, lower
  the claim ceiling or report blocked.
- Treat worker threads as subagent-first lane controllers. For substantive
  research, implementation, analysis, debugging, or review work, the worker
  should create fresh bounded subagents by default and integrate their result
  packets rather than doing the whole lane in its own accumulating context.
- Allow direct worker execution only for explicit no-subagent exceptions:
  lane planning and packet authoring, small deterministic local checks, result
  integration, validator/status commands, a narrow mechanical edit explicitly
  authorized by the manager packet, or when subagent tools are unavailable or a
  safe minimal packet cannot be made. Record the exception reason.
- The worker packet must state subagent-first posture, allowed purpose, scope,
  reporting shape, side-effect limits, and any no-subagent exception or count
  limit.
- Treat each worker thread as the controller for its own bounded lane. A worker
  thread should use subagents to explore, implement, debug, or self-check
  inside that lane and must report the subagents it used or why it did not
  create one. Its self-check is not independent verification of its own output.
- Worker subagent count is scope-driven, not fixed. The worker may use as many
  bounded subagents as the lane reasonably needs unless the manager packet sets
  a specific limit.
- If the user invokes only the skill name and the actionable goal is unclear,
  ask one concise question instead of creating a thread.

## Context Lifecycle

- Keep `NIGHT_WORK_HANDOFF` as the structured continuity object for the manager
  and worker team.
- Refresh handoff before worker creation, compacting, clearing, manager
  rollover, cross-PC/overnight continuation, and substantial phase closeout.
- Compact when continuing the same large goal and context pressure, drift, or a
  meaningful unit boundary makes preservation useful. Name the fields that must
  survive: goal, decisions, constraints, changed files, validators, blockers,
  worker ids/titles, rejected approaches, and next actions.
- Clear or start fresh at phase boundaries when old context is more likely to
  distract than help. Resume from the checkpoint, not from raw transcript.
- Re-anchor during long phases by restating active goal, completed work,
  constraints, blockers, worker state, and next action.
- Do not pass raw transcripts, private payloads, source dumps, secrets, or
  unnecessary tool output into handoff or worker packets.

## Routing Rules

- Use a subagent for bounded non-durable work inside the current lane: focused
  investigation, noisy code search, small non-acceptance verification, or
  parallel analysis that can be integrated immediately.
- Use a Codex worker thread when the work needs durable history, a title/id,
  follow-up, overnight or cross-PC continuity, a separate phase lane, a
  long-running task, or manager integration after independent execution.
- Split durable work into role threads when useful: research, synthesis,
  verification, coding, documentation, or project-specific lanes.
- Use a fresh verifier or judge thread when a lane must independently check,
  reject, approve, or acceptance-review prior work. The verifier packet should
  include objective, changed refs, acceptance criteria, validators, claims, and
  suspected risk areas; avoid raw transcript and avoid revealing the intended
  fix except where it is necessary evidence.
- Use a worktree worker thread when the worker will mutate files and write
  scope overlaps the foreground checkout or another worker.
- Use a fresh manager thread only for rollover, continuity transfer, mission
  boundary changes, context drift, 24-hour span, or explicit user request.
- When creating a worker thread, include that substantive lane work is
  subagent-first by default, plus the subagent scope, reporting shape,
  side-effect limits, and no-subagent exceptions. The normal setting is bounded
  subagents allowed with no hardcoded count.
- A worker thread may create subagents within its packet scope without asking
  again. It must not create further Codex worker threads, automations, `.party`
  chains, default-route changes, or canon entries unless the manager granted
  that specific authority.
- Manager may pass bounded result packets between worker threads or ask one
  fresh, non-implementer worker to review another worker's result. Prefer
  summaries, changed refs, validator outputs, and explicit questions over raw
  logs.

## Delegation Packet Minimum

Use the workflow's worker packet policy as the canonical contract. Every worker,
worktree worker, verifier, judge, or worker-created subagent packet must include:

- `title_or_packet_id`: thread title or stable packet id.
- `objective`: one bounded task goal and lane role.
- `context_refs`: exact checkpoint, files, sections, or command outputs to read.
- `current_state`: decisions, unknowns, blockers, worker state, and relevant
  prior results.
- `acceptance_criteria`: concrete pass conditions or the explicit reason they
  are not yet known.
- `allowed_scope`: read paths, write paths or read-only status, ownership, and
  conflict protocol for foreground or peer-worker edits.
- `constraints`: public/private boundary, secret and raw-payload exclusions, and
  forbidden paths or data classes.
- `side_effect_limits`: allowed and forbidden file, git, network, external,
  notification, thread, canon, party, automation, and default-route actions.
- `subagent_policy`: subagent-first posture, allowed purpose, count limit or no
  hardcoded count, and named no-subagent exceptions.
- `verification`: validators or checks to run, or the reason validation is not
  applicable.
- `output_shape`: subagents used or exception, changed or inspected refs,
  commands and exit status, validator results, blockers, residual risks, and
  next action.
- `claim_ceiling`: use the execution-contract vocabulary: observed,
  source_supported, validated_private, canon_candidate, canon_entry, or
  rejected_or_blocked; choose the weakest value supported by evidence.
- `stop_conditions`: owner decision, secret, unsafe boundary, overlapping write
  scope without worktree isolation, unavailable tool/model, unbounded fan-out,
  or failed validator outside scope.

For verifier, judge, review, workflow-check, or acceptance lanes, use a minimal
evidence packet with objective, changed refs, acceptance criteria, validators,
claims, and risk areas. The verifier must inspect actual files or status when
available and must not rely only on worker narrative.

## Operating Steps

1. Read `docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md`.
2. Read `.workflow/codex_thread_manager_v0/workflow.yaml`,
   `step_graph.yaml`, `handoff_rules.yaml`, and `profile_policy.yaml`.
3. Bind the bounded goal, workspace scope, success criteria, stop conditions,
   claim ceiling, and public/private boundary before thread actions.
4. Refresh `NIGHT_WORK_HANDOFF` before creating threads, compacting, clearing,
   rolling over a manager, or ending a substantial phase.
5. Choose the team topology: manager thread plus role worker threads by default
   for substantial actionable invocations, worktree worker thread for isolated
   file mutation, fresh manager thread for rollover, same thread for trivial
   preflight or blocked cases, or subagent for non-durable side checks.
6. Use thread tools when explicit skill invocation, explicit user wording, or
   durable worker/worktree needs authorize an actual thread lane and the
   runtime tools are available.
7. For worker threads, provide the Delegation Packet Minimum: title, objective,
   context refs, current state, allowed read/write scope, side-effect limits,
   stop conditions, claim ceiling, report shape, subagent-first default, and
   no-subagent exception rules.
8. For verifier, judge, review, workflow-check, or acceptance lanes, use a
   fresh-context thread or fresh bounded subagent with a minimal evidence
   packet. Do not fork or continue the implementer for independent judgment.
9. For worktree workers, require disjoint write scope or worktree isolation and
   tell workers not to revert others' changes.
10. Govern recursive fan-out by bounded rules. Workers and subagents may create
   bounded subagents within the packet scope, but creating further worker
   threads, automations, or canon entries requires manager permission. If a
   worker skips subagent creation for substantive work, it must report the
   applicable no-subagent exception.
11. Integrate worker/subagent results only after checking actual file, status,
    and thread state.
12. Run deterministic validators and `$soulforge-workflow-check` before
    readiness, registration, default-route, or production claims.
13. Close with thread titles/ids when available, manager lifecycle action,
    validation status, remaining blockers, next action, and
    `지식 트리거 확인: ...`.

## Naming Rule

Use concise Korean-facing thread titles:

```text
[<BUCKET>] <짧은작업명>/<역할>
```

Examples:

```text
[SYSTEM] 스레드파일럿/팀장
[SYSTEM] 스레드파일럿/조사
[SYSTEM] 스레드파일럿/검토
[P26-014] 자료정리/WT
```

Use `[SYSTEM]` for Soulforge system/reusable work, confirmed project codes for
company projects, and `/WT` only for worktree file-mutating workers.

## Boundary Rules

- This skill is a launcher, not a `.party` binding or default route.
- Do not copy raw transcripts, NotebookLM answer payloads, secrets,
  credentials, private payloads, account state, thread-internal hidden
  reasoning, or unneeded source text into public canon or handoff records.
- Local thread tools and installed skill files are runtime surfaces; the
  registered workflow and registry skill own the public-safe reusable contract.
- Do not claim `pilot-executed`, `production-ready`, `default-route-safe: yes`,
  or owner approval unless the required evidence and registration/default-route
  conditions are actually present.
- Do not switch a default route or create a `.party` chain without explicit
  owner request.

## Stop Conditions

Stop and report blocked when the next step requires a secret, external side
effect authorization, owner decision, unavailable thread/subagent tool,
unavailable model/profile, unsafe public/private boundary, overlapping worker
write scope, recursive fan-out, failed validator that cannot be fixed in scope,
unavailable independent verifier when a stronger claim requires one,
conflicting active goal, or exhausted user-specified budget.
