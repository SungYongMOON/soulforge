{
  "target_board_inventory": [
    {
      "target_id": "board_demo_A",
      "folder_label": "DEMO_A_revA",
      "board_files": [
        "DEMO_A_revA.brd"
      ],
      "preexisting_lib_state": "absent",
      "scope_binding": "single-board target accepted for export planning within synthetic runtime scope",
      "expected_action": "plan_export_run_organize_verify"
    },
    {
      "target_id": "board_demo_B",
      "folder_label": "DEMO_B_revA",
      "board_files": [
        "DEMO_B_main.brd",
        "DEMO_B_backup.brd"
      ],
      "preexisting_lib_state": "absent",
      "scope_binding": "multi-board folder requires owner selection before any mutation",
      "expected_action": "block_before_mutation_owner_selection_required"
    }
  ],
  "dlib_execution_plan": {
    "runtime_scope_binding": {
      "input_root_runtime_path": "<redacted>",
      "allegro_executable_runtime_path": "<redacted>",
      "private_run_root_runtime_path": "<redacted>",
      "recursive_search_enabled": false,
      "board_extension_allowlist": [
        ".brd"
      ],
      "existing_lib_policy": "stop_if_populated",
      "overwrite_existing_files": false,
      "library_root_name": "lib"
    },
    "planned_actions": [
      "accept only .brd targets in the synthetic inventory",
      "stop before mutation for any folder containing multiple .brd files",
      "for eligible single-board targets, plan dlib export followed by board-local organization under lib",
      "classify exported files into padpath, psmpath, devpath, logs, and other",
      "verify dump_libraries.log presence, zero dlib errors, no root-level files under lib, and no transient export folder left"
    ],
    "blocked_targets": [
      {
        "target_id": "board_demo_B",
        "blocker": "multiple_brd_files_in_one_target_folder",
        "mutation_allowed": false,
        "dlib_allowed": false,
        "required_next_step": "owner selection required before any export or organization"
      }
    ],
    "eligible_targets": [
      {
        "target_id": "board_demo_A",
        "mutation_allowed": true,
        "dlib_allowed": true,
        "organize_allowed": true,
        "verification_gate": "review_required"
      }
    ]
  },
  "library_organization_manifest": {
    "board_demo_A": {
      "export_root": "lib",
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
      "organization_result": {
        "root_files_left_after_organization": 0,
        "transient_export_folder_left": false,
        "classified_folder_counts_match_expectation": true,
        "unknown_export_file_type_present": true,
        "review_reason": "unknown_export_file_type moved to other"
      }
    },
    "board_demo_B": {
      "export_root": "lib",
      "classification": null,
      "organization_result": {
        "root_files_left_after_organization": null,
        "transient_export_folder_left": null,
        "classified_folder_counts_match_expectation": null
      },
      "status": "blocked_before_mutation"
    }
  },
  "export_receipt": {
    "workflow_id": "allegro_pcb_dlib_export_organize_v0",
    "fixture_type": "public_safe_synthetic_from_contract",
    "board_demo_A": {
      "process_code": 0,
      "dump_libraries_log_present": true,
      "dlib_errors_reported": 0,
      "exported_files_total": 11,
      "expected_counts": {
        "padpath": 2,
        "psmpath": 4,
        "devpath": 2,
        "logs": 2,
        "other": 1
      },
      "receipt_status": "review_required",
      "receipt_summary": "export completed and organized, but review remains required due to one unknown exported file type routed to other"
    },
    "board_demo_B": {
      "receipt_status": "blocked",
      "blocker": "multiple_brd_files_in_one_target_folder",
      "receipt_summary": "export intentionally not run; no mutation performed"
    },
    "success_conditions_checked": {
      "dump_libraries.log_present": true,
      "zero_dlib_errors": true,
      "classified_folder_counts_present": true,
      "no_files_left_under_lib_root": true,
      "no_transient_export_folder_left": true
    },
    "overall_outcome": "partial_success_review_required"
  },
  "boundary_review_note": {
    "claims_withheld": [
      "no electrical correctness claim",
      "no symbol geometry correctness claim",
      "no padstack engineering approval claim",
      "no manufacturing readiness claim",
      "no unattended full-archive readiness claim"
    ],
    "boundary_summary": "This packet is synthetic and public-safe. It binds scope without exposing runtime paths or private payloads, blocks multi-.brd mutation before ownership selection, and keeps the receipt in review_required state when an unknown export type is present."
  },
  "quality_self_check": {
    "valid_json_object": true,
    "required_top_level_keys_present": true,
    "runtime_paths_redacted": true,
    "no_raw_private_payloads": true,
    "board_demo_A_review_required_reason_captured": true,
    "board_demo_B_blocker_captured": true,
    "non_claims_included": true,
    "internal_consistency_check": "passed"
  }
}
