{
  "profile_metadata": {
    "workflow_id": "external_reasoning_workspace_v0",
    "fixture_id": "external_reasoning_workspace_v0_public_synthetic_advisory_001",
    "execution_scope": "isolated_public_safe_synthetic_calibration",
    "species": "dwarf",
    "class": "auditor",
    "authority": "advisory_only",
    "actual_browser_actions_performed": false
  },
  "goal_and_authorization_binding": {
    "task_goal": "Use an external advisory workspace to pressure-test a synthetic workflow routing note without granting validation authority.",
    "success_condition": "Produce public-safe advisory findings, boundary risks, and a caller handoff that preserve source-truth, validation-verdict, owner-approval, and side-effect boundaries.",
    "advisory_question": "Identify boundary risks in the synthetic workflow routing note and return advisory-only gaps plus a caller handoff summary.",
    "allowed_context_refs": [
      ".workflow/external_reasoning_workspace_v0/workflow.yaml",
      ".workflow/external_reasoning_workspace_v0/step_graph.yaml"
    ],
    "allowed_side_effects_in_real_run": [
      "open_or_reuse_chatgpt_tab",
      "send_sanitized_prompt_packet",
      "read_assistant_response_by_dom_role",
      "record_private_pointer_ref_metadata"
    ],
    "authorization_scope": "synthetic_only",
    "action_time_approval_absent_for": [
      "share_link_creation",
      "file_upload",
      "project_creation",
      "permission_change",
      "payment_or_account_setting_change",
      "destructive_cleanup"
    ],
    "public_private_boundary": "Only portable public references, sanitized summaries, packet field names, boundary rules, and pointer metadata shapes may appear publicly.",
    "claim_ceiling": "advisory_only_not_source_truth_not_validation_verdict",
    "stop_conditions": [
      "goal_becomes_conflicting_or_unbounded",
      "required_side_effect_lacks_authorization",
      "login_recovery_or_captcha_is_required",
      "secret_or_credential_inspection_is_needed",
      "raw_private_payload_is_needed",
      "required_visible_mode_label_is_unavailable",
      "unapproved_share_upload_project_permission_payment_or_destructive_action_is_needed",
      "another_agent_controls_the_same_tab",
      "marker_or_nonce_is_missing",
      "assistant response lacks DOM message-role readback",
      "advisory output is requested as source truth or a validation verdict",
      "turn limit is reached without acceptance"
    ]
  },
  "chatgpt_preflight_report": {
    "status": "not_performed_synthetic_fixture",
    "actual_browser_action_claim": false,
    "visible_checks_observed": false,
    "runtime_availability": "unknown",
    "login_state": "unknown",
    "captcha_or_login_recovery_state": "unknown",
    "account_payment_security_or_permission_prompt_state": "unknown",
    "secret_or_browser_storage_inspection": false,
    "note": "No runtime preflight fact is established by this deliverable."
  },
  "external_session_pointer_metadata": {
    "resolution_state": "synthetic_no_session_resolved",
    "session_action": "none",
    "same_goal_reuse_assessed": false,
    "private_pointer_ref": null,
    "raw_url_present": false,
    "account_bound_conversation_id_present": false,
    "account_id_present": false,
    "project_created": false,
    "uncertainty": "A real run would require visible preflight and authorized session resolution before submission."
  },
  "bounded_prompt_packet": {
    "task_goal": "Pressure-test whether a synthetic public-safe workflow routing note keeps source truth, validation verdict, and owner approval separate.",
    "advisory_question": "Identify boundary risks in the synthetic workflow routing note and return advisory-only gaps plus a caller handoff summary.",
    "allowed_context_refs": [
      ".workflow/external_reasoning_workspace_v0/workflow.yaml",
      ".workflow/external_reasoning_workspace_v0/step_graph.yaml"
    ],
    "sanitized_context_summary": "A synthetic caller wants advisory comments on whether a public-safe workflow routing note keeps source truth, validation verdict, and owner approval separate.",
    "visible_mode_label": "SYNTH_VISIBLE_THINKING_LABEL",
    "mode_label_status": "fixture_supplied_not_runtime_observed",
    "side_effect_limits": [
      "No share-link creation",
      "No file upload",
      "No project creation",
      "No permission change",
      "No payment or account-setting change",
      "No destructive cleanup"
    ],
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
    ],
    "expected_answer_shape": [
      "advisory_findings",
      "boundary_risks",
      "caller_handoff_summary",
      "claim_ceiling"
    ],
    "marker_or_nonce": "SF-EXT-SYNTH-001",
    "claim_ceiling": "advisory_only_not_source_truth_not_validation_verdict",
    "submission_state": "not_submitted"
  },
  "dom_readback_packet": {
    "evidence_scope": "fixture_supplied_synthetic_observation_only",
    "runtime_dom_readback_claim": false,
    "assistant_role_detected": true,
    "marker_or_nonce": "SF-EXT-SYNTH-001",
    "marker_or_nonce_present": true,
    "response_completion_observed": true,
    "requested_output_shape_present": true,
    "output_shape_gap": null,
    "secret_or_private_payload_requested": false,
    "raw_url_recorded": false,
    "raw_transcript_stored": false,
    "qualification": "These fields reproduce synthetic fixture observations and do not establish that browser or DOM interaction occurred."
  },
  "advisory_response_packet": {
    "provenance": "synthetic_fixture_derived_advisory",
    "external_response_runtime_claim": false,
    "marker_or_nonce": "SF-EXT-SYNTH-001",
    "advisory_findings": [
      {
        "finding_id": "SYNTH-FINDING-001",
        "finding": "The routing note should label every external response as advisory input and prohibit its promotion to source truth, validation verdict, owner approval, canon, or default-route safety.",
        "status": "advisory_only"
      },
      {
        "finding_id": "SYNTH-FINDING-002",
        "finding": "The caller handoff should retain unresolved gaps and require independent evidence or the designated review workflow for any later validation claim.",
        "status": "advisory_only"
      },
      {
        "finding_id": "SYNTH-FINDING-003",
        "finding": "Side-effect authorization should remain action-specific; authorization to submit a sanitized prompt does not authorize sharing, uploading, project creation, permission changes, account changes, or cleanup.",
        "status": "advisory_only"
      },
      {
        "finding_id": "SYNTH-FINDING-004",
        "finding": "Public records should contain only sanitized content and pointer metadata shapes; raw URLs, account-bound identifiers, transcripts, private payloads, secrets, and host-local absolute paths remain excluded.",
        "status": "advisory_only"
      }
    ],
    "boundary_risks": [
      {
        "risk_id": "SYNTH-RISK-001",
        "risk": "Advisory language may be mistaken for a validation verdict if the caller omits the claim ceiling.",
        "mitigation": "Carry the advisory-only label and explicit non-claims into every downstream packet.",
        "residual_uncertainty": "Caller behavior is not established."
      },
      {
        "risk_id": "SYNTH-RISK-002",
        "risk": "A private session pointer could leak account-bound data if represented by a raw URL or identifier.",
        "mitigation": "Use only an authorized private pointer reference and record no raw handle publicly.",
        "residual_uncertainty": "No real pointer was resolved."
      },
      {
        "risk_id": "SYNTH-RISK-003",
        "risk": "A synthetic DOM observation could be misrepresented as runtime browser evidence.",
        "mitigation": "Mark all readback fields as fixture-supplied and keep the runtime-action claim false.",
        "residual_uncertainty": "Real browser state remains unknown."
      },
      {
        "risk_id": "SYNTH-RISK-004",
        "risk": "Continuation could exceed the bounded goal or turn limit.",
        "mitigation": "Continue only for a same-goal, marker-verified, safe missing piece within the authorized turn limit; otherwise hand off or stop.",
        "residual_uncertainty": "No real conversation turn count exists."
      }
    ],
    "caller_handoff_summary": "The synthetic routing note preserves its boundary only if external reasoning remains advisory, public records stay sanitized, action-time approvals remain separate, unresolved gaps survive handoff, and independent authority supplies any source, validation, owner, canon, or default-route decision.",
    "claim_ceiling": "advisory_only_not_source_truth_not_validation_verdict"
  },
  "continuation_decision": {
    "decision": "handoff",
    "reason": "The synthetic acceptance condition is satisfied by a bounded advisory packet; no real external session exists to continue.",
    "turns_claimed": 0,
    "default_max_turns": 3,
    "goal_changed": false,
    "unapproved_side_effect_needed": false,
    "runtime_contamination_risk": "unknown",
    "restart_required": false
  },
  "boundary_review_note": {
    "public_safe": true,
    "raw_conversation_url_included": false,
    "raw_project_url_included": false,
    "account_bound_identifier_included": false,
    "raw_transcript_included": false,
    "raw_private_payload_included": false,
    "secret_included": false,
    "host_local_absolute_path_included": false,
    "source_truth_claimed": false,
    "validation_verdict_claimed": false,
    "owner_approval_claimed": false,
    "canon_promotion_claimed": false,
    "default_route_safety_claimed": false,
    "runtime_verification_claimed": false,
    "unresolved_boundaries": [
      "Real browser availability is unknown.",
      "Real authentication and visible-mode availability are unknown.",
      "Real session accessibility and contamination risk are unknown.",
      "No owner approval beyond the supplied synthetic authorization is established."
    ]
  },
  "caller_handoff_packet": {
    "handoff_kind": "synthetic_public_safe_advisory",
    "task_goal": "Use an external advisory workspace to pressure-test a synthetic workflow routing note without granting validation authority.",
    "advisory_summary": "Keep external reasoning advisory-only; retain explicit authority separations, sanitized storage, action-specific approvals, bounded continuation, and stop conditions.",
    "advisory_finding_refs": [
      "SYNTH-FINDING-001",
      "SYNTH-FINDING-002",
      "SYNTH-FINDING-003",
      "SYNTH-FINDING-004"
    ],
    "boundary_risk_refs": [
      "SYNTH-RISK-001",
      "SYNTH-RISK-002",
      "SYNTH-RISK-003",
      "SYNTH-RISK-004"
    ],
    "private_pointer_ref": null,
    "required_caller_actions": [
      "Treat findings as advisory rather than factual or validating authority.",
      "Preserve unresolved uncertainties.",
      "Obtain independent evidence for source-truth claims.",
      "Use the designated review authority for validation or workflow-change claims.",
      "Request owner decision before any unapproved side effect or authority-bearing action."
    ],
    "non_claims": [
      "No source truth established.",
      "No validation verdict issued.",
      "No owner approval established.",
      "No canon promotion authorized.",
      "No default-route safety established.",
      "No browser or service interaction established."
    ],
    "claim_ceiling": "advisory_only_not_source_truth_not_validation_verdict"
  },
  "completion_state": {
    "state": "synthetic_deliverable_complete",
    "workflow_runtime_completed": false,
    "actual_browser_actions_performed": false,
    "external_service_contacted": false,
    "state_changed": false,
    "message_sent": false,
    "runtime_facts_verified": false,
    "stop_condition_triggered": false,
    "remaining_uncertainty": "All real-session, browser, authentication, mode-availability, pointer-access, and runtime readback facts remain unestablished."
  }
}
