# 2026-05-15 quality-equivalence calibration

Calibration archive: `calibrations/cal_20260515_quality_equiv_001/`

Runtime mode: `cli_only_calibration` because isolated subagent/candidate-runner tooling was not exposed in this session. The run included actual `gpt-5.5` `low`, `medium`, and `xhigh` candidates and compared them against the `gpt-5.5/xhigh` baseline. Previous primary and shadow profiles were carried forward in `previous_policy_comparison.json` when present.

Old primary: gpt-5.4/high/dwarf/archivist (C_shadow_gpt_5_4_high)

New primary: gpt-5.5/medium/dwarf/archivist (qe_gpt_5_5_medium_dwarf_archivist)

Quality class: `quality_equivalent_pass`
Quality score: 96
Baseline-relative quality: 1
CLI proxy tokens: input 17781, output 1604, reasoning 30
Wall time: 33.573s

Quality-equivalent shadows:
- qe_gpt_5_5_low_dwarf_archivist: gpt-5.5/low/dwarf/archivist, score 96, baseline-relative 1, output tokens 1651, wall 34.387s
- qe_gpt_5_5_xhigh_dwarf_archivist: gpt-5.5/xhigh/dwarf/archivist, score 96, baseline-relative 1, output tokens 1660, wall 35.757s

Telemetry limitations:
- CLI token and wall-time values are proxy telemetry for CLI candidates only.
- Subagent token usage is unavailable.
- Source/download truth was not externally verified for synthetic fixtures.

Boundary note: archive contents are public-safe fixture and evaluation metadata only; raw project payloads, secrets, runtime paths, private-state data, and project-local run truth stay out of the workflow package.
