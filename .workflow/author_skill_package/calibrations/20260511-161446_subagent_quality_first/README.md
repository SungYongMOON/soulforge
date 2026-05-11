# 20260511-161446_subagent_quality_first

Public-safe staged profile calibration for `.workflow/author_skill_package`.

## Result

- Primary profile: `gpt-5.4-mini|low|darkelf|archivist`
- Reason: lowest published-credit profile that passed the frozen quality gate with rule score `100`.
- Stage A winner: `darkelf|archivist`
- Stage B quality top: `gpt-5.3-codex-spark|high|darkelf|archivist`
- Spark note: Spark candidates were fastest and quality-passing, but their official Codex credit rates are still research preview / non-final, so they are retained as shadow candidates rather than selected as lowest known cost.

## Scope

- Input fixture: synthetic public-safe `api_contract_drift_check` skill authoring request.
- Quality source: isolated subagent staged matrix.
- Telemetry source: CLI probes for Stage B quality-passing candidates.
- Full candidate universe: 300 combinations.
- Executed staged candidates: 34.
- CLI telemetry probes: 19.

## Boundary

- No real API specs, customer endpoint names, production logs, credentials, private incident details, `_workspaces`, `_workmeta`, or `private-state` material belongs in this archive.
- CLI telemetry is a cost and wall-time proxy only; it is not exact subagent telemetry.
