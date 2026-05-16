# 2026-05-15 quality-equivalence calibration

Calibration archive: `calibrations/cal_20260515_quality_equiv_001/`

Runtime mode: `cli_only_calibration` because isolated subagent/candidate-runner tooling was not exposed in this session. The run included actual `gpt-5.5` `low`, `medium`, and `xhigh` candidates and compared them against the `gpt-5.5/xhigh` baseline. Previous primary and shadow profiles were carried forward in `previous_policy_comparison.json` when present.

Old primary: gpt-5.4/medium/elf/administrator (C_primary_gpt_5_4_medium)

New primary: gpt-5.5/low/elf/administrator (qe_gpt_5_5_low_elf_administrator)

Quality class: `quality_equivalent_pass`
Quality score: 100
Baseline-relative quality: 1.042
CLI proxy tokens: input 16832, output 2052, reasoning 13
Wall time: 43.684s

Quality-equivalent shadows:
- qe_gpt_5_5_medium_elf_administrator: gpt-5.5/medium/elf/administrator, score 96, baseline-relative 1, output tokens 2080, wall 42.909s
- qe_gpt_5_5_xhigh_elf_administrator: gpt-5.5/xhigh/elf/administrator, score 96, baseline-relative 1, output tokens 2790, wall 54.295s

Telemetry limitations:
- CLI token and wall-time values are proxy telemetry for CLI candidates only.
- Subagent token usage is unavailable.
- Source/download truth was not externally verified for synthetic fixtures.

Boundary note: archive contents are public-safe fixture and evaluation metadata only; raw project payloads, secrets, runtime paths, private-state data, and project-local run truth stay out of the workflow package.
