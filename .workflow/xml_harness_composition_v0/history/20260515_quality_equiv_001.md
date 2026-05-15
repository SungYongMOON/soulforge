# xml_harness_composition_v0 quality-equivalence calibration - 2026-05-15

- Calibration id: `cal_20260515_quality_equiv_001`
- Archive: `../calibrations/cal_20260515_quality_equiv_001/`
- Mode: `cli_only_calibration`
- Subagent status: `blocked_runtime_subagent_unavailable`
- Fixture: public-safe synthetic fixture derived from the workflow contract only.

## Result

The revised quality-equivalence policy selected `gpt-5.5` / `medium` / `human` / `auditor` as the primary profile.

`gpt-5.5/xhigh` was run as the baseline and as a formal candidate. `gpt-5.5/medium` scored `96/100`, or `0.96` relative to the baseline, with no material critical-section loss. `gpt-5.5/low` was safe and usable but only `minimum_viable_pass` because it wrapped and renamed the required packet shape, weakening machine-readable downstream handoff.

## Telemetry Limits

Token and wall-time values are Codex CLI proxy telemetry from synthetic CLI runs. Exact subagent token usage is unavailable because the isolated candidate runner was not exposed in this runtime. Raw CLI event streams were redacted after telemetry extraction because they included runtime-local paths and plugin startup noise unrelated to calibration evidence.
