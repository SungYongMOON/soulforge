# Archive And Policy Contract

## Calibration Archive

For workflow-level optimization, write the complete public-safe calibration under the workflow itself:

```text
.workflow/<workflow_id>/
|-- profile_policy.yaml
`-- calibrations/
    `-- <calibration_id>/
        |-- run_manifest.yaml
        |-- input_fixture.public.json
        |-- golden/
        |   |-- output.md
        |   `-- usage.json
        |-- quality_gate/
        |   |-- criteria.json
        |   `-- evaluator_review.json
        |-- subagent_matrix/
        |   |-- candidates.jsonl
        |   |-- quality_eval.jsonl
        |   `-- outputs/
        |-- cli_telemetry_probe/
        |   |-- passed_candidates.jsonl
        |   `-- telemetry.jsonl
        |-- evaluation/
        |   |-- rule_eval.jsonl
        |   |-- llm_shortlist_eval.json
        |   `-- final_ranking.json
        `-- recommendation.yaml
```

The archive must include all candidate outputs from the calibration run, including rejected candidates, because token-heavy runs are analysis assets. CLI telemetry is required only for quality-passing candidates. Keep large candidate text in JSONL or per-candidate files; keep summary/ranking files small and easy to diff.

Do not write actual customer/project raw input, private transcripts, credentials, `_workspaces` material, or secret-derived content into `.workflow`. If the calibration cannot be public-safe, do not produce a workflow archive.

## Workflow Policy Update

After a successful calibration, update the workflow when the user explicitly asked for, or confirmed, calibration archive/profile policy writes.

Write or update `.workflow/<workflow_id>/profile_policy.yaml` with:

- `workflow_id`
- `kind: workflow_profile_policy`
- `status`
- `last_calibration_id`
- `calibration_mode`
- `measurement_policy` with `quality_source`, `telemetry_source`, `subagent_token_usage_available`, `telemetry_exact_for_subagent`, and `cost_confidence`
- `primary_profile` with `model`, `reasoning_effort`, `species`, `class`, measured tokens, wall time, and quality score
- `shadow_top_k` using saved ranks from the matrix, usually ranks 2-5
- `rerun_triggers`
- `calibration_archive_ref`

Also add a public-safe summary under `.workflow/<workflow_id>/history/` when the calibration changes the workflow's operating policy.

If `profile_policy.yaml` is still the creator draft, replace `primary_profile: null`, `shadow_top_k: []`, and `calibration_archive_ref: null` with measured calibration values and set `status: active`.

Quality ranking comes from isolated candidate outputs or the explicitly approved CLI-only fallback. Cost, token, reasoning-token, and wall-time values come from CLI probes unless the operational runner exposes usage. Label CLI-derived values as CLI proxy telemetry in the policy.

## Recommendation Rule

Recommend the lowest-cost and fastest profile only among candidates that pass quality gates. If token difference is under 5%, treat it as noise and prefer better quality, task fit, or speed. If wall-clock time differs by more than 20%, treat it as meaningful. If quality differs by 10 points or more, prefer quality over cost unless the user explicitly asks for cheapest acceptable output.

Final answer should include:

- recommended `model`, `reasoning_effort`, `species`, and `class`
- why it passed the quality gate
- token, reasoning token, wall time, and cost comparison when measured
- what was not measured
- boundary assumptions
