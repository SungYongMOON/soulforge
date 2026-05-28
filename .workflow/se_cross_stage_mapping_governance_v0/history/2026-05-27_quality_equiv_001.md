# 2026-05-27 quality-equivalence calibration

- Workflow: `se_cross_stage_mapping_governance_v0`
- Calibration: `cal_20260527_quality_equiv_001`
- Archive: `calibrations/cal_20260527_quality_equiv_001/`
- Primary profile: `gpt-5.4|low|dwarf|auditor`
- Shadow profiles:
  - `gpt-5.5|medium|dwarf|auditor`
  - `gpt-5.5|low|dwarf|auditor`
  - `gpt-5.4-mini|low|dwarf|auditor`

The calibration used a public-safe synthetic metadata fixture. It compared
fresh subagent candidate outputs for governance route precision, claim-ceiling
discipline, row traceability, and HWP/HWPX/source boundary handling. CLI proxy
telemetry was collected for the shortlisted low-effort candidates.

`gpt-5.4-mini|low|dwarf|auditor` was faster and cheaper but only minimum
viable because its owner-decision routing was less precise. The selected
primary profile keeps stronger route discipline without using private raw
project truth or claiming source, artifact, review, readiness, or verification
authority.
