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
    "runtime_scope_bound": true,
    "recursive_search_enabled": false,
    "board_extension_allowlist": [
      ".brd"
    ],
    "existing_lib_policy": "stop_if_populated",
    "overwrite_existing_files": false,
    "library_root_name": "lib",
    "planned_targets": [
      {
        "target_id": "board_demo_A",
        "planned_state": "eligible_for_export",
        "plan": [
          "run dlib export for the single board file",
          "classify exported artifacts into board-local lib subfolders",
          "verify success conditions",
          "record receipt status"
        ]
      },
      {
        "target_id": "board_demo_B",
        "planned_state": "blocked_before_mutation",
        "plan": [
          "pause before any export or filesystem mutation",
          "require owner selection because multiple .brd files exist in one target folder"
        ]
      }
    ]
  },
  "library_organization_manifest": {
    "board_demo_A": {
      "process_code": 0,
      "dump_libraries_log_present": true,
      "dlib_errors_reported": 0,
      "classification_summary": {
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
        "review_required": true,
        "review_reason": "unknown_export_file_type moved to other"
      }
    },
    "board_demo_B": {
      "organization_result": {
        "status": "not_started",
        "blocked": true,
        "blocker": "multiple_brd_files_in_one_target_folder"
      }
    }
  },
  "export_receipt": {
    "board_demo_A": {
      "status": "review_required",
      "success_conditions_met": [
        "dump_libraries.log present",
        "zero dlib errors",
        "classified folder counts recorded",
        "no files left directly under lib root",
        "no transient export folder left"
      ],
      "receipt_note": "Export completed and organized, but receipt remains review_required because an unknown exported file type was routed to other."
    },
    "board_demo_B": {
      "status": "blocked",
      "success_conditions_met": [],
      "blocker": "multiple_brd_files_in_one_target_folder",
      "receipt_note": "No dlib run or mutation permitted until owner selection resolves the ambiguous target folder."
    }
  },
  "boundary_review_note": {
    "scope_confirmation": "Public-safe synthetic calibration only; no real PCB payloads, runtime paths, or private workspace details included.",
    "non_claims": [
      "No electrical correctness claim",
      "No symbol geometry correctness claim",
      "No padstack engineering approval claim",
      "No manufacturing readiness claim",
      "No unattended full-archive readiness claim"
    ],
    "boundary_status": "respected"
  },
  "quality_self_check": {
    "shape_check": "passed",
    "path_leak_check": "passed",
    "claim_boundaries_check": "passed",
    "board_blocking_rule_check": "passed",
    "receipt_status_check": "passed",
    "notes": [
      "Output is compact and bound to the synthetic fixture.",
      "board_demo_A is represented as review_required, not unconditional success.",
      "board_demo_B is represented as blocked before mutation."
    ]
  }
}
