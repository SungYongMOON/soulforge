# Grill Me Mapping

## Soulforge Mapping

- Canon skill id: `grill_me`
- Typical operating lane: owner-facing design and plan alignment
- Canon linkage: `.registry/skills/grill_me/skill.yaml`
- UI metadata: `codex/agents/openai.yaml`

## Interview Flow

1. Locate the plan surface from the user's message, attached files, current repo context, or a named path.
2. State assumptions only when they affect the interview target or decision framing.
3. Build a dependency-aware design tree. Rank its decision knots by implementation risk, reversibility, dependency impact, and owner authority.
4. Compute the frontier: every unresolved decision whose prerequisites are already settled.
5. Resolve discoverable facts from approved repository context and tools before questioning. A bounded read-only explorer may gather an independent fact without blocking unrelated frontier questions; it must not make owner decisions or perform mutations.
6. Ask the independent frontier as one numbered round. Include every currently answerable high-leverage question; split the round only for safety, cognitive load, or an explicit owner request for one-at-a-time questioning.
7. After each round, record:
   - decision or tentative direction
   - rejected alternatives
   - tradeoff accepted
   - plan change implied
   - remaining blocker or follow-up question
8. Recompute the tree and frontier from the answers. Stop when the frontier is empty and the owner confirms shared understanding, or when progress requires unavailable source, private runtime truth, or owner-only judgment.

## Question Style

- Prefer specific, answerable questions over broad critique.
- Make uncertainty visible without becoming adversarial.
- Number every question in a round and give a recommended answer for each.
- When useful, present 2 to 4 mutually exclusive options with the practical consequence of each option.
- If the answer space is genuinely open, ask a short free-form question instead of forcing choices.
- Avoid asking for information already present in the provided plan or visible repository context.
- Never ask the owner to supply a fact that can be found safely from approved local context; decisions remain with the owner.

## Output Shape

During the interview, keep the response compact:

```text
Frontier round <N>:
Q1 — <short decision title>
- Why it matters: <risk or dependency>
- Question: <answerable decision>
- Options: <only when useful>
- Recommended: <recommended answer and reason>

Q2 — <next independent frontier decision>
...
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
- Keep delegated fact-finding read-only and bounded; do not use it to perform implementation, external writes, or owner decisions.
- Keep private payloads, secrets, runtime bindings, local absolute paths, and transcripts out of tracked skill files.
- If the user asks to convert the interview result into implementation work, leave interview mode and follow the normal Soulforge execution contract for the new task.
