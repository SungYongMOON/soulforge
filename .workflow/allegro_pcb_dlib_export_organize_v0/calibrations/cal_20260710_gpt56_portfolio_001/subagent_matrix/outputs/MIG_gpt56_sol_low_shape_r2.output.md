{
  "target_board_inventory": {
    "workflow_id": "allegro_pcb_dlib_export_organize_v0",
    "scope_status": "synthetic_fixture_only",
    "runtime_paths": "redacted_not_emitted",
    "recursive_search_enabled": false,
    "board_extension_allowlist": [
      ".brd"
    ],
    "targets": [
      {
        "target_id": "board_demo_A",
        "folder_label": "DEMO_A_revA",
        "board_files": [
          "DEMO_A_revA.brd"
        ],
        "board_count": 1,
        "preexisting_lib_state": "absent",
        "inventory_status": "eligible_for_planning",
        "required_owner_action": null
      },
      {
        "target_id": "board_demo_B",
        "folder_label": "DEMO_B_revA",
        "board_files": [
          "DEMO_B_main.brd",
          "DEMO_B_backup.brd"
        ],
        "board_count": 2,
        "preexisting_lib_state": "absent",
        "inventory_status": "blocked_before_mutation",
        "blocker": "multiple_brd_files_in_one_target_folder",
        "required_owner_action": "select_exactly_one_board_file"
      }
    ]
  },
  "dlib_execution_plan": {
    "runtime_path_policy": {
      "absolute_paths_required": true,
      "actual_runtime_paths_emitted": false,
      "path_escape_allowed": false
    },
    "library_layout": {
      "library_root_name": "lib",
      "folders": [
        "padpath",
        "psmpath",
        "devpath",
        "logs",
        "other"
      ],
      "transient_export_folder_candidates": [
        "export_libraries"
      ]
    },
    "export_elements": {
      "mechanical_symbols": true,
      "package_symbols": true,
      "format_symbols": true,
      "shape_and_flash_symbols": true,
      "device_files": true,
      "padstacks": true,
      "no_library_dependencies": false,
      "purge_unused_cross_section_layers": false
    },
    "targets": [
      {
        "target_id": "board_demo_A",
        "selected_board_file": "DEMO_A_revA.brd",
        "planned_invocation": {
          "board_open_mode": "readonly",
          "nograph": "when_available",
          "execution": "script_replay",
          "generated_script": "runtime_only_not_emitted",
          "capture": [
            "journal",
            "stdout",
            "stderr",
            "process_code",
            "dlib_logs"
          ]
        },
        "existing_lib_policy": "stop_if_populated",
        "overwrite_existing_files": false,
        "mutation_boundary": "declared_board_local_library_root_only",
        "plan_status": "planned_from_synthetic_fixture"
      },
      {
        "target_id": "board_demo_B",
        "selected_board_file": null,
        "planned_invocation": null,
        "mutation_allowed": false,
        "plan_status": "blocked",
        "stop_condition": "multiple_brd_files_in_one_target_folder",
        "required_owner_action": "select DEMO_B_main.brd or DEMO_B_backup.brd before any preparation, export, collection, organization, or cleanup"
      }
    ]
  },
  "dlib_execution_logs": {
    "evidence_kind": "synthetic_fixture_result",
    "runtime_logs_or_journals_included": false,
    "targets": [
      {
        "target_id": "board_demo_A",
        "reported_process_code": 0,
        "dump_libraries_log_present": true,
        "reported_dlib_error_count": 0,
        "log_assessment": "export_evidence_sufficient_for_organization_assessment_but_not_unconditional_completion",
        "review_trigger": "unexpected_notes.tmp requires unknown-file review"
      },
      {
        "target_id": "board_demo_B",
        "invocation_status": "not_applicable_blocked_before_mutation",
        "process_code": null,
        "dump_libraries_log_present": null,
        "reported_dlib_error_count": null,
        "stop_condition": "owner board selection required"
      }
    ]
  },
  "library_organization_manifest": {
    "classification_rules": {
      "padpath": [
        ".pad"
      ],
      "psmpath": [
        ".psm",
        ".dra",
        ".bsm",
        ".fsm",
        ".ssm",
        ".osm",
        ".mdd"
      ],
      "devpath": [
        "*.txt",
        "*.txt,*",
        "*.map",
        "*.map,*"
      ],
      "logs": [
        "*.log",
        "*.log,*"
      ],
      "unknown": "move_to_other_and_require_review"
    },
    "targets": [
      {
        "target_id": "board_demo_A",
        "files": {
          "padpath": [
            "PAD_A.pad",
            "PAD_B.pad"
          ],
          "psmpath": [
            "MCU.psm",
            "MCU.dra",
            "CONNECTOR.bsm",
            "FIDUCIAL.fsm"
          ],
          "devpath": [
            "devices.txt",
            "pinmap.map"
          ],
          "logs": [
            "dump_libraries.log",
            "allegro_journal.log"
          ],
          "other": [
            "unexpected_notes.tmp"
          ]
        },
        "counts": {
          "padpath": 2,
          "psmpath": 4,
          "devpath": 2,
          "logs": 2,
          "other": 1
        },
        "files_directly_under_library_root": 0,
        "unknown_file_review_required": true,
        "manifest_status": "review_required"
      },
      {
        "target_id": "board_demo_B",
        "files": null,
        "counts": null,
        "manifest_status": "not_created",
        "reason": "blocked_before_mutation"
      }
    ]
  },
  "export_receipt": {
    "overall_status": "review_required_and_partially_blocked",
    "targets": [
      {
        "target_id": "board_demo_A",
        "status": "review_required",
        "evidence_summary": {
          "process_code_zero": true,
          "dump_libraries_log_present": true,
          "dlib_errors_zero": true,
          "classified_counts_recorded": true,
          "files_directly_under_library_root_zero": true,
          "transient_export_folder_left": false,
          "unknown_files_present": true
        },
        "review_reason": "unknown_export_file_type_moved_to_other",
        "owner_decision_needed": "review disposition of unexpected_notes.tmp",
        "completion_claim_allowed": false
      },
      {
        "target_id": "board_demo_B",
        "status": "blocked",
        "mutation_occurred": false,
        "dlib_invocation_occurred": false,
        "blocker": "multiple_brd_files_in_one_target_folder",
        "owner_decision_needed": "select exactly one board file",
        "completion_claim_allowed": false
      }
    ],
    "cleanup_assessment": {
      "board_demo_A_transient_export_folder_left": false,
      "board_demo_B_cleanup_not_applicable": true
    },
    "post_development_review_requirement": "required_before_any_completion_claim"
  },
  "boundary_review_note": {
    "output_basis": "public_safe_synthetic_fixture_only",
    "public_private_boundary": {
      "actual_runtime_absolute_paths_disclosed": false,
      "raw_pcb_payloads_included": false,
      "generated_scripts_included": false,
      "tool_journals_included": false,
      "credentials_or_cookies_included": false,
      "private_state_included": false
    },
    "owner_boundaries": [
      "Owner selection is required before board_demo_B may proceed.",
      "Owner review is required for unexpected_notes.tmp in board_demo_A.",
      "Overwrite, deletion, stale-file cleanup, or populated-library handling requires the declared owner mutation policy."
    ],
    "stop_conditions": [
      "Do not mutate board_demo_B until exactly one board file is selected.",
      "Keep board_demo_A in review_required state until the unknown file disposition is reviewed.",
      "Do not issue a completion claim before the required post-development review gate.",
      "Stop if a runtime path is relative, unresolved, traverses outside scope, or computes an output outside the approved input root.",
      "Stop under stop_if_populated if a target library root is found populated."
    ],
    "non_claims": [
      "No electrical correctness claim.",
      "No symbol geometry correctness claim.",
      "No padstack engineering approval claim.",
      "No manufacturing readiness claim.",
      "No unattended full-archive readiness claim.",
      "No claim that board files were opened, exported, saved, or otherwise processed in a real runtime.",
      "No claim that runtime paths, tools, licenses, installations, files, logs, or cleanup state were independently verified."
    ],
    "closeout_status": "not_complete_owner_review_and_owner_selection_pending"
  }
}
