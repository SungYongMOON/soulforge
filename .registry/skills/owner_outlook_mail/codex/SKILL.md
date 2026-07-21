---
name: soulforge-owner-outlook-mail
description: Use when Codex should draft or revise owner-style Korean business mail for Outlook, especially requests that require visible 수신/사유, 목적·현황, 검토 근거, 요청 업무 tables, 완료·회신 기준, latest owner corrections, black Outlook formatting, Outlook terminal/COM control, or `$soulforge-owner-outlook-mail`; route authoring through the Soulforge outbound-mail workflow, validate the finalized structure before Outlook application, never send a sample, and honor the explicitly requested control surface.
---

# Soulforge Owner Outlook Mail

Use this skill as a thin launcher for `.workflow/outbound_mail_authoring_v0`.
Keep that workflow as the procedure and template authority.
Treat the gates below as a mandatory owner-local specialization that narrows
authoring and Outlook application without granting send authority.

## Operating Steps

1. Read the root agent contract and the workflow's `workflow.yaml`, `step_graph.yaml`, and `profile_policy.yaml`.
2. Read `docs/architecture/workspace/MAIL_SEND_STYLE_POLICY_V0.md` and `.workflow/outbound_mail_authoring_v0/templates/team_mail_context.template.yaml`.
3. Normalize supplied facts to `outbound_team_mail_context_v1`. Preserve role-only `to`/`cc`/`bcc` recipients and reasons, every actual assignee with requested work and notes, global notes, facts, schedule before/after/rationale/deadline or reply-by, participant involvement, format/examples, attachments, and response requirements.
   - When a requester supplies a numbered source agenda, preserve that agenda's number, title, and order as the outer structure of the visible mail. Do not regroup the mail by assignee.
   - For every agenda item, bind and render: `담당`, `요청 업무`, `요청 기한`, `요청 사유`, and `회신/완료 기준`. If a value is unknown, render `지정 필요` or `확인 필요` in that item and add the same gap to `assumptions`; never silently omit it or invent it.
   Accept v0 input only through the workflow compatibility map, emit only v1, and preserve unsupported or ambiguous public-safe source paths and values in `assumptions`. Merge every derived keyword, recipient, attachment, footer, approval, and normalization gap into v1 `assumptions` before rendering; rendered assumptions must match that array. Never infer an assignee from a recipient or participant. Stop rather than copying contact values or private payload into the normalized context.
4. Before drafting or revising, create a current-request lock containing:
   - `owner_latest_corrections`: the newest explicit owner correction for every changed phrase, fact, scope, recipient, order, attachment, and formatting choice.
   - `superseded_or_forbidden_terms`: prior wording or scope that must not reappear.
   - `required_phrases`: exact owner-approved wording that must survive rendering.
   - `recipient_display_order`: approved To/Cc/Bcc display order, separate from body text.
   - `required_visible_sections`: supported sections that the owner expects to see.
   Apply corrections last-write-wins. Rebuild the draft from the locked facts; do not keep patching stale prose. Scan the final subject and authored body for every forbidden term and required phrase before Outlook application. Keep private values in the runtime packet only.
5. If available, bind the optional local/private owner voice profile and its provenance. Use only aggregate traits; never copy exact examples or private values into public output.
6. Bind `requested_send_surface: outlook_manual` and track `authority_state` separately. Missing approval keeps `authority_state: draft_only`; never use the authority state as the requested surface in this launcher.
7. Select the visible body mode with the workflow render policy. Reserve `compact` for pure sharing that has no requested work, confirmation, review, decision, or required response. If even one requested work item or required response exists, use `action_brief` or `decision_brief` regardless of assignee count or apparent complexity.
   For an actionable structured request, use this default visible order unless the owner supplied a numbered source agenda:
   1. Two unnumbered top lines: `수신 : <approved display name/role>` and `사유 : <one-line reason>`. Show `수신` even for one recipient; never place an address in the body.
   2. Greeting and one or two sentences that state the purpose immediately.
   3. `1. 목적` or `1. 현황`.
   4. `2. 검토 결과` or `2. 기술·판단 근거` when supported.
   5. `3. 요청 업무`.
   6. `4. 완료·회신 기준`, with a deadline only when supplied.
   7. `5. 첨부`, `비고`, or `후속 조치` only when supported.
   Omit empty sections and renumber contiguously. Preserve a supplied numbered source agenda as the outer order instead of this default. Use one table for multiple assignees, repeated request fields, or three or more related technical values. Use `담당자 | 요청 업무 | 확인 목적·요청 사유 | 완료·회신 기준` and add `요청 기한` only when supplied; for technical values use `항목 | 적용·확인 내용 | 비고`. Do not repeat the same value in prose and a table. If conflict, negotiation, rapid back-and-forth, or material ambiguity is present, recommend a synchronous discussion and use email only for the agenda or resulting decision record.
8. Draft concise owner-style Korean mail from approved facts, then apply subject, attachment, footer, and owner-approval checks owned by the workflow.
   If a new-mail keyword is not confirmed, leave the subject unresolved and return a body-only draft with the gap in assumptions.
9. Run the structured-request acceptance gate before returning or applying the draft. Read [`references/structured-request-contract.md`](references/structured-request-contract.md), derive the complete `soulforge.structured_request_mail_validation.v1` packet from `outbound_team_mail_context_v1` plus the current-request lock, and do not omit or guess required packet fields. For a local packet, run `scripts/validate_structured_request_mail.ps1 -Path <packet.json>`; maintainers run `scripts/test_structured_request_mail.ps1` for the full file-only regression matrix. The gate must confirm the recipient-language top labels (`수신/사유` or `To/Reason`), purpose in the introduction, contiguous supported sections, required table/header rules in both text and HTML, required phrases present, forbidden terms absent, recipient order and visible recipients unchanged, no address in the body, Malgun Gothic and black formatting declarations, thread subject preservation, approved attachment scope, deadline state, and footer state. Treat `application_allowed: false` as a hard Outlook-application block even when the file-only structure is otherwise valid. If any required check fails, revise and validate again; do not create or update an Outlook draft while the gate is failing.
10. Return the draft, render plan, context coverage, latest-correction coverage, validator result, and pre-send checklist. Confirm that multi-assignee work, notes, schedule, formats/examples, attachments, response requirements, required phrases, and forbidden-term results survived into the normalized context/checklist even when the visible body is compact. Do not send or mutate Outlook in this authoring step.
11. When the user explicitly requests an Outlook draft, bind the requested control surface before applying it:
   - For `Outlook terminal`, `local Outlook terminal`, `PowerShell Outlook`, `COM`, or another explicit programmatic request, use PowerShell with the local Outlook COM object model only. Do not invoke computer-use, app-control, pointer/keyboard automation, or any UI fallback.
   - The programmatic executor may open only the exact current-request local source message, create its reply or one new unsent draft, preserve the existing thread subject when replying, apply only the approved body, stage and attach only the exact owner-selected attachment, and save or display that one draft.
   - Match visible labels and section language to the actual recipient-facing mail language. Korean `수신/사유` is the Korean structured-mail default, not a requirement for an otherwise English external mail; use `To/Reason` or omit unsupported labels when the approved draft is English.
   - Insert an approved Outlook signature as body content, never as a business attachment. Do not read, decode, concatenate, or rewrite the signature `.htm` file. Resolve the runtime-private signature by logical name, then use the Outlook Word editor to insert its `.rtf` representation at a bounded placeholder with `Range.InsertFile`. `scripts/insert_outlook_signature.ps1` is the canonical helper. Verify that no `.rtf` attachment was created, the visible signature/footer appears once, Hangul remains intact when present, and no Unicode replacement character is present.
   - Render approved external references as visible clickable anchors and prefer the official manufacturer or primary-source specification URL. Verify both the visible link label and the final HTML `href`; plain URL text alone does not satisfy this check.
   - Use Word-editor find/replace for non-ASCII visible-text corrections after Outlook has rendered the item. Raw `HTMLBody.Replace()` is not sufficient because Outlook may entity-encode or rewrite the text.
   - Apply the validator-passed body without summarizing or rewriting it. For every newly authored Outlook body range, explicitly apply Malgun Gothic and RGB black font color to body paragraphs, numbered headings, bullets, and every table cell. Never inherit blue or other colored formatting from the replied message. Verify the authored paragraphs, headings, bullets, and table cells are black before saving.
   - When the current user explicitly authorizes a password method for the selected Office attachment, derive the value at runtime from the approved source, apply it only to that attachment, and never print, log, persist, or repeat the value.
   - If the requested programmatic executor fails, stop and return the copy-ready draft. Never switch to UI automation implicitly.
   - Use an app-control executor only when the current user explicitly requests UI or computer control. That UI executor remains limited to one unsent draft and must not send mail.
12. If the owner later gives a separate, current, explicit send or scheduled-send instruction, treat that as a distinct executor handoff. Revalidate the exact saved draft, recipients and order, thread subject, attachment list, footer, latest corrections, and future delivery time immediately before the one authorized send action. This authoring launcher never treats draft approval as send approval and never sends a synthetic or evaluation sample.

## Boundaries

- Do not create a separate profiling workflow.
- This authoring launcher must not itself send, move, delete, mark, categorize, or broadly mutate Outlook mail. A separate executor may create or update one unsent draft only after the user's current explicit request and only within step 11.
- Do not create or edit Outlook folders or rules.
- Do not read raw mail bodies, raw HTML, `.msg`, `.eml`, attachment payloads, secrets, session state, or credential files except the exact local source message and exact owner-selected attachment required for the current explicitly requested draft. Never archive those payloads in public canon or `_workmeta`.
- Do not copy contact values, raw addresses, exact footer text, private paths, project rows, or exact mail excerpts into public files or outputs.
- If the private profile or exact footer source is unavailable, fall back to the public style policy and keep unresolved footer state draft-only.
- Do not call `.Send()`, add unapproved recipients, attach legacy or unselected files, or silently change the requested control surface.
- Do not claim pilot execution, production readiness, default-route safety, external send authority, or broad Outlook mutation authority.
- Never create a synthetic, sample, fixture, evaluator, or forward-test mail item in Outlook. Synthetic validation is file/text only with no recipients, attachments, COM object creation, or `.Send()` call.

Read [`references/mapping.md`](references/mapping.md) for linkage, input fields, profile handling, and validation checks.
