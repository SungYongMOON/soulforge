---
name: soulforge-long-thread-handoff
description: Use only when the user explicitly opts into a Soulforge long-thread phase transition or handoff, says "장기작업 인계 시작", "오염방지 인계모드", or "긴 스레드 인계", or asks the current manager to continue substantive work through fresh subagents with bounded implementation and verification. Keep the manager as integration owner, use Soulforge Workflow Generator/Check for workflow authoring, and persist until done or blocked.
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
- Use a runtime-neutral fresh context for delegated work. In the current Codex collaboration runtime, spawn each fresh worker with `fork_turns="none"`. Pass only the handoff summary or bounded continuity refs, target files, constraints, and acceptance criteria.
- In overnight or continued-work mode, decide whether a handoff is actually needed before refreshing, compacting, or starting clean. Ask the user only when a stop condition or owner decision is involved.
- When the subagent runtime exposes model and reasoning selectors, request the strongest profile the user specified. If the user did not specify one, do not invent a profile requirement. When selectors are absent, use the strongest available fresh worker and report the model/reasoning profile as `unselectable` or `unknown`, as applicable. Do not infer a downgrade or claim a profile assignment that the runtime did not expose.
- Keep the manager/controller as the integration owner. Create analysis, implementation, and verification lanes only when those distinct roles are actually needed for substantive work, execute them in dependency order, and start verification only after implementation is stable.
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
3. Create or refresh a `NIGHT_WORK_HANDOFF` checkpoint before delegation only when unresolved forward-state must cross a context boundary: a long-running or autonomous session is about to compact, clear, reset, or end; work moves from a non-Codex model/tool to Codex; active execution transfers to another PC or primary controller; blockers, rejected approaches, owner-decision waits, stale-memory corrections, or exact next actions must survive resume; or the user explicitly asks for checkpoint continuity. Write only to an exact path or reference confirmed by an applicable owner-approved canonical surface. If that location is absent or ambiguous, do not invent one; ask for the owner decision.
4. Keep the checkpoint compact. Preserve final goal, current state, changed or inspected files, decisions made, rejected approaches, validation results, blockers, risks, next actions, and user instructions that must survive compaction.
5. Do not copy raw transcript, secrets, credentials, private payloads, or unneeded source text into the handoff. Mark unknowns explicitly.
6. Treat `NIGHT_WORK_HANDOFF` as durable continuity state during overnight work only after the need is established. Refresh it after meaningful changes to unresolved forward-state, such as a new blocker, rejected approach, owner-decision wait, stale-memory correction, validator result, subagent integration finding, PC/controller transfer, or changed next action that must survive resume.
7. If the next phase should start clean, use the checkpoint as the continuity anchor for a fresh session instead of carrying the full conversation forward.
8. For substantive work, decide which distinct analysis, implementation, and verification roles are actually required. Run only the needed lanes in dependency order: analysis before dependent implementation, and verification after implementation is stable. Do not create ceremonial lanes or assume all three can run in parallel. Skip subagents only for a named no-subagent exception: unclear goal, trivial status or preflight, small deterministic local check, unavailable subagent tool, unsafe minimal-packet boundary, owner decision, or stop condition.
9. Before delegating any writer, pin the expected HEAD and confirm `index.lock` is absent, dirty changes have known ownership, no external actor appears to be editing the same tree, and allowed write paths do not overlap another active writer. Assign exactly one writer per file, database schema, or other writer surface. Sequentialize overlapping work or use a separate worktree; stop if neither is safe.
10. For workers, specify write ownership, tell them they are not alone in the codebase, and tell them not to revert others' changes. Never run overlapping writer scopes concurrently.
11. After subagents return, inspect the actual file/status state before integrating so stale manager memory does not override fresh work.
12. Integrate returned work as the manager/controller, run appropriate deterministic validators, and keep the final claim ceiling conservative when verification is partial.
13. Do not create a handoff for clean bounded work already closed by commit, push, self-verification, and no extra forward-state. Refresh `NIGHT_WORK_HANDOFF` before a context reset or phase end only when unresolved forward-state remains or the user asks for checkpoint continuity, and only when the exact owner-approved checkpoint path or reference is known.

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
- the runtime does not expose usable subagent tools
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

- Consider Telegram only when the user explicitly requested it in the current request or an applicable standing authorization covers this delivery. At send time, confirm both the authorization scope and the configured delivery mechanism.
- If Telegram was requested but delivery is unavailable, blocked, outside authorization, or would require secrets/tokens, produce a concise unsent brief and state why it was not sent.
- If Telegram was not requested and no applicable standing authorization calls for it, omit Telegram work and status from closeout.
- Never ask the agent to read or expose Telegram tokens, bot credentials, session files, or other secrets.

## Stop Conditions

Stop and report `blocked` instead of looping when the next step requires a secret, external side effect authorization, owner decision, unavailable tool/model, unsafe public/private boundary, failed validator that cannot be fixed in scope, conflicting active goal, or exhausted user-specified budget.

## Closeout Shape

Report:

- declared goal and completion state
- subagents used, their roles, and only model/reasoning profile facts exposed by the runtime; otherwise report `unselectable` or `unknown`
- files changed or inspected
- validators and review gates run
- Telegram sent/not-sent status only when Telegram was requested or applicable authorization called for it
- remaining blockers or next action
- `지식 트리거 확인: ...` for Soulforge bounded work
