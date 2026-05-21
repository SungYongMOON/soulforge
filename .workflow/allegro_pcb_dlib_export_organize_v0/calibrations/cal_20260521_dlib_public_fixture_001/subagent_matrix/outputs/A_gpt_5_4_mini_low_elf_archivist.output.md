{
  "target_board_inventory": [
    {
      "target_id": "board_demo_A",
      "folder_label": "DEMO_A_revA",
      "board_files": [
        "DEMO_A_revA.brd"
      ],
      "preexisting_lib_state": "absent",
      "inventory_status": "eligible"
    },
    {
      "target_id": "board_demo_B",
      "folder_label": "DEMO_B_revA",
      "board_files": [
        "DEMO_B_main.brd",
        "DEMO_B_backup.brd"
      ],
      "preexisting_lib_state": "absent",
      "inventory_status": "blocked_pending_owner_selection"
    }
  ],
  "dlib_execution_plan": {
    "runtime_scope_binding": {
      "recursive_search_enabled": false,
      "board_extension_allowlist": [
        ".brd"
      ],
      "existing_lib_policy": "stop_if_populated",
      "overwrite_existing_files": false,
      "library_root_name": "lib"
    },
    "board_demo_A": {
      "planned_action": "run_export_then_organize_then_verify",
      "gate_conditions": [
        "single target board file present",
        "no preexisting lib content"
      ]
    },
    "board_demo_B": {
      "planned_action": "block_before_mutation",
      "gate_conditions": [
        "multiple .brd files in one target folder require owner selection before mutation"
      ]
    }
  },
  "library_organization_manifest": {
    "board_demo_A": {
      "export_classification": {
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
      "organization_result": "classified_into_board_local_lib_folders",
      "root_files_left_under_lib": 0,
      "transient_export_folder_left": false
    },
    "board_demo_B": {
      "organization_result": "not_started",
      "reason": "blocked_by_owner_selection_required_before_mutation"
    }
  },
  "export_receipt": {
    "workflow_id": "allegro_pcb_dlib_export_organize_v0",
    "target_id": "board_demo_A",
    "process_code": 0,
    "dump_libraries_log_present": true,
    "dlib_errors_reported": 0,
    "synthetic_export_status": "review_required",
    "receipt_state": "review_required",
    "receipt_reason": "unknown_export_file_type moved to other",
    "success_conditions": {
      "met": [
        "dump_libraries.log present",
        "zero dlib errors",
        "classified folder counts recorded",
        "no files left directly under lib root",
        "no transient export folder left"
      ],
      "not_met": [
        "review gate remains open because an unknown export file type was classified as other"
      ]
    },
    "blocked_target_receipt": {
      "target_id": "board_demo_B",
      "status": "blocked",
      "blocker": "multiple_brd_files_in_one_target_folder",
      "dlib_should_run": false,
      "mutation_should_happen": false
    }
  },
  "boundary_review_note": {
    "scope": "public_safe_synthetic_calibration_only",
    "non_claims": [
      "No electrical correctness is claimed.",
      "No symbol geometry correctness is claimed.",
      "No padstack engineering approval is claimed.",
      "No manufacturing readiness is claimed.",
      "No unattended full-archive readiness is claimed."
    ],
    "privacy_boundaries": [
      "No runtime absolute paths are emitted.",
      "No raw PCB payloads, tool journals, credentials, cookies, or private-state data are exposed."
    ]
  },
  "quality_self_check": {
    "shape_check": "passed",
    "policy_check": "passed",
    "path_leak_check": "passed",
    "inventory_coverage": "passed",
    "blocker_handling": "passed",
    "receipt_integrity": "passed",
    "notes": [
      "Output is synthetic and contract-bound.",
      "Board_demo_A is review_required, not fully approved.",
      "Board_demo_B remains blocked until owner selection."
    ]
  }
}
