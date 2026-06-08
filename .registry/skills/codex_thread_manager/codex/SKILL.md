---
name: soulforge-codex-thread-manager
description: Use only when the user explicitly asks for Soulforge Codex thread management, "Codex 스레드 매니저", "스레드파일럿", manager/worker/worktree thread orchestration, durable worker threads, manager rollover, or wants to coordinate actual Codex threads instead of only using subagents while preserving NIGHT_WORK_HANDOFF and public/private boundaries. This is the Codex launcher for the registered `.workflow/codex_thread_manager_v0/` workflow.
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

## Operating Steps

1. Read `docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md`.
2. Read `.workflow/codex_thread_manager_v0/workflow.yaml`,
   `step_graph.yaml`, `handoff_rules.yaml`, and `profile_policy.yaml`.
3. Bind the bounded goal, workspace scope, success criteria, stop conditions,
   claim ceiling, and public/private boundary before thread actions.
4. Refresh `NIGHT_WORK_HANDOFF` before creating threads, compacting, clearing,
   rolling over a manager, or ending a substantial phase.
5. Choose the smallest safe continuation surface: same thread, fresh manager
   thread, worker thread, worktree worker thread, or subagent.
6. Use thread tools only when the user explicitly asks for a new/separate/fresh
   thread or when durable worker/worktree lanes are needed.
7. For worker threads, provide title, objective, allowed paths, stop conditions,
   claim ceiling, report shape, and whether subagents are allowed.
8. For worktree workers, require disjoint write scope or worktree isolation and
   tell workers not to revert others' changes.
9. Block recursive fan-out by default. Subagents and workers must not create
   further subagents, worker threads, automations, or canon entries unless the
   manager explicitly allows a bounded exception.
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
