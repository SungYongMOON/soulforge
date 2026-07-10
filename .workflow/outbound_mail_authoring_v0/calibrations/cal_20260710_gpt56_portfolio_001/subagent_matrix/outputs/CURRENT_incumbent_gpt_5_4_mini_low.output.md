## Mail Authoring Scope
- `workflow_id`: `outbound_mail_authoring_v0`
- `fixture_id`: `public_synthetic_korean_draft_with_attachment_selection`
- `mail_kind`: `검토 요청`
- `thread_mode`: `new_mail`
- `send_surface`: `draft_only`
- `recipient_scope`: `named_recipient_pending_final_owner_approval`
- `project_code_internal`: `DEMO-042` for internal metadata only, not for subject/body
- `mail_authoring_scope_status`: bound with missing final recipient approval

## Missing Inputs
- Final owner-approved recipient
- Owner-approved send approval
- Footer template content availability
- No other blocking facts provided

## Project Keyword Resolution
- Resolution source used: active project keyword index
- `project_keyword_resolution`: `AURORA`
- Resolution basis: `project_code_internal=DEMO-042` -> `project_mail_keyword=AURORA`
- Internal project code excluded from visible mail content

## Subject Candidate
- `[AURORA] 검토 요청 - interface review package`

## Owner-Style Body Draft
```text
안녕하세요.

첨부한 interface review package를 검토해 주시기 바랍니다.
현재 검토용 자료는 준비되어 있으며, 검토 후 의견을 부탁드립니다.

회신 기한은 2026-07-15입니다.
요청드리는 사항은 수정 필요 여부를 확인하시거나, 필요한 변경사항을 표시해 주시는 것입니다.

감사합니다.
```

## Attachment Selection Basis
- Selected for send: `ATT-FINAL` (`interface_review_revB.pdf`)
- Excluded from send: `ATT-OLD` (`interface_review_revA.pdf`)
- Selection reason: current version only; superseded version excluded
- Shareability check: selected attachment marked shareable

## Footer Gap State
- `template_available`: `false`
- `footer_application_state`: `confirmation_needed`
- Final-send footer requirement is not satisfied for copy-ready final mail
- Draft is retained as draft-only pending footer confirmation

## Pre-Send Checklist
- Recipient to/cc/bcc bound: `not fully bound`
- Subject matches thread or project keyword rule: `yes`
- Body purpose visible: `yes`
- Requested action visible: `yes`
- Attachment selected and shareable: `yes`
- Duplicate or superseded attachment excluded: `yes`
- Footer signature and security notice present once: `no, gap remains`
- No private paths, raw source, secrets, or internal run IDs: `yes`
- Owner approval state named: `draft_only`

## Approval State
- `owner_approval_gate_result`: `draft_only`
- Reason: final recipient approval not provided, and footer template is unavailable

## Handoff
- `send_surface_handoff`: `draft_only`
- Handoff constraint: no sending, no Outlook mutation, no recipient changes, no attachment changes

## Metadata Record Plan
- Store metadata only:
  - workflow id
  - fixture id
  - project keyword resolution
  - subject candidate
  - attachment selection basis
  - draft-only approval state
  - footer gap state
- Do not store:
  - full body payload as authoritative source
  - raw HTML
  - msg/eml content
  - attachment payloads
  - footer payload
- Unknown routes remain owner-review scoped

## Boundary Review
- No external send without current owner approval
- No Outlook folder, rule, or send-button mutation claimed
- No raw mail body or attachment payload copied into public package
- No footer payload disclosed
- No internal project code in visible subject or body
- Output state remains `draft_only`
- Claim ceiling: synthetic, public-safe, draft-only deliverable only
