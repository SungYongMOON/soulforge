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
- Allow a worker thread to create bounded subagents by default when useful.
  The worker packet must state the allowed purpose, scope, reporting shape, and
  any denial or limit.
- Treat each worker thread as the controller for its own bounded lane. A worker
  thread may use subagents to explore, implement, verify, or review inside that
  lane and must report the subagents it used.
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
  investigation, noisy code search, independent review, small verification, or
  parallel analysis that can be integrated immediately.
- Use a Codex worker thread when the work needs durable history, a title/id,
  follow-up, overnight or cross-PC continuity, a separate phase lane, a
  long-running task, or manager integration after independent execution.
- Split durable work into role threads when useful: research, synthesis,
  verification, coding, documentation, or project-specific lanes.
- Use a worktree worker thread when the worker will mutate files and write
  scope overlaps the foreground checkout or another worker.
- Use a fresh manager thread only for rollover, continuity transfer, mission
  boundary changes, context drift, 24-hour span, or explicit user request.
- When creating a worker thread, include whether subagents are allowed by
  default, the subagent scope, reporting shape, and side-effect limits. The
  normal setting is bounded subagents allowed with no hardcoded count.
- A worker thread may create subagents within its packet scope without asking
  again. It must not create further Codex worker threads, automations, `.party`
  chains, default-route changes, or canon entries unless the manager granted
  that specific authority.
- Manager may pass bounded result packets between worker threads or ask one
  worker to review another worker's result. Prefer summaries, changed refs,
  validator outputs, and explicit questions over raw logs.

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
7. For worker threads, provide title, objective, allowed paths, stop conditions,
   claim ceiling, report shape, and subagent bounds or denial.
8. For worktree workers, require disjoint write scope or worktree isolation and
   tell workers not to revert others' changes.
9. Govern recursive fan-out by bounded rules. Workers and subagents may create
   bounded subagents within the packet scope, but creating further worker
   threads, automations, or canon entries requires manager permission.
10. Integrate worker/subagent results only after checking actual file, status,
    and thread state.
11. Run deterministic validators and `$soulforge-workflow-check` before
    readiness, registration, default-route, or production claims.
12. Close with thread titles/ids when available, manager lifecycle action,
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
conflicting active goal, or exhausted user-specified budget.
