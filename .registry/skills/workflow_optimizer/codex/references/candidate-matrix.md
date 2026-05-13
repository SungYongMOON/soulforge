# Candidate Matrix

Default mode is `subagent_quality_first`: use a full isolated quality matrix for the first calibration of a workflow unless the user explicitly asks for a cheaper smoke.

Follow the execution mode rule in `SKILL.md`: an actual full optimizer run request covers the default isolated quality matrix and CLI telemetry probes. Do not require a second user approval just because the user did not separately say "subagent" or "CLI". If the runtime lacks the required isolated subagent/candidate-runner surface, stop before candidate execution, report `blocked_runtime_subagent_unavailable`, and ask whether the user wants an explicitly labeled CLI-only fallback.

## Default Full Matrix

- Models: `gpt-5.4-mini`, `gpt-5.4`, `gpt-5.5`
- Reasoning efforts: `low`, `medium`, `high`, `xhigh`
- Species: `human`, `elf`, `dwarf`, `orc`, `darkelf`
- Classes: `administrator`, `archivist`, `auditor`

Exclude the `gpt-5.3-*` family from default calibration, including every reasoning effort. Add a 5.3 model only when the user explicitly requests a historical or latency-specific 5.3 comparison.

## Staged Matrix

Use staged matrices when cost control is more important than first-pass certainty.

Stage A chooses species and class with a cheap baseline:

- Default model: `gpt-5.4-mini`
- Default reasoning effort: `low`
- Default species: `human`, `elf`, `dwarf`, `orc`, `darkelf`
- Default classes: `administrator`, `archivist`, `auditor`

Stage B compares model and reasoning effort on the Stage A winner:

- Procedure/docs workflows: `gpt-5.4-mini`, `gpt-5.4`, `gpt-5.5`
- Code/repo/tool workflows: `gpt-5.4-mini`, `gpt-5.4`, `gpt-5.5`
- Latency-sensitive coding: start with `gpt-5.4-mini`; include other models only when quality or latency evidence requires it.
- Reasoning efforts: `low`, `medium`, `high`, `xhigh`

Stage C re-runs the top 2-3 candidates if differences are small or output quality is close.

## Repeat Runs

For repeat runs of an already calibrated workflow, use saved Top-K profiles from the workflow's latest calibration rather than inventing new nearby candidates.

- Produce the user-facing output with the saved primary profile.
- Shadow-run saved ranks 2-5 when the user asks for ongoing quality monitoring or when the workflow changed.
- If the primary fails the frozen quality gate or a shadow candidate repeatedly wins, update `profile_policy.yaml` or run a new full calibration.
