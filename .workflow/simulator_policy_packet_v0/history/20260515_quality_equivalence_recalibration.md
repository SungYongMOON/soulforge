# Quality-Equivalence Recalibration - 2026-05-15

Calibration archive: `calibrations/cal_20260515_quality_equiv_001/`

The previous policy was draft-only with no primary profile or shadows. The recalibration used the explicitly labeled `cli_only_calibration` fallback because isolated subagent/candidate-runner tooling was unavailable in this runtime.

Actual `gpt-5.5` candidates were run at `low`, `medium`, and `xhigh` with `dwarf / auditor`; `gpt-5.5 / xhigh` was the baseline candidate. The selected primary is `gpt-5.5 / low / dwarf / auditor` with `quality_equivalent_pass`, score `97`, and baseline-relative quality `0.97`.

The `medium` candidate remains a `minimum_viable_pass` shadow only because its downstream handoff and completion state were less explicit than the xhigh baseline.
