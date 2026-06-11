# Latest Update Sync Quality-Equivalence Calibration - 2026-06-11

This calibration used a public-safe synthetic latest-update fixture for
`latest_update_sync_and_followup_v0`. It did not run real pull commands, sync
skills, audit or repair junctions, inspect secrets, download source payloads, or
read host-local cloud roots.

The shortlist compared five isolated Codex CLI candidates:

- `gpt-5.4-mini|low|dwarf|auditor`
- `gpt-5.4|low|dwarf|auditor`
- `gpt-5.5|low|dwarf|auditor`
- `gpt-5.5|medium|dwarf|auditor`
- `gpt-5.5|xhigh|dwarf|auditor`

All candidates passed the synthetic hard gate. The selected primary profile is
`gpt-5.4-mini|low|dwarf|auditor` because it was the lowest-token quality pass
while preserving event-driven update handling, repo boundary separation,
tracked skill bridge policy, metadata-only junction suffix review, and named
metadata-only follow-up routing.

The first shadow profile is `gpt-5.4|low|dwarf|auditor`, which produced a more
explicit boundary narrative and should be preferred if the mini profile loses
clarity in a future live pilot or synthetic rerun.

Archive:
`.workflow/latest_update_sync_and_followup_v0/calibrations/cal_20260611_latest_update_quality_equiv_001/`
