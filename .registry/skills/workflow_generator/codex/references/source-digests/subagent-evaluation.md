# Digest: Subagent Evaluation Constraints

Sources:

- https://code.claude.com/docs/en/sub-agents
- https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices

## Constraint Summary

- Subagents are useful as fresh-context evaluators when the goal is to observe how a separate agent uses B.
- Focused subagents are better than broad ones. Give only the tools and context needed for the evaluation.
- For skill testing, prompt the evaluator like a real user task, not like a review of the intended fix.
- Avoid giving the evaluator the suspected defect, expected answer, or author's diagnosis.
- When a skill is preloaded or directly invoked in a subagent, the evaluation tests whether the skill content is sufficient for the task.

## Scale-Up Rules for B

- Use a new evaluator context for each serious round.
- Keep evaluator prompts short, realistic, and independent.
- Compare evaluator output to the acceptance contract, not to private expectations.
- Stop and ask the user if the evaluator repeatedly fails for reasons that require domain judgment, taste, or private facts.
