mail_authoring_scope:
  thread_mode: new_mail
  mail_kind: 검토 요청
  send_surface: draft_only
  recipient_state: named_recipient_pending_final_owner_approval
  attachment_scope: selected_current_attachment_only
  output_authority: draft_only
  missing_inputs:
    - final_owner_approved_recipient
    - owner_approved_subject
    - owner_approved_body
    - owner_approved_attachment_selection
    - approved_footer_template_or_Outlook_footer_confirmation

project_keyword_resolution:
  project_mail_keyword: AURORA
  resolution_source: active_project_keyword_index_ref
  authority_note: fixture-scoped resolution only; no claim of project canon truth

subject_candidate: "[AURORA] 검토 요청 - 인터페이스 검토 자료"

owner_style_body_draft: |-
  안녕하세요.

  인터페이스 검토 자료가 준비되어 검토를 요청드립니다.

  첨부 자료를 확인하시고, 확인 결과 또는 필요한 수정 사항을 2026-07-15까지 회신 부탁드립니다.

  감사합니다.

attachment_selection_basis:
  selected:
    - attachment_id: ATT-FINAL
      display_name: interface_review_revB.pdf
      basis:
        - current version
        - shareable
        - explicitly selected by attachment policy
  excluded:
    - attachment_id: ATT-OLD
      display_name: interface_review_revA.pdf
      basis:
        - superseded version
        - explicitly excluded by attachment policy
  state: bound_for_draft
  owner_approval_state: pending

footer_application_state:
  signature_block: not_applied
  company_security_notice_block: not_applied
  template_available: false
  footer_confirmation_needed: true
  consequence: copy-ready final body unavailable; remain draft-only
  non_claim: No footer payload is included.

pre_send_checklist:
  - check: recipient_to_cc_bcc_bound
    state: pending
    note: Final recipient approval is missing.
  - check: subject_matches_project_keyword_rule
    state: pass
  - check: body_purpose_visible
    state: pass
  - check: requested_action_visible
    state: pass
  - check: deadline_visible
    state: pass
  - check: attachments_shareable
    state: pass
  - check: attachment_selection_basis_bound
    state: pass
  - check: superseded_attachment_excluded
    state: pass
  - check: selected_attachment_owner_approved
    state: pending
  - check: signature_and_security_notice_present_once
    state: gap
    note: Footer source is unavailable.
  - check: no_private_paths_secrets_or_internal_run_ids
    state: pass
  - check: owner_approval_state_named
    state: pass

owner_approval_gate_result:
  state: draft_only
  reasons:
    - Final recipient approval is missing.
    - Subject and body approval are missing.
    - Attachment selection approval is missing.
    - Mandatory footer blocks are unavailable.
    - No owner decision reference was supplied.
  external_send_authority: none

send_surface_handoff:
  surface: draft_only
  state: authoring_packet_only
  subject: "[AURORA] 검토 요청 - 인터페이스 검토 자료"
  selected_attachment:
    - ATT-FINAL
  excluded_attachment:
    - ATT-OLD
  stop_before:
    - Outlook mutation
    - recipient binding
    - copy-ready finalization
    - external send
  required_to_advance:
    - owner-approved recipients
    - owner-approved subject
    - owner-approved body
    - owner-approved selected attachment
    - signature and security notice present exactly once
    - owner-approved send surface

metadata_record_plan:
  record_state: draft_only
  fields:
    mail_kind: 검토 요청
    project_keyword: AURORA
    subject_candidate: "[AURORA] 검토 요청 - 인터페이스 검토 자료"
    body_gist: 인터페이스 검토 자료 확인 및 수정 필요 사항 회신 요청
    deadline: 2026-07-15
    selected_attachment_ids:
      - ATT-FINAL
    excluded_attachment_ids:
      - ATT-OLD
    approval_state: draft_only
    footer_state: confirmation_needed
  exclusions:
    - full mail body
    - footer payload
    - raw HTML
    - MSG or EML content
    - attachment payloads
  source_truth_note: This metadata plan is not mail source truth.

boundary_review:
  result: pass_with_draft_only_gaps
  claim_ceiling: synthetic authoring deliverable only
  confirmed_boundaries:
    - No owner approval is claimed.
    - No external send authority is granted.
    - No Outlook or mailbox mutation is represented.
    - No internal project code appears in the subject or body.
    - No recipient was invented.
    - Only supplied facts and the supplied deadline appear in the body.
    - The current attachment is selected and the superseded attachment is excluded.
    - No footer, raw-mail, attachment-payload, secret, or private-path content is included.
  stop_conditions_active:
    - recipient approval missing
    - attachment approval missing
    - footer template missing
    - external-send approval missing
  final_state: draft_only
