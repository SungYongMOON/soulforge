```yaml
workflow_id: allegro_pcb_dlib_export_organize_v0
fixture_type: public_safe_synthetic_calibration
runtime_paths: redacted
runtime_paths_emitted: false

target_board_inventory:
  scope:
    recursive_search_enabled: false
    extension_allowlist: [".brd"]
    library_root_name: lib
  boards:
    - target_id: board_demo_A
      folder_label: DEMO_A_revA
      board_files: ["DEMO_A_revA.brd"]
      preexisting_lib_state: absent
      status: eligible_for_planning
    - target_id: board_demo_B
      folder_label: DEMO_B_revA
      board_files: ["DEMO_B_main.brd", "DEMO_B_backup.brd"]
      preexisting_lib_state: absent
      status: blocked
      blocker: multiple_brd_files_in_one_target_folder
      owner_action_required: select_one_board_before_mutation

dlib_execution_plan:
  global_policy:
    existing_lib_policy: stop_if_populated
    overwrite_existing_files: false
    invocation_modes:
      - readonly
      - nograph_when_available
      - script_replay
    enabled_elements:
      mechanical_symbols: true
      package_symbols: true
      format_symbols: true
      shape_and_flash_symbols: true
      device_files: true
      padstacks: true
    dependency_policy:
      no_library_dependencies: false
      purge_unused_cross_section_layers: false
  plans:
    - target_id: board_demo_A
      folder_label: DEMO_A_revA
      board_file: DEMO_A_revA.brd
      board_local_library_root: lib
      expected_folders:
        - padpath
        - psmpath
        - devpath
        - logs
        - other
      transient_export_folder_candidates: [export_libraries]
      generated_script: runtime_only
      log_targets:
        - dump_libraries.log
        - allegro_journal.log
      mutation_scope: board_local_declared_library_root
      execution_status: planned_from_synthetic_fixture
    - target_id: board_demo_B
      folder_label: DEMO_B_revA
      board_file: null
      board_local_library_root: null
      execution_status: blocked
      stop_condition: owner_selection_required
      dlib_should_run: false
      mutation_should_happen: false

library_organization_manifest:
  target_id: board_demo_A
  source_basis: synthetic_dlib_result
  destination_root: lib
  classifications:
    padpath:
      files: ["PAD_A.pad", "PAD_B.pad"]
      count: 2
    psmpath:
      files: ["MCU.psm", "MCU.dra", "CONNECTOR.bsm", "FIDUCIAL.fsm"]
      count: 4
    devpath:
      files: ["devices.txt", "pinmap.map"]
      count: 2
    logs:
      files: ["dump_libraries.log", "allegro_journal.log"]
      count: 2
    other:
      files: ["unexpected_notes.tmp"]
      count: 1
      review_required: true
  root_files_left_after_organization: 0
  unknown_file_policy: moved_to_other_and_review_required
  target_status: review_required

export_receipt:
  workflow_id: allegro_pcb_dlib_export_organize_v0
  results:
    - target_id: board_demo_A
      process_code: 0
      dump_libraries_log_present: true
      dlib_errors_reported: 0
      classified_folder_counts:
        padpath: 2
        psmpath: 4
        devpath: 2
        logs: 2
        other: 1
      root_files_left_after_organization: 0
      transient_export_folder_left: false
      status: review_required
      review_reason: unknown_export_file_type_moved_to_other
    - target_id: board_demo_B
      status: blocked
      blocker: multiple_brd_files_in_one_target_folder
      dlib_should_run: false
      mutation_should_happen: false
  overall_status: review_required_with_one_blocked_target
  success_gate:
    dump_libraries_log_present: satisfied_for_board_demo_A
    zero_dlib_errors: satisfied_for_board_demo_A
    classified_folder_counts_recorded: satisfied_for_board_demo_A
    no_files_directly_under_lib_root: satisfied_for_board_demo_A
    no_transient_export_folder_left: satisfied_for_board_demo_A
    unknown_file_review: required
    owner_selection_for_board_demo_B: required

boundary_review_note:
  status: review_required
  public_safe: true
  runtime_paths: redacted_and_not_emitted
  raw_pcb_payloads: not included
  generated_scripts: runtime_only
  journals_and_private_run_evidence: private_runtime_evidence_only
  mutation_boundary: limited_to_declared_board_local_library_roots
  board_files_saved_by_workflow: not claimed
  non_claims:
    - electrical correctness
    - symbol geometry correctness
    - padstack engineering approval
    - manufacturing readiness
    - Cadence license or installation management
    - owner approval for overwrite or delete policy
    - unattended full-archive readiness
  owner_decisions_required:
    - select_one_board_file for board_demo_B
    - review unexpected_notes.tmp
    - define any broader archive or rerun policy if requested
  completion_gate:
    - resolve board_demo_B owner selection
    - resolve unknown-file review for board_demo_A
    - apply post-development review requirements before any completion claim

quality_self_check:
  required_outputs_present:
    target_board_inventory: true
    dlib_execution_plan: true
    library_organization_manifest: true
    export_receipt: true
    boundary_review_note: true
    quality_self_check: true
  hard_rules:
    relative_paths_rejected: preserved
    actual_runtime_absolute_paths_emitted: false
    raw_or_private_payloads_emitted: false
    multiple_brd_stop_condition_preserved: true
    unknown_file_review_state_preserved: true
    export_success_gates_recorded: true
    required_non_claims_present: true
  unresolved_items:
    - board_demo_B owner board selection
    - board_demo_A unknown file review
```
