# Skill Forward Evaluation

## Evaluation Target

- `skill_id`:
- Request mode: `create | revise`
- Routed controller: `workflow_generator`
- Routed mode: `single_skill_build | single_skill_modify`
- Authoritative quality rubric: `quality_rubric.yaml#skill_package_predictability_v0`
- Acceptance contract:

## Deterministic Validation

- Structure validator identity:
- Structure validator command recorded in run evidence:
- Structure validator status: `pass | fail | not-run`
- Changed scripts:
- Safe script check used for each changed script: `--help | dry-run | synthetic-fixture | static-only | not-applicable`
- Safe script check evidence:
- Critical script left at static-only: `yes | no`

## Trigger Fixtures

### Normal Trigger

- Fixture request:
- Expected route:
- Observed route:
- Evidence:
- Status: `pass | fail | not-run`

### Adjacent Non-Trigger

- Fixture request:
- Expected route:
- Observed route:
- Evidence:
- Status: `pass | fail | not-run`

### Realistic Execution

- Fixture request:
- Required outputs:
- Produced outputs:
- Missing outputs:
- Evidence:
- Status: `pass | fail | not-run`

## Fresh Executor B

- Fresh context identifier:
- Inputs visible to B:
- Diagnosis, expected answer, and verifier notes hidden from B: `yes | no`
- Candidate output:
- Execution status: `pass | fail | not-run`

## Separate Verifier V

- Verifier context identifier:
- Separate from B: `yes | no`
- Candidate reviewed read-only: `yes | no`
- Acceptance result:
- Must-have failures:
- Verification status: `pass | fail | not-run`

## Quality Rubric Result

Record only item ids and evidence here; definitions remain authoritative in `quality_rubric.yaml`.

- `process_predictability`: `pass | fail | not_observed` — evidence:
- `distinct_trigger_branches`: `pass | fail | not_observed` — evidence:
- `checkable_and_exhaustive_completion`: `pass | fail | not_observed` — evidence:
- `information_hierarchy_and_ssot`: `pass | fail | not_observed` — evidence:
- `pruning`: `pass | fail | not_observed` — evidence:
- Overall rubric status: `pass | fail | not_observed`

## Completion Claim

- Completion label: `draft | blocked-pending-subagent-eval | blocked-pending-verifier-subagent | usable-pending-fresh-eval | usable-pending-verifier-eval | usable | production-ready | owner-approved | blocked`
- Completion-label authority: `.registry/skills/workflow_generator/codex/references/verification-gate.md`
- Claim allowed by observed evidence: `yes | no`
- Blocking or pending evidence:
- Next action:

`not-run`, `not_observed`, a failed required fixture, missing fresh B evidence, or missing separate V evidence cannot support `usable` or `production-ready`. A critical script checked only by static inspection cannot support `production-ready`.
