# Archive And Policy Contract

## Calibration Archive

For workflow-level optimization, write the complete public-safe calibration under the workflow itself:

```text
.workflow/<workflow_id>/
|-- profile_policy.yaml
`-- calibrations/
    `-- <calibration_id>/
        |-- run_manifest.yaml
        |-- capability_runner_snapshot.yaml
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

Record these fields in the manifest/recommendation, with equivalent nesting allowed:

- `optimization_intent`: `migration_validation` or `profile_search`
- `search_scope`: shortlist/stages plus whether exhaustive search was authorized
- `capability_runner_snapshot`: executable path or public-safe identifier, version, invocation boundary, catalog/capability source, available models, and supported/default efforts per model
- `incumbent_comparator`: incumbent profile and evidence/archive ref
- `tested_dimensions` and `untested_dimensions`
- `migration_decision`: `retained`, `replaced`, or `blocked`, with reason
- `selection_claim`: normally `lowest_cost_passing_among_tested`, or a narrower blocked/no-selection claim
- `measurement_sources`: quality, telemetry/token proxy, service, billing mode, pricing ref/effective date, and billed-cost source when available
- `usage_evidence`: invocation count, observation interval, and source, or `not_measured`

Create a new calibration archive for each run. Never rewrite historical archives to match a newer capability catalog, price, policy shape, or migration decision.

Do not write actual customer/project raw input, private transcripts, credentials, `_workspaces` material, or secret-derived content into `.workflow`. If the calibration cannot be public-safe, do not produce a workflow archive.

## Workflow Policy Update

After a successful calibration, update the workflow when the user explicitly asked for, or confirmed, calibration archive/profile policy writes.

Write or update `.workflow/<workflow_id>/profile_policy.yaml` with:

- `workflow_id`
- `kind: workflow_profile_policy`
- `status`
- `last_calibration_id`
- `calibration_mode`
- `optimization_intent` and `search_scope`
- `capability_runner_snapshot_ref`
- `incumbent_comparator`
- `tested_dimensions` and `untested_dimensions`
- `migration_decision` (`retained`, `replaced`, or `blocked`)
- `selection_claim`
- `measurement_policy` with `quality_source`, `telemetry_source`, `subagent_token_usage_available`, `telemetry_exact_for_subagent`, and `cost_confidence`
- `primary_profile` with `model`, `reasoning_effort`, `species`, `class`, measured tokens, wall time, and quality score
- `shadow_top_k` using saved ranks from the matrix, usually ranks 2-5
- `rerun_triggers`
- `calibration_archive_ref`

Also add a public-safe summary under `.workflow/<workflow_id>/history/` when the calibration changes the workflow's operating policy.

If `profile_policy.yaml` is still the creator draft, replace `primary_profile: null`, `shadow_top_k: []`, and `calibration_archive_ref: null` with measured calibration values and set `status: active`.

Quality ranking comes from isolated candidate outputs. Cost, token, reasoning-token, and wall-time values come from runner probes unless the operational runner exposes usage. Label usage-derived values as token proxy telemetry, keep list-price estimates separate, and record billed cost only from an authoritative service/billing source.

On `blocked_runner_catalog_incompatible`, keep the incumbent primary profile, set the migration decision to `blocked`, record the incompatible capability snapshot and untested challenger dimensions, and make no replacement or winner claim.

## Recommendation Rule

Recommend the lowest-cost and fastest profile only among tested candidates that pass quality gates. Always use the claim `lowest_cost_passing_among_tested`; never promote it to global cheapest. When an authorized Cartesian search covers every runner-supported combination in the recorded capability snapshot, report that coverage separately without widening the cost claim. If token difference is under 5%, treat it as noise and prefer better quality, task fit, or speed. If wall-clock time differs by more than 20%, treat it as meaningful. If quality differs by 10 points or more, prefer quality over cost unless the user explicitly asks for cheapest acceptable output.

Final answer should include:

- recommended `model`, `reasoning_effort`, `species`, and `class`
- why it passed the quality gate
- token, reasoning token, wall time, and cost comparison when measured
- service, billing mode, pricing source, and whether each cost value is a token proxy, list-price estimate, or billed cost
- usage-frequency evidence; if absent, state that aggregate savings, payback, and ROI were not measured
- what was not measured
- tested and untested dimensions plus migration retained/replaced/blocked state
- boundary assumptions
