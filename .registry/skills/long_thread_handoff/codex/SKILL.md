---
name: soulforge-long-thread-handoff
description: Use only when the user explicitly asks for a Soulforge long-thread handoff, contamination-free handoff mode, "장기작업 인계 시작", "오염방지 인계모드", "긴 스레드 인계", or wants to replace the repeated prompt that tells Codex to act as manager, summarize the current long conversation into a goal/checkpoint, delegate analysis/work/review to fresh GPT-5.5 xhigh subagents, use Soulforge Workflow Generator/Check for workflow authoring, persist until done or blocked, and prepare Telegram completion notification.
---

# Soulforge Long Thread Handoff

Use this skill as a launcher near the end of a long Soulforge thread when the user wants to avoid context contamination and continue work through fresh subagents.

## Core Contract

- Treat explicit invocation of this skill as authorization to use subagents for the bounded handoff task when the current tool environment supports them.
- Act as manager/controller A: own goal declaration, boundaries, evidence, integration, validation routing, and final reporting.
- Do not deep-analyze the full old context yourself unless needed to produce a safe checkpoint. Convert the thread into a compact handoff, then delegate material analysis, implementation, and review.
- Prefer fresh subagents with `fork_context=false`. Pass only the handoff summary, target files, constraints, and acceptance criteria.
- Request `gpt-5.5` with `xhigh` reasoning for subagents when available. If the runtime cannot provide that profile, use the strongest available profile and state the downgrade.
- Continue until the declared goal is complete or a real stop condition is reached.

## Trigger UX

The user should be able to write one short request instead of pasting the long prompt:

```text
장기작업 인계 시작: <목표 또는 남은 일>
```

```text
$soulforge-long-thread-handoff <목표 또는 남은 일>
```

If the user gives only the trigger and the current goal is unclear, ask one concise question. Otherwise proceed.

## Handoff Procedure

1. Read the active Soulforge execution contract before changing files or making repo judgments: `docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md`.
2. Declare the goal. If Codex goal tools are available, check for an active goal, create or reuse a matching goal, and stop on a conflicting active goal. Include success criteria and stop conditions.
3. Create a `NIGHT_WORK_HANDOFF` checkpoint before delegation when the thread is long, the phase is substantial, or the user asks for continuity.
4. Keep the checkpoint compact. Preserve final goal, current state, changed or inspected files, decisions made, rejected approaches, validation results, blockers, risks, next actions, and user instructions that must survive compaction.
5. Do not copy raw transcript, secrets, credentials, private payloads, or unneeded source text into the handoff. Mark unknowns explicitly.
6. Spawn analysis, implementation, and verification subagents as separate roles when useful. For workers, specify write ownership, tell them they are not alone in the codebase, and tell them not to revert others' changes.
7. Integrate returned work, run appropriate deterministic validators, and keep the final claim ceiling conservative when verification is partial.
8. Refresh `NIGHT_WORK_HANDOFF` before ending a substantial phase, before a context reset, or when the user asks for checkpoint continuity.

## Workflow Authoring Rule

When the task requires creating or materially evolving a Soulforge workflow:

- Delegate workflow creation/evolution to a fresh subagent using `$soulforge-workflow-generator`.
- After creation/evolution, delegate review to a separate fresh subagent using `$soulforge-workflow-check`.
- Do not claim `pilot-executed`, `canon-ready`, `registered`, or `default-route-safe: yes` unless the required evidence and registration/default-route conditions are actually present.
- Do not register a workflow or switch a default route unless the user explicitly asks for that decision.

## Telegram Closeout

- If a safe, configured Telegram delivery mechanism is available and the user has authorized sending, send a concise completion brief after the goal is done.
- If Telegram delivery is unavailable, blocked, or would require secrets/tokens, produce a Telegram-ready brief and state that it was not sent.
- Never ask the agent to read or expose Telegram tokens, bot credentials, session files, or other secrets.

## Stop Conditions

Stop and report `blocked` instead of looping when the next step requires a secret, external side effect authorization, owner decision, unavailable tool/model, unsafe public/private boundary, failed validator that cannot be fixed in scope, conflicting active goal, or exhausted user-specified budget.

## Closeout Shape

Report:

- declared goal and completion state
- subagents used, their roles, and any model/profile downgrade
- files changed or inspected
- validators and review gates run
- Telegram sent/not sent status
- remaining blockers or next action
- `지식 트리거 확인: ...` for Soulforge bounded work
