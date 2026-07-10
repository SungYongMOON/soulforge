{
  "profile_metadata": {
    "workflow_id": "external_reasoning_workspace_v0",
    "fixture_id": "external_reasoning_workspace_v0_public_synthetic_advisory_001",
    "profile_role_metadata": {
      "model_label": "synthetic_assigned_profile",
      "reasoning_effort": "medium",
      "species": "dwarf",
      "class": "auditor"
    },
    "claim_ceiling": "advisory_only_not_source_truth_not_validation_verdict"
  },
  "goal_and_authorization_binding": {
    "task_goal": "Use an external advisory workspace to pressure-test a synthetic workflow routing note without granting validation authority.",
    "advisory_question": "Identify boundary risks in the synthetic workflow routing note and return advisory-only gaps plus a caller handoff summary.",
    "allowed_side_effects": [
      "open_or_reuse_chatgpt_tab",
      "send_sanitized_prompt_packet",
      "read_assistant_response_by_dom_role",
      "record_private_pointer_ref_metadata"
    ],
    "disallowed_without_explicit_action_time_approval": [
      "share_link_creation",
      "file_upload",
      "project_creation",
      "permission_change",
      "payment_or_account_setting_change",
      "destructive_cleanup"
    ],
    "stop_conditions": [
      "goal_becomes_unbounded",
      "authorization_is_missing",
      "secret_or_private_payload_is_needed",
      "required_visible_mode_label_is_unavailable",
      "marker_or_nonce_is_missing",
      "DOM_message_role_readback_is_unavailable",
      "external_answer_is_requested_as_source_truth_or_validation_verdict"
    ],
    "public_private_boundary": {
      "approved_context_refs": [
        ".workflow/external_reasoning_workspace_v0/workflow.yaml",
        ".workflow/external_reasoning_workspace_v0/step_graph.yaml"
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
      ]
    }
  },
  "chatgpt_preflight_report": {
    "status": "not_performed_synthetic_fixture_only",
    "synthetic_observation_scope": "No browser action or runtime fact is claimed.",
    "required_visible_checks": [
      "browser_available",
      "chatgpt_page_available_or_openable",
      "logged_in_state_observable_without_secret_read",
      "no_login_recovery_or_captcha",
      "no_payment_security_or_permission_prompt"
    ],
    "secret_inspection": "forbidden",
    "stop_if": [
      "login_recovery_required",
      "captcha_present",
      "secret_or_credential_needed",
      "browser_tab_already_controlled_by_another_agent"
    ]
  },
  "external_session_pointer_metadata": {
    "status": "synthetic_pointer_metadata_only",
    "pointer_ref": "_workmeta/system/synthetic/external_reasoning_workspace_v0_public_synthetic_advisory_001",
    "raw_url_present": false,
    "account_bound_identifier_present": false,
    "reuse_policy": {
      "same_goal_required": true,
      "authorized_pointer_required": true,
      "low_contamination_risk_required": true
    }
  },
  "bounded_prompt_packet": {
    "task_goal": "Use an external advisory workspace to pressure-test a synthetic workflow routing note without granting validation authority.",
    "public_safe_context_refs": [
      ".workflow/external_reasoning_workspace_v0/workflow.yaml",
      ".workflow/external_reasoning_workspace_v0/step_graph.yaml"
    ],
    "sanitized_context_summary": "A synthetic caller wants advisory comments on whether a public-safe workflow routing note keeps source truth, validation verdict, and owner approval separate.",
    "advisory_question": "Identify boundary risks in the synthetic workflow routing note and return advisory-only gaps plus a caller handoff summary.",
    "side_effect_limits": [
      "No file upload",
      "No share-link creation",
      "No project creation",
      "No permission, payment, or account-setting changes",
      "No destructive cleanup"
    ],
    "forbidden_content": [
      "raw_private_payload",
      "raw_transcript",
      "secret_value",
      "cookie_or_session_material",
      "credential_body",
      "host_local_absolute_path"
    ],
    "output_shape": [
      "advisory_findings",
      "boundary_risks",
      "caller_handoff_summary",
      "claim_ceiling"
    ],
    "marker_or_nonce": "SF-EXT-SYNTH-001",
    "claim_ceiling": "advisory_only_not_source_truth_not_validation_verdict"
  },
  "dom_readback_packet": {
    "status": "synthetic_observation_only",
    "readback_method": "dom_message_role",
    "assistant_role_detected": true,
    "marker_or_nonce_present": true,
    "response_completion_observed": true,
    "requested_output_shape_present": true,
    "secret_or_private_payload_requested": false,
    "raw_url_recorded": false,
    "raw_transcript_stored": false,
    "runtime_execution_claim": false
  },
  "advisory_response_packet": {
    "status": "advisory_only",
    "advisory_findings": [
      "The routing note should explicitly identify external reasoning as advisory input only.",
      "Source truth, validation verdict, owner approval, and canon promotion must remain outside the external workspace's authority.",
      "Private session pointers may be recorded only as metadata references and must not expose raw URLs or account-bound identifiers.",
      "Continuation should stop or hand off when the goal changes, contamination risk rises, a forbidden payload is needed, or the turn limit is reached without acceptance."
    ],
    "boundary_risks": [
      "Treating an external response as validation or source truth",
      "Persisting raw transcript, private payload, raw URL, or account identifier",
      "Performing unapproved upload, sharing, project, permission, payment, or destructive actions",
      "Using hidden model or endpoint inspection instead of a visible user-authorized label",
      "Continuing after marker, role, completion, or answer-shape checks fail"
    ],
    "caller_handoff_summary": "Use the findings as bounded advisory gaps for owner or validator review. No source-truth, validation, approval, canon-promotion, or default-route-safety claim is established.",
    "claim_ceiling": "advisory_only_not_source_truth_not_validation_verdict"
  },
  "continuation_decision": {
    "decision": "handoff",
    "basis": [
      "Synthetic requested output shape is represented as complete.",
      "The fixture does not authorize actual browser actions.",
      "No further turn is necessary for this bounded deliverable."
    ],
    "additional_turns": 0,
    "restart_or_stop_triggers": [
      "goal_changed",
      "contamination_risk_high",
      "session_inaccessible",
      "unapproved_side_effect_needed",
      "secret_or_raw_private_payload_needed"
    ]
  },
  "boundary_review_note": {
    "public_safe": true,
    "raw_url_included": false,
    "account_id_included": false,
    "raw_transcript_included": false,
    "private_payload_included": false,
    "source_truth_claim": false,
    "validation_verdict_claim": false,
    "owner_approval_claim": false,
    "default_route_safety_claim": false,
    "runtime_verification_claim": false,
    "uncertainty": "The deliverable records synthetic fixture observations and bounded advisory content only; it does not establish external runtime execution."
  },
  "caller_handoff_packet": {
    "workflow_id": "external_reasoning_workspace_v0",
    "fixture_id": "external_reasoning_workspace_v0_public_synthetic_advisory_001",
    "handoff_type": "bounded_advisory_handoff",
    "advisory_findings_ref": "advisory_response_packet.advisory_findings",
    "boundary_risks_ref": "advisory_response_packet.boundary_risks",
    "private_pointer_ref": "_workmeta/system/synthetic/external_reasoning_workspace_v0_public_synthetic_advisory_001",
    "required_next_owner_actions": [
      "Decide whether any advisory gap requires owner approval.",
      "Route validation questions to an authorized validator.",
      "Preserve unresolved gaps and maintain the stated claim ceiling."
    ],
    "non_claims": [
      "Not source truth",
      "Not a validation verdict",
      "Not owner approval",
      "Not canon promotion",
      "Not default-route safety",
      "Not evidence of actual browser execution"
    ]
  },
  "completion_state": {
    "status": "complete_synthetic_public_safe_deliverable",
    "actual_browser_action_claim": false,
    "external_answer_advisory_only": true,
    "stop_conditions_preserved": true,
    "uncertainty_preserved": true
  }
}
