# Outbound Mail Authoring Boundary Review

- workflow_id: `outbound_mail_authoring_v0`
- request_id: `<stable_request_id>`
- authority_state: `<draft_only | owner_review_ready | owner_approved_send_handoff | blocked>`
- default_route_safe: `no`

## Checks

- External send without current owner approval: `<pass | blocked>`
- Outlook folder/rule/mail mutation claim absent: `<pass | blocked>`
- Raw mail body, raw HTML, `.msg`, `.eml`, and attachment payload absent: `<pass | blocked>`
- Secret/session/credential read absent: `<pass | blocked>`
- Internal project code absent from outgoing subject: `<pass | blocked>`
- Signature block and company security notice block present exactly once or gap marked: `<pass | gap | blocked>`
- Public output excludes exact footer payload and full security disclaimer text: `<pass | blocked>`
- Metadata recording plan is metadata-only: `<pass | gap | blocked>`

## Claim Ceiling

`<observed | source_supported | validated_private | rejected_or_blocked>`

## Notes

`<short boundary note>`
