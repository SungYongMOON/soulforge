# Quality-Equivalence Calibration - 2026-05-15

## Scope

- Workflow: `simulation_run_verify_v0`
- Calibration archive: `calibrations/cal_20260515_quality_equiv_001/`
- Fixture boundary: public-safe synthetic only
- Runner surface: ephemeral `codex exec` CLI isolated candidates

## Previous Result

- Previous calibration: `cal_20260515_public_synthetic`
- Previous primary: `gpt-5.4 / low / human / auditor`
- Previous candidate id: `c_stage_b_gpt54_low_human_auditor`
- Previous score: `94`
- Previous status: active under the earlier pass-oriented policy

The previous archive used a `gpt-5.5/xhigh` quality baseline but did not include actual `gpt-5.5` candidate profiles in the rankable comparison set. Under the revised optimizer policy, that evidence is insufficient by itself for a quality-equivalent primary claim.

## New Result

- New calibration: `cal_20260515_quality_equiv_001`
- New primary: `gpt-5.5 / low / human / auditor`
- New candidate id: `qe_gpt55_low_human_auditor`
- Quality class: `quality_equivalent_pass`
- Quality score: `96`
- Baseline-relative quality: `1.0` versus `qe_gpt55_xhigh_human_auditor`

Actual `gpt-5.5` candidate profiles were run for `low`, `medium`, and `xhigh`. All passed the hard gate and quality-equivalence gate on the frozen synthetic fixture. The selected `gpt-5.5/low` profile preserved the baseline's material content while using fewer output and reasoning tokens than `gpt-5.5/xhigh`.

## Old vs New Quality Difference

- The previous `gpt-5.4/low/human/auditor` profile remains quality-equivalent in the new comparison, with score `94` and baseline-relative quality `0.98`.
- The new `gpt-5.5/low/human/auditor` profile is more directly machine-readable, retains explicit owner acceptance separation, and has no material information loss versus the `gpt-5.5/xhigh` candidate.
- The prior profile's main weakness is format ergonomics: it splits the packet across Markdown headings and fenced YAML sections, which is less direct for downstream machine consumption.

## Telemetry Limits

- CLI telemetry is exact for the CLI-isolated candidate runs in the archive, not for a separate subagent runner.
- Provider price by model family was not measured.
- Full model/species/class grid was not run.
- No private run truth, real simulator output, waveform evidence, or owner decision packet was used.
