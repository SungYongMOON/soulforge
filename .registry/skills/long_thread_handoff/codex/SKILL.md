---
name: soulforge-long-thread-handoff
description: Use only when the user explicitly asks for a Soulforge long-thread handoff, contamination-free handoff mode, "장기작업 인계 시작", "오염방지 인계모드", "긴 스레드 인계", or wants to replace the repeated prompt that tells Codex to act as manager, summarize the current long conversation into a goal/checkpoint, delegate analysis/work/review to fresh GPT-5.6 xhigh subagents, use Soulforge Workflow Generator/Check for workflow authoring, persist until done or blocked, and prepare Telegram completion notification.
---

# Soulforge Long Thread Handoff

Use this skill as a launcher near the end of a long Soulforge thread when the user wants to avoid context contamination and continue work through fresh subagents.

`NIGHT_WORK_HANDOFF` is conditional continuity state, not a default closeout artifact. Create or refresh it only when forward-state that is not already captured by git commits, validation output, activity logs, or open threads must cross a context boundary.

For context-management rationale and optional tactics, read `references/context-management-video-notes.md` only when the task involves improving handoff quality, deciding compact vs fresh-session behavior, or explaining why the handoff uses structured checkpoints.

## Core Contract

- Treat explicit invocation of this skill as a request to actively use fresh subagents for non-trivial bounded work, subject only to current tool environment support. Direct same-thread execution is allowed only for a named no-subagent exception, and the exception must be reported.
- Act as manager/controller A: own goal declaration, boundaries, evidence, integration, validation routing, and final reporting.
- Do not deep-analyze the full old context yourself unless needed to produce a safe checkpoint. When unresolved forward-state must cross a context boundary, convert it into a compact handoff before delegating; otherwise record the explicit no-handoff reason and delegate with bounded refs, constraints, and acceptance criteria.
- Keep the manager context clean: carry forward structured state and final findings, not raw exploration, failed attempts, or unneeded source text.
- Prefer a structured checkpoint over prose-only compaction for fragile work when unresolved forward-state must survive. The checkpoint should make omitted or unknown items explicit.
- During long phases, periodically re-anchor the work by restating the current goal, constraints, completed work, blockers, and next action before continuing or delegating.
- Use fresh subagents with `fork_context=false` by default for delegated work. Pass only the handoff summary, target files, constraints, and acceptance criteria.
- In overnight or continued-work mode, decide whether a handoff is actually needed before refreshing, compacting, or starting clean. Ask the user only when a stop condition or owner decision is involved.
- Request `gpt-5.6` with `xhigh` reasoning for subagents when available. If the runtime cannot provide that profile, use the strongest available profile and state the downgrade.
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
3. Create or refresh a `NIGHT_WORK_HANDOFF` checkpoint before delegation only when unresolved forward-state must cross a context boundary: a long-running or autonomous session is about to compact, clear, reset, or end; work moves from a non-Codex model/tool to Codex; active execution transfers to another PC or primary controller; blockers, rejected approaches, owner-decision waits, stale-memory corrections, or exact next actions must survive resume; or the user explicitly asks for checkpoint continuity.
4. Keep the checkpoint compact. Preserve final goal, current state, changed or inspected files, decisions made, rejected approaches, validation results, blockers, risks, next actions, and user instructions that must survive compaction.
5. Do not copy raw transcript, secrets, credentials, private payloads, or unneeded source text into the handoff. Mark unknowns explicitly.
6. Treat `NIGHT_WORK_HANDOFF` as durable continuity state during overnight work only after the need is established. Refresh it after meaningful changes to unresolved forward-state, such as a new blocker, rejected approach, owner-decision wait, stale-memory correction, validator result, subagent integration finding, PC/controller transfer, or changed next action that must survive resume.
7. If the next phase should start clean, use the checkpoint as the continuity anchor for a fresh session instead of carrying the full conversation forward.
8. Create separate analysis, implementation, and verification subagent lanes for substantive work. Skip subagents only for a named no-subagent exception: unclear goal, trivial status or preflight, small deterministic local check, unavailable subagent tool/model, unsafe minimal-packet boundary, owner decision, or stop condition. Use subagents especially when the manager only needs final findings or a bounded patch, not the intermediate source material.
9. For workers, specify write ownership, tell them they are not alone in the codebase, and tell them not to revert others' changes.
10. After subagents return, inspect the actual file/status state before integrating so stale manager memory does not override fresh work.
11. Integrate returned work, run appropriate deterministic validators, and keep the final claim ceiling conservative when verification is partial.
12. Do not create a handoff for clean bounded work already closed by commit, push, self-verification, and no extra forward-state. Refresh `NIGHT_WORK_HANDOFF` before a context reset or phase end only when unresolved forward-state remains, or when the user asks for checkpoint continuity.

## Delegation Packet Minimum

Every fresh subagent packet must be self-contained enough to work without the
old thread, but compact enough to avoid recreating the transcript. Include:

- `objective`: one bounded task goal and role.
- `context_refs`: exact checkpoint, files, sections, or command outputs to read.
- `current_state`: decisions, unknowns, blockers, and relevant prior results.
- `acceptance_criteria`: concrete pass conditions or the explicit reason they
  are not yet known.
- `allowed_scope`: read paths, write paths or read-only status, ownership, and
  "do not revert others' changes".
- `constraints`: public/private boundary, secret and raw-payload exclusions, and
  forbidden paths or data classes.
- `side_effect_limits`: allowed and forbidden file, git, network, external,
  notification, thread, canon, or party actions.
- `verification`: validators or checks to run, or the reason validation is not
  applicable.
- `output_shape`: findings, changed or inspected refs, commands and exit status,
  blockers, residual risks, and next action.
- `claim_ceiling`: use the execution-contract vocabulary: observed,
  source_supported, validated_private, canon_candidate, canon_entry, or
  rejected_or_blocked; choose the weakest value supported by evidence.
- `stop_conditions`: owner decision, secret, unsafe boundary, overlapping write
  scope, unavailable tool/model, or failed validator outside scope.

For verifier or review subagents, include the changed refs, acceptance criteria,
validators, claims to check, and suspected risk areas. Do not pass hidden
reasoning, raw transcript, private payloads, or the intended fix unless it is
necessary evidence.

## No-Subagent Exceptions

Explicit invocation means fresh subagents are the default for material work.
Same-thread direct execution is allowed only when one of these exceptions is
named in the manager notes or closeout:

- the current goal is unclear enough that one concise user question is required
  before work can be safely delegated
- the task is only a trivial status check, preflight, or small deterministic
  local check
- the runtime does not expose usable subagent tools or the requested
  subagent/model profile is unavailable and no safe fallback exists
- a safe minimal packet cannot be prepared without raw transcript, private
  payload, secret, or overbroad source material
- an owner decision, unsafe boundary, conflicting write scope, failed validator,
  or other stop condition blocks delegation

## Autonomous Context Reset Policy

- Refresh `NIGHT_WORK_HANDOFF` conditionally; compact sparingly; clear at phase boundaries.
- Refresh handoff only when a meaningful work unit, important decision, validator result, blocker discovery, subagent integration, or change in next action leaves unresolved forward-state that must survive a context boundary.
- Compact only when continuing the same larger goal and context pressure or drift risk is material: large tool output has accumulated, context usage is high, automatic compaction seems likely, several decisions must be preserved, or a meaningful unit just finished.
- Before compacting, refresh `NIGHT_WORK_HANDOFF` first only if unresolved forward-state must survive compaction, and name the fields that must survive.
- Clear or start a fresh session when the work kind changes and prior context is more likely to distract than help, such as research to implementation, implementation to debugging, debugging to documentation, feature A to feature B, or front-end to back-end.
- Before clearing, refresh `NIGHT_WORK_HANDOFF` only if unresolved forward-state must survive the clear; after clear, resume from the checkpoint rather than from the full old conversation when a checkpoint was created.
- If uncertain between compact and clear, choose the action that preserves needed state while removing more irrelevant context. When the next work needs prior reasoning, compact; when it needs only final state and next actions, clear.

## Context Hygiene Guardrails

- Watch for context pollution, goal drift, stale-memory assumptions, and inconsistent decisions as signs the current thread needs re-anchoring or handoff.
- Treat compaction as continuity transfer, not as a clean restart. If compaction is unavoidable, explicitly state what must survive: goal, decisions, constraints, bugs, changed files, validators, blockers, and next actions.
- Use fresh sessions or fresh subagents at phase boundaries when old context is more likely to distract than help.
- If an approach failed or produced bad output, record it as a rejected approach only when future agents must avoid retrying it. Do not preserve failed intermediate details as active guidance.
- If the runtime has safe checkpoint or rewind support, prefer returning to the last known-good state after a bad attempt rather than layering corrective prompts on top of contaminated context.

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
