You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-luna; reasoning_effort=medium; species=dwarf; class=auditor.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: source_packet_sufficiency_review_v0
kind: workflow
status: active
title: Source Packet Sufficiency Review v0
summary: Decide whether collected datasheets, EVAL docs, layout guidance, simulation sources, and owner-approved local packets are sufficient for the intended claim strength without inventing missing evidence or mutating upstream artifacts.
entrypoint: run
execution_mode: local_tool_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
inputs:
  - sufficiency_scope_refs
  - source_packet_refs
  - approved_sufficiency_policy
optional_inputs:
  - component_materials_packet_refs
  - layout_guide_packet_refs
  - simulation_source_packet_refs
  - page_module_spec_refs
  - quantitative_enrichment_packet_refs
  - harness_packet_refs
  - owner_decision_refs
outputs:
  - source_sufficiency_packet
  - evidence_coverage_table
  - blocked_fields_register
  - owner_followup_needed
  - allowed_claim_ceiling
  - rerun_routes
  - boundary_review_note
validation_level: pilot_executed_private_fixture
registration_policy: owner_requested_registration
upstream_workflows:
  - workflow_id: official_source_packet_collect_v0
    expected_outputs:
      - source_packet_manifest
      - source_inventory
      - source_gap_report
      - owner_followup_needed
  - workflow_id: exp_xml_component_materials
    expected_outputs:
      - source_discovery_packet
      - download_manifest
      - circuit_design_review_queue
    status: optional_materials_context
  - workflow_id: component_pcb_layout_guide_extraction
    expected_outputs:
      - extraction_manifest
      - layout_guide_source_gap_packet
    status: optional_layout_context
  - workflow_id: simulation_source_collect_v0
    expected_outputs:
      - simulation_source_packet
      - model_inventory
      - missing_models
    status: optional_simulation_context
downstream_workflows:
  - workflow_id: page_quantitative_enrichment_v0
    expected_input: allowed_claim_ceiling_and_blocked_fields
    status: rerun_trigger_only
  - workflow_id: xml_harness_composition_v0
    expected_input: source_sufficiency_claim_ceiling_and_blockers
    status: rerun_trigger_only
  - workflow_id: verification_plan_from_page_contracts_v0
    expected_input: source_sufficiency_blockers_and_owner_followup
    status: rerun_trigger_only
sufficiency_contract:
  owns:
    - claim_strength_scope
    - evidence_coverage_rows
    - blocked_field_register
    - allowed_claim_ceiling
    - owner_followup_for_missing_evidence
  does_not_own:
    - source_acquisition
    - component_material_truth
    - layout_extraction
    - simulation_model_collection
    - quantitative_value_truth
    - harness_promotion
  authority_boundary:
    sufficiency_packet_is_not_source_authority: true
    blocked_field_is_not_failed_design: true
    upstream_artifacts_are_read_only: true
  required_output_shapes:
    project_binding: templates/project_binding.template.yaml
notes:
  - This workflow is a sufficiency-review lane. It judges whether evidence is enough for a bounded claim family and leaves missing evidence visible.
  - Public workflow canon stores only portable orchestration rules, state semantics, and sanitized templates.


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: source_packet_sufficiency_review_v0
kind: step_graph
status: active
steps:
  - step_id: prepare_scope_binding
    title: Prepare Scope Binding
    actor_slot: workflow_runner
    action:
      kind: project_local_sufficiency_binding_setup
    summary: Resolve the bounded scope and output root.
  - step_id: inventory_evidence_rows
    title: Inventory Evidence Rows
    actor_slot: coverage_curator
    action:
      kind: source_material_layout_simulation_inventory
    summary: Inventory available and missing evidence without mutating upstream packets.
  - step_id: map_blocked_fields_and_ceiling
    title: Map Blocked Fields And Ceiling
    actor_slot: ceiling_mapper
    action:
      kind: sufficiency_ceiling_and_gap_mapping
    summary: Classify blocked fields and allowed claim ceilings for later consumers.
  - step_id: write_bundle_and_boundary_review
    title: Write Bundle And Boundary Review
    actor_slot: boundary_reviewer
    action:
      kind: sufficiency_bundle_write_and_boundary_review
    summary: Confirm no overclaim of source authority before publication.


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "workflow_id": "source_packet_sufficiency_review_v0",
  "fixture_id": "PUBLIC_SYNTH_SOURCE_PACKET_SUFFICIENCY_REVIEW_V0",
  "source_kind": "synthetic_from_workflow_contract",
  "public_safe": true,
  "workflow_title": "Source Packet Sufficiency Review v0",
  "workflow_summary": "Decide whether collected datasheets, EVAL docs, layout guidance, simulation sources, and owner-approved local packets are sufficient for the intended claim strength without inventing missing evidence or mutating upstream artifacts.",
  "workflow_readiness_label": "pilot-executed",
  "input_refs": [
    "sufficiency_scope_refs",
    "source_packet_refs",
    "approved_sufficiency_policy"
  ],
  "expected_output_groups": [
    "source_sufficiency_packet",
    "evidence_coverage_table",
    "blocked_fields_register",
    "owner_followup_needed",
    "allowed_claim_ceiling",
    "rerun_routes",
    "boundary_review_note"
  ],
  "must_preserve": [
    "sufficient",
    "blocked",
    "claim ceiling",
    "boundary",
    "no mutation"
  ],
  "scenario_facts": [
    "one claim family has enough evidence",
    "one claim family is blocked by missing layout guidance",
    "one owner follow-up remains open"
  ],
  "boundary_policy": [
    "Do not claim tool use, file edits, runtime paths, or hidden private evidence.",
    "Do not mutate upstream artifacts or promote stronger source/canon authority than the contract supports.",
    "Keep public-safe synthetic boundaries explicit."
  ]
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
