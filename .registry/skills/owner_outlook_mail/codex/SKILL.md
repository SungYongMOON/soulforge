---
name: soulforge-owner-outlook-mail
description: Use when Codex should explicitly draft owner-style Korean business mail for Outlook manual use, including requests mentioning owner Outlook style, team mail context, or `$soulforge-owner-outlook-mail`; route through the existing Soulforge outbound mail authoring workflow with an optional local/private aggregate voice profile, while never sending mail or mutating Outlook.
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
6. Draft concise owner-style Korean mail from approved facts, then apply subject, attachment, footer, and owner-approval checks owned by the workflow.
   If a new-mail keyword is not confirmed, leave the subject unresolved and return a body-only draft with the gap in assumptions.
7. Return the draft, context coverage, and pre-send checklist. Confirm that multi-assignee work, notes, schedule, formats/examples, attachments, and response requirements survived into the draft/checklist. Do not send or mutate Outlook.

## Boundaries

- Do not create a separate profiling workflow.
- Do not send, move, delete, mark, categorize, or otherwise mutate Outlook mail.
- Do not create or edit Outlook folders or rules.
- Do not read raw mail bodies, raw HTML, `.msg`, `.eml`, attachment payloads, secrets, session state, or credential files.
- Do not copy contact values, raw addresses, exact footer text, private paths, project rows, or exact mail excerpts into public files or outputs.
- If the private profile or exact footer source is unavailable, fall back to the public style policy and keep unresolved footer state draft-only.
- Do not claim pilot execution, production readiness, default-route safety, external send authority, or Outlook mutation authority.

Read [`references/mapping.md`](references/mapping.md) for linkage, input fields, profile handling, and validation checks.
