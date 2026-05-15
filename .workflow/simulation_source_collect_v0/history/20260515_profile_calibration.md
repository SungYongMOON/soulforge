# 2026-05-15 Profile Calibration

Calibrated `simulation_source_collect_v0` against a public-safe synthetic mixed model-source fixture.

The run used `gpt-5.5 / xhigh` as evaluator-only quality anchor, then staged subagent quality checks across selected species/class combinations and model families. The winning operating profile is:

- model: `gpt-5.3-codex`
- reasoning_effort: `low`
- species: `dwarf`
- class: `auditor`

The chosen profile passed the frozen quality gate while preserving the workflow's pre-deck, pre-run, no-payload, no-secret, no-conversion boundaries. CLI proxy telemetry was collected for quality-passing finalists only; subagent exact token usage was not available.
