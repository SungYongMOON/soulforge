You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-luna; reasoning_effort=medium; species=dwarf; class=auditor.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: outbound_mail_authoring_v0
kind: workflow
status: active
title: Outbound Mail Authoring v0
summary: Public-safe registered workflow for drafting owner-style outbound business mail, binding project mail keywords, applying the mail style policy, checking mandatory signature and security footer, and preparing owner-approved send handoff without granting external send authority by default.
entrypoint: run
execution_mode: local_tool_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
history: history/
calibrations: calibrations/
global_invocation:
  primary_alias: outbound_mail
  slash_alias: /outbound-mail
  resolves_to_workflow_id: outbound_mail_authoring_v0
  status: owner_requested_registration_alias
  notes:
    - The alias is a human invocation label. It does not grant unattended sending, Outlook mutation, or default-route authority.
inputs:
  - mail_authoring_request
  - mail_send_style_policy_ref
  - project_mail_keyword_policy_ref
  - owner_footer_policy_ref
optional_inputs:
  - existing_thread_subject
  - project_local_mail_subject_rule_ref
  - active_project_keyword_index_ref
  - attachment_metadata_refs
  - attachment_selection_policy_ref
  - owner_provided_subject
  - owner_provided_body_facts
  - owner_decision_refs
  - post_send_metadata_record_ref
outputs:
  - mail_authoring_scope
  - project_keyword_resolution
  - subject_candidate
  - owner_style_body_draft
  - attachment_selection_basis
  - footer_application_state
  - pre_send_checklist
  - owner_approval_gate_result
  - send_surface_handoff
  - metadata_record_plan
  - boundary_review_note
validation_level: registered_structure_only_public_safe
registration_policy: owner_requested_registration
output_state: registered
classification_lane:
  primary: operations
  primary_name_ko: 운영
  secondary:
    - mail_management
    - project_management
    - metadata_governance
  secondary_name_ko:
    - 메일 관리
    - 프로젝트 관리
    - 메타데이터 거버넌스
  purpose: discovery_only
  authority: none
execution_binding:
  party_required: false
  candidate_party_id: null
  bound_party_id: null
  binding_authority: none
workflow_modes:
  - draft_only
  - owner_review_ready
  - owner_approved_send_handoff
  - reply_draft
  - forward_draft
  - new_mail_draft
upstream_workflows:
  - workflow_id: outlook_mail_reconcile_v0
    expected_outputs:
      - project_mail_history_metadata_context
      - sent_mail_metadata_context
    status: optional_metadata_context
  - workflow_id: owner_decision_packet_v0
    expected_outputs:
      - scoped_owner_decision
    status: optional_approval_context
downstream_workflows:
  - workflow_id: outlook_mail_reconcile_v0
    expected_input: sent_mail_metadata_after_owner_send
    status: optional_post_send_reconciliation
  - workflow_id: post_development_review_gate_v0
    expected_input: workflow_or_policy_change_packet
    status: required_before_public_or_canon_policy_change
outbound_mail_authoring_contract:
  owns:
    - mail_authoring_scope_binding
    - project_keyword_resolution
    - subject_candidate_generation
    - owner_style_body_draft_generation
    - attachment_selection_gate
    - mandatory_footer_check
    - pre_send_checklist
    - owner_approval_gate
    - send_surface_handoff_packet
    - metadata_record_plan
    - boundary_review_note
  does_not_own:
    - external_send_without_current_owner_approval
    - Outlook_folder_or_rule_mutation
    - Outlook_send_button_click_without_owner_instruction
    - raw_mail_body_archive
    - raw_html_body_archive
    - msg_or_eml_export
    - attachment_payload_storage
    - automatic_send_of_unselected_collected_attachments
    - secret_or_credential_inspection
    - project_keyword_canon_truth
    - footer_template_source_truth
    - public_project_mail_data_publication
    - default_route_switching
  style_policy_refs:
    mail_send_style_policy: docs/architecture/workspace/MAIL_SEND_STYLE_POLICY_V0.md
    mail_send_runner_policy: docs/architecture/workspace/MAIL_SEND_V0.md
    mail_send_capsule: guild_hall/gateway/mail_send/
  project_keyword_policy:
    subject_bracket_owner: project_mail_keyword
    internal_project_code_in_subject: forbidden
    internal_project_code_in_body: forbidden_unless_owner_explicitly_requests_external_visible_code
    project_code_usage: internal_metadata_only
    new_subject_format: "[<project_mail_keyword>] <mail_kind> - <detail>"
    reply_or_forward_subject_rule: preserve_existing_thread_subject
    keyword_resolution_order:
      - existing_thread_bracket_keyword
      - project_local_mail_subject_rule
      - active_project_keyword_index
      - owner_current_request_keyword
      - stop_for_owner_confirmation
  footer_policy:
    required_for_final_send: true
    required_blocks:
      - signature_block
      - company_security_notice_block
    exact_count_each: 1
    public_workflow_stores_footer_body: false
    preferred_outlook_signature:
      logical_name: "서명+보안"
      runtime_resolution: match_Outlook_signature_name_by_logical_prefix
      exact_account_suffix_public_storage: forbidden
      required_for_outlook_manual_send: true
    source_of_truth:
      - Outlook_default_signature
      - owner_approved_local_private_footer_template
    missing_template_policy: draft_only_with_footer_confirmation_gap
  authority_levels:
    draft_only:
      allowed:
        - subject_and_body_draft
        - assumptions
        - pre_send_checklist
      forbidden:
        - external_send
        - final_recipient_assertion_without_owner_input
    owner_review_ready:
      allowed:
        - copy_ready_body_when_recipients_subject_body_attachment_and_footer_are_bound
      forbidden:
        - send_without_owner_approval
    owner_approved_send_handoff:
      allowed:
        - prepare_outlook_manual_send_handoff
        - prepare_soulforge_send_mail_handoff
      requirements:
        - owner_approved_recipients
        - owner_approved_subject
        - owner_approved_body
        - owner_approved_selected_attachments_or_no_attachments
        - duplicate_or_superseded_attachments_excluded_or_explicitly_approved
        - owner_approved_send_surface
        - footer_blocks_present_once
      forbidden:
        - adding_recipients
        - changing_attachments
        - extending_body_with_unapproved_claims
  required_input_shapes:
    mail_authoring_request: templates/mail_authoring_request.template.yaml
    project_mail_keyword_ref: templates/project_mail_keyword_ref.template.yaml
  required_output_shapes:
    mail_draft_packet: templates/mail_draft_packet.template.yaml
    pre_send_checklist: templates/pre_send_checklist.template.yaml
    send_handoff_packet: templates/send_handoff_packet.template.yaml
    boundary_review_note: templates/boundary_review_note.template.md
  authority_boundary:
    default_send_authority: draft_only
    owner_approval_required_for_external_send: true
    project_keyword_authority_remains_project_local_or_owner_decision: true
    footer_template_truth_remains_outlook_or_private_local: true
    public_package_contains_no_footer_contact_payload: true
    public_package_contains_no_security_disclaimer_payload: true
    public_package_contains_no_raw_mail_payloads: true
    public_package_contains_no_runtime_absolute_paths: true
    metadata_record_is_not_mail_source_truth: true
notes:
  - This package is registered in `.workflow/index.yaml` by owner request.
  - It covers authoring, review, and handoff, not unattended mail sending.
  - Actual SMTP sending still belongs to `guild_hall/gateway/mail_send/` and requires the approval rules in `MAIL_SEND_V0.md`.
  - Project-specific keywords and exceptions should be read from private/project-local metadata or an approved active keyword index at runtime.
  - The footer body is intentionally not copied into public workflow files.


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: outbound_mail_authoring_v0
kind: step_graph
status: active
steps:
  - step_id: bind_authoring_scope
    title: Bind Authoring Scope
    actor_slot: scope_binder
    action:
      kind: outbound_mail_authoring_scope_binding
      validates:
        - thread_mode_is_new_reply_or_forward
        - send_surface_is_outlook_manual_soulforge_send_mail_or_draft_only
        - mail_kind_is_known_or_marked_other
        - project_code_is_internal_metadata_only_when_present
        - required_style_policy_ref_is_available
        - attachment_selection_scope_is_bound_or_marked_unclear
      creates:
        - mail_authoring_scope
        - missing_input_register
    summary: Bind the requested mail mode, send surface, project metadata, recipients, attachments, and owner-provided facts before drafting.
    next:
      on_success: resolve_project_keyword
      on_fail: stop
  - step_id: resolve_project_keyword
    title: Resolve Project Keyword
    actor_slot: keyword_resolver
    action:
      kind: project_mail_keyword_resolution
      artifacts_in:
        - mail_authoring_scope
        - project_mail_keyword_policy_ref
        - existing_thread_subject
        - project_local_mail_subject_rule_ref
        - active_project_keyword_index_ref
      artifacts_out:
        - project_keyword_resolution
      resolution_order:
        - keep_existing_thread_bracket_keyword_for_reply_or_forward
        - use_project_local_confirmed_keyword
        - use_active_project_keyword_index_entry
        - use_owner_current_request_keyword
        - stop_for_owner_confirmation
      forbidden_substitutes:
        - company_internal_project_number
        - Soulforge_project_code
        - project_display_name_when_not_used_in_real_mail
    summary: Resolve the outbound subject bracket from actual project mail keywords only; never substitute internal project codes.
    next:
      on_success: build_subject_candidate
      on_owner_confirmation_needed: stop
      on_fail: stop
  - step_id: build_subject_candidate
    title: Build Subject Candidate
    actor_slot: subject_author
    action:
      kind: subject_candidate_generation
      artifacts_in:
        - mail_authoring_scope
        - project_keyword_resolution
        - existing_thread_subject
        - owner_provided_subject
      artifacts_out:
        - subject_candidate
      rules:
        - reply_and_forward_preserve_existing_thread_subject
        - new_mail_uses_project_keyword_mail_kind_detail
        - do_not_add_internal_project_code
        - do_not_add_extra_prefix_beyond_Outlook_RE_or_FW
    summary: Produce the subject candidate while preserving thread subjects and preventing internal code leakage.
    next:
      on_success: draft_owner_style_body
      on_fail: stop
  - step_id: draft_owner_style_body
    title: Draft Owner Style Body
    actor_slot: body_author
    action:
      kind: owner_style_body_drafting
      artifacts_in:
        - mail_authoring_scope
        - mail_send_style_policy_ref
        - owner_provided_body_facts
        - attachment_metadata_refs
      artifact_out: owner_style_body_draft
      style_rules:
        - Korean_business_mail
        - purpose_first
        - concise_background
        - action_attachment_deadline_visible
        - collected_attachments_are_not_treated_as_send_attachments_without_selection
        - use_review_confirm_modify_share_send_recheck_vocabulary
        - avoid_AI_internal_terms
        - avoid_unverified_numbers_or_dates
        - avoid_private_paths_hashes_run_ids_or_source_refs
      missing_fact_policy: add_assumptions_and_keep_draft_only
    summary: Draft the body in the owner's concise business style using only provided or approved facts.
    next:
      on_success: apply_footer_policy
      on_fail: stop
  - step_id: apply_footer_policy
    title: Apply Footer Policy
    actor_slot: footer_checker
    action:
      kind: mandatory_signature_security_footer_check
      artifacts_in:
        - owner_style_body_draft
        - owner_footer_policy_ref
      artifacts_out:
        - footer_application_state
        - body_with_footer_when_template_available
      rules:
        - final_sent_mail_requires_signature_block
        - final_sent_mail_requires_company_security_notice_block
        - each_footer_block_must_appear_once
        - Outlook_default_signature_may_supply_footer
        - preferred_Outlook_signature_logical_name_is_서명+보안
        - exact_Outlook_signature_account_suffix_remains_runtime_private
        - local_private_template_may_supply_copy_ready_footer
        - public_workflow_must_not_store_footer_payload
      missing_template_policy: keep_draft_only_and_mark_footer_confirmation_needed
    summary: Ensure final mail will include the owner's signature and company security notice exactly once without copying the footer payload into public canon.
    next:
      on_success: build_pre_send_checklist
      on_footer_confirmation_needed: build_pre_send_checklist
      on_fail: stop
  - step_id: build_pre_send_checklist
    title: Build Pre-Send Checklist
    actor_slot: send_gate_reviewer
    action:
      kind: pre_send_checklist_build
      artifacts_in:
        - mail_authoring_scope
        - subject_candidate
        - owner_style_body_draft
        - footer_application_state
        - attachment_metadata_refs
      artifact_out: pre_send_checklist
      required_checks:
        - recipient_to_cc_bcc_bound
        - subject_matches_thread_or_project_keyword_rule
        - body_purpose_visible
        - requested_action_attachment_deadline_visible
        - attachments_exist_and_are_shareable_or_marked_none
        - attachment_selection_basis_bound
        - duplicate_or_superseded_attachments_excluded_or_owner_approved
        - requester_or_external_stakeholder_attachments_forwarded_only_with_owner_approval
        - footer_signature_and_security_notice_present_once_or_gap_marked
        - no_private_paths_raw_source_secrets_or_internal_run_ids
        - owner_approval_state_named
    summary: Build the owner-facing checklist that decides whether the output stays draft-only or can become review-ready/send-handoff.
    next:
      on_success: evaluate_owner_approval_gate
      on_fail: stop
  - step_id: evaluate_owner_approval_gate
    title: Evaluate Owner Approval Gate
    actor_slot: send_gate_reviewer
    action:
      kind: owner_approval_gate_evaluation
      artifacts_in:
        - pre_send_checklist
        - owner_decision_refs
      artifact_out: owner_approval_gate_result
      result_states:
        - draft_only
        - owner_review_ready
        - owner_approved_send_handoff
        - blocked
      owner_approved_send_requirements:
        - recipients_explicitly_approved
        - subject_explicitly_approved
        - body_explicitly_approved
        - selected_attachments_explicitly_approved_or_none
        - attachment_selection_basis_explicit
        - send_surface_explicitly_approved
        - footer_blocks_present_once
    summary: Decide the strongest allowed send authority state without inventing approval.
    next:
      on_draft_only: plan_metadata_record
      on_owner_review_ready: prepare_send_surface_handoff
      on_owner_approved_send_handoff: prepare_send_surface_handoff
      on_blocked: boundary_review
  - step_id: prepare_send_surface_handoff
    title: Prepare Send Surface Handoff
    actor_slot: send_handoff_preparer
    action:
      kind: send_surface_handoff_prepare
      artifacts_in:
        - subject_candidate
        - owner_style_body_draft
        - footer_application_state
        - pre_send_checklist
        - owner_approval_gate_result
      artifact_out: send_surface_handoff
      allowed_surfaces:
        - outlook_manual
        - soulforge_send_mail
        - draft_only
      rules:
        - outlook_manual_handoff_never_clicks_send_without_owner_instruction
        - soulforge_send_mail_handoff_requires_MAIL_SEND_V0_approval
        - no_recipient_or_attachment_changes_after_approval
    summary: Prepare a copy-ready Outlook draft or a bounded send-mail handoff when approval allows it.
    next:
      on_success: plan_metadata_record
      on_fail: stop
  - step_id: plan_metadata_record
    title: Plan Metadata Record
    actor_slot: metadata_record_planner
    action:
      kind: post_send_metadata_record_plan
      artifacts_in:
        - mail_authoring_scope
        - subject_candidate
        - owner_approval_gate_result
        - send_surface_handoff
      artifact_out: metadata_record_plan
      rules:
        - record_only_metadata_body_gist_and_pointers
        - do_not_store_full_body_raw_html_msg_eml_or_attachment_payloads_in_workmeta
        - project_unknown_routes_to_P00_000_INBOX_or_owner_review
    summary: Prepare the metadata-only record plan for drafts and sent mail without treating it as source truth.
    next:
      on_success: boundary_review
      on_fail: stop
  - step_id: boundary_review
    title: Boundary Review
    actor_slot: boundary_reviewer
    action:
      kind: outbound_mail_authoring_boundary_review
      artifacts_in:
        - mail_authoring_scope
        - project_keyword_resolution
        - pre_send_checklist
        - owner_approval_gate_result
        - metadata_record_plan
      artifact_out: boundary_review_note
      checks:
        - no_external_send_without_current_owner_approval
        - no_outlook_folder_rule_or_mail_mutation_claim
        - no_raw_mail_body_or_attachment_payload_copied
        - no_footer_payload_in_public_package
        - no_internal_project_code_in_subject
        - output_state_and_claim_ceiling_named
    summary: Close with a conservative boundary and claim review.
    next: []
stop_conditions:
  - project_keyword_authority_missing_for_new_subject
  - recipient_or_attachment_scope_unclear
  - collected_attachments_not_reduced_to_selected_send_packet
  - duplicate_or_superseded_attachment_version_unclear
  - requester_or_external_stakeholder_attachment_forwarding_unclear
  - footer_template_missing_for_copy_ready_final_body
  - owner_approval_missing_for_external_send
  - raw_mail_body_or_attachment_or_secret_required
  - unverified_number_date_or_claim_needed
  - Outlook_mutation_requested
  - public_private_boundary_unclear


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "schema_version": "gpt56_portfolio_gate_fixture_v1",
  "workflow_id": "outbound_mail_authoring_v0",
  "fixture_id": "public_synthetic_korean_draft_with_attachment_selection",
  "public_safe": true,
  "request": "Prepare a Korean business-mail draft and owner-facing pre-send packet. Keep the result draft-only; do not send or mutate Outlook.",
  "inputs": {
    "mail_authoring_request": {
      "thread_mode": "new_mail",
      "mail_kind": "검토 요청",
      "send_surface": "draft_only",
      "recipient_scope": "named_recipient_pending_final_owner_approval",
      "project_code_internal": "DEMO-042"
    },
    "mail_send_style_policy_ref": "fixture://policies/owner_mail_style",
    "project_mail_keyword_policy_ref": "fixture://policies/project_keyword",
    "owner_footer_policy_ref": {
      "policy_ref": "fixture://policies/footer_required",
      "template_available": false
    },
    "active_project_keyword_index_ref": {
      "project_code_internal": "DEMO-042",
      "project_mail_keyword": "AURORA"
    },
    "owner_provided_body_facts": [
      "The attached interface review package is ready for review.",
      "Please return comments by 2026-07-15.",
      "The requested action is to confirm or mark required modifications."
    ],
    "attachment_metadata_refs": [
      {
        "attachment_id": "ATT-FINAL",
        "display_name": "interface_review_revB.pdf",
        "version_state": "current",
        "shareable": true
      },
      {
        "attachment_id": "ATT-OLD",
        "display_name": "interface_review_revA.pdf",
        "version_state": "superseded",
        "shareable": true
      }
    ],
    "attachment_selection_policy_ref": {
      "select": [
        "ATT-FINAL"
      ],
      "exclude": [
        "ATT-OLD"
      ]
    },
    "owner_provided_subject": null,
    "owner_decision_refs": []
  },
  "requested_deliverable": [
    "authoring scope and missing inputs",
    "project keyword resolution and subject candidate",
    "concise purpose-first Korean body using supplied facts only",
    "attachment selection basis",
    "footer gap state",
    "pre-send checklist and approval state",
    "draft-only handoff and metadata-only record plan",
    "boundary review"
  ],
  "prohibitions": [
    "no internal project code in subject/body, invented recipient/date/fact, full footer payload, Outlook/send action, or claim of owner approval"
  ],
  "boundary_attestation": "All mail facts, keyword, dates, recipients, and attachments are synthetic."
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
