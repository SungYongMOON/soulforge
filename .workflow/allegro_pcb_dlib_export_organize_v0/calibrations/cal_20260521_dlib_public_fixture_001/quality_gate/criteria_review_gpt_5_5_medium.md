You are an evaluator-only reviewer for Soulforge workflow profile calibration.
Review whether the draft criteria are sufficient and not overfit to wording. Return one valid JSON object with keys: sufficient, missing_critical_conditions, overfit_risks, suspicious_assumptions, revised_notes.

Workflow id: allegro_pcb_dlib_export_organize_v0
Public-safe fixture:
{
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

Draft criteria:
{
    "workflow_id":  "allegro_pcb_dlib_export_organize_v0",
    "calibration_id":  "cal_20260521_dlib_public_fixture_001",
    "policy":  "public_safe_dlib_export_organize_quality_gate_v0",
    "hard_gates":  [
                       "public/private/secret boundary pass",
                       "valid JSON object with required top-level output shape",
                       "no command/file/network claims beyond synthetic fixture interpretation",
                       "no golden output or golden-derived criteria in candidate prompt",
                       "no raw PCB payload, generated runtime script, runtime absolute path, credential, cookie, private-state, or _workspaces material in output"
                   ],
    "required_top_level_keys":  [
                                    "target_board_inventory",
                                    "dlib_execution_plan",
                                    "library_organization_manifest",
                                    "export_receipt",
                                    "boundary_review_note",
                                    "quality_self_check"
                                ],
    "must_cover":  [
                       "board_demo_A is planned, exported, organized, verified, and marked review_required because unexpected_notes.tmp is classified into other",
                       "board_demo_B is blocked before mutation because multiple .brd files require owner selection",
                       "board_demo_A counts are padpath=2, psmpath=4, devpath=2, logs=2, other=1",
                       "dump_libraries.log is present and dlib_errors_reported is zero for board_demo_A",
                       "root_files_left_after_organization is zero and transient_export_folder_left is false for board_demo_A",
                       "runtime paths remain private/redacted; raw PCB payload and secrets are not inspected",
                       "non-claims are explicit for electrical correctness, symbol geometry, padstack approval, manufacturing readiness, and unattended full-archive readiness",
                       "next action routes owner selection for board_demo_B and review of unknown file type for board_demo_A"
                   ],
    "scoring":  {
                    "pass_threshold":  90,
                    "quality_equivalent_threshold":  95,
                    "dimensions":  {
                                       "quality_and_usability":  40,
                                       "model_task_fit":  20,
                                       "token_cost_efficiency":  20,
                                       "wall_clock_time":  15,
                                       "stability":  5
                                   }
                }
}

Golden baseline output:
{"target_board_inventory":{"workflow_id":"allegro_pcb_dlib_export_organize_v0","runtime_scope_binding":{"input_root":"private_absolute_runtime_path_redacted","allegro_executable":"private_absolute_runtime_path_redacted","private_run_root":"private_absolute_runtime_path_redacted","recursive_search_enabled":false,"board_extension_allowlist":[".brd"],"existing_lib_policy":"stop_if_populated","overwrite_existing_files":false,"library_root_name":"lib","public_path_policy":"no runtime absolute paths or relative runtime paths emitted"},"targets":[{"target_id":"board_demo_A","folder_label":"DEMO_A_revA","board_files":["DEMO_A_revA.brd"],"preexisting_lib_state":"absent","inventory_status":"eligible_single_board"},{"target_id":"board_demo_B","folder_label":"DEMO_B_revA","board_files":["DEMO_B_main.brd","DEMO_B_backup.brd"],"preexisting_lib_state":"absent","inventory_status":"blocked_multiple_board_files"}]},"dlib_execution_plan":{"targets":[{"target_id":"board_demo_A","dlib_should_run":true,"allowed_mutation":"create_board_local_lib_and_organize_exports","preconditions":["exactly_one_brd_file","lib_absent_or_empty","overwrite_disabled","no_recursive_search"],"synthetic_result":{"process_code":0,"dump_libraries_log_present":true,"dlib_errors_reported":0,"post_organization_status":"review_required","review_reason":"unknown_export_file_type moved to other"}},{"target_id":"board_demo_B","dlib_should_run":false,"allowed_mutation":"none","blocker":"multiple_brd_files_in_one_target_folder","required_resolution":"owner_selection_required_before_any_mutation"}]},"library_organization_manifest":{"board_demo_A":{"board_local_lib":"lib","folders":{"padpath":["PAD_A.pad","PAD_B.pad"],"psmpath":["MCU.psm","MCU.dra","CONNECTOR.bsm","FIDUCIAL.fsm"],"devpath":["devices.txt","pinmap.map"],"logs":["dump_libraries.log","allegro_journal.log"],"other":["unexpected_notes.tmp"]},"counts":{"padpath":2,"psmpath":4,"devpath":2,"logs":2,"other":1},"root_files_left_after_organization":0,"transient_export_folder_left":false,"manifest_status":"review_required"},"board_demo_B":{"manifest_status":"blocked_not_created","reason":"multiple_brd_files_in_one_target_folder"}},"export_receipt":{"workflow_id":"allegro_pcb_dlib_export_organize_v0","candidate_id":"golden_gpt_5_5_xhigh_dwarf_auditor","overall_status":"review_required_with_blocker","successful_export_targets":[],"review_required_targets":["board_demo_A"],"blocked_targets":["board_demo_B"],"success_checks":{"board_demo_A":{"dump_libraries_log_present":true,"zero_dlib_errors":true,"classified_folder_counts_match_expected":true,"no_lib_root_files_left":true,"no_transient_export_folder_left":true,"receipt_state":"review_required_due_unknown_file_type"},"board_demo_B":{"mutation_prevented":true,"receipt_state":"blocked_owner_selection_required"}}},"boundary_review_note":{"public_safe":true,"external_validation_claimed":false,"actual_allegro_run_claimed":false,"runtime_paths_emitted":false,"raw_payloads_emitted":false,"non_claims":["no_electrical_correctness","no_symbol_geometry_correctness","no_padstack_engineering_approval","no_manufacturing_readiness","no_unattended_full_archive_readiness"]},"quality_self_check":{"top_level_shape_matches_required":true,"path_leak_check":"passed_redacted_only","mutation_gate_check":"passed_board_demo_B_blocked_before_mutation","unknown_file_policy_check":"passed_other_folder_review_required","success_rule_check":"board_demo_A meets mechanical export conditions but remains review_required; board_demo_B blocked","public_safe_synthetic_only":true}}
