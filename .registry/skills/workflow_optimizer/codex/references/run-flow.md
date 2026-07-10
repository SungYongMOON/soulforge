# Workflow Optimizer Run Flow

## Goal Declaration

For actual optimizer runs, first call `get_goal` if available. If there is no existing active goal for this optimization, call `create_goal` with this objective shape:

`Validate or optimize the <workflow_id> Soulforge workflow execution profile using public-safe runner-verified candidates; compare against the incumbent; archive the tested and untested scope under .workflow/<workflow_id>/calibrations/<calibration_id>/; update .workflow/<workflow_id>/profile_policy.yaml when supported; select the lowest-cost passing profile among tested candidates.`

Replace `<workflow_id>` when known. If the workflow id is not known yet, use `target workflow` in the goal objective and resolve the workflow before running candidates.

Only set `token_budget` when the user explicitly gives a budget. Do not include golden output, private input text, secret material, candidate answers, or evaluator-only criteria in the goal objective.

If `create_goal` fails because the thread already has a goal, report that and continue under the existing thread without inventing a second goal.

When the recommendation is complete and no required work remains, call `update_goal(status="complete")` and report final token/time usage.

## Runner And Capability Preflight

Before candidate construction:

1. Identify the exact executable path, runner version, invocation/config boundary, and operational service.
2. Prove that executable can launch in the intended environment.
3. Use runner-owned capability output or a public-safe minimal smoke to resolve runnable models and supported/default efforts per model.
4. Record the runner/catalog snapshot and distinguish it from cache or UI visibility.
5. Resolve token telemetry, pricing source, and billing evidence availability separately.

If the runner cannot launch, cannot parse its catalog/capability data, or fails before candidate output, stop with `blocked_runner_catalog_incompatible`. Retain the incumbent policy, archive the blocked preflight only when public-safe and authorized, and do not claim a challenger or migration winner.

## Quality Gate Stage

For `migration_validation`, reuse the latest frozen workflow gate when an applicability check confirms the workflow goal, contract, required output, safety boundary, and fixture class have not materially changed.

Create or revise a gate only for a first calibration or a material contract change:

1. Derive acceptance criteria from the workflow contract and approved public-safe evidence. A golden output may inform evaluator-only requirements but is not truth.
2. Extract:
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

Do not regenerate the gate solely from an unvalidated new-model golden. Any golden output or golden-derived criterion in a candidate prompt is a hard failure. A candidate may pass with different wording or layout when it satisfies the frozen gate.

## Full Run Order

1. Preflight the run boundary, exact executable runner, per-model efforts, telemetry path, pricing service, and billing source.
2. Resolve the target workflow, incumbent, creator handoff files, and optimization intent.
3. Freeze the candidate input fixture without golden output.
4. Reuse or build the frozen quality gate according to Quality Gate Stage.
5. Build the migration shortlist or the smallest triggered staged search.
6. Run isolated candidates and evaluate quality against the frozen gate.
7. Probe telemetry and pricing/billing evidence only as available for quality-passing candidates.
8. Re-run finalists only when the decision depends on an unstable small difference.
9. Archive public-safe runner capability, candidates, tested/untested dimensions, evidence sources, and selection claim.
10. Retain or replace the incumbent; update policy only when the evidence supports the decision.
11. Complete the goal if one was started.
