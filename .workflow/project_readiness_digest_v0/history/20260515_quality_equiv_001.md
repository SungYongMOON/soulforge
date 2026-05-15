# Quality equivalence calibration - 2026-05-15

Calibration: `cal_20260515_quality_equiv_001`
Mode: `cli_only_calibration` because isolated subagent/candidate-runner tooling was unavailable in this runtime.

Old policy: status draft; primary none/draft
New primary: `gpt-5.5|medium|dwarf|administrator` (quality_equivalent_pass, score 94.0, baseline-relative 1.033).
Baseline: `gpt-5.5|xhigh|dwarf|administrator`.

Promotion basis: the primary met the revised `quality_equivalent_pass` gate against the `gpt-5.5/xhigh` baseline. Candidates below that gate remain shadows or minimum-viable evidence only. CLI telemetry is exact for the CLI candidates but not exact subagent telemetry.
