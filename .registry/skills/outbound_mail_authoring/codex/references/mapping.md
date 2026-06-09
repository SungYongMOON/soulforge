# Outbound Mail Authoring Launcher Mapping

## Canon Linkage

- Canon skill id: `outbound_mail_authoring`
- Codex installed skill: `soulforge-outbound-mail-authoring`
- Human workflow alias: `/outbound-mail`
- Source workflow: `.workflow/outbound_mail_authoring_v0/`
- Canon skill package: `.registry/skills/outbound_mail_authoring/`
- Party binding: none; the workflow declares `party_required: false`

## Runtime Resolution

When invoked, resolve `/outbound-mail` to `outbound_mail_authoring_v0`, then read:

1. `.workflow/outbound_mail_authoring_v0/workflow.yaml`
2. `.workflow/outbound_mail_authoring_v0/step_graph.yaml`
3. `.workflow/outbound_mail_authoring_v0/profile_policy.yaml`
4. `docs/architecture/workspace/MAIL_SEND_STYLE_POLICY_V0.md`

Read additional workflow files such as `handoff_rules.yaml`, `monster_rules.yaml`,
or templates only when needed for the current request.

The workflow owns the procedure, profile policy, templates, and boundary posture.
This launcher must not copy optimizer values, step graphs, Outlook runtime
state, project keyword tables, exact footer payloads, or mail payloads into the
skill body.

## Scope Contract

Before drafting, bind:

- thread mode: `new`, `reply`, or `forward`
- mail kind
- send surface: `draft_only`, `outlook_manual`, or `soulforge_send_mail`
- recipients, if known
- attachment refs and external-share state, if any
- project code as internal metadata only, if known
- confirmed project mail keyword or the reason it is missing
- footer source: Outlook default signature or owner-approved private local template
- owner approval state

If required facts are missing, keep the output `draft_only` and expose the gap
in the assumptions and pre-send checklist.

## Subject Rules

- Reply and forward: preserve the existing thread subject.
- New project mail: use `[<project_mail_keyword>] <mail_kind> - <detail>`.
- Do not put company internal project numbers, Soulforge project codes, internal
  run ids, local paths, or project display names into outgoing subjects unless
  the owner explicitly confirms that exact text is externally visible and
  appropriate.

## Footer Rules

Final send handoff requires:

1. signature block present
2. company security notice block present
3. each block present exactly once

The exact footer text is not public workflow or skill content. It stays in
Outlook default signature or an owner-approved private local template.

If the footer source is unknown, draft the mail body and mark:

```text
서명/보안 footer 확인 필요
```

Do not claim `owner_review_ready` for a copy-ready final body when footer source
is unknown.

## Output Shape

The workflow output sequence is:

1. `mail_authoring_scope`
2. `project_keyword_resolution`
3. `subject_candidate`
4. `owner_style_body_draft`
5. `footer_application_state`
6. `pre_send_checklist`
7. `owner_approval_gate_result`
8. `send_surface_handoff`
9. `metadata_record_plan`
10. `boundary_review_note`

Use the templates under `.workflow/outbound_mail_authoring_v0/templates/`.

## Validation Checklist

- `.workflow/outbound_mail_authoring_v0/workflow.yaml` was read before execution.
- `.workflow/outbound_mail_authoring_v0/profile_policy.yaml` was read before selecting or overriding any execution profile.
- `MAIL_SEND_STYLE_POLICY_V0.md` was read before drafting.
- The request's thread mode, mail kind, send surface, recipient, attachment, project, keyword, footer, and owner approval states were bound or marked as gaps.
- Reply and forward subjects were preserved.
- New project subjects used only confirmed project mail keywords.
- Internal company project numbers and Soulforge project codes were not inserted into outgoing subjects.
- The final send handoff requires signature and security notice blocks exactly once.
- Unknown footer template keeps the result draft-only.
- No external send was performed without current owner approval.
- No Outlook folder, rule, send, move, delete, mark-read, category, or mail mutation action was performed.
- No raw body text, raw HTML body, `.msg`, `.eml`, attachment payload, secret, session state, or credential file was read or stored.
- Public tracked files contain no project keyword tables, exact footer payload, runtime absolute paths, raw mail payloads, or private evidence.
- Stronger claims such as pilot-executed, production-ready, default-route-safe, external send authority, or Outlook mutation authority were not made without separate evidence and owner approval.
