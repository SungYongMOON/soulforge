---
name: soulforge-owner-outlook-mail
description: Use when Codex should explicitly draft owner-style Korean business mail for Outlook manual use, including requests mentioning owner Outlook style, team mail context, Outlook terminal control, or `$soulforge-owner-outlook-mail`; route through the existing Soulforge outbound mail authoring workflow, never send mail, and honor the user's explicitly requested draft control surface.
---

# Soulforge Owner Outlook Mail

Use this skill as a thin launcher for `.workflow/outbound_mail_authoring_v0`.
Keep that workflow as the procedure and template authority.

## Operating Steps

1. Read the root agent contract and the workflow's `workflow.yaml`, `step_graph.yaml`, and `profile_policy.yaml`.
2. Read `docs/architecture/workspace/MAIL_SEND_STYLE_POLICY_V0.md` and `templates/team_mail_context.template.yaml`.
3. Normalize supplied facts to `outbound_team_mail_context_v1`. Preserve role-only `to`/`cc`/`bcc` recipients and reasons, every actual assignee with requested work and notes, global notes, facts, schedule before/after/rationale/deadline or reply-by, participant involvement, format/examples, attachments, and response requirements.
   Accept v0 input only through the workflow compatibility map, emit only v1, and preserve unsupported or ambiguous public-safe source paths and values in `assumptions`. Merge every derived keyword, recipient, attachment, footer, approval, and normalization gap into v1 `assumptions` before rendering; rendered assumptions must match that array. Never infer an assignee from a recipient or participant. Stop rather than copying contact values or private payload into the normalized context.
4. If available, bind the optional local/private owner voice profile and its provenance. Use only aggregate traits; never copy exact examples or private values into public output.
5. Bind `requested_send_surface: outlook_manual` and track `authority_state` separately. Missing approval keeps `authority_state: draft_only`; never use the authority state as the requested surface in this launcher.
6. Select the visible body mode with the workflow render policy. Keep the normalized v1 metadata complete, but render only the human-visible sections needed for `compact`, `action_brief`, `decision_brief`, `status_change`, or `reply_map`. Use the six-field `수신/사유/요청업무/요청기한/요청사유/비고` view only for complex action mail, omit every empty field, and show `수신` only when multiple roles or assignees need responsibility mapping. If conflict, negotiation, rapid back-and-forth, or material ambiguity is present, recommend a synchronous discussion and use email only for the agenda or resulting decision record.
7. Draft concise owner-style Korean mail from approved facts, then apply subject, attachment, footer, and owner-approval checks owned by the workflow.
   If a new-mail keyword is not confirmed, leave the subject unresolved and return a body-only draft with the gap in assumptions.
8. Return the draft, render plan, context coverage, and pre-send checklist. Confirm that multi-assignee work, notes, schedule, formats/examples, attachments, and response requirements survived into the normalized context/checklist even when the visible body is compact. Do not send Outlook mail.
9. When the user explicitly requests an Outlook draft, bind the requested control surface before applying it:
   - For `Outlook terminal`, `local Outlook terminal`, `PowerShell Outlook`, `COM`, or another explicit programmatic request, use PowerShell with the local Outlook COM object model only. Do not invoke computer-use, app-control, pointer/keyboard automation, or any UI fallback.
   - The programmatic executor may open only the exact current-request local source message, create its reply or one new unsent draft, preserve the existing thread subject when replying, apply only the approved body, stage and attach only the exact owner-selected attachment, and save or display that one draft.
   - When the current user explicitly authorizes a password method for the selected Office attachment, derive the value at runtime from the approved source, apply it only to that attachment, and never print, log, persist, or repeat the value.
   - If the requested programmatic executor fails, stop and return the copy-ready draft. Never switch to UI automation implicitly.
   - Use an app-control executor only when the current user explicitly requests UI or computer control. That UI executor remains limited to one unsent draft and must not send mail.

## Boundaries

- Do not create a separate profiling workflow.
- Do not send, move, delete, mark, categorize, or otherwise mutate Outlook mail beyond the current user's explicit creation or update of one unsent local draft through the selected executor.
- Do not create or edit Outlook folders or rules.
- Do not read raw mail bodies, raw HTML, `.msg`, `.eml`, attachment payloads, secrets, session state, or credential files except the exact local source message and exact owner-selected attachment required for the current explicitly requested draft. Never archive those payloads in public canon or `_workmeta`.
- Do not copy contact values, raw addresses, exact footer text, private paths, project rows, or exact mail excerpts into public files or outputs.
- If the private profile or exact footer source is unavailable, fall back to the public style policy and keep unresolved footer state draft-only.
- Do not call `.Send()`, add unapproved recipients, attach legacy or unselected files, or silently change the requested control surface.
- Do not claim pilot execution, production readiness, default-route safety, external send authority, or broad Outlook mutation authority.

Read [`references/mapping.md`](references/mapping.md) for linkage, input fields, profile handling, and validation checks.
