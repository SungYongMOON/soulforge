{
  "target_board_inventory": {
    "workflow_id": "allegro_pcb_dlib_export_organize_v0",
    "runtime_scope": {
      "paths_redacted": true,
      "recursive_search_enabled": false,
      "board_extension_allowlist": [".brd"],
      "existing_lib_policy": "stop_if_populated",
      "overwrite_existing_files": false,
      "library_root_name": "lib"
    },
    "targets": [
      {
        "target_id": "board_demo_A",
        "folder_label": "DEMO_A_revA",
        "board_files": ["DEMO_A_revA.brd"],
        "preexisting_lib_state": "absent",
        "expected_action": "plan_export_run_organize_verify"
      },
      {
        "target_id": "board_demo_B",
        "folder_label": "DEMO_B_revA",
        "board_files": ["DEMO_B_main.brd", "DEMO_B_backup.brd"],
        "preexisting_lib_state": "absent",
        "expected_action": "block_before_mutation_owner_selection_required"
      }
    ]
  },
  "dlib_execution_plan": {
    "allowed_target_ids": ["board_demo_A"],
    "blocked_targets": [
      {
        "target_id": "board_demo_B",
        "blocker": "multiple_brd_files_in_one_target_folder",
        "owner_selection_required": true,
        "dlib_should_run": false,
        "mutation_should_happen": false
      }
    ],
    "run_steps": ["export", "organize", "verify"],
    "constraints": {
      "recursive_search_enabled": false,
      "board_extension_allowlist": [".brd"],
      "existing_lib_policy": "stop_if_populated",
      "overwrite_existing_files": false,
      "library_root_name": "lib"
    }
  },
  "library_organization_manifest": {
    "board_demo_A": {
      "destination_root": "lib",
      "status": "review_required",
      "expected_counts_match": true,
      "classified_counts": {
        "padpath": 2,
        "psmpath": 4,
        "devpath": 2,
        "logs": 2,
        "other": 1
      },
      "folders": {
        "padpath": ["PAD_A.pad", "PAD_B.pad"],
        "psmpath": ["MCU.psm", "MCU.dra", "CONNECTOR.bsm", "FIDUCIAL.fsm"],
        "devpath": ["devices.txt", "pinmap.map"],
        "logs": ["dump_libraries.log", "allegro_journal.log"],
        "other": ["unexpected_notes.tmp"]
      },
      "organization_state": {
        "root_files_left_after_organization": 0,
        "transient_export_folder_left": false
      },
      "review_reason": "unknown_export_file_type moved to other"
    },
    "board_demo_B": {
      "status": "blocked",
      "reason": "multiple_brd_files_in_one_target_folder",
      "owner_selection_required": true,
      "dlib_should_run": false,
      "no_mutation": true
    }
  },
  "export_receipt": {
    "board_demo_A": {
      "process_code": 0,
      "dump_libraries_log_present": true,
      "dlib_errors_reported": 0,
      "success_criteria_met": true,
      "receipt_state": "review_required",
      "checks": {
        "dump_libraries_log_present": true,
        "zero_dlib_errors": true,
        "classified_folder_counts": true,
        "no_files_left_under_lib_root": true,
        "no_transient_export_folder_left": true
      },
      "review_reason": "unknown_export_file_type moved to other"
    },
    "board_demo_B": {
      "receipt_state": "blocked",
      "dlib_ran": false,
      "mutation_happened": false,
      "owner_selection_required": true,
      "blocker": "multiple_brd_files_in_one_target_folder"
    }
  },
  "boundary_review_note": {
    "synthetic_only": true,
    "public_safe": true,
    "blocked_target": "board_demo_B",
    "blocked_reason": "multiple_brd_files_in_one_target_folder",
    "owner_selection_required_before_mutation": true,
    "non_claims": [
      "no electrical correctness",
      "no symbol geometry correctness",
      "no padstack engineering approval",
      "no manufacturing readiness",
      "no unattended full-archive readiness"
    ]
  },
  "quality_self_check": {
    "top_level_keys_exact": true,
    "paths_redacted": true,
    "raw_payloads_avoided": true,
    "board_demo_A_review_required_kept": true,
    "board_demo_B_block_pre_mutation_kept": true,
    "no_external_validation_claimed": true
  }
}
