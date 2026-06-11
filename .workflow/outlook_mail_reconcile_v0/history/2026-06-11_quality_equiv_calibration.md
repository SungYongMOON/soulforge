# Outlook Mail Reconcile Quality-Equivalence Calibration - 2026-06-11

This calibration used a public-safe synthetic Outlook metadata reconciliation
fixture for `outlook_mail_reconcile_v0`. It did not access Outlook, read mail
bodies, read HTML bodies, copy `.msg` or `.eml` files, copy attachment payloads,
move or delete mail, mark mail read/unread, edit rules/categories, send mail,
write project ledgers, or publish project mail rows.

The shortlist compared five isolated Codex CLI candidates:

- `gpt-5.4-mini|low|dwarf|auditor`
- `gpt-5.4|low|dwarf|auditor`
- `gpt-5.5|low|dwarf|auditor`
- `gpt-5.5|medium|dwarf|auditor`
- `gpt-5.5|xhigh|dwarf|auditor`

Four candidates passed the synthetic hard gate. `gpt-5.5|low|dwarf|auditor`
was excluded because its output weakened the mutation/apply boundary.

The selected primary profile is `gpt-5.4-mini|low|dwarf|auditor` because it was
the lowest-token quality pass while preserving dry-run mode, Codex-managed
project scope, P00 inbox exclusion, metadata-only Outlook reads, owner follow-up
for ambiguous rows, received-history cross-validation, and no-Outlook-mutation
boundary.

Archive:
`.workflow/outlook_mail_reconcile_v0/calibrations/cal_20260611_outlook_reconcile_quality_equiv_001/`
