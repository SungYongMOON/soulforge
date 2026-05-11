# Digest: OpenAI Eval and Accuracy Guidance

Sources:

- https://developers.openai.com/api/docs/guides/evaluation-best-practices
- https://developers.openai.com/api/docs/guides/prompt-engineering
- https://developers.openai.com/api/docs/guides/optimizing-llm-accuracy

## Constraint Summary

- Generative outputs vary, so skill quality should be tested with evals rather than assumed from one good answer.
- A mature eval set becomes the feedback loop for improving application or prompt performance.
- A useful baseline includes representative questions/tasks, expected properties or ground truth, observed failures, and a hypothesis for why failures occur.
- Automated or semi-automated graders can accelerate iteration, but the scorecard must be explicit enough to avoid vague preferences.
- Accuracy improvements should diagnose the failure mode before choosing the tool: prompt change, reference context, retrieval, examples, scripts, or broader workflow changes.

## Scale-Up Rules for B

- Do not edit B unless the edit maps to an observed failure or a user acceptance criterion.
- Prefer benchmark tasks and held-out tasks over subjective "looks better" judgments.
- Record before/after scores and failure hypotheses.
- If B lacks domain facts, add or link reference context instead of bloating the main instructions.
- If B fails because the operation is deterministic or fragile, prefer a script or validator over more prose.
