You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-luna; reasoning_effort=medium; species=dwarf; class=auditor.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: external_reasoning_workspace_v0
kind: workflow
status: active
title: External Reasoning Workspace v0
summary: Use a session-aware external ChatGPT browser conversation as a bounded advisory reasoning workspace, with sanitized prompt packets, DOM message-role readback, private pointer refs, and strict side-effect boundaries.
global_name_ko: 운영_외부추론자문_v0
global_name_ko_scope: registered_invocation_alias
display_name_ko: 운영/자문/외부추론세션
display_name_ko_scope: registered_authoring_aid
naming_contract_ref: .workflow/docs/WORKFLOW_NAMING_CONTRACT_V0.md
entrypoint: run
execution_mode: local_browser_advisory_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
inputs:
  - external_reasoning_request
  - soulforge_task_goal
  - side_effect_authorization
  - public_private_boundary_policy
optional_inputs:
  - prior_external_session_pointer_ref
  - approved_public_context_refs
  - sanitized_private_context_summary
  - max_turn_override
  - owner_decision_refs
outputs:
  - goal_and_authorization_binding
  - chatgpt_preflight_report
  - external_session_pointer_metadata
  - bounded_prompt_packet
  - dom_readback_packet
  - advisory_response_packet
  - continuation_decision
  - boundary_review_note
  - caller_handoff_packet
validation_level: private_pilot_executed_browser_advisory
registration_policy: owner_requested_registration
output_state: registered
classification_lane:
  primary: review_governance
  primary_name_ko: 리뷰/거버넌스
  secondary:
    - knowledge_management
    - project_management
    - workflow_authoring
  secondary_name_ko:
    - 지식 관리
    - 프로젝트 관리
    - 워크플로우 작성
  purpose: discovery_only
  authority: none
execution_binding:
  party_required: false
  candidate_party_id: null
  bound_party_id: null
  binding_authority: none
  notes:
    - Party binding is intentionally unbound for this registered workflow.
    - A matching party lane or browser capability does not create execution authority.
upstream_workflows:
  - workflow_id: long_thread_handoff_v0
    expected_input: bounded_advisory_question_from_manager
    status: optional_caller
  - workflow_id: dual_deep_research_v0
    expected_input: advisory_question_not_replacing_notebooklm_or_codex_source_research
    status: optional_adjacent_caller
downstream_workflows:
  - workflow_id: knowledge_access_event_capture_v0
    expected_input: metadata_only_advisory_use_event
    status: optional_usage_signal_route
  - workflow_id: owner_decision_packet_v0
    expected_input: side_effect_or_authority_decision_needed
    status: optional_owner_decision_route
  - workflow_id: post_development_review_gate_v0
    expected_input: workflow_change_or_claim_review
    status: required_before_readiness_registration_or_default_route_claim
external_reasoning_workspace_contract:
  owns:
    - task_goal_binding
    - side_effect_authorization_binding
    - chrome_chatgpt_preflight_without_secret_inspection
    - same_goal_session_reuse_policy
    - visible_mode_label_selection_policy
    - sanitized_prompt_packet_shape
    - marker_nonce_roundtrip_check
    - dom_message_role_readback_policy
    - bounded_multi_turn_continuation_policy
    - advisory_handoff_shape
    - metadata_pointer_recording_policy
  does_not_own:
    - source_truth
    - validation_verdict_authority
    - owner_approval
    - chatgpt_account_authentication
    - chatgpt_subscription_or_payment_state
    - share_link_creation
    - file_upload
    - project_creation_without_action_time_approval
    - permission_or_invite_changes
    - deletion_archive_or_destructive_cleanup
    - raw_private_payload_storage
    - raw_transcript_storage
    - account_bound_id_publication
    - cookie_token_password_or_session_inspection
    - default_route_switching
    - default_route_safety_claim
  session_policy:
    continue_existing_session_first: true
    reuse_allowed_when:
      - task_goal_matches_current_request
      - private_pointer_ref_is_authorized_and_accessible
      - contamination_risk_is_low
      - same_browser_tab_is_not_controlled_by_another_agent
    create_new_conversation_when:
      - task_goal_changed
      - phase_boundary_requires_clean_context
      - prior_pointer_missing_stale_or_inaccessible
      - contamination_risk_is_high
    default_max_turns: 3
    extended_turns_allowed_when_user_authorized: true
  mode_selection_policy:
    select_only_visible_user_authorized_label: true
    pro_or_thinking_like_label_is_runtime_observation: true
    hard_coded_model_names_forbidden: true
    hidden_endpoint_or_internal_model_probe_forbidden: true
    unavailable_label_result: stop_or_request_owner_decision
  prompt_packet_policy:
    required_fields:
      - task_goal
      - public_safe_context_refs
      - sanitized_context_summary
      - advisory_question
      - side_effect_limits
      - forbidden_content
      - output_shape
      - marker_or_nonce
      - claim_ceiling
    forbidden_fields:
      - raw_private_payload
      - raw_transcript
      - secret_value
      - credential_ref_body
      - cookie_or_session_material
      - host_local_absolute_path
  readback_policy:
    required_method: dom_message_role_readback
    generic_ui_text_readback_sufficient: false
    required_checks:
      - assistant_role_detected
      - marker_or_nonce_present
      - response_completion_observed
      - requested_output_shape_present_or_gap_recorded
      - no_secret_or_private_payload_request
  side_effect_policy:
    allowed_when_scoped_by_user:
      - open_or_claim_chatgpt_tab
      - create_or_reuse_bounded_chat
      - send_sanitized_prompt_packet
      - read_assistant_responses_by_dom_role
      - recover_conversation_url_as_private_pointer_ref
    requires_explicit_action_time_approval:
      - share_link_creation
      - file_upload
      - project_creation
      - invite_or_permission_change
      - deletion_archive_or_destructive_cleanup
      - account_subscription_security_or_payment_setting
    forbidden:
      - cookie_local_storage_password_store_session_file_or_token_inspection
      - raw_private_payload_copy_into_public_canon
      - raw_transcript_copy_into_public_canon
      - chatgpt_answer_as_validation_verdict
      - concurrent_multi_agent_control_of_same_tab
  storage_policy:
    public_package_allows:
      - portable_repo_relative_refs
      - packet_field_names
      - boundary_rules
      - metadata_pointer_shape
    public_package_forbids:
      - raw_conversation_url
      - raw_project_url
      - account_bound_conversation_id
      - account_id
      - raw_transcript
      - private_payload
      - secret
      - host_local_absolute_path
    private_pointer_owner_hint:
      - _workmeta/system
      - _workmeta/<project_code>
      - owner_approved_shared_metadata_surface
  authority_boundary:
    advisory_output_only: true
    not_source_truth: true
    not_validation_verdict: true
    not_owner_approval: true
    not_canon_promotion: true
    not_default_route_safe: true
notes:
  - "This package was extracted from `docs/architecture/guild_hall/EXTERNAL_REASONING_WORKSPACE_V0.md` and registered after owner request on 2026-06-07."
  - "A bounded private pilot executed on 2026-06-07 and observed marker-verified assistant-role DOM readback; this is private execution evidence only, not source truth, production readiness, or default-route safety."
  - "ChatGPT model names and product labels can change; operators must use only visible labels authorized by the user in the current UI."
  - "Conversation and project URLs are private pointer refs and must not be copied into public workflow files."
pilot_evidence:
  state: pilot-executed
  evidence_ref: _workmeta/system/runs/external_reasoning_workspace_pilot_retry_20260607_172733KST/run_evidence/CHATGPT_PILOT_EXECUTION_PACKET.yaml
  verifier_summary: marker_present_in_assistant_role_message_and_dom_role_readback_used
  claim_ceiling: observed
  registration_result: registered
  default_route_safe: no


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: external_reasoning_workspace_v0
kind: step_graph
status: active
steps:
  - step_id: bind_goal_and_authorization
    title: Bind Goal And Authorization
    actor_slot: advisory_controller
    action:
      kind: external_advisory_goal_scope_binding
      requires:
        - external_reasoning_request
        - soulforge_task_goal
        - side_effect_authorization
        - public_private_boundary_policy
      validates:
        - task_goal_is_bounded
        - success_condition_named
        - stop_conditions_named
        - allowed_side_effects_named
        - public_private_boundary_named
      artifact_out: goal_and_authorization_binding
    summary: Bind the Soulforge task goal, advisory question, allowed inputs, side-effect authorization, stop conditions, and claim ceiling before browser interaction begins.
    next:
      on_success: run_chrome_chatgpt_preflight
      on_fail: stop
  - step_id: run_chrome_chatgpt_preflight
    title: Run Chrome ChatGPT Preflight
    actor_slot: browser_operator
    action:
      kind: chrome_chatgpt_preflight_no_secret_inspection
      artifacts_in:
        - goal_and_authorization_binding
      artifact_out: chatgpt_preflight_report
      visible_checks_only:
        - browser_available
        - chatgpt_page_available_or_openable
        - logged_in_state_observable_without_secret_read
        - no_login_recovery_or_captcha
        - no_payment_security_or_permission_prompt
      forbidden_checks:
        - cookie_read
        - local_storage_read
        - password_store_read
        - token_read
        - credential_file_read
        - session_file_read
      blocked_if:
        - login_recovery_required
        - captcha_present
        - secret_or_credential_needed
        - browser_tab_already_controlled_by_another_agent
    summary: Observe only visible browser state to confirm the ChatGPT session can be used; do not inspect secrets, browser storage, credentials, or account internals.
    next:
      on_success: resolve_external_session
      on_fail: stop
  - step_id: resolve_external_session
    title: Resolve External Session
    actor_slot: session_curator
    action:
      kind: same_goal_chatgpt_session_resolution
      artifacts_in:
        - goal_and_authorization_binding
        - chatgpt_preflight_report
      optional_artifacts_in:
        - prior_external_session_pointer_ref
        - owner_decision_refs
      artifact_out: external_session_pointer_metadata
      reuse_rules:
        same_goal_required: true
        authorized_pointer_required: true
        contamination_risk_must_be_low: true
      create_new_rules:
        allowed_only_when_scoped_by_user: true
        fresh_bounded_packet_required: true
        project_creation_requires_explicit_action_time_approval: true
      public_recording:
        raw_url_forbidden: true
        pointer_ref_only: true
    summary: Reuse an authorized same-goal ChatGPT conversation when safe, or create a fresh bounded conversation without storing raw account-bound handles in public canon.
    next:
      on_success: select_visible_mode_label
      on_fail: stop
  - step_id: select_visible_mode_label
    title: Select Visible Mode Label
    actor_slot: browser_operator
    action:
      kind: visible_user_authorized_mode_selection
      artifacts_in:
        - goal_and_authorization_binding
        - external_session_pointer_metadata
      artifact_out: mode_selection_note
      rules:
        select_only_visible_label: true
        pro_or_thinking_like_label_allowed_when_visible_and_user_authorized: true
        hard_coded_model_name_forbidden: true
        hidden_endpoint_probe_forbidden: true
      blocked_if:
        - required_visible_label_unavailable
        - selection_would_change_subscription_payment_or_account_setting
        - label_requires_unapproved_permission_change
    summary: Select only a visible user-authorized Pro / Thinking-like mode label; never hard-code unstable model names or probe hidden runtime internals.
    next:
      on_success: assemble_bounded_prompt_packet
      on_fail: stop
  - step_id: assemble_bounded_prompt_packet
    title: Assemble Bounded Prompt Packet
    actor_slot: prompt_packet_author
    action:
      kind: sanitized_external_advisory_prompt_packet
      artifacts_in:
        - goal_and_authorization_binding
        - mode_selection_note
      optional_artifacts_in:
        - approved_public_context_refs
        - sanitized_private_context_summary
      artifact_out: bounded_prompt_packet
      required_fields:
        - task_goal
        - advisory_question
        - allowed_context_refs
        - sanitized_context_summary
        - side_effect_limits
        - forbidden_content
        - expected_answer_shape
        - marker_or_nonce
        - claim_ceiling
      forbidden_content:
        - raw_private_payload
        - raw_transcript
        - secret_value
        - cookie_or_session_material
        - credential_body
        - host_local_absolute_path
    summary: Build a prompt packet that gives the external workspace only bounded public-safe refs or sanitized summaries, plus an explicit marker or nonce for readback verification.
    next:
      on_success: send_prompt_and_wait
      on_fail: stop
  - step_id: send_prompt_and_wait
    title: Send Prompt And Wait
    actor_slot: browser_operator
    action:
      kind: chatgpt_prompt_submission
      artifacts_in:
        - external_session_pointer_metadata
        - bounded_prompt_packet
      artifact_out: prompt_submission_note
      allowed_actions:
        - paste_or_type_sanitized_prompt
        - submit_prompt
        - wait_for_visible_response_completion
      forbidden_actions:
        - file_upload
        - share_link_creation
        - permission_change
        - payment_or_subscription_change
        - destructive_cleanup
    summary: Submit only the sanitized bounded prompt and wait for the visible assistant response to complete, stopping on any unapproved side effect.
    next:
      on_success: readback_assistant_response
      on_fail: stop
  - step_id: readback_assistant_response
    title: Read Back Assistant Response
    actor_slot: dom_readback_reviewer
    action:
      kind: dom_message_role_assistant_readback
      artifacts_in:
        - bounded_prompt_packet
        - prompt_submission_note
      artifacts_out:
        - dom_readback_packet
        - advisory_response_packet
      readback_method: dom_message_role
      required_checks:
        - assistant_role_detected
        - marker_or_nonce_present
        - response_completion_observed
        - expected_answer_shape_present_or_gap_recorded
        - no_secret_or_raw_private_payload_requested
      generic_ui_text_allowed_as_primary_evidence: false
    summary: Read the assistant response through DOM message-role evidence and verify the marker, role, completion, and answer shape before any advisory output is trusted.
    next:
      on_success: decide_continue_or_handoff
      on_fail: stop
  - step_id: decide_continue_or_handoff
    title: Decide Continue Or Handoff
    actor_slot: continuation_controller
    action:
      kind: bounded_multi_turn_advisory_loop_decision
      artifacts_in:
        - goal_and_authorization_binding
        - advisory_response_packet
        - dom_readback_packet
      optional_artifacts_in:
        - max_turn_override
      artifact_out: continuation_decision
      default_max_turns: 3
      continue_when:
        - marker_verified
        - same_goal_context_continuity_matters
        - missing_piece_is_bounded_and_safe
        - turn_limit_not_reached
      handoff_when:
        - acceptance_condition_met
        - turn_limit_reached
        - advisory_gap_should_be_reported
      restart_or_stop_when:
        - goal_changed
        - contamination_risk_high
        - session_inaccessible
        - unapproved_side_effect_needed
        - secret_or_raw_private_payload_needed
    summary: Continue in the same conversation only while the same bounded goal remains active and the default turn limit has not been reached; otherwise prepare the advisory handoff or stop.
    next:
      on_continue: assemble_bounded_prompt_packet
      on_handoff: assemble_advisory_handoff
      on_fail: stop
  - step_id: assemble_advisory_handoff
    title: Assemble Advisory Handoff
    actor_slot: advisory_archivist
    action:
      kind: external_advisory_handoff_packet
      artifacts_in:
        - goal_and_authorization_binding
        - advisory_response_packet
        - continuation_decision
      artifacts_out:
        - caller_handoff_packet
        - boundary_review_note
      output_rules:
        advisory_only: true
        cite_external_response_as_advisory_not_source_truth: true
        preserve_unresolved_gaps: true
        record_private_pointer_refs_only: true
        public_raw_url_forbidden: true
        raw_transcript_forbidden: true
        secret_forbidden: true
    summary: Convert the external answer into an advisory packet for the caller workflow, retaining gaps and claim limits while recording only metadata/private pointer refs.
    next:
      on_success: complete
      on_fail: stop
stop_conditions:
  - conflicting_or_unbounded_goal
  - missing_side_effect_authorization
  - login_recovery_or_captcha_required
  - secret_or_credential_inspection_needed
  - raw_private_payload_required
  - required_visible_mode_label_unavailable
  - share_upload_project_permission_payment_or_destructive_action_without_explicit_approval
  - concurrent_multi_agent_control_of_same_tab
  - marker_or_nonce_missing_from_readback
  - assistant_response_not_read_by_dom_message_role
  - chatgpt_output_needed_as_validation_verdict_or_source_truth
  - default_turn_limit_reached_without_acceptance


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "fixture_id": "external_reasoning_workspace_v0_public_synthetic_advisory_001",
  "fixture_kind": "public_safe_synthetic_workflow_contract_fixture",
  "workflow_id": "external_reasoning_workspace_v0",
  "task_goal": "Use an external advisory workspace to pressure-test a synthetic workflow routing note without granting validation authority.",
  "side_effect_authorization": {
    "synthetic_only": true,
    "actual_browser_actions_performed": false,
    "allowed_side_effects_in_real_run": [
      "open_or_reuse_chatgpt_tab",
      "send_sanitized_prompt_packet",
      "read_assistant_response_by_dom_role",
      "record_private_pointer_ref_metadata"
    ],
    "explicit_action_time_approval_absent_for": [
      "share_link_creation",
      "file_upload",
      "project_creation",
      "permission_change",
      "payment_or_account_setting_change",
      "destructive_cleanup"
    ]
  },
  "public_private_boundary_policy": {
    "public_context_refs": [
      ".workflow/external_reasoning_workspace_v0/workflow.yaml",
      ".workflow/external_reasoning_workspace_v0/step_graph.yaml"
    ],
    "sanitized_context_summary": "A synthetic caller wants advisory comments on whether a public-safe workflow routing note keeps source truth, validation verdict, and owner approval separate.",
    "forbidden_content": [
      "raw_private_payload",
      "raw_transcript",
      "raw_conversation_url",
      "account_bound_conversation_id",
      "account_id",
      "cookie_or_session_material",
      "token",
      "password",
      "credential_body",
      "host_local_absolute_path"
    ]
  },
  "mode_selection": {
    "visible_user_authorized_label": "SYNTH_VISIBLE_THINKING_LABEL",
    "hard_coded_model_names_allowed": false,
    "hidden_endpoint_probe_allowed": false
  },
  "prompt_packet_request": {
    "advisory_question": "Identify boundary risks in the synthetic workflow routing note and return advisory-only gaps plus a caller handoff summary.",
    "expected_answer_shape": [
      "advisory_findings",
      "boundary_risks",
      "caller_handoff_summary",
      "claim_ceiling"
    ],
    "marker_or_nonce": "SF-EXT-SYNTH-001",
    "claim_ceiling": "advisory_only_not_source_truth_not_validation_verdict"
  },
  "synthetic_dom_readback_observation": {
    "synthetic_observation_only": true,
    "assistant_role_detected": true,
    "marker_or_nonce_present": true,
    "response_completion_observed": true,
    "requested_output_shape_present": true,
    "asked_for_secret_or_private_payload": false,
    "raw_url_recorded": false,
    "raw_transcript_stored": false
  },
  "expected_output_requirements": {
    "top_level_keys": [
      "profile_metadata",
      "goal_and_authorization_binding",
      "chatgpt_preflight_report",
      "external_session_pointer_metadata",
      "bounded_prompt_packet",
      "dom_readback_packet",
      "advisory_response_packet",
      "continuation_decision",
      "boundary_review_note",
      "caller_handoff_packet",
      "completion_state"
    ],
    "actual_browser_action_claim_must_be_false": true,
    "external_answer_must_be_advisory_only": true,
    "private_pointer_must_not_include_raw_url_or_account_id": true,
    "must_not_claim_source_truth_validation_verdict_owner_approval_or_default_route_safety": true
  }
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
