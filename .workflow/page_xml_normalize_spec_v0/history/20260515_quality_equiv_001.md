# 2026-05-15 quality-equivalence calibration

Calibration archive: `calibrations/cal_20260515_quality_equiv_001/`

Runtime mode: `cli_only_calibration` because isolated subagent/candidate-runner tooling was not exposed in this session. The run included actual `gpt-5.5` `low`, `medium`, and `xhigh` candidates and compared them against the `gpt-5.5/xhigh` baseline. Previous primary and shadow profiles were carried forward in `previous_policy_comparison.json`; the pre-existing policy YAML was malformed, so its old primary/shadow summary was recovered from the raw excerpt before the policy was replaced with parseable YAML.

Old primary: gpt-5.4/medium/elf/auditor (repeat_topk_gpt_5_4_medium_elf_auditor)

New primary: gpt-5.5/medium/elf/auditor (qe_gpt_5_5_medium_elf_auditor)

Quality class: `quality_equivalent_pass`
Quality score: 96
Baseline-relative quality: 1
CLI proxy tokens: input 15702, output 1124, reasoning 36
Wall time: 24.484s

Quality-equivalent shadows:
- qe_gpt_5_5_low_elf_auditor: gpt-5.5/low/elf/auditor, score 96, baseline-relative 1, output tokens 1385, wall 29.176s
- qe_gpt_5_5_xhigh_elf_auditor: gpt-5.5/xhigh/elf/auditor, score 96, baseline-relative 1, output tokens 1874, wall 37.872s

Telemetry limitations:
- CLI token and wall-time values are proxy telemetry for CLI candidates only.
- Subagent token usage is unavailable.
- Source/download truth was not externally verified for synthetic fixtures.

Boundary note: archive contents are public-safe fixture and evaluation metadata only; raw project payloads, secrets, runtime paths, private-state data, and project-local run truth stay out of the workflow package.
