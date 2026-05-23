# Grill Me Mapping

## Soulforge Mapping

- Canon skill id: `grill_me`
- Typical operating lane: owner-facing design and plan alignment
- Canon linkage: `.registry/skills/grill_me/skill.yaml`
- UI metadata: `codex/agents/openai.yaml`

## Interview Flow

1. Locate the plan surface from the user's message, attached files, current repo context, or a named path.
2. State assumptions only when they affect the interview target or decision framing.
3. Build a short queue of 3 to 5 decision knots, ranked by implementation risk, reversibility, dependency impact, and owner authority.
4. Ask the highest-leverage question first. Ask one question per turn.
5. After each answer, record:
   - decision or tentative direction
   - rejected alternatives
   - tradeoff accepted
   - plan change implied
   - remaining blocker or follow-up question
6. Stop when the plan has enough owner decisions for the next implementation slice, or when the next answer requires unavailable source, private runtime truth, or owner-only judgment.

## Question Style

- Prefer specific, answerable questions over broad critique.
- Make uncertainty visible without becoming adversarial.
- When useful, present 2 to 4 mutually exclusive options with the practical consequence of each option.
- If the answer space is genuinely open, ask a short free-form question instead of forcing choices.
- Avoid asking for information already present in the provided plan or visible repository context.

## Output Shape

During the interview, keep the response compact:

```text
Decision knot: <short label>
Why it matters: <risk or dependency>
Question: <one question>
Options: <only when useful>
```

When the user asks to close the interview, or the decision set is sufficient, return:

```text
Grill Me result:
- Decisions made: ...
- Plan patch: ...
- Rejected approaches: ...
- Remaining assumptions: ...
- Blockers or owner-only decisions: ...
- Suggested next action: ...
```

## Boundary Notes

- This skill does not replace code review, post-development review, source validation, or owner approval.
- Do not infer design facts, requirements, performance targets, or external constraints without source support.
- Keep private payloads, secrets, runtime bindings, local absolute paths, and transcripts out of tracked skill files.
- If the user asks to convert the interview result into implementation work, leave interview mode and follow the normal Soulforge execution contract for the new task.
