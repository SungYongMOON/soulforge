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

Emit only `outbound_team_mail_context_v1`. Bind role-only `recipients.to`,
`recipients.cc`, and `recipients.bcc` entries with a reason; `mail_reason`;
`requested_work[]` entries containing the actual `assignee`, work items,
and per-assignee notes; global notes; facts; schedule before/after/rationale and
deadline or reply-by; participant involvement; requested formats and examples;
attachment metadata; response requirements; and assumptions.
Keep contact values and private paths out of the public template.

## v0 Compatibility

Accept `outbound_team_mail_context_v0` only as normalization input. Use the
workflow-owned map in `workflow.yaml`, then emit one v1 packet without any v0
fields.

- Directly map only fields whose meaning is preserved by the workflow map.
- Do not infer an assignee from a recipient, participant, or request owner.
- For an unsupported or ambiguous public-safe field, preserve the source path
  and value in `assumptions` and keep the result draft-only.
- Merge every derived keyword, recipient, attachment, footer, approval, and
  normalization gap into v1 `assumptions` before rendering or handoff. A gap
  that exists only in a rendered assumptions section is invalid.
- Stop normalization if a value contains contact data, a raw mail excerpt,
  exact footer payload, private path, or private project row. Do not copy that
  value into assumptions.
- Apply the workflow normalizer's declared-flag and deterministic value scan;
  reject email/strong phone forms, concrete absolute/private runtime paths,
  quoted-mail header chains, and footer-security payload indicators even when
  the input incorrectly leaves its safety flags false.

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

## Outlook Terminal Draft Application

When the current user explicitly requests `Outlook terminal`, local Outlook
terminal, PowerShell Outlook, COM, or another programmatic control surface,
select PowerShell plus the local Outlook COM object model as the only executor.
Do not invoke computer-use, app-control, keyboard/pointer automation, or a UI
fallback. The executor may open only the exact current-request local source
message, create its reply or one new unsent draft, preserve the thread subject,
apply the approved body, stage and attach only the exact owner-selected file,
and save or display that draft. It must never call `.Send()`.

If the owner explicitly binds a password method for the selected Office
attachment, derive and use the value only at runtime. Do not print, log, store,
or repeat the value. If COM execution fails, stop and return the copy-ready
draft; do not substitute UI automation. UI/app-control is eligible only when
the current user explicitly requests that control surface.

## Adaptive Body Rendering

Keep `outbound_team_mail_context_v1` as the complete machine-readable source of
truth. Select the human-facing view with the workflow render policy and record
the mode, reason codes, visible sections, and channel recommendation in the
draft packet.

- `compact`: pure sharing only, with no requested work, confirmation, review,
  decision, or required response.
- `action_brief`: use whenever at least one requested work item or required
  response exists, even for one assignee and one item. Show `수신/사유`, purpose
  or review result, supported review/technical basis, `요청 업무`, completion or
  reply criteria, supported follow-up, and attachments. For repeated request
  fields, use a table with `담당자`, `요청 업무`, `확인 목적` or request basis,
  and `완료·회신 기준`; show a deadline only when supplied.
- `decision_brief`: approval or choice; lead with the decision needed and show
  recommendation, alternatives/impact, deadline, and basis only when present.
- `status_change`: lead with the change, before/after, impact, and next action.
- `reply_map`: answer two or more source items in a numbered one-to-one map.

Do not repeat TO/CC values as a `수신` block. Use that section only to map
multiple roles or assignees to responsibilities. Merge `사유` and `요청사유`
when they would repeat the same content. For conflict, negotiation, material
ambiguity, or rapid back-and-forth, recommend live discussion followed by a
short decision/owner/deadline recap. This recommendation never raises send
authority above `draft_only`.

## Validation Checklist

- The existing workflow was loaded and remains the sole procedure authority.
- The workflow-owned team context template was used.
- The workflow-owned render policy selected a mode and omitted empty sections.
- The full normalized context remained complete regardless of visible mode.
- The normalized context emits v1 only; v0 and v1 shapes are never mixed.
- The v1 assumptions array and rendered assumptions contain the same gaps.
- The draft packet and checklist explicitly name `requested_send_surface: outlook_manual` and `authority_state: draft_only` (or checklist `authority_result: draft_only`) separately; never leave authority implied by gaps.
- Every requested work item retains its actual assignee or an explicit unresolved-assignee assumption.
- Global/per-assignee notes, schedule before/after/rationale/deadline, participants, formats/examples, attachments, and response requirements survive into draft context coverage and the pre-send checklist.
- Requested send surface is `outlook_manual`, authority state is named separately, and `draft_only` is never treated as the requested surface by this launcher.
- Any voice profile use includes aggregate-only provenance.
- Missing facts remain assumptions; no facts or schedules are invented.
- Footer gaps keep the result draft-only.
- Compact was not selected when requested work, confirmation, review, decision, or a required response exists.
- Newly authored Outlook paragraphs, headings, bullets, and every table cell explicitly use black text and do not inherit colored reply-thread formatting.
- No external send occurred; any Outlook mutation was limited to one explicitly requested unsent draft through the requested control surface.
- A terminal/programmatic request used PowerShell Outlook COM only and did not fall back to UI or computer-control automation.
- Only the exact owner-selected attachment was staged and attached; any runtime password value was neither printed nor persisted.
- No raw mail payload, exact excerpt, contact value, raw address, exact footer, private path, or project row entered public output.
