{
  "target_board_inventory": {
    "workflow_id": "allegro_pcb_dlib_export_organize_v0",
    "runtime_scope_binding": {
      "runtime_paths": "redacted_not_emitted",
      "recursive_search_enabled": false,
      "board_extension_allowlist": [
        ".brd"
      ],
      "existing_lib_policy": "stop_if_populated",
      "overwrite_existing_files": false,
      "library_root_name": "lib"
    },
    "targets": [
      {
        "target_id": "board_demo_A",
        "folder_label": "DEMO_A_revA",
        "board_files": [
          "DEMO_A_revA.brd"
        ],
        "preexisting_lib_state": "absent",
        "inventory_status": "eligible_single_board"
      },
      {
        "target_id": "board_demo_B",
        "folder_label": "DEMO_B_revA",
        "board_files": [
          "DEMO_B_main.brd",
          "DEMO_B_backup.brd"
        ],
        "preexisting_lib_state": "absent",
        "inventory_status": "blocked_multiple_board_files"
      }
    ]
  },
  "dlib_execution_plan": {
    "candidate_id": "B_gpt_5_5_xhigh_orc_auditor",
    "plans": [
      {
        "target_id": "board_demo_A",
        "dlib_should_run": true,
        "allowed_reason": "single .brd file and no populated existing lib",
        "planned_steps": [
          "run_dlib_export",
          "organize_into_board_local_lib",
          "verify_counts_and_cleanup",
          "write_receipt"
        ]
      },
      {
        "target_id": "board_demo_B",
        "dlib_should_run": false,
        "mutation_should_happen": false,
        "blocker": "multiple_brd_files_in_one_target_folder",
        "required_owner_action": "select exactly one board file before export"
      }
    ]
  },
  "library_organization_manifest": {
    "board_demo_A": {
      "board_local_library_root": "DEMO_A_revA/lib",
      "classification": {
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
      "review_required": true,
      "review_reason": "unknown_export_file_type moved to other"
    },
    "board_demo_B": {
      "board_local_library_root": "DEMO_B_revA/lib",
      "classification": {},
      "counts": {},
      "status": "not_created_or_mutated",
      "blocker": "multiple_brd_files_in_one_target_folder"
    }
  },
  "export_receipt": {
    "workflow_id": "allegro_pcb_dlib_export_organize_v0",
    "fixture_type": "public_safe_synthetic_from_contract",
    "synthetic_result": true,
    "targets": [
      {
        "target_id": "board_demo_A",
        "process_code": 0,
        "dump_libraries_log_present": true,
        "dlib_errors_reported": 0,
        "classified_counts_match_expected": true,
        "root_files_left_after_organization": 0,
        "transient_export_folder_left": false,
        "success_conditions_met": true,
        "receipt_status": "review_required",
        "review_reason": "unknown_export_file_type moved to other"
      },
      {
        "target_id": "board_demo_B",
        "success_conditions_met": false,
        "receipt_status": "blocked",
        "blocker": "multiple_brd_files_in_one_target_folder",
        "dlib_should_run": false,
        "mutation_should_happen": false
      }
    ],
    "overall_status": "partial_blocked_review_required"
  },
  "boundary_review_note": {
    "public_safe": true,
    "runtime_paths_emitted": false,
    "raw_payloads_emitted": false,
    "external_validation_claimed": false,
    "non_claims": [
      "no electrical correctness",
      "no symbol geometry correctness",
      "no padstack engineering approval",
      "no manufacturing readiness",
      "no unattended full-archive readiness"
    ]
  },
  "quality_self_check": {
    "top_level_shape_matches_required": true,
    "multiple_brd_block_enforced": true,
    "unknown_file_type_review_enforced": true,
    "no_runtime_absolute_paths": true,
    "no_mutation_claimed": true,
    "synthetic_only": true,
    "release_readiness": "not_ready_until_board_demo_B_owner_selection_and_board_demo_A_other_file_review"
  }
}
