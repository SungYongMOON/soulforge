# Regression Matrix

Use this when any fixture has passed in `workflow_evolution`.

## Purpose

After a fixture passes, future edits must not break it. The regression matrix records which workflow/skill version was tested against which fixture and what evidence supports the result.

## Minimum Fields

```yaml
workflow_version:
skill_versions:
fixtures:
  - id:
    status: passed|failed|blocked|regression_failed
    last_run:
    evolution_phase:
    executor_artifact:
    verifier_report:
    source_packets:
    oracle_visible_to_executor: false
    reference_oracle_used_for_construction: false
    artifact_type:
    failure_class:
    residual_gaps:
```

## Regression Rule

- Run all previously passed fixtures after a workflow or skill edit.
- Prefer `cold_replay` for routine regression and `final_cold_gate` for readiness or promotion checks.
- Do not count `warm_evolve` alone as regression pass evidence.
- If a regression fails, stop and classify the failure before selecting a new fixture.
- Do not erase earlier pass evidence; append the new result.
- If the pass bar changes, mark earlier results as stale until rerun under the new bar.

## Evidence Meaning

A full green matrix supports workflow-evolution evidence for the covered fixture set. It does not prove production readiness for untested fixtures, and it does not validate a newly extracted skill without a separate skill-validation loop.
