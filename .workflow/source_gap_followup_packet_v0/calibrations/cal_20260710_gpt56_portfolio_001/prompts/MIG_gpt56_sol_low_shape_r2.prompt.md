Calibration replay metadata: candidate_id=MIG_gpt56_sol_low_shape_r2; model=gpt-5.6-sol; reasoning_effort=low.
Only candidate/profile metadata was transformed in the frozen public-safe candidate prompt below; task content and fixture remain unchanged.
--- TRANSFORMED FROZEN PUBLIC-SAFE CANDIDATE PROMPT ---
You are running a public-safe CLI-only calibration candidate for Soulforge workflow source_gap_followup_packet_v0.
Profile metadata:
- candidate_id: MIG_gpt56_sol_low_shape_r2
- model: gpt-5.6-sol
- reasoning_effort: low
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
    "fixture_id":  "source_gap_followup_packet_v0_public_synthetic_mixed_gap_dedup",
    "upstream_gap_records":  [
                                 {
                                     "source_kind":  "datasheet",
                                     "upstream_gap_ref":  "official:G001",
                                     "downstream_impact":  [
                                                               "materials",
                                                               "quantitative"
                                                           ],
                                     "owning_workflow_id":  "official_source_packet_collect_v0",
                                     "component_refdes":  "U1",
                                     "owner_action_hint":  "manual_download",
                                     "component_identity":  "FIXTURE-OPAMP-01",
                                     "gap_family":  "blocked_access"
                                 },
                                 {
                                     "source_kind":  "datasheet",
                                     "upstream_gap_ref":  "quant:G009",
                                     "downstream_impact":  [
                                                               "quantitative"
                                                           ],
                                     "owning_workflow_id":  "page_quantitative_enrichment_v0",
                                     "component_refdes":  "U1",
                                     "owner_action_hint":  "manual_download",
                                     "component_identity":  "FIXTURE-OPAMP-01",
                                     "gap_family":  "blocked_access"
                                 },
                                 {
                                     "source_kind":  "layout_guide",
                                     "upstream_gap_ref":  "layout:L014",
                                     "downstream_impact":  [
                                                               "layout"
                                                           ],
                                     "owning_workflow_id":  "component_pcb_layout_guide_extraction",
                                     "component_refdes":  "U1",
                                     "owner_action_hint":  "provide_file",
                                     "component_identity":  "FIXTURE-OPAMP-01",
                                     "gap_family":  "missing_layout_guidance"
                                 },
                                 {
                                     "upstream_gap_ref":  "harness:H002",
                                     "source_kind":  "interface_context",
                                     "owner_action_hint":  "confirm_connection_role",
                                     "downstream_impact":  [
                                                               "harness"
                                                           ],
                                     "owning_workflow_id":  "xml_harness_composition_v0",
                                     "gap_family":  "missing_harness_context",
                                     "interface_id":  "IF_PWR"
                                 },
                                 {
                                     "source_kind":  "material_source",
                                     "upstream_gap_ref":  "materials:M006",
                                     "downstream_impact":  [
                                                               "materials",
                                                               "harness"
                                                           ],
                                     "owning_workflow_id":  "exp_xml_component_materials",
                                     "component_refdes":  "J1",
                                     "owner_action_hint":  "confirm_identity",
                                     "component_identity":  "FIXTURE-CONN-02",
                                     "gap_family":  "identity_ambiguity"
                                 }
                             ],
    "project_scope_key":  "public_source_gap_fixture",
    "public_safe":  true,
    "required_outputs":  [
                             "source_gap_followup_packet",
                             "gap_dedup_index",
                             "owner_action_queue",
                             "owner_source_batch_manifest_template",
                             "download_or_reuse_batch_manifest",
                             "retry_trigger_register",
                             "downstream_unblock_map",
                             "boundary_review_note"
                         ],
    "source_mode":  "contract_only_synthetic"
}
