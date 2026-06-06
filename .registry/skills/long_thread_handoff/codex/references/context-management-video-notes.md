# Context Management Video Notes

Source:

- YouTube: "100만 토큰시대! 앤트로픽이 알려준 클로드코드 컨텍스트 관리법", 김플립 - LLM 코딩, uploaded 2026-04-26, video id `NpfBwijf0-Y`.
- Local analysis input: YouTube `ko-orig` automatic captions fetched with `yt-dlp` on 2026-06-05. Do not store or reproduce the raw transcript in this skill.
- Cross-check sources: Claude Code docs on subagents, slash commands, and file checkpointing.

Claim ceiling:

- These are distilled operational heuristics, not Soulforge canon and not a complete transcript.
- The video is an explanatory secondary source. Use official runtime docs and local tool behavior as authority for exact command availability.

## Distilled Heuristics

1. Larger context windows reduce hard limits but do not remove focus risk. Long threads can still suffer context pollution, goal drift, stale assumptions about files, and inconsistent decisions.
2. Compaction is a continuity tool, not a clean restart. When compacting, direct what must survive instead of relying on automatic or generic summaries.
3. Fresh sessions are best at phase boundaries where previous context is more likely to distract than help. Preserve only the structured state needed for continuity.
4. Structured state beats prose-only summaries for fragile work. Use explicit fields for goal, decisions, constraints, changed files, validation, blockers, rejected approaches, and next actions.
5. Handoff should be refreshed before compaction or clearing. Compaction is useful when continuing the same larger goal; clearing is useful when a completed phase should not pollute the next work kind.
6. Do not compact just to feel tidy. Every compaction can lose detail, so use it when context pressure, drift, or unit-boundary continuity justifies the cost.
7. Re-anchor during long phases. Ask the agent to restate the active goal, completed work, constraints, blockers, and next action before continuing when the thread starts drifting.
8. Use subagents for work where only the result matters to the manager. Research, inspection, summarization, document drafting, and bounded patches can keep intermediate source material out of the manager context.
9. After subagents or other agents modify files, refresh from disk with status/diff/file reads before deciding. Do not let stale manager memory override actual state.
10. Bad attempts contaminate future context if preserved as active guidance. Prefer safe checkpoint/rewind when available, or record only the rejected approach and why future agents should avoid it.

## Application To Long Thread Handoff

- `NIGHT_WORK_HANDOFF` is the structured continuity object for Soulforge long threads.
- During overnight work, the manager should decide checkpoint, compact, and clear timing from phase state and context pressure instead of asking for routine permission.
- The manager should minimize what enters the next context: no raw transcripts, no private payloads, no source dumps, and no unnecessary tool output.
- Delegated agents should receive only the handoff, target paths, constraints, acceptance criteria, and explicit write ownership.
- The final report should distinguish observed facts, source-supported claims, validation results, and remaining unknowns.
