{
  "target_board_inventory": [
    {
      "target_id": "board_demo_A",
      "folder_label": "DEMO_A_revA",
      "board_file_count": 1,
      "preexisting_lib_state": "absent",
      "expected_action": "plan_export_run_organize_verify"
    },
    {
      "target_id": "board_demo_B",
      "folder_label": "DEMO_B_revA",
      "board_file_count": 2,
      "preexisting_lib_state": "absent",
      "expected_action": "block_before_mutation_owner_selection_required"
    }
  ],
  "dlib_execution_plan": {
    "workflow_id": "allegro_pcb_dlib_export_organize_v0",
    "runtime_scope_binding": {
      "input_root_runtime_path": "redacted",
      "allegro_executable_runtime_path": "redacted",
      "private_run_root_runtime_path": "redacted",
      "recursive_search_enabled": false,
      "board_extension_allowlist": [
        ".brd"
      ],
      "existing_lib_policy": "stop_if_populated",
      "overwrite_existing_files": false,
      "library_root_name": "lib"
    },
    "board_demo_A": {
      "decision": "allowed",
      "plan": [
        "export dlib",
        "organize exported files into board-local lib folders",
        "verify receipt gates"
      ],
      "gate": "review_required"
    },
    "board_demo_B": {
      "decision": "blocked",
      "blocker": "multiple_brd_files_in_one_target_folder",
      "plan": [
        "wait for owner selection",
        "do not mutate",
        "do not run dlib"
      ]
    }
  },
  "library_organization_manifest": {
    "board_demo_A": {
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
      ],
      "classification_note": "unknown_export_file_type routed to other"
    },
    "board_demo_B": {
      "status": "not_organized",
      "reason": "blocked before mutation"
    }
  },
  "export_receipt": {
    "overall_status": "review_required",
    "synthetic_dlib_result": {
      "board_demo_A": {
        "process_code": 0,
        "dump_libraries_log_present": true,
        "dlib_errors_reported": 0,
        "exported_file_count": 11,
        "expected_counts": {
          "padpath": 2,
          "psmpath": 4,
          "devpath": 2,
          "logs": 2,
          "other": 1
        },
        "root_files_left_after_organization": 0,
        "transient_export_folder_left": false,
        "result_status": "review_required",
        "review_reason": "unknown_export_file_type moved to other"
      },
      "board_demo_B": {
        "result_status": "blocked",
        "blocker": "multiple_brd_files_in_one_target_folder",
        "dlib_should_run": false,
        "mutation_should_happen": false
      }
    },
    "acceptance_checks": {
      "dump_libraries_log_present": true,
      "zero_dlib_errors": true,
      "classified_folder_counts": true,
      "no_files_left_under_lib_root": true,
      "no_transient_export_folder_left": true
    },
    "receipt_note": "board_demo_A is operationally clean but remains review_required because an unknown export file type was diverted to other; board_demo_B remains blocked pending owner selection."
  },
  "boundary_review_note": {
    "scope": "public-safe synthetic calibration only",
    "no_claims": [
      "no electrical correctness",
      "no symbol geometry correctness",
      "no padstack engineering approval",
      "no manufacturing readiness",
      "no unattended full-archive readiness"
    ],
    "constraints_respected": [
      "no runtime paths exposed",
      "no raw PCB payloads copied",
      "no private-state data included",
      "no actual Allegro execution claimed"
    ]
  },
  "quality_self_check": {
    "shape_ok": true,
    "inventory_complete": true,
    "runtime_scope_redacted": true,
    "board_demo_A_gate_correct": true,
    "board_demo_B_blocked_before_mutation": true,
    "classification_matches_fixture": true,
    "receipt_state_consistent": true,
    "no_overclaiming": true
  }
}
