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

## Source Agenda Preservation

When the requester provides an originating numbered agenda, treat it as the
visible mail's canonical outer order. Do not replace it with an assignee-first
summary. Keep each agenda number and title, then place its `담당`, `요청 업무`,
`요청 기한`, `요청 사유`, and `회신/완료 기준` directly beneath it. Use
`지정 필요` or `확인 필요` when a field is not supplied, copy that same gap to
`assumptions`, and keep the result `draft_only`; do not infer a missing owner,
deadline, rationale, or completion evidence.

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

## Bound Continuation and Default Executor

For one bounded mail task, retain the latest validated subject, recipient
display order, body corrections, exact selected attachment, requested control
surface, logical signature name, and the saved draft's runtime-private Outlook
StoreID/EntryID. A short continuation reuses those values
and adds only the newly requested operation. Re-ask only when a value changed,
validation detects drift, multiple candidate drafts exist, the file changed, or
trusted lock metadata is unavailable after a context boundary. Never carry this
lock into an unrelated mail task.

When the owner asks for a local Outlook draft without naming a control surface,
run `scripts/insert_outlook_signature.ps1 -AvailabilityProbe`. It uses only
`Marshal.GetActiveObject('Outlook.Application')` against an already running
classic Outlook session and never instantiates COM, starts Outlook, or launches
a process. Select the local programmatic executor when available. Otherwise
return the copy-ready draft and stop; do not substitute UI automation.
UI/app-control remains eligible only when the user explicitly requests it.

## Outlook Draft Preview

After the authoring workflow completes, a separate app-control executor may
open one new unsent Outlook draft only when the current user explicitly asks
to open or show it. It may enter only the bound subject, recipient display
names, and body; it must not send, attach files, reuse prior recipients, alter
other mailbox state, or treat the preview as send approval. If app control
fails, stop UI actions and return the copy-ready draft. This does not change
`requested_send_surface: outlook_manual` or `authority_state: draft_only`.

## Outlook Terminal Draft Application

When the current user explicitly requests `Outlook terminal`, local Outlook
terminal, PowerShell Outlook, COM, or another programmatic control surface,
select PowerShell plus the local Outlook COM object model as the only executor.
Do not invoke computer-use, app-control, keyboard/pointer automation, or a UI
fallback. The executor may open only the exact current-request local source
message, create its reply or one new unsent draft, preserve the thread subject,
apply the approved body, stage and attach only the exact owner-selected file,
and save or display that draft. After its first successful save, capture the
Outlook StoreID and EntryID in the runtime-private current-request lock. It must
never call `.Send()`.

For terminal/COM execution, keep signature insertion inside the Outlook body.
Never parse or concatenate the signature HTML file and never attach its RTF.
Resolve the runtime-private signature by logical name and insert the matching
RTF through the Outlook Word editor at a bounded placeholder with
`Range.InsertFile` and explicitly set its `Attachment` argument to `false`;
`scripts/insert_outlook_signature.ps1` implements this step without reading or
logging footer text. Maintainers can run its `-ContractSelfTest` without opening
Outlook. Before saving the insertion, verify that inline body content increased,
the draft has no RTF attachment, the footer occurs once, any Hangul is intact,
and no Unicode
replacement character is present. Use the Word editor for non-ASCII text
corrections because Outlook can entity-encode `HTMLBody`. For external
reference links, prefer the official primary-source specification and verify
both visible anchor text and the final HTML `href`. Match `To/Reason` versus
`수신/사유` to the approved recipient-facing language.

If the owner explicitly binds a password method for the selected Office
attachment, derive and use the value only at runtime. Do not print, log, store,
or repeat the value. If COM execution fails, stop and return the copy-ready
draft; do not substitute UI automation. UI/app-control is eligible only when
the current user explicitly requests that control surface.

## Owner-approved Send Continuation

A later separate, current, explicit `보내줘` or scheduled-send instruction
authorizes only the exact current locked draft. Resolve it by StoreID/EntryID,
then produce the pre-send revalidation result for recipient values/order,
subject, latest body corrections, exact attachment list, footer, and schedule
when applicable. Call `.Send()` exactly once, then poll Sent Items and Outbox
once per second for at most 30 seconds. Correlate only on the runtime-private
locked subject, ordered typed recipient identities, attachment
name/size/digest, normalized body digest, and send-start UTC time. Use a
normalized direct SMTP identity when available. For `MAPIPDL` without direct
SMTP, resolve every member SMTP, canonicalize the set, and use only its
runtime-private SHA-256 fingerprint while preserving the group's top-level
recipient position. An unresolved member blocks send before `.Send()` and no
member address is logged or persisted. Use
`scripts/outlook_recipient_correlation.ps1` for normalization. Zero matches at
the bound is `unknown`; more than one is `ambiguous`; neither allows automatic
resend. Run `scripts/test_outlook_send_continuation.ps1` for the file-only
contract test. This continuation does not authorize bulk mailbox mutation or
any synthetic or evaluator send.

## Adaptive Body Rendering

Keep `outbound_team_mail_context_v1` as the complete machine-readable source of
truth. Select the human-facing view with the workflow render policy and record
the mode, reason codes, visible sections, and channel recommendation in the
draft packet.

- `compact`: pure sharing only, with no requested work, confirmation, review,
  decision, or required response.
- For a numbered source agenda, preserve its order in `action_brief`; under
  each item show the five mandatory agenda fields or their explicit gaps.
- `action_brief`: use whenever at least one requested work item or required
  response exists, even for one assignee and one item. Show `수신/사유`, purpose
  or review result, supported review/technical basis, `요청 업무`, completion or
  reply criteria, supported follow-up, and attachments. For repeated request
  fields, prefer `담당자 | 요청 업무 | 완료·회신 기준` and render shared reason
  or context outside the table. Use the readability preset's
  `request_work_three_column` semantic profile when those conditions match and
  no latest owner explicit width override exists. Width precedence is owner
  override, then semantic profile, then generic default.
  Add a reason/basis column only when it differs by row and remains readable;
  show a deadline only when supplied.
- `decision_brief`: approval or choice; lead with the decision needed and show
  recommendation, alternatives/impact, deadline, and basis only when present.
- `status_change`: lead with the change, before/after, impact, and next action.
- `reply_map`: answer two or more source items in a numbered one-to-one map.

The public workflow normally avoids repeating TO/CC values as a `수신` block.
The owner structured-request specialization below deliberately narrows that
rule by showing approved display names or roles, never addresses. Merge `사유`
and `요청사유` when they would repeat the same content. For conflict,
negotiation, material ambiguity, or rapid back-and-forth, recommend live
discussion followed by a short decision/owner/deadline recap. This
recommendation never raises send authority above `draft_only`.

## Owner Structured-request Specialization

For this installed owner launcher, an actionable request always shows a body
top line for the approved recipient display name or role and a second line for
the reason, even with one recipient. Never show an address. Then render greeting
and immediate purpose, purpose or status, supported review basis, requested
work, completion or reply criteria, and supported attachment/follow-up sections.
Preserve a supplied numbered source agenda instead of imposing this default.

Before rendering, lock the latest owner corrections, forbidden superseded
terms, required phrases, recipient display order, and required visible sections.
Apply corrections last-write-wins and rebuild stale passages. Before any Outlook
application, run the local structured-request validator and require zero
forbidden terms, all required phrases, unchanged recipient order, required
tables/headers, and explicit Malgun Gothic plus black formatting on authored
paragraphs, headings, bullets, and table cells.

## Validation Checklist

- The existing workflow was loaded and remains the sole procedure authority.
- The workflow-owned team context template was used.
- The workflow-owned render policy selected a mode and omitted empty sections.
- The full normalized context remained complete regardless of visible mode.
- The normalized context emits v1 only; v0 and v1 shapes are never mixed.
- The v1 assumptions array and rendered assumptions contain the same gaps.
- The draft packet and checklist explicitly name `requested_send_surface: outlook_manual` and `authority_state: draft_only` (or checklist `authority_result: draft_only`) separately; never leave authority implied by gaps.
- Every requested work item retains its actual assignee or an explicit unresolved-assignee assumption.
- A supplied numbered source agenda is preserved in the visible body in the same order; the body is not regrouped by assignee.
- Every visible agenda item has `담당`, `요청 업무`, `요청 기한`, `요청 사유`, and `회신/완료 기준`, either as supplied values or explicit `지정 필요`/`확인 필요` gaps mirrored in `assumptions`.
- Global/per-assignee notes, schedule before/after/rationale/deadline, participants, formats/examples, attachments, and response requirements survive into draft context coverage and the pre-send checklist.
- Requested send surface is `outlook_manual`, authority state is named separately, and `draft_only` is never treated as the requested surface by this launcher.
- Any voice profile use includes aggregate-only provenance.
- Missing facts remain assumptions; no facts or schedules are invented.
- Footer gaps keep the result draft-only.
- Compact was not selected when requested work, confirmation, review, decision, or a required response exists.
- Newly authored Outlook paragraphs, headings, bullets, and every table cell explicitly use black text and do not inherit colored reply-thread formatting.
- A matching three-column request-work table used the preset semantic profile and retained its table and column widths after save, close, and reopen.
- Direct SMTP and MAPIPDL recipients used ordered typed correlation identities; no unresolved group member passed pre-send validation and no group member address was logged.
- No external send occurred unless the owner gave a separate current explicit instruction for the exact locked draft; any authorized send called `.Send()` once and its Sent Items/Outbox result was checked without automatic retry.
- No synthetic or evaluator mail item was created in Outlook; samples remain local text or validation packets only.
- A terminal/programmatic request used PowerShell Outlook COM only and did not fall back to UI or computer-control automation.
- An unspecified local Outlook draft request used COM only after its read-only availability probe, or stopped with a copy-ready draft when COM was unavailable.
- A same-task continuation reused validated bindings and re-asked only for a missing, changed, drifted, ambiguous, or untrusted value.
- Only the exact owner-selected attachment was staged and attached; any runtime password value was neither printed nor persisted.
- No raw mail payload, exact excerpt, contact value, raw address, exact footer, private path, or project row entered public output.
