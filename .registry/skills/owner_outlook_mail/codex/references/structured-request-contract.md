# Structured Request Mail Contract

Use this contract for actionable Korean Outlook request mail. It is an
acceptance gate, not a source of project facts and not send authority.

## Current-request lock

Before rendering, bind the newest owner-approved values for:

- latest corrections
- forbidden superseded terms
- required phrases
- recipient display order
- required visible sections
- selected attachment and thread subject

Apply the newest correction last. Rebuild stale passages instead of layering
more edits on them. The final subject and authored body must contain every
required phrase and zero forbidden terms.

## Default visible structure

For an actionable request without a supplied numbered agenda:

```text
수신 : <approved display name or role>
사유 : <one-line reason>

<greeting and immediate purpose>

1. 목적 or 현황
2. 검토 결과 or 기술·판단 근거
3. 요청 업무
4. 완료·회신 기준
5. 첨부, 비고, or 후속 조치 when supported
```

Show `수신` for one or many recipients but never copy an address into the
body. Omit unsupported sections and renumber the remaining headings without
gaps. If the owner supplies a numbered source agenda, preserve that title and
order as the outer structure.

## Table rules

Use one table when there are multiple assignees, repeated request fields, or
three or more related technical values.

- Preferred work table: `담당자 | 요청 업무 | 완료·회신 기준`. Keep a
  shared reason or context in the introduction or basis section and use the
  readability preset's `request_work_three_column` semantic profile.
- Add `확인 목적·요청 사유` only when it differs by row and the resulting
  table remains readable.
- Add `요청 기한` only when the owner supplied a deadline or reply-by value.
- Technical table: `항목 | 적용·확인 내용 | 비고`
- A two-column key/value table is allowed for one request when three or more
  fields would otherwise repeat.

Do not repeat the same value in the table and surrounding prose.

## Acceptance checks

- The first two non-empty lines are `수신 :` and `사유 :` exactly once.
- The greeting or first two sentences state the purpose.
- Every supported required section is visible and numbered contiguously.
- Required table and headers are present when the table rule applies.
- Every required phrase is present and every superseded term is absent.
- Recipient order matches the current-request lock; addresses are not in the
  body.
- A deadline is visible only when supplied.
- The reply/forward subject is preserved.
- Only the owner-selected attachment is added; inline thread assets are not
  mistaken for business attachments.
- New paragraphs, headings, bullets, and all table cells declare Malgun Gothic
  and RGB black. Reply-thread blue formatting is not inherited.
- The signature and security footer are present once or the draft remains
  blocked for footer confirmation.

## Canonical validation packet

Build `soulforge.structured_request_mail_validation.v1` only after normalizing
the source to `outbound_team_mail_context_v1` and applying the current-request
lock. The packet is a derived, file-only acceptance artifact; it is not a mail
payload and does not grant Outlook application or send authority.

Map the normalized context and lock into these required groups:

- execution boundary: `source_context_schema`, `validation_intent: file_only`,
  `authority_state`, `requested_send_surface: outlook_manual`, and
  `application_requested`;
- rendered content: `body_text`, `body_html`, recipient-language label pair
  (`recipient_label: 수신` with `reason_label: 사유`, or `recipient_label: To`
  with `reason_label: Reason`), `purpose_phrases`, required/forbidden phrases,
  required sections, table counts, and table headers;
- recipient lock: `recipient_display_order` and the separately observed
  `actual_recipient_display_order`; every expected display role must also be
  visible in the top `수신` line in the same order;
- subject lock: `subject.mode`, `value`, `original_thread_subject`, `resolved`,
  and subject-local required/forbidden phrases;
- application guards: exact `attachments.owner_selected` and
  `attachments.staged` lists, `inline_thread_assets_ignored`, deadline supplied
  and visible state, and footer confirmation/counts plus non-secret synthetic
  marker checks for text/HTML presence.

The validator checks required fragments in both text and HTML so the two
renderings cannot diverge on recipients, required sections, required phrases,
or table headers. A structurally valid packet may still return
`application_allowed: false` when it is intentionally `draft_only`, the
subject is unresolved, or the footer is incomplete. Do not apply that packet
to Outlook.

Use `scripts/fixtures/structured_request_pass.json` as the complete synthetic
shape example. Missing fields are validation failures; do not guess or omit
them.

Run `scripts/test_structured_request_mail.ps1` for the file-only regression
matrix. It covers the pass packet, forbidden terms, missing required fields,
visible recipient order, thread subject preservation, attachment scope,
deadline visibility, text/HTML-only forbidden or address content, HTML top-line
recipient order, text/HTML divergence, and confirmed footer/application
evidence. The harness creates only temporary JSON files and
never opens Outlook or creates a mail item.

## Synthetic evaluation boundary

Use public synthetic roles and placeholder facts only. Store the evaluation as
text or a local validation packet. Do not create an Outlook item, recipient,
attachment, COM object, or send action. Never call `.Send()` in an evaluation.
