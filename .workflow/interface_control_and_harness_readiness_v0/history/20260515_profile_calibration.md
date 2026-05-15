# 2026-05-15 profile calibration

`interface_control_and_harness_readiness_v0` was calibrated with a public-safe synthetic fixture covering source-supported power, timing-limited GPIO, local-internal test point misuse, no-connect handling, and label-inferred PWM semantics.

The selected primary profile is `gpt-5.3-codex-spark / high / dwarf / auditor`. It passed the frozen quality gate and was materially faster in CLI proxy telemetry than the stronger `gpt-5.4 / medium / elf / auditor` shadow.

Boundary notes:

- No raw project truth, `_workspaces` material, private payloads, credentials, or secret-derived content was used.
- Readiness outputs remain ceilings only and do not approve harness composition.
- Recalibrate if readiness partitions, no-connect handling, local-internal reclassification policy, or required output templates change.
