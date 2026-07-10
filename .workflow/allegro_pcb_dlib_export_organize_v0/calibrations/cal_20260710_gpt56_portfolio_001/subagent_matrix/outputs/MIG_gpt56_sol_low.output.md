workflow_id: allegro_pcb_dlib_export_organize_v0
deliverable_type: public_safe_synthetic_calibration
evidence_basis: supplied_synthetic_fixture_only
runtime_verification_status: not_claimed

target_board_inventory:
  scope:
    recursive_search_enabled: false
    extension_allowlist:
      - .brd
    library_root_name: lib
    runtime_paths:
      input_root: redacted_private_absolute_runtime_path
      allegro_executable: redacted_private_absolute_runtime_path
      private_run_root: redacted_private_absolute_runtime_path
    path_readiness: unknown_not_assessable_from_redacted_fixture
  targets:
    - target_id: board_demo_A
      folder_label: DEMO_A_revA
      board_files:
        - DEMO_A_revA.brd
      board_count: 1
      preexisting_lib_state: absent
      inventory_status: eligible_for_planning
      mutation_authority: limited_to_declared_board_local_lib_root
    - target_id: board_demo_B
      folder_label: DEMO_B_revA
      board_files:
        - DEMO_B_main.brd
        - DEMO_B_backup.brd
      board_count: 2
      preexisting_lib_state: absent
      inventory_status: blocked
      blocker: multiple_brd_files_in_one_target_folder
      required_owner_decision: select_exactly_one_board_file
      mutation_allowed: false
      dlib_execution_allowed: false

dlib_execution_plan:
  common_policy:
    invocation:
      readonly: true
      script_replay: true
      nograph: when_available
    existing_lib_policy: stop_if_populated
    overwrite_existing_files: false
    dependency_policy:
      no_library_dependencies: false
      purge_unused_cross_section_layers: false
    enabled_elements:
      mechanical_symbols: true
      package_symbols: true
      format_symbols: true
      shape_and_flash_symbols: true
      device_files: true
      padstacks: true
    organization_folders:
      - padpath
      - psmpath
      - devpath
      - logs
      - other
    runtime_artifacts:
      generated_script_path: private_runtime_only
      execution_logs: private_run_evidence_only
      actual_absolute_paths_in_public_output: prohibited
  targets:
    - target_id: board_demo_A
      selected_board_file: DEMO_A_revA.brd
      plan_status: synthetically_executed_per_fixture
      intended_sequence:
        - confirm_absolute_runtime_paths_and_containment
        - prepare_board_local_lib_folders
        - generate_runtime_only_dlib_script
        - invoke_allegro_readonly_with_script_replay
        - capture_process_and_dlib_logs
        - collect_direct_or_transient_export_payload
        - classify_files
        - evaluate_export_conditions
        - clean_workflow_created_transient_artifacts
      output_root: board_local_lib
    - target_id: board_demo_B
      selected_board_file: null
      plan_status: blocked_before_mutation
      stop_condition: owner_board_selection_missing
      prohibited_actions:
        - create_library_root
        - generate_or_replay_dlib_script
        - invoke_dlib
        - move_or_overwrite_files
        - clean_existing_content

library_organization_manifest:
  targets:
    - target_id: board_demo_A
      classification_basis: supplied_synthetic_dlib_result
      folders:
        padpath:
          count: 2
          files:
            - PAD_A.pad
            - PAD_B.pad
        psmpath:
          count: 4
          files:
            - MCU.psm
            - MCU.dra
            - CONNECTOR.bsm
            - FIDUCIAL.fsm
        devpath:
          count: 2
          files:
            - devices.txt
            - pinmap.map
        logs:
          count: 2
          files:
            - dump_libraries.log
            - allegro_journal.log
        other:
          count: 1
          files:
            - unexpected_notes.tmp
          review_required: true
          review_reason: unknown_export_file_type
      total_classified_files: 11
      root_files_left_after_organization: 0
      unknown_file_policy_applied: move_to_other_and_require_review
      manifest_status: review_required
    - target_id: board_demo_B
      classification_status: not_applicable
      reason: blocked_before_dlib_and_mutation

export_receipt:
  overall_status: review_required
  targets:
    - target_id: board_demo_A
      status: review_required
      synthetic_result:
        process_code: 0
        dump_libraries_log_present: true
        dlib_errors_reported: 0
        classified_counts:
          padpath: 2
          psmpath: 4
          devpath: 2
          logs: 2
          other: 1
        root_files_left_after_organization: 0
        transient_export_folder_left: false
      success_conditions:
        log_present: satisfied_by_fixture
        zero_dlib_errors: satisfied_by_fixture
        classified_folder_counts_recorded: satisfied_by_fixture
        no_files_directly_under_lib_root: satisfied_by_fixture
        no_transient_export_folder_left: satisfied_by_fixture
        board_file_not_saved: unknown_not_stated_by_fixture
      review_hold:
        reason: unknown_export_file_type_moved_to_other
        file: unexpected_notes.tmp
        required_disposition: owner_review_before_completion_claim
    - target_id: board_demo_B
      status: blocked
      blocker: multiple_brd_files_in_one_target_folder
      dlib_run: false
      mutation: false
      required_next_action: owner_selects_DEMO_B_main.brd_or_DEMO_B_backup.brd
  completion_claim_allowed: false
  completion_blockers:
    - board_demo_A_unknown_file_requires_owner_review
    - board_demo_A_board_not_saved_condition_is_unconfirmed
    - board_demo_B_requires_owner_board_selection
    - post_development_review_gate_not_established_by_fixture

boundary_review_note:
  output_state: synthetic_public_safe_deliverable
  public_private_posture:
    actual_runtime_paths_emitted: false
    raw_pcb_payloads_included: false
    generated_scripts_included: false
    tool_journals_included: false
    credentials_cookies_or_private_state_included: false
  mutation_boundary:
    permitted_scope: declared_board_local_library_roots_only
    board_demo_A: fixture_describes_export_and_organization_results
    board_demo_B: mutation_prohibited_until_owner_selection
  owner_decisions_required:
    - target_id: board_demo_A
      decision: disposition_of_unexpected_notes.tmp
    - target_id: board_demo_B
      decision: select_exactly_one_board_file
  stop_conditions:
    - unresolved_or_relative_runtime_path
    - computed_output_path_escapes_owner_approved_root
    - populated_existing_lib_under_stop_if_populated_policy
    - multiple_board_files_without_owner_selection
    - overwrite_or_delete_needed_without_owner_approval
    - unknown_file_pending_review
    - missing_dump_libraries_log
    - nonzero_dlib_errors
    - files_remaining_directly_under_lib_root
    - transient_export_folder_remaining
  non_claims:
    - no_electrical_correctness_claim
    - no_symbol_geometry_correctness_claim
    - no_padstack_engineering_approval
    - no_manufacturing_readiness_claim
    - no_unattended_full_archive_readiness_claim
    - no_runtime_path_or_tool_readiness_verification_claim
    - no_claim_that_board_files_were_unchanged
    - no_final_completion_claim
  required_closeout_gate: post_development_review_gate_v0

quality_self_check:
  required_shapes_present:
    target_board_inventory: true
    dlib_execution_plan: true
    library_organization_manifest: true
    export_receipt: true
    boundary_review_note: true
    quality_self_check: true
  fixture_consistency:
    board_demo_A_counts_match_expected: true
    board_demo_A_unknown_file_preserves_review_required: true
    board_demo_B_blocked_before_mutation: true
    overall_status_not_overclaimed: true
  boundary_checks:
    identifiers_are_synthetic: true
    actual_absolute_runtime_paths_absent: true
    private_payloads_absent: true
    owner_boundaries_preserved: true
    uncertainty_preserved: true
  final_disposition: usable_with_open_owner_and_review_gates
