# GitHub Upload Publish Quality-Equivalence Calibration - 2026-06-11

This calibration used a public-safe synthetic upload fixture for
`github_upload_publish_v0`. It did not run real git commands, create commits,
push remotes, inspect secrets, or read private/raw project material.

The shortlist compared five isolated Codex CLI candidates:

- `gpt-5.4-mini|low|dwarf|auditor`
- `gpt-5.4|low|dwarf|auditor`
- `gpt-5.5|low|dwarf|auditor`
- `gpt-5.5|medium|dwarf|auditor`
- `gpt-5.5|xhigh|dwarf|auditor`

All candidates passed the synthetic hard gate. The selected primary profile is
`gpt-5.4-mini|low|dwarf|auditor` because it was the lowest-token and fastest
quality-passing candidate while preserving the public/private boundary,
blocking `_workspaces` raw material from public commit, and holding push until
`done:check` passes.

The first shadow profile is `gpt-5.4|low|dwarf|auditor`, which produced a more
explicit boundary narrative and should be preferred if the mini profile loses
clarity in a future live pilot or synthetic rerun.

Archive:
`.workflow/github_upload_publish_v0/calibrations/cal_20260611_github_upload_quality_equiv_001/`
