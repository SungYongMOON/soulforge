# 2026-05-15 quality-equivalence calibration

`interface_control_and_harness_readiness_v0` was re-calibrated under the revised workflow-optimizer quality-equivalence policy using only the public-safe synthetic fixture from `cal_20260515_public_synthetic_staged_v0`.

Old result:

- Primary: `gpt-5.3-codex-spark / high / dwarf / auditor`
- Candidate id: `c06_codex_spark_high_dwarf_auditor`
- Old class: hard-gate pass from staged public synthetic calibration, without actual `gpt-5.5` candidate profiles in the selectable matrix.

New result:

- Primary: `gpt-5.5 / medium / elf / auditor`
- Candidate id: `c11_gpt55_medium_elf_auditor`
- New class: `quality_equivalent_pass`
- Quality score: `95`
- Baseline-relative quality: `0.99` versus the `gpt-5.5/xhigh` evaluator anchor.

Comparison notes:

- Actual `gpt-5.5` candidate profiles were run for low, medium, and xhigh reasoning. `gpt-5.5/medium` won; `gpt-5.5/low` passed but was dominated by medium, and `gpt-5.5/xhigh` was only `minimum_viable_pass` because it weakened `JOIN_1` from `source_supported_possible` to `candidate_safe_possible` in the harness output.
- The old primary profile was rerun as `c13_codex_spark_high_dwarf_auditor` and still passed `quality_equivalent_pass`, but it was demoted to latency shadow because it produced a much larger output and reasoning-token footprint in this run.
- `gpt-5.4/medium/elf/auditor` remained a strong shadow with good provenance, but was slower and used fenced JSON.

Boundary and telemetry limits:

- No raw project truth, `_workspaces` material, private payloads, credentials, or secret-derived content was used.
- The subagent runner was unavailable in this worker context, so the calibration used the user-allowed isolated CLI candidate fallback.
- CLI usage is exact for these candidate executions, but it is not exact subagent telemetry. Dollar cost was not emitted; cost comparison is token and model-family proxy only.
