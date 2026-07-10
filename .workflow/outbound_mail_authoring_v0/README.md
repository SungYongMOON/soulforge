# Outbound Mail Authoring v0

Registered workflow for drafting owner-style outbound business mail and
preparing a send handoff without granting send authority by default.

This workflow applies the public mail style policy, resolves project subject
keywords from approved runtime surfaces, checks the mandatory signature plus
security footer, and produces an owner-facing pre-send checklist.

It may also consume the public-safe `templates/team_mail_context.template.yaml`
shape and an optional local/private aggregate owner voice profile. The workflow
remains the procedure authority; the profile is guidance, not mail source truth
or send authority.

## Status

- Workflow status: active
- Registration: registered in `.workflow/index.yaml`
- Short invocation alias: `/outbound-mail`
- Default route: no
- Claim ceiling: registered structure-only workflow; no pilot execution has
  been claimed

## Intended Use

Use this when the owner asks to draft, revise, or prepare an outbound mail such
as:

- new project mail
- reply draft
- forward draft
- 자료송부
- 검토요청
- 수정요청
- 확인요청
- 재송부

The workflow keeps external sending at `draft_only` unless the current request
explicitly approves recipients, subject, body, attachments or no attachments,
send surface, and footer state.

## Core Rules

- New project subjects use a real project mail keyword:
  `[<project_mail_keyword>] <mail_kind> - <detail>`.
- If that keyword is not confirmed, keep the subject unresolved but allow a
  body-only draft with the keyword gap in assumptions and the authority state
  fixed at `draft_only`.
- Internal company project numbers, Soulforge project codes, and display names
  are metadata only and do not go into outgoing subjects.
- Replies and forwards preserve the existing thread subject.
- Final sent mail must include the owner Outlook footer block exactly once:
  signature block plus company security notice block.
- Outlook manual send should use the default signature whose logical name is
  `서명+보안`; account-specific suffixes and exact footer payloads stay local.
- Exact footer contact values and full security disclaimer text stay in Outlook
  default signature or an owner-approved local/private footer template.
- Public workflow files must not store raw mail bodies, raw HTML, `.msg` or
  `.eml` files, attachment payloads, secrets, private project mail rows, or
  runtime absolute paths.

## Non-Use

Do not use this workflow for:

- Outlook folder or rule operations
- sent/received ledger reconciliation
- raw mail body extraction or attachment archiving
- legal, contract, purchasing, or official submission mail requiring separate
  company forms or approvals
- automatic recurring mail unless a separate approved automation scope exists

## Invocation

Use `/outbound-mail` as the short human-facing alias. The resolver target is the
canonical workflow id `outbound_mail_authoring_v0`.

The launcher skill, when installed, should resolve to this workflow and read
`workflow.yaml`, `step_graph.yaml`, and `profile_policy.yaml` at runtime.
