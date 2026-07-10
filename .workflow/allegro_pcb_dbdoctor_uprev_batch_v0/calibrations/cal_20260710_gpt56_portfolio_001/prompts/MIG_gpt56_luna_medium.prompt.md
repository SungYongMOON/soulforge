You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-luna; reasoning_effort=medium; species=dwarf; class=auditor.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: allegro_pcb_dbdoctor_uprev_batch_v0
kind: workflow
status: active
title: Allegro PCB DB Doctor Uprev Batch v0
summary: Parameterized workflow for moving legacy Allegro PCB database files into per-file old/new packets, running Cadence DB Doctor with explicit runtime paths, and verifying converted outputs without hard-coding a sample folder.
entrypoint: run
execution_mode: local_tool_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
inputs:
  - batch_scope_packet
  - dbdoctor_runtime_binding
  - mutation_authority_policy
optional_inputs:
  - extension_allowlist_policy
  - existing_packet_policy
  - retry_policy
  - owner_approval_ref
outputs:
  - inventory_report
  - conversion_plan
  - old_new_packet_manifest
  - dbdoctor_execution_logs
  - conversion_receipt
  - boundary_review_note
validation_level: registered_extracted_from_sample_pilot_private_evidence
registration_policy: owner_requested_registration
output_state: registered
classification_lane:
  primary: design_asset
  primary_name_ko: 설계 자산
  secondary:
    - workspace_management
    - review_governance
  secondary_name_ko:
    - 작업공간 관리
    - 리뷰/거버넌스
  purpose: discovery_only
  authority: none
execution_binding:
  party_required: false
  candidate_party_id: null
  bound_party_id: null
  binding_authority: none
runtime_path_policy:
  user_supplied_paths_must_be_absolute: true
  reject_relative_input_root: true
  reject_relative_tool_path: true
  public_package_stores_runtime_paths: false
  runtime_paths_allowed_only_in_private_evidence: true
default_packet_labels:
  old_version_folder_name: 구버전
  new_version_folder_name: 신버전
default_database_policy:
  top_level_files_only_by_default: true
  default_extension_allowlist:
    - .brd
  non_default_extensions_require_owner_policy: true
  existing_packet_folder_policy: stop_unless_owner_approved
operating_contract:
  owns:
    - absolute_runtime_path_intake_shape
    - top_level_legacy_database_inventory
    - old_new_packet_plan_shape
    - dbdoctor_outfile_execution_sequence
    - dbdoctor_log_capture_shape
    - conversion_success_classification
    - temp_file_cleanup_check
    - conversion_receipt_shape
    - boundary_review_note_shape
  does_not_own:
    - electrical_correctness
    - manufacturing_readiness
    - symbol_or_padstack_library_validity
    - owner_approval_for_full_archive_mutation
    - Cadence_license_or_install_management
    - secret_material_inspection
    - public_storage_of_project_payloads
    - unattended_archive_wide_mutation_by_default
  boundaries:
    no_fixed_sample_folder_in_workflow_package: true
    no_relative_user_supplied_pcb_paths: true
    no_runtime_absolute_paths_in_public_package: true
    no_raw_pcb_payload_copy_into_public_repo: true
    mutation_requires_scope_and_owner_authority: true
    output_success_requires_file_and_log_evidence: true
  required_output_shapes:
    batch_scope_packet: templates/batch_scope_packet.template.yaml
    conversion_plan: templates/conversion_plan.template.yaml
    conversion_receipt: templates/conversion_receipt.template.yaml
    boundary_review_note: templates/boundary_review_note.template.md
downstream_workflows:
  - workflow_id: owner_decision_packet_v0
    expected_input: full_archive_mutation_or_extension_policy_needed
    status: optional_owner_gate
  - workflow_id: post_development_review_gate_v0
    expected_input: conversion_workflow_changed_state_or_claim_posture
    status: required_before_completion_claim
notes:
  - "The workflow package intentionally contains no sample input folder or installed Cadence path. Those values are runtime-only inputs and belong in private run evidence."
  - "DB Doctor may return a non-zero process code while still writing a valid converted database. Success classification must require output existence plus completion phrases and zero detected errors in the captured log."
  - "Registered status means the reusable public-safe workflow package is stored in `.workflow`; it is not a production-ready unattended full-archive conversion claim."


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: allegro_pcb_dbdoctor_uprev_batch_v0
kind: step_graph
status: active
steps:
  - step_id: bind_runtime_scope
    title: Bind Runtime Scope
    actor_slot: runtime_scope_binder
    action: Collect input root, DB Doctor executable or locator, extension allowlist, old/new folder labels, mutation mode, and owner approval reference without writing runtime paths into workflow canon.
    inputs:
      - batch_scope_packet
      - dbdoctor_runtime_binding
      - mutation_authority_policy
    outputs:
      - bound_runtime_scope
    next:
      - validate_absolute_paths
  - step_id: validate_absolute_paths
    title: Validate Absolute Paths
    actor_slot: path_policy_checker
    action: Reject relative input roots, relative tool paths, path traversal, missing roots, missing DB Doctor executable, and computed packet paths that escape the owner-approved input root.
    inputs:
      - bound_runtime_scope
    outputs:
      - path_policy_report
    next:
      - inventory_legacy_databases
  - step_id: inventory_legacy_databases
    title: Inventory Legacy Databases
    actor_slot: inventory_runner
    action: Enumerate only top-level files matching the active extension allowlist unless the owner explicitly enables recursive or non-default extension handling.
    inputs:
      - path_policy_report
    outputs:
      - inventory_report
    next:
      - plan_old_new_packets
  - step_id: plan_old_new_packets
    title: Plan Old New Packets
    actor_slot: packet_planner
    action: Derive one packet folder per file stem, plan sibling old/new folders, detect folder/file collisions, and prepare the exact move and output targets.
    inputs:
      - inventory_report
    outputs:
      - conversion_plan
    next:
      - materialize_old_new_packets
  - step_id: materialize_old_new_packets
    title: Materialize Old New Packets
    actor_slot: packet_materializer
    action: Create packet folders and move originals into the old-version folder only when mutation authority is confirmed; otherwise stop after dry-run plan output.
    inputs:
      - conversion_plan
    outputs:
      - old_new_packet_manifest
    next:
      - run_dbdoctor_outfile
  - step_id: run_dbdoctor_outfile
    title: Run DB Doctor Outfile
    actor_slot: dbdoctor_runner
    action: For each packet, run DB Doctor with outfile mode, write the new-version database into the new-version folder, set the working directory to that folder, and capture stdout, stderr, command metadata, and process code.
    inputs:
      - old_new_packet_manifest
    outputs:
      - dbdoctor_execution_logs
    next:
      - classify_conversion_results
  - step_id: classify_conversion_results
    title: Classify Conversion Results
    actor_slot: result_classifier
    action: Classify each conversion from output existence, log completion text, save text, warning/error counts, and process code; record warning-bearing completion separately from failure.
    inputs:
      - dbdoctor_execution_logs
    outputs:
      - conversion_result_matrix
    next:
      - cleanup_and_verify_packets
  - step_id: cleanup_and_verify_packets
    title: Cleanup And Verify Packets
    actor_slot: cleanup_verifier
    action: Check for leftover DB Doctor temp files, verify old/new database counts, preserve conversion logs, and record retry or owner-decision blockers.
    inputs:
      - conversion_result_matrix
    outputs:
      - conversion_receipt
    next:
      - review_boundary_and_close
  - step_id: review_boundary_and_close
    title: Review Boundary And Close
    actor_slot: boundary_closeout_reviewer
    action: Confirm public/private boundary posture, output state, known gaps, and whether any follow-up should route to owner decision or post-development review.
    inputs:
      - conversion_receipt
    outputs:
      - boundary_review_note
    next: []


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "fixture_id": "allegro_dbdoctor_uprev_public_synthetic_001",
  "fixture_kind": "public_safe_synthetic_workflow_contract_fixture",
  "workflow_id": "allegro_pcb_dbdoctor_uprev_batch_v0",
  "public_safety": {
    "contains_real_pcb_payload": false,
    "contains_project_private_material": false,
    "contains_runtime_absolute_paths": false,
    "contains_credentials_or_secrets": false,
    "basis": "Synthetic fields derived from the public workflow contract only. Runtime paths are represented by opaque tokens, not host paths."
  },
  "runtime_binding": {
    "input_root_ref": "runtime_ref://owner-approved/allegro_batch_root",
    "dbdoctor_executable_ref": "runtime_ref://owner-approved/cadence_dbdoctor_executable",
    "runtime_refs_are_absolute_in_private_evidence": true,
    "runtime_refs_are_redacted_for_public_archive": true,
    "dbdoctor_locator": {
      "method": "explicit_executable",
      "runtime_locator_ref": "runtime_ref://owner-approved/cadence_dbdoctor_executable"
    }
  },
  "mutation_authority_policy": {
    "mutation_mode": "convert",
    "owner_approval_ref": "owner_approval_ref://synthetic/allow_default_brd_convert_only",
    "full_archive_mutation_authorized": false,
    "top_level_files_only": true,
    "recursive_scan_authorized": false,
    "non_default_extensions_authorized": false
  },
  "database_policy": {
    "extension_allowlist": [".brd"],
    "non_allowlisted_extensions": "block",
    "existing_packet_policy": "stop",
    "packet_labels": {
      "old_version_folder_name": "old_version",
      "new_version_folder_name": "new_version"
    }
  },
  "input_root_listing": [
    {
      "entry_id": "F001",
      "relative_name": "PWR_A.brd",
      "kind": "file",
      "extension": ".brd",
      "depth": 0,
      "existing_packet_folder": false
    },
    {
      "entry_id": "F002",
      "relative_name": "CTRL_B.brd",
      "kind": "file",
      "extension": ".brd",
      "depth": 0,
      "existing_packet_folder": false
    },
    {
      "entry_id": "F003",
      "relative_name": "BROKEN_C.brd",
      "kind": "file",
      "extension": ".brd",
      "depth": 0,
      "existing_packet_folder": false
    },
    {
      "entry_id": "F004",
      "relative_name": "RF_COLLIDE.brd",
      "kind": "file",
      "extension": ".brd",
      "depth": 0,
      "existing_packet_folder": true,
      "collision_reason": "A packet folder named RF_COLLIDE already exists under the approved root."
    },
    {
      "entry_id": "F005",
      "relative_name": "notes.txt",
      "kind": "file",
      "extension": ".txt",
      "depth": 0,
      "existing_packet_folder": false
    },
    {
      "entry_id": "F006",
      "relative_name": "nested/NESTED_D.brd",
      "kind": "file",
      "extension": ".brd",
      "depth": 1,
      "existing_packet_folder": false
    }
  ],
  "synthetic_dbdoctor_observations": [
    {
      "entry_id": "F001",
      "relative_name": "PWR_A.brd",
      "command_role": "outfile_conversion",
      "output_exists": true,
      "process_code": 0,
      "stdout_markers": ["Database revision complete", "Saved to disk"],
      "stderr_markers": [],
      "log_summary": {
        "warning_count": 0,
        "detected_error_count": 0,
        "completion_text_present": true,
        "saved_to_disk_text_present": true
      },
      "temp_files_remaining": []
    },
    {
      "entry_id": "F002",
      "relative_name": "CTRL_B.brd",
      "command_role": "outfile_conversion",
      "output_exists": true,
      "process_code": 3,
      "stdout_markers": ["Database revision complete", "Saved to disk"],
      "stderr_markers": ["Warnings emitted"],
      "log_summary": {
        "warning_count": 2,
        "detected_error_count": 0,
        "completion_text_present": true,
        "saved_to_disk_text_present": true
      },
      "temp_files_remaining": ["CTRL_B.tmp"],
      "expected_classification_hint": "success_with_warnings_requires_cleanup_review"
    },
    {
      "entry_id": "F003",
      "relative_name": "BROKEN_C.brd",
      "command_role": "outfile_conversion",
      "output_exists": false,
      "process_code": 2,
      "stdout_markers": ["Revision started"],
      "stderr_markers": ["Detected error: missing padstack library reference"],
      "log_summary": {
        "warning_count": 1,
        "detected_error_count": 1,
        "completion_text_present": false,
        "saved_to_disk_text_present": false
      },
      "temp_files_remaining": ["BROKEN_C.jrl"],
      "expected_classification_hint": "failure_requires_owner_decision_or_retry_policy"
    }
  ],
  "expected_workflow_behavior_summary": {
    "inventory": [
      "Include only top-level .brd files as conversion candidates by default.",
      "Record notes.txt as blocked by extension policy.",
      "Record nested/NESTED_D.brd as out of default scope because recursive scan is not authorized."
    ],
    "planning": [
      "Create old/new packet plans for PWR_A, CTRL_B, and BROKEN_C.",
      "Block RF_COLLIDE before materialization because existing_packet_policy is stop and a packet folder collision exists."
    ],
    "conversion_classification": [
      "PWR_A is converted_success because output exists, completion text and saved-to-disk text are present, and detected errors are zero.",
      "CTRL_B is converted_with_warnings because output exists, completion and saved text are present, detected errors are zero, and warning-bearing nonzero exit is allowed.",
      "BROKEN_C is conversion_failed because output is missing and detected errors are nonzero."
    ],
    "cleanup_and_closeout": [
      "CTRL_B and BROKEN_C must carry cleanup or retry blockers for temp files.",
      "The packet must state that electrical correctness, manufacturing readiness, and unattended full-archive mutation are not claimed.",
      "Runtime path values and PCB payloads must remain outside the public archive."
    ]
  }
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
