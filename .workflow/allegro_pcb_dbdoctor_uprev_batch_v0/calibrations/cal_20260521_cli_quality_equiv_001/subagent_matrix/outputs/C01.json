{
  "packet_metadata": {
    "candidate_id": "C01",
    "workflow_id": "allegro_pcb_dbdoctor_uprev_batch_v0",
    "fixture_id": "allegro_dbdoctor_uprev_public_synthetic_001",
    "fixture_kind": "public_safe_synthetic_workflow_contract_fixture",
    "packet_kind": "synthetic_cli_only_calibration_output_packet",
    "claim_ceiling": "observed_synthetic_fixture_only",
    "filesystem_mutation_performed": false,
    "cadence_dbdoctor_execution_claimed": false,
    "real_pcb_payload_inspection_claimed": false
  },
  "public_safety": {
    "contains_real_pcb_payload": false,
    "contains_project_private_material": false,
    "contains_runtime_absolute_paths": false,
    "contains_credentials_or_secrets": false,
    "runtime_path_handling": "Only supplied runtime_ref tokens are retained; host paths and raw PCB payloads are excluded from this public-safe packet.",
    "secret_handling": "No credentials, cookies, tokens, license files, or secret values are included."
  },
  "runtime_binding": {
    "input_root_ref": "runtime_ref://owner-approved/allegro_batch_root",
    "dbdoctor_executable_ref": "runtime_ref://owner-approved/cadence_dbdoctor_executable",
    "runtime_refs_are_absolute_in_private_evidence": true,
    "runtime_refs_are_redacted_for_public_archive": true,
    "dbdoctor_locator": {
      "method": "explicit_executable",
      "runtime_locator_ref": "runtime_ref://owner-approved/cadence_dbdoctor_executable"
    },
    "binding_scope": "runtime_only",
    "public_archive_rule": "Do not expand runtime_ref tokens into host paths."
  },
  "authority_and_policy": {
    "mutation_authority_policy": {
      "mutation_mode": "convert",
      "owner_approval_ref": "owner_approval_ref://synthetic/allow_default_brd_convert_only",
      "full_archive_mutation_authorized": false,
      "top_level_files_only": true,
      "recursive_scan_authorized": false,
      "non_default_extensions_authorized": false
    },
    "database_policy": {
      "extension_allowlist": [
        ".brd"
      ],
      "non_allowlisted_extensions": "block",
      "existing_packet_policy": "stop",
      "packet_labels": {
        "old_version_folder_name": "old_version",
        "new_version_folder_name": "new_version"
      }
    },
    "classification_policy": {
      "converted_success_requires": [
        "output_exists",
        "completion_text_present",
        "saved_to_disk_text_present",
        "detected_error_count_is_zero"
      ],
      "warning_bearing_nonzero_exit_allowed_when": [
        "output_exists",
        "completion_text_present",
        "saved_to_disk_text_present",
        "detected_error_count_is_zero"
      ],
      "output_existence_alone_is_success": false,
      "nonzero_process_code_alone_is_failure": false
    }
  },
  "inventory": {
    "inventory_scope": "top_level_brd_files_only_by_default",
    "entries": [
      {
        "entry_id": "F001",
        "relative_name": "PWR_A.brd",
        "decision": "in_scope_conversion_candidate",
        "reason": "Top-level .brd file with no existing packet collision."
      },
      {
        "entry_id": "F002",
        "relative_name": "CTRL_B.brd",
        "decision": "in_scope_conversion_candidate",
        "reason": "Top-level .brd file with no existing packet collision."
      },
      {
        "entry_id": "F003",
        "relative_name": "BROKEN_C.brd",
        "decision": "in_scope_conversion_candidate",
        "reason": "Top-level .brd file with no existing packet collision."
      },
      {
        "entry_id": "F004",
        "relative_name": "RF_COLLIDE.brd",
        "decision": "blocked_existing_packet_collision",
        "reason": "Existing packet folder collision and existing_packet_policy is stop."
      },
      {
        "entry_id": "F005",
        "relative_name": "notes.txt",
        "decision": "blocked_non_allowlisted_extension",
        "reason": ".txt is not in the .brd extension allowlist."
      },
      {
        "entry_id": "F006",
        "relative_name": "nested/NESTED_D.brd",
        "decision": "blocked_nested_brd_out_of_scope",
        "reason": "Recursive scan is not authorized and only top-level files are in default scope."
      }
    ],
    "summary": {
      "input_entries": 6,
      "top_level_brd_entries_seen": 4,
      "in_scope_non_colliding_conversion_candidates": 3,
      "blocked_before_conversion": 3
    }
  },
  "packet_plan": {
    "materialization_state": "planned_only_not_created",
    "planned_packets": [
      {
        "entry_id": "F001",
        "relative_name": "PWR_A.brd",
        "packet_folder_relative": "PWR_A",
        "old_version_folder_relative": "PWR_A/old_version",
        "new_version_folder_relative": "PWR_A/new_version",
        "old_version_brd_relative": "PWR_A/old_version/PWR_A.brd",
        "new_version_brd_relative": "PWR_A/new_version/PWR_A.brd",
        "command_role": "outfile_conversion",
        "collision_check": "clear"
      },
      {
        "entry_id": "F002",
        "relative_name": "CTRL_B.brd",
        "packet_folder_relative": "CTRL_B",
        "old_version_folder_relative": "CTRL_B/old_version",
        "new_version_folder_relative": "CTRL_B/new_version",
        "old_version_brd_relative": "CTRL_B/old_version/CTRL_B.brd",
        "new_version_brd_relative": "CTRL_B/new_version/CTRL_B.brd",
        "command_role": "outfile_conversion",
        "collision_check": "clear"
      },
      {
        "entry_id": "F003",
        "relative_name": "BROKEN_C.brd",
        "packet_folder_relative": "BROKEN_C",
        "old_version_folder_relative": "BROKEN_C/old_version",
        "new_version_folder_relative": "BROKEN_C/new_version",
        "old_version_brd_relative": "BROKEN_C/old_version/BROKEN_C.brd",
        "new_version_brd_relative": "BROKEN_C/new_version/BROKEN_C.brd",
        "command_role": "outfile_conversion",
        "collision_check": "clear"
      }
    ],
    "unplanned_blocked_packets": [
      {
        "entry_id": "F004",
        "relative_name": "RF_COLLIDE.brd",
        "blocked_reason": "A packet folder named RF_COLLIDE already exists under the approved root.",
        "required_owner_decision": "Authorize a collision policy change, choose a new packet target, or leave blocked."
      }
    ]
  },
  "dbdoctor_observation_classification": {
    "classification_basis": "Synthetic observation fields only: output existence, completion text, saved-to-disk text, warning count, detected error count, process code, and temp cleanup state.",
    "items": [
      {
        "entry_id": "F001",
        "relative_name": "PWR_A.brd",
        "command_role": "outfile_conversion",
        "output_exists": true,
        "process_code": 0,
        "warning_count": 0,
        "detected_error_count": 0,
        "completion_text_present": true,
        "saved_to_disk_text_present": true,
        "temp_files_remaining": [],
        "classification": "converted_success",
        "classification_reason": "Output exists, completion text is present, saved-to-disk text is present, and detected errors are zero.",
        "cleanup_state": "clean",
        "blockers": []
      },
      {
        "entry_id": "F002",
        "relative_name": "CTRL_B.brd",
        "command_role": "outfile_conversion",
        "output_exists": true,
        "process_code": 3,
        "warning_count": 2,
        "detected_error_count": 0,
        "completion_text_present": true,
        "saved_to_disk_text_present": true,
        "temp_files_remaining": [
          "CTRL_B.tmp"
        ],
        "classification": "converted_with_warnings",
        "classification_reason": "Output exists, completion text and saved-to-disk text are present, detected errors are zero, and warning-bearing nonzero exit is allowed by policy.",
        "cleanup_state": "cleanup_review_required",
        "blockers": [
          {
            "blocker_type": "cleanup_review",
            "severity": "owner_action_required",
            "detail": "Temporary file remains after warning-bearing conversion.",
            "affected_temp_files": [
              "CTRL_B.tmp"
            ],
            "next_action": "Owner or runtime operator reviews cleanup evidence before final closeout."
          }
        ]
      },
      {
        "entry_id": "F003",
        "relative_name": "BROKEN_C.brd",
        "command_role": "outfile_conversion",
        "output_exists": false,
        "process_code": 2,
        "warning_count": 1,
        "detected_error_count": 1,
        "completion_text_present": false,
        "saved_to_disk_text_present": false,
        "temp_files_remaining": [
          "BROKEN_C.jrl"
        ],
        "classification": "conversion_failed",
        "classification_reason": "Output is missing, detected errors are nonzero, completion text is absent, and saved-to-disk text is absent.",
        "cleanup_state": "cleanup_and_retry_review_required",
        "blockers": [
          {
            "blocker_type": "retry_or_owner_decision",
            "severity": "owner_action_required",
            "detail": "Synthetic observation reports a detected error during conversion.",
            "next_action": "Owner decides whether to supply missing conversion prerequisites, retry under an approved policy, or hold the board blocked."
          },
          {
            "blocker_type": "cleanup_review",
            "severity": "owner_action_required",
            "detail": "Temporary journal file remains after failed conversion.",
            "affected_temp_files": [
              "BROKEN_C.jrl"
            ],
            "next_action": "Runtime operator reviews cleanup handling before any retry."
          }
        ]
      }
    ],
    "summary": {
      "converted_success": 1,
      "converted_with_warnings": 1,
      "conversion_failed": 1,
      "cleanup_review_required": 2,
      "retry_or_owner_decision_required": 1
    }
  },
  "blockers": {
    "failure_blockers": [
      {
        "entry_id": "F003",
        "relative_name": "BROKEN_C.brd",
        "blocker": "conversion_failed",
        "next_action": "Owner decision or approved retry policy required."
      }
    ],
    "collision_blockers": [
      {
        "entry_id": "F004",
        "relative_name": "RF_COLLIDE.brd",
        "blocker": "existing_packet_collision",
        "next_action": "Stop unless owner explicitly authorizes a collision handling policy."
      }
    ],
    "cleanup_blockers": [
      {
        "entry_id": "F002",
        "relative_name": "CTRL_B.brd",
        "remaining_temp_files": [
          "CTRL_B.tmp"
        ],
        "next_action": "Cleanup review required."
      },
      {
        "entry_id": "F003",
        "relative_name": "BROKEN_C.brd",
        "remaining_temp_files": [
          "BROKEN_C.jrl"
        ],
        "next_action": "Cleanup review required before retry or closeout."
      }
    ],
    "policy_blockers": [
      {
        "entry_id": "F005",
        "relative_name": "notes.txt",
        "blocker": "non_allowlisted_extension",
        "next_action": "Remain blocked unless owner changes non-default extension policy."
      },
      {
        "entry_id": "F006",
        "relative_name": "nested/NESTED_D.brd",
        "blocker": "recursive_scan_not_authorized",
        "next_action": "Remain out of scope unless owner authorizes recursive scanning."
      }
    ]
  },
  "batch_rollup": {
    "overall_status": "partial_conversion_classification_with_owner_action_required",
    "planned_conversion_candidates": 3,
    "converted_success_or_warning": 2,
    "failed_conversions": 1,
    "blocked_before_conversion": 3,
    "owner_decision_required": true,
    "public_archive_ready": false,
    "public_archive_blocking_reasons": [
      "Cleanup review remains for CTRL_B.brd and BROKEN_C.brd.",
      "Retry or owner hold decision remains for BROKEN_C.brd.",
      "Collision decision remains for RF_COLLIDE.brd."
    ]
  },
  "non_claims": {
    "electrical_correctness_claimed": false,
    "manufacturing_readiness_claimed": false,
    "cadence_license_or_install_management_claimed": false,
    "unattended_full_archive_mutation_claimed": false,
    "real_dbdoctor_execution_claimed": false,
    "real_pcb_payload_inspection_claimed": false,
    "runtime_absolute_path_disclosure_claimed": false
  },
  "closeout_boundary_review": {
    "boundary_result": "public_safe_synthetic_packet_only",
    "no_real_filesystem_mutation": true,
    "runtime_paths_redacted": true,
    "pcb_payloads_excluded": true,
    "credentials_or_secrets_excluded": true,
    "next_action": "Owner or runtime operator reviews cleanup blockers, decides retry or hold for BROKEN_C.brd, decides collision handling for RF_COLLIDE.brd, and keeps runtime paths and PCB payload evidence outside the public archive.",
    "knowledge_trigger_check": {
      "result": "none",
      "claim_ceiling": "observed_synthetic_fixture_only",
      "reason": "This packet classifies a supplied synthetic fixture and does not promote reusable canon, sourcebound knowledge, or private runtime evidence."
    }
  }
}
