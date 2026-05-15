# 2026-05-15 quality-equivalence calibration

Calibration archive: `calibrations/cal_20260515_quality_equiv_001/`

Runtime mode: `cli_only_calibration` because isolated subagent/candidate-runner tooling was not exposed in this session. The run included actual `gpt-5.5` `low`, `medium`, and `xhigh` candidates and compared them against the `gpt-5.5/xhigh` baseline. Previous primary and shadow profiles were carried forward in `previous_policy_comparison.json` when present.

Old primary: none / draft

New primary: gpt-5.5/low/elf/archivist (qe_gpt_5_5_low_elf_archivist)

Quality class: `quality_equivalent_pass`
Quality score: 92
Baseline-relative quality: 0.92
CLI proxy tokens: input 15769, output 1475, reasoning 16
Wall time: 35.145s

Quality-equivalent shadows:
- qe_gpt_5_5_xhigh_elf_archivist: gpt-5.5/xhigh/elf/archivist, score 100, baseline-relative 1, output tokens 2155, wall 42.49s
- qe_gpt_5_5_medium_elf_archivist: gpt-5.5/medium/elf/archivist, score 92, baseline-relative 0.92, output tokens 2278, wall 44.658s

Telemetry limitations:
- CLI token and wall-time values are proxy telemetry for CLI candidates only.
- Subagent token usage is unavailable.
- Source/download truth was not externally verified for synthetic fixtures.

Boundary note: archive contents are public-safe fixture and evaluation metadata only; raw project payloads, secrets, runtime paths, private-state data, and project-local run truth stay out of the workflow package.
