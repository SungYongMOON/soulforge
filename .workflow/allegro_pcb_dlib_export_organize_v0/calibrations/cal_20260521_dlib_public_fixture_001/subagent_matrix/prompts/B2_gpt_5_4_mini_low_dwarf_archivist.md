You are running a public-safe isolated calibration candidate for Soulforge workflow $workflowId.
Candidate id: B2_gpt_5_4_mini_low_dwarf_archivist
Profile: model=gpt-5.4-mini reasoning_effort=low species=dwarf class=archivist.
Profile posture: species $Species means steady structural judgment, durable execution, and tool-centered craft; class $Class means evidence-first source inspection, relation stitching, and careful drafting.

Rules:
- Do not run commands, browse, inspect local files, create files, mutate files, or claim external validation.
- Use only the public-safe synthetic fixture below and the workflow task.
- Do not include raw project payloads, runtime absolute paths, generated script bodies, credentials, cookies, private-state data, or _workspaces material.
- Treat this as synthetic calibration output, not as an actual Allegro run.
- Output only one valid compact JSON object. No markdown fences, no prose outside JSON.
- Include these top-level keys exactly: target_board_inventory, dlib_execution_plan, library_organization_manifest, export_receipt, boundary_review_note, quality_self_check.

Task:
Produce a compact workflow output packet for $workflowId. It must bind the runtime scope without leaking paths, inventory target boards, plan dlib export only where allowed, represent the synthetic dlib result, classify exported files into board-local lib folders, verify success/blocker conditions, create an export receipt, and close with boundary/non-claim notes.

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
