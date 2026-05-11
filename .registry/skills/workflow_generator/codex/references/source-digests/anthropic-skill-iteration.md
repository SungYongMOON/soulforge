# Digest: Anthropic Agent Skills and Iteration Patterns

Sources:

- https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview
- https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices

## Constraint Summary

- Skills package workflows, context, and best practices as filesystem resources.
- Progressive disclosure matters: metadata is seen first, `SKILL.md` is loaded when relevant, and extra files are read as needed.
- Concise `SKILL.md` content matters because loaded skill text competes with the rest of the working context.
- Iteration should be based on observed agent behavior in real tasks, not only on the author's assumptions.
- The refinement loop is: run the skill in a realistic task, observe where the agent struggled, update the skill, test again, and repeat.
- Watch how the agent navigates skill resources. Missed files, repeated over-reading, or ignored references indicate the structure needs adjustment.

## Scale-Up Rules for B

- Improve the path the agent naturally follows: metadata -> main instructions -> needed references.
- Make important rules more prominent before adding more rules.
- Remove or demote content the evaluator never uses.
- If the evaluator misses a reference, strengthen the pointer from `SKILL.md`.
- Do not add large reference material to `SKILL.md` unless the evaluator repeatedly needs it immediately.
