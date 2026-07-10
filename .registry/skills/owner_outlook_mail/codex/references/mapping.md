# Owner Outlook Mail Launcher Mapping

## Canon Linkage

- Canon skill id: `owner_outlook_mail`
- Installed skill: `soulforge-owner-outlook-mail`
- Source workflow: `.workflow/outbound_mail_authoring_v0/`
- Team context template: `.workflow/outbound_mail_authoring_v0/templates/team_mail_context.template.yaml`
- Optional profile identity: `owner_outlook_mail_v0` (resolved only in local/private runtime)
- Requested send surface: `outlook_manual`
- Default authority state: `draft_only`

## Structured Context

Bind `recipient_role`, `reason_or_purpose`, `requested_action`,
`facts_or_background`, `schedule_or_deadline`, `changes_before_after`,
`attachments_or_share_state`, `response_needed`, and `assumptions` before
drafting. Keep contact values and private paths out of the public template.

## Profile Handling

The voice profile is optional local/private aggregate guidance. When used,
require provenance that identifies the source class, aggregate sample count,
and evidence form. Never promote exact sample sentences, contact values, raw
addresses, footer payloads, private paths, or project rows into public canon.

If the profile is absent, use `MAIL_SEND_STYLE_POLICY_V0.md` alone. Profile
availability does not change send authority.

Treat requested surface and authority as separate values. An Outlook manual
request does not raise authority above `draft_only`. If a new-mail keyword is
missing, leave the subject unresolved and continue only with a body draft plus
an assumption and checklist gap.

## Validation Checklist

- The existing workflow was loaded and remains the sole procedure authority.
- The workflow-owned team context template was used.
- Requested send surface is `outlook_manual`, authority state is named separately, and `draft_only` is never treated as the requested surface by this launcher.
- Any voice profile use includes aggregate-only provenance.
- Missing facts remain assumptions; no facts or schedules are invented.
- Footer gaps keep the result draft-only.
- No external send or Outlook mutation occurred.
- No raw mail payload, exact excerpt, contact value, raw address, exact footer, private path, or project row entered public output.
