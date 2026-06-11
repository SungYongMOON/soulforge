# External Reasoning Workspace Quality-Equivalence Calibration - 2026-06-11

This calibration used a public-safe synthetic advisory controller fixture for
`external_reasoning_workspace_v0`. It did not open Chrome, submit a real
ChatGPT prompt, inspect cookies, read session material, upload files, create
share links, change permissions, change payment/account settings, or store raw
conversation identifiers.

The shortlist compared five isolated Codex CLI candidates:

- `gpt-5.4-mini|low|dwarf|auditor`
- `gpt-5.4|low|dwarf|auditor`
- `gpt-5.5|low|dwarf|auditor`
- `gpt-5.5|medium|dwarf|auditor`
- `gpt-5.5|xhigh|dwarf|auditor`

All five candidates passed the synthetic hard gate after the evaluator
distinguished authority-denial keys such as `not_source_truth: true` from real
overclaim keys such as `source_truth: true`.

The selected primary profile is `gpt-5.4-mini|low|dwarf|auditor` because it was
the lowest-token quality pass while preserving the visible-label policy,
sanitized prompt packet, metadata-only pointer boundary, synthetic DOM readback
checks, advisory-only claim ceiling, and no-real-browser synthetic boundary.

The first shadow profile is `gpt-5.5|medium|dwarf|auditor`, which produced the
highest non-primary weighted score and should be preferred if a future
adversarial fixture exposes weaker boundary language in the mini profile.

Archive:
`.workflow/external_reasoning_workspace_v0/calibrations/cal_20260611_external_reasoning_quality_equiv_001/`
