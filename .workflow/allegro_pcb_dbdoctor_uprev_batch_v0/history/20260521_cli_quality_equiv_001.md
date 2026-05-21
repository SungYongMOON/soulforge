# allegro_pcb_dbdoctor_uprev_batch_v0 CLI calibration - 2026-05-21

- Calibration id: `cal_20260521_cli_quality_equiv_001`
- Archive: `../calibrations/cal_20260521_cli_quality_equiv_001/`
- Mode: `cli_only_calibration_with_shape_clarified_finalist_rerun`
- Subagent status: `blocked_runtime_subagent_unavailable`
- Fixture: public-safe synthetic fixture derived from the workflow contract only.

## Result

The calibration selected `gpt-5.4-mini` / `medium` / `dwarf` / `auditor` as the primary profile.

The selected candidate `C05MR` passed the strict section-shape gate and preserved the core DB Doctor decisions: `PWR_A.brd` as `converted_success`, `CTRL_B.brd` as `converted_with_warnings`, `BROKEN_C.brd` as `conversion_failed`, and `RF_COLLIDE.brd` as blocked by packet collision.

`C04R` (`gpt-5.4` / `medium` / `dwarf` / `auditor`) is retained as the first shadow because it scored higher quality (`97`) but used the larger model and slower wall time. `C02` remains the high-confidence gpt-5.5 fallback.

## Telemetry Limits

Token and wall-time values are Codex CLI proxy telemetry from synthetic CLI runs. Exact subagent token usage is unavailable. Raw CLI events and stderr were not archived because runtime plugin startup noise can contain host-local paths unrelated to calibration evidence.
