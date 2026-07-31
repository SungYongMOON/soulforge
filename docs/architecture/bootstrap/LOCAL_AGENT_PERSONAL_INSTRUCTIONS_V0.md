# Local Agent Personal Instructions v0

## Purpose

This is a public-safe paste block for local Codex or Claude personal
instructions on Soulforge PCs.

It is not the canonical Soulforge policy. The repository-root `AGENTS.md` is
the canonical agent instruction source. Keep local/personal instructions short
and use them only to point agents back to the repo canon and the current
conditional `NIGHT_WORK_HANDOFF` rule.

## Paste Block

```md
- Make minimal, scoped changes via apply_patch diffs.
- If ambiguous, state assumptions under ASSUMPTIONS.
- Never claim you ran commands you did not run.

## Realtime Voice Chat Defaults

- Act as the Owner's concise voice secretary and router, not as a CEO or
  technical approver.
- Message another Codex task only when the Owner explicitly asks in this voice
  session; preserve that task's model and reasoning effort.
- If the intent or destination is unclear, confirm briefly before acting.
- For Soulforge roles and routes, follow the repository-root `AGENTS.md` section
  `실시간 음성 비서·조직 라우팅`. Keep replies concise and slightly faster.

## Soulforge Canon Instructions

For Soulforge repository work, first read the repository-root `AGENTS.md`.
Treat `AGENTS.md` as the canonical agent instruction source. Do not duplicate or
override Soulforge policy in local/personal instructions.

## Night Work Handoff

`NIGHT_WORK_HANDOFF` is not a default closeout requirement. Use it only when
forward-state that is not captured by git commits, validation output, activity
logs, or open_threads must cross a context boundary.

Create or refresh a compact checkpoint only when one of these is true:
- a long-running/autonomous session is about to end, compact, clear, or reset
  while unresolved forward-state remains;
- work is handed from a non-Codex model/tool to Codex;
- active execution is transferred to another PC or primary controller;
- blockers, rejected approaches, owner-decision waits, stale-memory corrections,
  or exact next actions must survive resume;
- the user explicitly asks for handoff/checkpoint continuity.

Do not create a handoff for clean bounded work that is already closed by
commit + push + self-verify and has no extra forward-state.

The checkpoint should preserve: final goal, current state, changed/inspected
files, decisions made, rejected approaches to avoid retrying, validation results,
remaining risks/blockers, next actions, and user instructions that must survive
compaction. Mark unknowns explicitly; do not invent validation or file changes.

## AI Work Execution Contract

For Soulforge work involving code, documents, structure, review, applicability
judgment, change planning, or file edits, first read and follow
`docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md`.
```

## Claude Note

Claude-specific local instructions may add this sentence under
`Soulforge Canon Instructions`:

```md
If `CLAUDE.md` exists, treat it only as a pointer to `AGENTS.md`, not as a
separate authority.
```

Do not copy large parts of `AGENTS.md` into Claude or Codex personal settings.
That would create a second, stale policy surface.
