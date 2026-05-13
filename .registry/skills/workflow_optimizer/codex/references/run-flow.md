# Workflow Optimizer Run Flow

## Goal Declaration

For actual optimizer runs, first call `get_goal` if available. If there is no existing active goal for this optimization, call `create_goal` with this objective shape:

`Calibrate the <workflow_id> Soulforge workflow execution profile using public-safe isolated candidate runs across model, reasoning effort, species, and class; archive the calibration under .workflow/<workflow_id>/calibrations/<calibration_id>/; update .workflow/<workflow_id>/profile_policy.yaml; recommend the lowest-cost profile that passes the frozen quality gate.`

Replace `<workflow_id>` when known. If the workflow id is not known yet, use `target workflow` in the goal objective and resolve the workflow before running candidates.

Only set `token_budget` when the user explicitly gives a budget. Do not include golden output, private input text, secret material, candidate answers, or evaluator-only criteria in the goal objective.

If `create_goal` fails because the thread already has a goal, report that and continue under the existing thread without inventing a second goal.

When the recommendation is complete and no required work remains, call `update_goal(status="complete")` and report final token/time usage.

## Quality Baseline Stage

Before candidate runs, create an evaluator-only quality baseline.

1. Run the strongest configured profile on the same input to produce a golden output. Default strongest profile: `gpt-5.5` with `xhigh`, unless the user gives a different ceiling.
2. Extract acceptance criteria from the golden output:
   - final outcome the workflow must achieve
   - must-have content or structure
   - critical failure conditions
   - safety, public/private, and secret boundaries
   - usability requirements
   - optional nice-to-have qualities
3. Ask an evaluator to review the criteria:
   - Are the criteria sufficient for the user goal?
   - Are any critical conditions missing?
   - Is the checklist overfit to golden wording or style?
   - Does the golden output itself contain suspicious or unsafe assumptions?
4. Freeze the revised criteria before running candidates.
5. Keep the golden output and criteria evaluator-only. Candidate prompts receive only the workflow input, fixture, and their assigned profile.

Do not treat the golden output as literal truth. Treat it as a source for requirements. A candidate may pass with different wording or layout if it satisfies the frozen quality criteria.

## Full Run Order

1. Preflight the run boundary, available models, and telemetry path.
2. Resolve the target workflow and confirm creator handoff files.
3. Freeze the candidate input fixture without golden output.
4. Run Quality Baseline Stage.
5. Run the authorized quality matrix. Use isolated subagents only when tools and policy/user authorization permit them.
6. Evaluate candidate quality against frozen criteria.
7. Run CLI telemetry probes only for quality-passing candidates.
8. Archive the public-safe matrix and telemetry probe under the target workflow.
9. Update the workflow profile policy with primary and shadow top-k profiles.
10. Re-run finalists when the decision depends on a small difference.
11. Recommend `model`, `reasoning_effort`, `species`, and `class`.
12. Complete the goal if one was started.
