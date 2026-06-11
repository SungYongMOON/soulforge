# Long Thread Handoff Quality-Equivalence Calibration - 2026-06-11

This calibration used a public-safe synthetic long-thread handoff fixture for
`long_thread_handoff_v0`. It did not use a raw old transcript, private payload,
secret, mail body, attachment payload, real `NIGHT_WORK_HANDOFF` mutation,
external notification, route switch, owner approval, or live pilot evidence.

The shortlist compared five isolated Codex CLI candidates:

- `gpt-5.4-mini|low|dwarf|auditor`
- `gpt-5.4|low|dwarf|auditor`
- `gpt-5.5|low|dwarf|auditor`
- `gpt-5.5|medium|dwarf|auditor`
- `gpt-5.5|xhigh|dwarf|auditor`

Four candidates passed the synthetic hard gate. `gpt-5.4-mini|low|dwarf|auditor`
failed because it omitted `final_goal` from the `night_work_handoff` object,
even though the rest of the packet was safe and mostly usable.

The selected primary profile is `gpt-5.4|low|dwarf|auditor` because it was the
lowest-token quality pass while preserving durable handoff shape,
worker-report-as-evidence handling, validation gap separation, the
`continue_without_clear_or_compact` decision, and the no-default-route/no-
production-ready claim ceiling.

The first shadow profile is `gpt-5.5|low|dwarf|auditor`, which was the fastest
measured passing profile and should be preferred if latency matters more than
the additional token cost.

Archive:
`.workflow/long_thread_handoff_v0/calibrations/cal_20260611_long_thread_handoff_quality_equiv_001/`
