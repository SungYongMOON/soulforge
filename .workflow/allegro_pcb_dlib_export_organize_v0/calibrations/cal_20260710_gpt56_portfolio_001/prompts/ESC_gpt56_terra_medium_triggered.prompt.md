You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-terra; reasoning_effort=medium; species=dwarf; class=archivist.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.
Emit the exact public workflow output groups as top-level fields: target_board_inventory, dlib_execution_plan, dlib_execution_logs, library_organization_manifest, export_receipt, boundary_review_note.
Serialization requirement for this corrected harness run: return exactly one valid JSON object and no Markdown fence or surrounding prose.
This shape correction comes from the public workflow output contract and fixture handoff; it is not evaluator or golden material.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: allegro_pcb_dlib_export_organize_v0
kind: workflow
status: active
title: Allegro PCB Dlib Export Organize v0
summary: Parameterized workflow for exporting Cadence Allegro board libraries with the dlib Export Libraries command and organizing the output into board-local Allegro reference folders.
entrypoint: run
execution_mode: local_tool_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
inputs:
  - library_export_scope_packet
  - allegro_runtime_binding
  - owner_mutation_policy
optional_inputs:
  - board_selection_policy
  - existing_lib_policy
  - organization_policy
  - retry_policy
  - owner_approval_ref
outputs:
  - target_board_inventory
  - dlib_execution_plan
  - dlib_execution_logs
  - library_organization_manifest
  - export_receipt
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
  generated_script_path_is_runtime_only: true
default_board_policy:
  top_level_or_declared_version_folders_only_by_default: true
  default_extension_allowlist:
    - .brd
  target_folder_label_is_runtime_supplied: true
  recursive_search_requires_owner_policy: true
  multiple_brd_files_per_target_folder_policy: stop_unless_owner_selects_one
default_library_layout:
  library_root_name: lib
  padstack_folder: padpath
  symbol_folder: psmpath
  device_folder: devpath
  log_folder: logs
  unknown_folder: other
  transient_export_folder_candidates:
    - export_libraries
dlib_command_contract:
  allegro_invocation_mode:
    - readonly
    - nograph_when_available
    - script_replay
  dlib_elements_enabled_by_default:
    mechanical_symbols: true
    package_symbols: true
    format_symbols: true
    shape_and_flash_symbols: true
    device_files: true
    padstacks: true
  dependency_policy:
    no_library_dependencies: false
    purge_unused_cross_section_layers: false
organization_contract:
  padpath_extensions:
    - .pad
  psmpath_extensions:
    - .psm
    - .dra
    - .bsm
    - .fsm
    - .ssm
    - .osm
    - .mdd
  devpath_name_patterns:
    - "*.txt"
    - "*.txt,*"
    - "*.map"
    - "*.map,*"
  logs_name_patterns:
    - "*.log"
    - "*.log,*"
  unknown_file_policy: move_to_other_and_require_review
operating_contract:
  owns:
    - runtime_scope_intake_shape
    - Allegro_dlib_tool_readiness_check
    - target_board_inventory
    - board_local_lib_folder_creation
    - runtime_generated_dlib_script_shape
    - dlib_execution_log_capture
    - dlib_output_collection
    - library_file_classification
    - export_success_classification
    - transient_export_folder_cleanup_check
    - export_receipt_shape
    - boundary_review_note_shape
  does_not_own:
    - electrical_correctness
    - manufacturing_readiness
    - symbol_geometry_correctness
    - padstack_engineering_approval
    - owner_approval_for_overwrite_or_delete_policy
    - Cadence_license_or_install_management
    - secret_material_inspection
    - public_storage_of_project_payloads
    - unattended_archive_wide_mutation_by_default
  boundaries:
    no_fixed_sample_folder_in_workflow_package: true
    no_installed_Cadence_path_in_public_package: true
    no_runtime_absolute_paths_in_public_package: true
    no_raw_pcb_payload_copy_into_public_repo: true
    board_files_opened_readonly_by_default: true
    output_mutation_limited_to_declared_library_roots: true
    output_success_requires_file_and_log_evidence: true
  required_output_shapes:
    library_export_scope_packet: templates/library_export_scope_packet.template.yaml
    dlib_execution_plan: templates/dlib_execution_plan.template.yaml
    library_organization_manifest: templates/library_organization_manifest.template.yaml
    export_receipt: templates/export_receipt.template.yaml
    boundary_review_note: templates/boundary_review_note.template.md
upstream_workflows:
  - workflow_id: allegro_pcb_dbdoctor_uprev_batch_v0
    expected_output: optional_new_version_board_folders
    status: optional_predecessor
downstream_workflows:
  - workflow_id: owner_decision_packet_v0
    expected_input: overwrite_rerun_unknown_file_or_full_archive_policy_needed
    status: optional_owner_gate
  - workflow_id: post_development_review_gate_v0
    expected_input: dlib_export_workflow_changed_state_or_claim_posture
    status: required_before_completion_claim
notes:
  - "The workflow package intentionally contains no sample input folder, board path, installed Cadence path, or generated script path. Those values are runtime-only inputs and belong in private run evidence."
  - "The observed pilot showed Allegro may write to a default export folder before collection. The workflow accepts direct-to-lib output or a transient export folder, then normalizes into the board-local lib layout."
  - "Registered status means the reusable public-safe workflow package is stored in `.workflow`; it is not a production-ready unattended archive library export claim."


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: allegro_pcb_dlib_export_organize_v0
kind: step_graph
status: active
steps:
  - step_id: bind_runtime_scope
    title: Bind Runtime Scope
    actor_slot: runtime_scope_binder
    action: Collect input root, Allegro executable or locator, board selection policy, version-folder selector, library root name, mutation mode, and owner approval reference without writing runtime paths into workflow canon.
    inputs:
      - library_export_scope_packet
      - allegro_runtime_binding
      - owner_mutation_policy
    outputs:
      - bound_runtime_scope
    next:
      - validate_tool_and_paths
  - step_id: validate_tool_and_paths
    title: Validate Tool And Paths
    actor_slot: tool_readiness_checker
    action: Reject relative input roots, relative tool paths, path traversal, missing roots, missing Allegro executable or unresolved locator, and computed output paths that escape the owner-approved input root.
    inputs:
      - bound_runtime_scope
    outputs:
      - path_and_tool_report
    next:
      - inventory_target_boards
  - step_id: inventory_target_boards
    title: Inventory Target Boards
    actor_slot: board_inventory_runner
    action: Enumerate target board files using the declared version-folder selector and extension allowlist; detect empty matches, duplicates, multiple boards per target folder, and pre-existing library roots.
    inputs:
      - path_and_tool_report
    outputs:
      - target_board_inventory
    next:
      - plan_library_export
  - step_id: plan_library_export
    title: Plan Library Export
    actor_slot: library_export_planner
    action: Build one export plan per board folder, including board file identity, board-local library root, transient export folder candidates, generated script path, log targets, overwrite policy, and expected organization folders.
    inputs:
      - target_board_inventory
    outputs:
      - dlib_execution_plan
    next:
      - prepare_library_roots
  - step_id: prepare_library_roots
    title: Prepare Library Roots
    actor_slot: library_root_preparer
    action: Create the board-local library root and organization folders only inside the declared board folder; apply owner policy for existing lib roots, stale files, and rerun cleanup.
    inputs:
      - dlib_execution_plan
    outputs:
      - prepared_library_roots
    next:
      - run_allegro_dlib_export
  - step_id: run_allegro_dlib_export
    title: Run Allegro Dlib Export
    actor_slot: dlib_export_runner
    action: Generate a runtime-only Allegro script that opens dlib, enables the selected export elements, executes export, and exits; run Allegro read-only with script replay per board and capture journal, stdout, stderr, process code, and dlib logs.
    inputs:
      - prepared_library_roots
    outputs:
      - dlib_execution_logs
    next:
      - collect_export_payload
  - step_id: collect_export_payload
    title: Collect Export Payload
    actor_slot: export_payload_collector
    action: Move or accept dlib output from the declared transient export folder or direct output location into the board-local library root, preserving Cadence logs and rejecting any source path outside the board folder.
    inputs:
      - dlib_execution_logs
    outputs:
      - collected_export_payload
    next:
      - classify_library_files
  - step_id: classify_library_files
    title: Classify Library Files
    actor_slot: library_file_classifier
    action: Move padstack files to padpath, symbol and drawing files to psmpath, device and map files to devpath, logs to logs, and unknown files to other with an explicit review flag.
    inputs:
      - collected_export_payload
    outputs:
      - library_organization_manifest
    next:
      - verify_export_results
  - step_id: verify_export_results
    title: Verify Export Results
    actor_slot: verification_runner
    action: Verify dump_libraries.log exists, detected dlib errors are zero, organization folder counts are recorded, no files remain directly under lib root, board files were not saved by the workflow, and unexpected unknown files are handled.
    inputs:
      - library_organization_manifest
    outputs:
      - export_result_matrix
    next:
      - cleanup_transient_artifacts
  - step_id: cleanup_transient_artifacts
    title: Cleanup Transient Artifacts
    actor_slot: cleanup_runner
    action: Remove only workflow-created transient export folders and runtime scripts when they are inside approved temp/run roots or board-local transient folders; preserve dlib logs in logs and private execution evidence in the run root.
    inputs:
      - export_result_matrix
    outputs:
      - export_receipt
    next:
      - review_boundary_and_close
  - step_id: review_boundary_and_close
    title: Review Boundary And Close
    actor_slot: boundary_closeout_reviewer
    action: Confirm output state, public/private boundary posture, path policy, non-claims, owner-decision follow-ups, and post-development review requirements.
    inputs:
      - export_receipt
    outputs:
      - boundary_review_note
    next: []


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
﻿{
    "workflow_id":  "allegro_pcb_dlib_export_organize_v0",
    "fixture_type":  "public_safe_synthetic_from_contract",
    "purpose":  "Calibrate workflow output quality for dlib export planning, organization manifest, receipt, and boundary closeout without real PCB payloads or runtime paths.",
    "runtime_scope":  {
                          "input_root_runtime_path":  "\u003cprivate_absolute_runtime_path_redacted\u003e",
                          "allegro_executable_runtime_path":  "\u003cprivate_absolute_runtime_path_redacted\u003e",
                          "private_run_root_runtime_path":  "\u003cprivate_absolute_runtime_path_redacted\u003e",
                          "recursive_search_enabled":  false,
                          "board_extension_allowlist":  [
                                                            ".brd"
                                                        ],
                          "existing_lib_policy":  "stop_if_populated",
                          "overwrite_existing_files":  false,
                          "library_root_name":  "lib"
                      },
    "synthetic_inventory":  [
                                {
                                    "target_id":  "board_demo_A",
                                    "folder_label":  "DEMO_A_revA",
                                    "board_files":  [
                                                        "DEMO_A_revA.brd"
                                                    ],
                                    "preexisting_lib_state":  "absent",
                                    "expected_action":  "plan_export_run_organize_verify"
                                },
                                {
                                    "target_id":  "board_demo_B",
                                    "folder_label":  "DEMO_B_revA",
                                    "board_files":  [
                                                        "DEMO_B_main.brd",
                                                        "DEMO_B_backup.brd"
                                                    ],
                                    "preexisting_lib_state":  "absent",
                                    "expected_action":  "block_before_mutation_owner_selection_required"
                                }
                            ],
    "synthetic_dlib_result":  {
                                  "board_demo_A":  {
                                                       "process_code":  0,
                                                       "dump_libraries_log_present":  true,
                                                       "dlib_errors_reported":  0,
                                                       "exported_files":  [
                                                                              "PAD_A.pad",
                                                                              "PAD_B.pad",
                                                                              "MCU.psm",
                                                                              "MCU.dra",
                                                                              "CONNECTOR.bsm",
                                                                              "FIDUCIAL.fsm",
                                                                              "devices.txt",
                                                                              "pinmap.map",
                                                                              "dump_libraries.log",
                                                                              "allegro_journal.log",
                                                                              "unexpected_notes.tmp"
                                                                          ],
                                                       "expected_counts":  {
                                                                               "padpath":  2,
                                                                               "psmpath":  4,
                                                                               "devpath":  2,
                                                                               "logs":  2,
                                                                               "other":  1
                                                                           },
                                                       "root_files_left_after_organization":  0,
                                                       "transient_export_folder_left":  false,
                                                       "expected_status":  "review_required",
                                                       "review_reason":  "unknown_export_file_type moved to other"
                                                   },
                                  "board_demo_B":  {
                                                       "expected_status":  "blocked",
                                                       "blocker":  "multiple_brd_files_in_one_target_folder",
                                                       "dlib_should_run":  false,
                                                       "mutation_should_happen":  false
                                                   }
                              },
    "required_output_shape":  [
                                  "target_board_inventory",
                                  "dlib_execution_plan",
                                  "library_organization_manifest",
                                  "export_receipt",
                                  "boundary_review_note",
                                  "quality_self_check"
                              ],
    "hard_rules":  [
                       "Reject relative runtime paths and never emit actual runtime absolute paths in public output.",
                       "Do not copy raw PCB payloads, generated scripts, tool journals, credentials, cookies, or private-state data into public canon.",
                       "Multiple .brd files in one target folder require owner selection before mutation.",
                       "Unknown exported file types are moved to other and keep receipt in review_required state.",
                       "Success requires dump_libraries.log present, zero dlib errors, classified folder counts, no files left directly under lib root, and no transient export folder left.",
                       "Non-claims must include no electrical correctness, no symbol geometry correctness, no padstack engineering approval, no manufacturing readiness, and no unattended full-archive readiness."
                   ]
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
