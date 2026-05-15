You are running a public-safe CLI-only calibration candidate for Soulforge workflow simulator_policy_packet_v0.
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
    "simulator_policy_scope":  {
                                   "target_simulators":  [
                                                             "ngspice",
                                                             "ltspice",
                                                             "xyce"
                                                         ],
                                   "allowed_use":  "pre-run policy and readiness gating only",
                                   "owner_authorization":  "ngspice syntax smoke allowed after trusted local probe; ltspice and xyce not authorized until probe evidence exists",
                                   "no_execution_claims":  true
                               },
    "public_safe":  true,
    "runtime_probe_refs":  [
                               {
                                   "version":  "42.x synthetic summary",
                                   "path_included":  false,
                                   "simulator":  "ngspice",
                                   "trusted":  true,
                                   "probe_ref":  "public_fixture_probe_ngspice_version_summary",
                                   "result":  "probe_evidence_available"
                               },
                               {
                                   "trusted":  false,
                                   "simulator":  "ltspice",
                                   "result":  "no_trusted_runtime_evidence",
                                   "probe_ref":  "public_fixture_probe_ltspice_missing",
                                   "path_included":  false
                               },
                               {
                                   "trusted":  false,
                                   "simulator":  "xyce",
                                   "result":  "not_probed",
                                   "probe_ref":  "public_fixture_probe_xyce_not_checked",
                                   "path_included":  false
                               }
                           ],
    "fixture_id":  "simulator_policy_packet_v0_public_synthetic_blocked_and_authorized_runtime_mix",
    "project_scope_key":  "public_sim_policy_fixture",
    "source_mode":  "contract_only_synthetic",
    "required_outputs":  [
                             "simulator_policy_packet",
                             "runtime_probe_summary",
                             "execution_authorization_state",
                             "runtime_blockers",
                             "boundary_review_note"
                         ],
    "source_packet_summaries":  [
                                    {
                                        "model_family":  "ltspice",
                                        "component":  "U1",
                                        "state":  "candidate_official_source_identified_not_locally_acquired"
                                    },
                                    {
                                        "model_family":  "s_parameter",
                                        "component":  "J1",
                                        "state":  "owner_file_needed"
                                    }
                                ]
}

