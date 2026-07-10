```yaml
workflow_id: allegro_pcb_dbdoctor_uprev_batch_v0
fixture_id: allegro_dbdoctor_uprev_public_synthetic_001
deliverable_kind: public_safe_synthetic_workflow_deliverable
status: fixture_derived_candidate
runtime_evidence_status: synthetic_only
claims_excluded:
  - electrical_correctness
  - manufacturing_readiness
  - library_validity
  - unattended_full_archive_mutation
  - Cadence_license_or_install_status

runtime_binding:
  input_root_ref: runtime_ref://owner-approved/allegro_batch_root
  dbdoctor_executable_ref: runtime_ref://owner-approved/cadence_dbdoctor_executable
  locator_method: explicit_executable
  paths_publicly_redacted: true

scope_policy:
  mutation_mode: convert
  owner_approval_ref: owner_approval_ref://synthetic/allow_default_brd_convert_only
  top_level_files_only: true
  recursive_scan_authorized: false
  extension_allowlist:
    - .brd
  existing_packet_policy: stop
  old_version_folder_name: old_version
  new_version_folder_name: new_version

inventory_report:
  candidates:
    - entry_id: F001
      relative_name: PWR_A.brd
      status: in_scope
    - entry_id: F002
      relative_name: CTRL_B.brd
      status: in_scope
    - entry_id: F003
      relative_name: BROKEN_C.brd
      status: in_scope
  blocked:
    - entry_id: F004
      relative_name: RF_COLLIDE.brd
      status: blocked_existing_packet_folder
      reason: packet folder RF_COLLIDE already exists
    - entry_id: F005
      relative_name: notes.txt
      status: blocked_extension_policy
    - entry_id: F006
      relative_name: nested/NESTED_D.brd
      status: out_of_scope_recursive_scan_not_authorized

conversion_plan:
  planned_packets:
    - entry_id: F001
      stem: PWR_A
      old_target: PWR_A/old_version/PWR_A.brd
      new_target: PWR_A/new_version/PWR_A.brd
      status: planned
    - entry_id: F002
      stem: CTRL_B
      old_target: CTRL_B/old_version/CTRL_B.brd
      new_target: CTRL_B/new_version/CTRL_B.brd
      status: planned
    - entry_id: F003
      stem: BROKEN_C
      old_target: BROKEN_C/old_version/BROKEN_C.brd
      new_target: BROKEN_C/new_version/BROKEN_C.brd
      status: planned
  blocked_packets:
    - entry_id: F004
      stem: RF_COLLIDE
      status: blocked
      reason: existing_packet_policy=stop

old_new_packet_manifest:
  materialization_status: authority_bound_by_fixture
  packets:
    - entry_id: F001
      stem: PWR_A
      old_version: PWR_A/old_version/PWR_A.brd
      new_version: PWR_A/new_version/PWR_A.brd
      status: eligible_for_execution
    - entry_id: F002
      stem: CTRL_B
      old_version: CTRL_B/old_version/CTRL_B.brd
      new_version: CTRL_B/new_version/CTRL_B.brd
      status: eligible_for_execution
    - entry_id: F003
      stem: BROKEN_C
      old_version: BROKEN_C/old_version/BROKEN_C.brd
      new_version: BROKEN_C/new_version/BROKEN_C.brd
      status: eligible_for_execution
    - entry_id: F004
      stem: RF_COLLIDE
      status: blocked_before_materialization

dbdoctor_execution_logs:
  evidence_kind: synthetic_fixture_observation
  entries:
    - entry_id: F001
      process_code: 0
      output_exists: true
      completion_text_present: true
      saved_to_disk_text_present: true
      warning_count: 0
      detected_error_count: 0
      temp_files_remaining: []
    - entry_id: F002
      process_code: 3
      output_exists: true
      completion_text_present: true
      saved_to_disk_text_present: true
      warning_count: 2
      detected_error_count: 0
      stderr_markers:
        - Warnings emitted
      temp_files_remaining:
        - CTRL_B.tmp
    - entry_id: F003
      process_code: 2
      output_exists: false
      completion_text_present: false
      saved_to_disk_text_present: false
      warning_count: 1
      detected_error_count: 1
      stderr_markers:
        - Detected error: missing padstack library reference
      temp_files_remaining:
        - BROKEN_C.jrl

conversion_receipt:
  evidence_kind: synthetic_fixture_observation
  results:
    - entry_id: F001
      relative_name: PWR_A.brd
      classification: converted_success
      basis:
        - output_exists
        - completion_text_present
        - saved_to_disk_text_present
        - detected_error_count_zero
      cleanup_status: clear
    - entry_id: F002
      relative_name: CTRL_B.brd
      classification: converted_with_warnings
      basis:
        - output_exists
        - completion_text_present
        - saved_to_disk_text_present
        - detected_error_count_zero
        - warning_bearing_nonzero_exit_allowed
      cleanup_status: blocked_temp_file
      blocker: CTRL_B.tmp
      next_gate: cleanup_review
    - entry_id: F003
      relative_name: BROKEN_C.brd
      classification: conversion_failed
      basis:
        - output_missing
        - completion_text_absent
        - saved_to_disk_text_absent
        - detected_error_count_nonzero
      cleanup_status: blocked_temp_file
      blocker: BROKEN_C.jrl
      next_gate: owner_decision_or_approved_retry_policy
    - entry_id: F004
      relative_name: RF_COLLIDE.brd
      classification: blocked_before_conversion
      basis:
        - existing_packet_folder
        - existing_packet_policy_stop

boundary_review_note: |
  This public-safe candidate is derived solely from synthetic fixture evidence.
  Runtime absolute paths remain represented only by opaque runtime references.
  No PCB payload or project-private material is included.

  The candidate covers top-level .brd inventory, packet planning, collision
  blocking, DB Doctor result classification, temporary-file blockers, and
  owner/retry escalation.

  Conversion classifications do not establish electrical correctness,
  manufacturing readiness, symbol or padstack library validity, license or
  installation status, or unattended full-archive conversion readiness.

  Required follow-up:
  - Review and resolve CTRL_B.tmp before clean closeout.
  - Route BROKEN_C to an owner decision or an explicitly approved retry policy.
  - Preserve runtime evidence and project payloads outside the public archive.
  - Route changed-state or changed-claim completion through the required
    post-development review gate.
```
