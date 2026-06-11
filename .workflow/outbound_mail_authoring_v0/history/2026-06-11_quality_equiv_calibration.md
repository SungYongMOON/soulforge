# Outbound Mail Authoring Quality-Equivalence Calibration - 2026-06-11

This calibration used a public-safe synthetic outbound-mail drafting fixture
for `outbound_mail_authoring_v0`. It did not send mail, mutate Outlook, use
SMTP, inspect secrets, expose footer payloads, bind real recipients, or include
attachment payloads.

The shortlist compared five isolated Codex CLI candidates:

- `gpt-5.4-mini|low|dwarf|auditor`
- `gpt-5.4|low|dwarf|auditor`
- `gpt-5.5|low|dwarf|auditor`
- `gpt-5.5|medium|dwarf|auditor`
- `gpt-5.5|xhigh|dwarf|auditor`

Four candidates passed the synthetic hard gate. `gpt-5.4|low|dwarf|auditor`
failed because the completion state was not bounded tightly enough for the
draft-only and pending-owner-approval requirement.

The selected primary profile is `gpt-5.4-mini|low|dwarf|auditor` because it was
the lowest-token quality pass while preserving the project keyword subject
policy, draft-only send authority ceiling, mandatory footer gap, recipient and
attachment approval gaps, metadata-only record plan, and no-real-send synthetic
boundary.

The first shadow profile is `gpt-5.5|low|dwarf|auditor`, which was the fastest
measured passing profile and should be preferred if the mini profile loses
completion-state clarity in a future live pilot or synthetic rerun.

Archive:
`.workflow/outbound_mail_authoring_v0/calibrations/cal_20260611_outbound_mail_quality_equiv_001/`
