deliverable_kind: allegro_pcb_dbdoctor_uprev_batch_receipt
fixture_id: allegro_dbdoctor_uprev_public_synthetic_001
workflow_id: allegro_pcb_dbdoctor_uprev_batch_v0
public_safety:
  classification: public_safe_synthetic
  runtime_absolute_paths_disclosed: false
  pcb_payloads_included: false
  credentials_or_secrets_included: false
  evidence_basis:
    - supplied_public_workflow_contract
    - supplied_public_step_graph
    - supplied_synthetic_fixture
  non_claims:
    - runtime_execution
    - filesystem_mutation
    - runtime_path_existence
    - tool_availability
    - electrical_correctness
    - manufacturing_readiness
    - symbol_or_padstack_library_validity
    - unattended_full_archive_mutation

batch_scope_packet:
  input_root_ref: runtime_ref://owner-approved/allegro_batch_root
  dbdoctor_executable_ref: runtime_ref://owner-approved/cadence_dbdoctor_executable
  runtime_refs:
    asserted_absolute_by_fixture: true
    independently_validated: false
    public_values_redacted: true
  mutation_mode: convert
  owner_approval_ref: owner_approval_ref://synthetic/allow_default_brd_convert_only
  authorized_scope:
    top_level_files_only: true
    extensions:
      - .brd
    recursive_scan: false
    non_default_extensions: false
    full_archive_mutation: false
  packet_labels:
    old_version_folder_name: old_version
    new_version_folder_name: new_version
  existing_packet_policy: stop

path_policy_report:
  status: conditionally_accepted_from_fixture_assertions
  accepted_refs:
    - runtime_ref://owner-approved/allegro_batch_root
    - runtime_ref://owner-approved/cadence_dbdoctor_executable
  unresolved_runtime_checks:
    - input_root_ref resolves to an existing absolute root
    - dbdoctor_executable_ref resolves to an existing executable
    - computed packet targets remain beneath the approved root
    - resolved paths contain no traversal
  stop_condition: Stop before mutation if any unresolved runtime check fails.

inventory_report:
  candidate_count: 4
  excluded_count: 2
  entries:
    - entry_id: F001
      relative_name: PWR_A.brd
      disposition: candidate
      basis: top_level_allowlisted_extension
    - entry_id: F002
      relative_name: CTRL_B.brd
      disposition: candidate
      basis: top_level_allowlisted_extension
    - entry_id: F003
      relative_name: BROKEN_C.brd
      disposition: candidate
      basis: top_level_allowlisted_extension
    - entry_id: F004
      relative_name: RF_COLLIDE.brd
      disposition: candidate_blocked_during_planning
      basis: top_level_allowlisted_extension
    - entry_id: F005
      relative_name: notes.txt
      disposition: blocked
      basis: extension_not_allowlisted
    - entry_id: F006
      relative_name: nested/NESTED_D.brd
      disposition: out_of_scope
      basis: recursive_scan_not_authorized

conversion_plan:
  status: partially_blocked
  planned_packets:
    - entry_id: F001
      packet_stem: PWR_A
      old_target: PWR_A/old_version/PWR_A.brd
      new_target: PWR_A/new_version/PWR_A.brd
      disposition: eligible_after_runtime_path_validation
    - entry_id: F002
      packet_stem: CTRL_B
      old_target: CTRL_B/old_version/CTRL_B.brd
      new_target: CTRL_B/new_version/CTRL_B.brd
      disposition: eligible_after_runtime_path_validation
    - entry_id: F003
      packet_stem: BROKEN_C
      old_target: BROKEN_C/old_version/BROKEN_C.brd
      new_target: BROKEN_C/new_version/BROKEN_C.brd
      disposition: eligible_after_runtime_path_validation
  blocked_packets:
    - entry_id: F004
      packet_stem: RF_COLLIDE
      disposition: blocked_before_materialization
      reason: existing_packet_folder_collision
      collision_detail: A packet folder named RF_COLLIDE already exists under the approved root.
      required_resolution: explicit_owner_approval_and_existing_packet_policy
  plan_stop_conditions:
    - unresolved packet collision
    - computed target escapes approved root
    - missing mutation authority
    - failed runtime path validation

old_new_packet_manifest:
  evidence_status: synthetic_expected_manifest_only
  materialization_claimed: false
  packets:
    - entry_id: F001
      packet_stem: PWR_A
      old_folder_label: old_version
      new_folder_label: new_version
      original_move_authorized_by_fixture: true
    - entry_id: F002
      packet_stem: CTRL_B
      old_folder_label: old_version
      new_folder_label: new_version
      original_move_authorized_by_fixture: true
    - entry_id: F003
      packet_stem: BROKEN_C
      old_folder_label: old_version
      new_folder_label: new_version
      original_move_authorized_by_fixture: true
  excluded:
    - entry_id: F004
      reason: existing_packet_policy_stop
    - entry_id: F005
      reason: extension_policy
    - entry_id: F006
      reason: recursion_not_authorized

dbdoctor_execution_logs:
  evidence_status: supplied_synthetic_observations
  runtime_commands_disclosed: false
  observations:
    - entry_id: F001
      command_role: outfile_conversion
      output_exists: true
      process_code: 0
      completion_text_present: true
      saved_to_disk_text_present: true
      warning_count: 0
      detected_error_count: 0
    - entry_id: F002
      command_role: outfile_conversion
      output_exists: true
      process_code: 3
      completion_text_present: true
      saved_to_disk_text_present: true
      warning_count: 2
      detected_error_count: 0
    - entry_id: F003
      command_role: outfile_conversion
      output_exists: false
      process_code: 2
      completion_text_present: false
      saved_to_disk_text_present: false
      warning_count: 1
      detected_error_count: 1

conversion_result_matrix:
  - entry_id: F001
    relative_name: PWR_A.brd
    classification: converted_success
    evidence:
      output_exists: true
      completion_text_present: true
      saved_to_disk_text_present: true
      detected_error_count: 0
      warning_count: 0
      process_code: 0
    blocker: null
  - entry_id: F002
    relative_name: CTRL_B.brd
    classification: converted_with_warnings
    evidence:
      output_exists: true
      completion_text_present: true
      saved_to_disk_text_present: true
      detected_error_count: 0
      warning_count: 2
      process_code: 3
    blocker: cleanup_review_required
    note: Nonzero process code does not override the supplied output-and-log success evidence.
  - entry_id: F003
    relative_name: BROKEN_C.brd
    classification: conversion_failed
    evidence:
      output_exists: false
      completion_text_present: false
      saved_to_disk_text_present: false
      detected_error_count: 1
      warning_count: 1
      process_code: 2
    blocker: retry_policy_or_owner_decision_required
  - entry_id: F004
    relative_name: RF_COLLIDE.brd
    classification: not_attempted_packet_collision
    blocker: owner_decision_required
  - entry_id: F005
    relative_name: notes.txt
    classification: not_attempted_extension_blocked
    blocker: null
  - entry_id: F006
    relative_name: nested/NESTED_D.brd
    classification: not_attempted_out_of_scope
    blocker: null

conversion_receipt:
  status: incomplete_with_blockers
  counts:
    inventoried_candidates: 4
    planned_packets: 3
    planning_blocked: 1
    converted_success: 1
    converted_with_warnings: 1
    conversion_failed: 1
    excluded_by_extension: 1
    excluded_by_recursion_policy: 1
  packet_checks:
    - entry_id: F001
      old_database_expected_count: 1
      new_database_observed_count_from_fixture: 1
      temp_files_remaining: []
      cleanup_status: clear_by_supplied_observation
    - entry_id: F002
      old_database_expected_count: 1
      new_database_observed_count_from_fixture: 1
      temp_files_remaining:
        - CTRL_B.tmp
      cleanup_status: blocked_pending_cleanup_review
    - entry_id: F003
      old_database_expected_count: 1
      new_database_observed_count_from_fixture: 0
      temp_files_remaining:
        - BROKEN_C.jrl
      cleanup_status: blocked_pending_failure_preservation_and_retry_decision
  unresolved_blockers:
    - blocker_id: B001
      entry_id: F002
      kind: leftover_temp_file
      required_action: Review and disposition CTRL_B.tmp without discarding conversion logs.
    - blocker_id: B002
      entry_id: F003
      kind: conversion_failure
      required_action: Preserve failure evidence and obtain an approved retry policy or owner decision.
    - blocker_id: B003
      entry_id: F003
      kind: leftover_temp_file
      required_action: Review BROKEN_C.jrl as failure evidence before any cleanup.
    - blocker_id: B004
      entry_id: F004
      kind: existing_packet_collision
      required_action: Obtain explicit owner direction before altering, reusing, or replacing the existing packet.
  stop_conditions:
    - Do not treat CTRL_B as cleanly closed while CTRL_B.tmp remains unresolved.
    - Do not retry BROKEN_C without an approved retry policy or owner decision.
    - Do not materialize RF_COLLIDE under the current existing-packet policy.
    - Do not expand into nested files, non-.brd extensions, or full-archive mutation under the supplied authority.
    - Do not claim batch completion while blockers B001 through B004 remain unresolved.

boundary_review_note:
  closeout_state: not_complete
  public_private_boundary:
    runtime_paths_retained_only_as_opaque_refs: true
    raw_pcb_payloads_included: false
    project_private_material_included: false
    command_lines_with_runtime_paths_included: false
  supported_claims:
    - The supplied synthetic evidence classifies PWR_A as converted_success.
    - The supplied synthetic evidence classifies CTRL_B as converted_with_warnings with cleanup review required.
    - The supplied synthetic evidence classifies BROKEN_C as conversion_failed.
    - RF_COLLIDE is blocked before materialization by the existing-packet stop policy.
    - notes.txt and nested/NESTED_D.brd remain outside the authorized conversion scope.
  unsupported_claims:
    - runtime execution occurred
    - filesystem changes occurred
    - runtime references resolve or exist
    - DB Doctor is installed, licensed, or available
    - converted databases are electrically correct
    - converted databases are manufacturing-ready
    - referenced libraries are valid or complete
    - the full archive was converted
    - all temporary files were cleaned
  follow_up_routes:
    - workflow_id: owner_decision_packet_v0
      reason:
        - BROKEN_C retry or failure disposition
        - RF_COLLIDE existing-packet disposition
        - any requested scope expansion
    - workflow_id: post_development_review_gate_v0
      reason:
        - required before any completion claim involving changed state or runtime verification
  final_disposition: synthetic_conversion_receipt_ready_with_owner_and_cleanup_blockers_preserved
