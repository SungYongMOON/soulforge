You are running a public-safe CLI-only calibration candidate for Soulforge workflow configuration_baseline_and_change_control_v0.
Profile metadata:
- candidate_id: qe_dwarf_auditor_gpt-5.5_medium
- model: gpt-5.5
- reasoning_effort: medium
- species: dwarf
- class: auditor

Use only the workflow contract summary and synthetic fixture below. Do not read repository files, do not run commands, do not use private/raw/secret material, and do not claim execution, approval, source truth, or pass/fail results beyond this packet.

Workflow contract summary:
- Own only the outputs listed in fixture.required_outputs.
- Preserve read-only upstream boundaries.
- Make blockers, missing inputs, review-required states, provenance summaries, owner actions, downstream handoffs, and boundary notes explicit.
- Machine-readable JSON only. No markdown fence. No prose outside JSON.
- Top-level JSON keys required: candidate_id, workflow_id, profile, fixture_id, public_safe, packets, downstream_handoff, boundary_review_note, completion_state.
- packets must contain one property for each required output name. Use arrays of objects where rows are natural.
- Include stable ids, statuses, provenance or basis, owner action/next action, downstream impact, and not_claimed notes.
- completion_state must distinguish quality-ready packet completion from execution/approval/source-truth claims.

Synthetic public fixture JSON:
{
    "fixture_id":  "configuration_baseline_and_change_control_v0_public_synthetic_baseline_delta",
    "project_scope_key":  "public_baseline_fixture",
    "change_requests":  [
                            {
                                "affected_refs":  [
                                                      "BL-REQ-001"
                                                  ],
                                "change_id":  "CR-001",
                                "source":  "review_action_item_closure_loop_v0",
                                "evidence_ref":  "owner_decision_ref:OD-17-summary",
                                "change_type":  "measurement_tolerance_update",
                                "approval_state":  "not_approved_here"
                            },
                            {
                                "affected_refs":  [
                                                      "BL-PAGE-007"
                                                  ],
                                "change_id":  "CR-002",
                                "source":  "page_module_trace_matrix_v0",
                                "evidence_ref":  "trace_delta_ref:TD-04-summary",
                                "change_type":  "page_identity_refresh",
                                "approval_state":  "not_approved_here"
                            },
                            {
                                "affected_refs":  [
                                                      "BL-HARNESS-002"
                                                  ],
                                "change_id":  "CR-003",
                                "source":  "interface_control_and_harness_readiness_v0",
                                "evidence_ref":  null,
                                "change_type":  "interface_direction_pending",
                                "approval_state":  "owner_waiting"
                            }
                        ],
    "public_safe":  true,
    "required_outputs":  [
                             "configuration_baseline_packet",
                             "baseline_inventory",
                             "change_request_register",
                             "impact_matrix",
                             "baseline_gap_register",
                             "rerun_routing",
                             "owner_followup_needed",
                             "closure_handoff",
                             "boundary_review_note"
                         ],
    "baseline_refs":  [
                          {
                              "checksum_state":  "present_public_prefix_only",
                              "approval_state":  "reference_only",
                              "baseline_id":  "BL-REQ-001",
                              "artifact_ref":  "requirements_packet_summary",
                              "version":  "v0.3"
                          },
                          {
                              "checksum_state":  "missing",
                              "approval_state":  "draft",
                              "baseline_id":  "BL-PAGE-007",
                              "artifact_ref":  "page_module_spec_summary",
                              "version":  "v0.2"
                          },
                          {
                              "checksum_state":  "present_public_prefix_only",
                              "approval_state":  "review_required",
                              "baseline_id":  "BL-HARNESS-002",
                              "artifact_ref":  "harness_trace_delta_summary",
                              "version":  "v0.1"
                          }
                      ],
    "source_mode":  "contract_only_synthetic"
}
