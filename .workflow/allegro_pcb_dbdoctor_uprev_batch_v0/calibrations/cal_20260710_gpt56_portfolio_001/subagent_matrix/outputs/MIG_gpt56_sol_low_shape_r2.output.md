{
  "packet_type": "allegro_pcb_dbdoctor_uprev_batch_output",
  "schema_version": "1.0",
  "candidate_profile": {
    "candidate_id": "MIG_gpt56_sol_low_shape_r2",
    "model": "gpt-5.6-sol",
    "reasoning_effort": "low",
    "species": "dwarf",
    "class": "auditor",
    "role": "quality_baseline_and_candidate",
    "calibration_mode": "cli_only_calibration"
  },
  "workflow": {
    "workflow_id": "allegro_pcb_dbdoctor_uprev_batch_v0",
    "fixture_id": "allegro_dbdoctor_uprev_public_synthetic_001",
    "fixture_kind": "public_safe_synthetic_workflow_contract_fixture",
    "execution_mode": "synthetic_classification_only",
    "mutation_performed": false
  },
  "public_safety": {
    "contains_real_pcb_payload": false,
    "contains_project_private_material": false,
    "contains_runtime_absolute_paths": false,
    "contains_credentials_or_secrets": false,
    "runtime_values_redacted": true,
    "runtime_refs_preserved_as_opaque_tokens": true,
    "public_archive_excludes": [
      "runtime absolute paths",
      "PCB database payloads",
      "credentials and secrets",
      "private execution evidence"
    ]
  },
  "runtime_binding": {
    "input_root_ref": "runtime_ref://owner-approved/allegro_batch_root",
    "dbdoctor_executable_ref": "runtime_ref://owner-approved/cadence_dbdoctor_executable",
    "dbdoctor_locator_method": "explicit_executable",
    "runtime_locator_ref": "runtime_ref://owner-approved/cadence_dbdoctor_executable",
    "binding_status": "referenced_not_executed",
    "absolute_runtime_values_disclosed": false
  },
  "authority_and_policy": {
    "mutation_mode": "convert",
    "owner_approval_ref": "owner_approval_ref://synthetic/allow_default_brd_convert_only",
    "full_archive_mutation_authorized": false,
    "top_level_files_only": true,
    "recursive_scan_authorized": false,
    "non_default_extensions_authorized": false,
    "extension_allowlist": [
      ".brd"
    ],
    "non_allowlisted_extensions_policy": "block",
    "existing_packet_policy": "stop",
    "packet_labels": {
      "old_version_folder_name": "old_version",
      "new_version_folder_name": "new_version"
    }
  },
  "inventory": {
    "scan_scope": "top_level_only",
    "entries": [
      {
        "entry_id": "F001",
        "relative_name": "PWR_A.brd",
        "disposition": "in_scope_conversion_candidate",
        "reason": "Top-level file with an allowlisted .brd extension and no packet collision."
      },
      {
        "entry_id": "F002",
        "relative_name": "CTRL_B.brd",
        "disposition": "in_scope_conversion_candidate",
        "reason": "Top-level file with an allowlisted .brd extension and no packet collision."
      },
      {
        "entry_id": "F003",
        "relative_name": "BROKEN_C.brd",
        "disposition": "in_scope_conversion_candidate",
        "reason": "Top-level file with an allowlisted .brd extension and no packet collision."
      },
      {
        "entry_id": "F004",
        "relative_name": "RF_COLLIDE.brd",
        "disposition": "blocked_existing_packet_collision",
        "reason": "A packet folder named RF_COLLIDE already exists under the approved root, and existing_packet_policy is stop."
      },
      {
        "entry_id": "F005",
        "relative_name": "notes.txt",
        "disposition": "blocked_extension_policy",
        "reason": "The .txt extension is not allowlisted and non-default extensions are not authorized."
      },
      {
        "entry_id": "F006",
        "relative_name": "nested/NESTED_D.brd",
        "disposition": "out_of_scope_nested_file",
        "reason": "The file is nested and recursive scanning is not authorized."
      }
    ],
    "counts": {
      "listed": 6,
      "in_scope_conversion_candidates": 3,
      "blocked_collisions": 1,
      "blocked_extensions": 1,
      "out_of_scope_nested": 1
    }
  },
  "packet_plan": {
    "materialization_performed": false,
    "planned_packets": [
      {
        "entry_id": "F001",
        "source_relative_name": "PWR_A.brd",
        "packet_relative_name": "PWR_A",
        "old_version_folder": "PWR_A/old_version",
        "new_version_folder": "PWR_A/new_version",
        "plan_status": "planned"
      },
      {
        "entry_id": "F002",
        "source_relative_name": "CTRL_B.brd",
        "packet_relative_name": "CTRL_B",
        "old_version_folder": "CTRL_B/old_version",
        "new_version_folder": "CTRL_B/new_version",
        "plan_status": "planned"
      },
      {
        "entry_id": "F003",
        "source_relative_name": "BROKEN_C.brd",
        "packet_relative_name": "BROKEN_C",
        "old_version_folder": "BROKEN_C/old_version",
        "new_version_folder": "BROKEN_C/new_version",
        "plan_status": "planned"
      }
    ],
    "blocked_packets": [
      {
        "entry_id": "F004",
        "source_relative_name": "RF_COLLIDE.brd",
        "packet_relative_name": "RF_COLLIDE",
        "plan_status": "blocked_before_materialization",
        "blocker": "existing_packet_collision",
        "owner_decision_required": true
      }
    ]
  },
  "conversion_results": [
    {
      "entry_id": "F001",
      "relative_name": "PWR_A.brd",
      "command_role": "outfile_conversion",
      "classification": "converted_success",
      "evidence": {
        "output_exists": true,
        "process_code": 0,
        "completion_text_present": true,
        "saved_to_disk_text_present": true,
        "warning_count": 0,
        "detected_error_count": 0,
        "temp_files_remaining": []
      },
      "classification_basis": "Output exists, completion and saved-to-disk text are present, and detected errors are zero.",
      "cleanup_status": "clean",
      "retry_required": false,
      "owner_decision_required": false
    },
    {
      "entry_id": "F002",
      "relative_name": "CTRL_B.brd",
      "command_role": "outfile_conversion",
      "classification": "converted_with_warnings",
      "evidence": {
        "output_exists": true,
        "process_code": 3,
        "completion_text_present": true,
        "saved_to_disk_text_present": true,
        "warning_count": 2,
        "detected_error_count": 0,
        "temp_files_remaining": [
          "CTRL_B.tmp"
        ]
      },
      "classification_basis": "Output exists, completion and saved-to-disk text are present, detected errors are zero, and a warning-bearing nonzero process code is allowed.",
      "cleanup_status": "cleanup_review_required",
      "retry_required": false,
      "owner_decision_required": false,
      "blockers": [
        "Confirm and safely resolve the remaining temporary file before packet closeout."
      ]
    },
    {
      "entry_id": "F003",
      "relative_name": "BROKEN_C.brd",
      "command_role": "outfile_conversion",
      "classification": "conversion_failed",
      "evidence": {
        "output_exists": false,
        "process_code": 2,
        "completion_text_present": false,
        "saved_to_disk_text_present": false,
        "warning_count": 1,
        "detected_error_count": 1,
        "temp_files_remaining": [
          "BROKEN_C.jrl"
        ]
      },
      "classification_basis": "Output is missing, completion and saved-to-disk text are absent, and a detected error is present.",
      "cleanup_status": "cleanup_required",
      "retry_required": true,
      "owner_decision_required": true,
      "blockers": [
        "Resolve or disposition the reported missing padstack library reference.",
        "Define an owner-approved retry or failure-disposition policy.",
        "Review and safely resolve the remaining journal file before retry or closeout."
      ]
    }
  ],
  "blockers_and_decisions": {
    "failure_blockers": [
      {
        "entry_id": "F003",
        "type": "conversion_failure",
        "status": "open"
      }
    ],
    "collision_blockers": [
      {
        "entry_id": "F004",
        "type": "existing_packet_collision",
        "status": "open",
        "required_decision": "Owner must choose whether to preserve, rename, archive, or otherwise disposition the existing packet. No overwrite is authorized."
      }
    ],
    "cleanup_blockers": [
      {
        "entry_id": "F002",
        "artifact": "CTRL_B.tmp",
        "status": "open"
      },
      {
        "entry_id": "F003",
        "artifact": "BROKEN_C.jrl",
        "status": "open"
      }
    ],
    "policy_blocks": [
      {
        "entry_id": "F005",
        "type": "non_allowlisted_extension",
        "status": "blocked"
      },
      {
        "entry_id": "F006",
        "type": "recursive_scope_not_authorized",
        "status": "out_of_scope"
      }
    ]
  },
  "batch_summary": {
    "planned_conversion_count": 3,
    "converted_success_count": 1,
    "converted_with_warnings_count": 1,
    "conversion_failed_count": 1,
    "collision_blocked_count": 1,
    "cleanup_review_required_count": 2,
    "owner_decision_required": true,
    "batch_closeout_status": "blocked"
  },
  "non_claims": [
    "No Cadence DB Doctor execution was performed or claimed.",
    "No real PCB database payload was inspected.",
    "Electrical correctness is not assessed or claimed.",
    "Manufacturing readiness is not assessed or claimed.",
    "Cadence installation, executable discovery beyond the supplied runtime reference, and license management are not performed or claimed.",
    "Unattended full-archive mutation is not authorized or claimed.",
    "Successful workflow classification does not establish design correctness beyond the supplied synthetic process evidence."
  ],
  "boundary_review": {
    "runtime_absolute_paths_present": false,
    "runtime_refs_only": true,
    "real_pcb_payload_present": false,
    "private_project_facts_present": false,
    "credentials_or_secrets_present": false,
    "real_filesystem_mutated": false,
    "collision_policy_respected": true,
    "extension_policy_respected": true,
    "recursive_scope_boundary_respected": true,
    "process_code_interpretation_respected": true,
    "output_existence_not_used_as_sole_success_criterion": true,
    "review_status": "boundary_compliant_with_open_operational_blockers"
  },
  "closeout": {
    "status": "not_ready_for_final_closeout",
    "reasons": [
      "BROKEN_C conversion is failed and requires owner disposition or an approved retry.",
      "RF_COLLIDE is blocked by an existing packet collision.",
      "CTRL_B.tmp and BROKEN_C.jrl require cleanup review."
    ],
    "next_action": "Obtain owner decisions for the BROKEN_C retry or failure disposition and the RF_COLLIDE collision, then review temporary artifacts under an approved cleanup policy before reclassification and closeout."
  }
}
