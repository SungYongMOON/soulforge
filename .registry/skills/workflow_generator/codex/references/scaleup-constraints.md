# Skill Scale-Up Constraints

Use these constraints to decide whether a proposed edit to target skill B is allowed.

## Source Priority

1. User acceptance contract for the current B optimization task.
2. Soulforge boundaries: public/private separation, secret handling, `_workmeta` evidence, and local runtime ownership.
3. Codex skill design rules: clear `description`, lean `SKILL.md`, optional `scripts/`, `references/`, `assets/`, and validation.
4. OpenAI eval and accuracy guidance: improve through benchmarked behavior, failure analysis, and measurable iteration.
5. Anthropic Agent Skills guidance: use progressive disclosure, observe real agent behavior, iterate based on usage, and keep subagents focused.

If sources conflict, prefer the higher priority item.

## Allowed Improvements

- Make the trigger description more precise, scoped, and front-loaded.
- Add or refine benchmark tasks that represent the user's real target outcomes.
- Add an acceptance contract with must-have, should-have, nice-to-have, score thresholds, max rounds, and user review gates.
- Move optional or domain-heavy material from `SKILL.md` into clearly linked reference files.
- Add scripts only when they remove repeated fragile steps or make validation deterministic.
- Strengthen boundary rules when a fresh-context evaluator crosses public/private, secret, or ownership limits.
- Improve evaluator prompts so they resemble real user tasks without leaking the intended fix.
- Add held-out tests when B overfits to one benchmark.

## Blocked Improvements

- Do not make B larger merely by adding background, theory, or adjacent capabilities.
- Do not add instructions that only help the current conversation but will not generalize.
- Do not include full external source pages, copyrighted long excerpts, or copied manuals inside B.
- Do not store local machine paths, credentials, private project facts, raw mail, or attachments in reusable skill files.
- Do not let evaluator subagents see diagnosis notes, intended fixes, or expected answers unless the test explicitly requires that.
- Do not continue optimization past the configured round/eval limit without user approval.
- Do not merge Codex runtime bindings, Soulforge canonical skill definitions, and project-local `_workmeta` records into one file.

## Quality Test

A B edit is acceptable only if it can answer yes to all of these:

- Does this change improve at least one user acceptance criterion or observed evaluator failure?
- Is the improvement visible in a benchmark, fresh-context evaluation, validation command, or concrete output artifact?
- Does it keep B easier to trigger, use, or validate?
- Does it preserve Soulforge public/private and secret boundaries?
- Does it avoid adding context that the agent does not need for the task?

If any answer is no, do not make the edit. Record it as a rejected scale-up direction instead.
