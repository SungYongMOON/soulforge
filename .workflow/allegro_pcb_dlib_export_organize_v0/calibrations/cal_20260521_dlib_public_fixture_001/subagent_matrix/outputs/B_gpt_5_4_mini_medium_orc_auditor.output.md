{
  "target_board_inventory": [
    {
      "target_id": "board_demo_A",
      "folder_label": "DEMO_A_revA",
      "board_files": [
        "DEMO_A_revA.brd"
      ],
      "preexisting_lib_state": "absent",
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
      "expected_action": "block_before_mutation_owner_selection_required"
    }
  ],
  "dlib_execution_plan": {
    "runtime_scope": {
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
    "board_demo_A": {
      "action": "run_export_then_organize_then_verify",
      "gate": "allowed",
      "notes": [
        "Synthetic dlib export completed with zero reported dlib errors.",
        "Organization must classify the unknown export file type into other."
      ]
    },
    "board_demo_B": {
      "action": "block_before_mutation",
      "gate": "blocked",
      "notes": [
        "Multiple .brd files in one target folder require owner selection before any mutation.",
        "dlib export must not run until the target is disambiguated."
      ]
    }
  },
  "library_organization_manifest": {
    "board_demo_A": {
      "lib_root": "organized",
      "folders": {
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
      "post_organization_state": {
        "root_files_left": 0,
        "transient_export_folder_left": false
      }
    },
    "board_demo_B": {
      "lib_root": "not_organized",
      "reason": "blocked_before_mutation_owner_selection_required"
    }
  },
  "export_receipt": {
    "workflow_id": "allegro_pcb_dlib_export_organize_v0",
    "synthetic_result_classification": "review_required",
    "board_demo_A": {
      "process_code": 0,
      "dump_libraries_log_present": true,
      "dlib_errors_reported": 0,
      "export_status": "review_required",
      "review_reason": "unknown_export_file_type moved to other",
      "success_checks": {
        "logs_present": true,
        "zero_dlib_errors": true,
        "classified_folder_counts_present": true,
        "no_files_left_in_lib_root": true,
        "no_transient_export_folder_left": true
      }
    },
    "board_demo_B": {
      "export_status": "blocked",
      "blocker": "multiple_brd_files_in_one_target_folder",
      "dlib_should_run": false,
      "mutation_should_happen": false
    }
  },
  "boundary_review_note": {
    "scope": "public_safe_synthetic_only",
    "non_claims": [
      "No electrical correctness is claimed.",
      "No symbol geometry correctness is claimed.",
      "No padstack engineering approval is claimed.",
      "No manufacturing readiness is claimed.",
      "No unattended full-archive readiness is claimed."
    ],
    "boundary_status": "paths_redacted_no_private_payload_no_external_validation_claimed"
  },
  "quality_self_check": {
    "passed": [
      "Runtime paths were redacted.",
      "No raw PCB payloads, scripts, journals, credentials, or private-state data were emitted.",
      "Board B was correctly blocked before mutation due to multiple .brd files.",
      "Board A was marked review_required because an unknown export file type was routed to other.",
      "Receipt includes the required success and blocker conditions."
    ],
    "failed": [],
    "overall_assessment": "synthetic_calibration_packet_compliant"
  }
}
