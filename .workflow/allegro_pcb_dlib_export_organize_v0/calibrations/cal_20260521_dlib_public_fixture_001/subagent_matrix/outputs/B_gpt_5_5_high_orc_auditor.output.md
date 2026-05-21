{
  "target_board_inventory": [
    {
      "target_id": "board_demo_A",
      "folder_label": "DEMO_A_revA",
      "board_files": [
        "DEMO_A_revA.brd"
      ],
      "board_file_count": 1,
      "preexisting_lib_state": "absent",
      "inventory_status": "eligible_for_dlib_export"
    },
    {
      "target_id": "board_demo_B",
      "folder_label": "DEMO_B_revA",
      "board_files": [
        "DEMO_B_main.brd",
        "DEMO_B_backup.brd"
      ],
      "board_file_count": 2,
      "preexisting_lib_state": "absent",
      "inventory_status": "blocked_owner_selection_required"
    }
  ],
  "dlib_execution_plan": {
    "runtime_scope_binding": {
      "workflow_id": "allegro_pcb_dlib_export_organize_v0",
      "recursive_search_enabled": false,
      "board_extension_allowlist": [
        ".brd"
      ],
      "existing_lib_policy": "stop_if_populated",
      "overwrite_existing_files": false,
      "library_root_name": "lib",
      "public_path_policy": "runtime_paths_redacted"
    },
    "targets": [
      {
        "target_id": "board_demo_A",
        "planned_action": "run_dlib_export_then_organize_and_verify",
        "dlib_should_run": true,
        "mutation_allowed_in_real_workflow": true,
        "synthetic_process_code": 0
      },
      {
        "target_id": "board_demo_B",
        "planned_action": "block_before_mutation",
        "dlib_should_run": false,
        "mutation_allowed_in_real_workflow": false,
        "blocker": "multiple_brd_files_in_one_target_folder"
      }
    ]
  },
  "library_organization_manifest": {
    "board_demo_A": {
      "status": "organized_review_required",
      "lib_folders": {
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
      "classified_counts": {
        "padpath": 2,
        "psmpath": 4,
        "devpath": 2,
        "logs": 2,
        "other": 1
      },
      "review_reason": "unknown_export_file_type_moved_to_other"
    },
    "board_demo_B": {
      "status": "blocked_not_organized",
      "lib_folders": {},
      "blocker": "multiple_brd_files_in_one_target_folder"
    }
  },
  "export_receipt": {
    "workflow_id": "allegro_pcb_dlib_export_organize_v0",
    "candidate_id": "B_gpt_5_5_high_orc_auditor",
    "profile": {
      "model": "gpt-5.5",
      "reasoning_effort": "high",
      "species": "orc",
      "class": "auditor"
    },
    "targets": [
      {
        "target_id": "board_demo_A",
        "receipt_status": "review_required",
        "checks": {
          "process_code_zero": true,
          "dump_libraries_log_present": true,
          "dlib_errors_reported_zero": true,
          "folder_counts_match_expected": true,
          "root_files_left_after_organization_zero": true,
          "transient_export_folder_removed": true,
          "unknown_files_present": true
        }
      },
      {
        "target_id": "board_demo_B",
        "receipt_status": "blocked",
        "checks": {
          "single_board_file_selected": false,
          "dlib_not_run": true,
          "mutation_not_performed": true
        },
        "blocker": "owner_selection_required_for_multiple_brd_files"
      }
    ],
    "overall_status": "review_required_with_blocked_target"
  },
  "boundary_review_note": {
    "public_safe_scope": "synthetic_fixture_only_no_real_allegro_execution_claimed",
    "path_policy": "no_actual_runtime_absolute_paths_emitted",
    "payload_policy": "no_raw_pcb_payloads_scripts_journals_credentials_cookies_or_private_state_included",
    "non_claims": [
      "no_electrical_correctness_claim",
      "no_symbol_geometry_correctness_claim",
      "no_padstack_engineering_approval_claim",
      "no_manufacturing_readiness_claim",
      "no_unattended_full_archive_readiness_claim"
    ]
  },
  "quality_self_check": {
    "required_top_level_keys_present": true,
    "target_inventory_complete": true,
    "multiple_brd_block_enforced": true,
    "unknown_file_routed_to_other": true,
    "review_required_status_preserved": true,
    "success_conditions_checked": true,
    "external_validation_claimed": false,
    "private_paths_or_payloads_leaked": false
  }
}
