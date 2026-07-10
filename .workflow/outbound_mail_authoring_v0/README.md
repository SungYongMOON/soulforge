# Outbound Mail Authoring v0

Registered workflow for drafting owner-style outbound business mail and
preparing a send handoff without granting send authority by default.

This workflow applies the public mail style policy, resolves project subject
keywords from approved runtime surfaces, checks the mandatory signature plus
security footer, and produces an owner-facing pre-send checklist.

It may also consume the public-safe `outbound_team_mail_context_v1` shape from
`templates/team_mail_context.template.yaml` and an optional local/private
aggregate owner voice profile. The v1 shape preserves role-only recipients,
per-assignee work and notes, global notes, facts, schedule changes, participant
involvement, formats/examples, attachments, and response requirements. Supported
v0 input is normalized to v1-only; ambiguous public-safe values remain explicit
assumptions and unsafe values stop normalization. The workflow remains the
procedure authority; the profile is guidance, not mail source truth or send
authority.

The public synthetic forward-test fixture is
`templates/team_mail_context.validation_fixture.yaml`. It covers two assignees,
assumption synchronization, explicit requested-surface/authority separation,
and ambiguous v0-to-v1 normalization without private or contact data.
The deterministic compatibility check is
`scripts/normalize_team_mail_context.mjs --fixture <fixture>`; it emits only v1
and stops when a public-safety flag reports protected input or deterministic
value scanning detects contact values, concrete absolute/private runtime paths,
quoted-mail header chains, or footer-security payload indicators. The value scan
does not classify ordinary dates, unseparated numeric identifiers, or part
numbers as contact data.

Visible body structure is selected separately from normalized metadata. The
deterministic policy in `templates/mail_render_policy.template.yaml` uses five
modes: `compact`, `action_brief`, `decision_brief`, `status_change`, and
`reply_map`. The full v1 context remains the source of truth in every mode;
empty headings are omitted. The six-field Korean action view (`수신`, `사유`,
`요청업무`, `요청기한`, `요청사유`, `비고`) is an expanded view for complex
action mail, not a mandatory shell for every message. Validate the selector
with `scripts/select_mail_render_mode.mjs --fixture
templates/mail_render_policy.validation_fixture.yaml`.

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
- Conflict, negotiation, rapid back-and-forth, or material ambiguity should be
  discussed synchronously; email then records the decision, owner, and deadline.

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
