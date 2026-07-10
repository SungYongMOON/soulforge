You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-sol; reasoning_effort=low; species=dwarf; class=auditor.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: technical_risk_open_question_burndown_v0
kind: workflow
status: active
title: Technical Risk Open Question Burndown v0
summary: Convert source gaps, ambiguous interfaces, unresolved quantitative fields, blocked simulation needs, and review action items into a bounded technical-risk and open-question register with closure criteria and burndown status.
entrypoint: run
execution_mode: local_tool_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
inputs:
  - risk_scope_refs
  - approved_risk_register_policy
optional_inputs:
  - source_gap_packet_refs
  - interface_control_packet_refs
  - quantitative_enrichment_packet_refs
  - harness_packet_refs
  - review_gate_packet_refs
  - action_closure_packet_refs
  - owner_decision_refs
outputs:
  - technical_risk_register
  - open_question_register
  - burndown_summary
  - closure_criteria_register
  - owner_followup_needed
  - rerun_routes
  - boundary_review_note
validation_level: pilot_executed_private_fixture
registration_policy: owner_requested_registration
upstream_workflows:
  - workflow_id: source_gap_followup_packet_v0
    expected_outputs:
      - source_gap_followup_packet
      - owner_action_queue
      - retry_trigger_register
  - workflow_id: interface_control_and_harness_readiness_v0
    expected_outputs:
      - compatibility_gap_report
      - interface_open_questions
      - owner_followup_needed
  - workflow_id: page_quantitative_enrichment_v0
    expected_outputs:
      - source_gap_report
      - owner_followup_needed
  - workflow_id: review_gate_evidence_pack_v0
    expected_outputs:
      - review_blockers
      - action_item_register
      - decision_summary
    status: optional_review_input
downstream_workflows:
  - workflow_id: review_gate_evidence_pack_v0
    expected_input: updated_risk_and_open_question_summary
    status: rerun_trigger_only
  - workflow_id: review_action_item_closure_loop_v0
    expected_input: closure_criteria_and_open_risk_refs
    status: rerun_trigger_only
risk_contract:
  owns:
    - risk_row_identity
    - open_question_row_identity
    - closure_criteria
    - burndown_status
    - rerun_routes
  does_not_own:
    - owner_acceptance
    - upstream_packet_mutation
  authority_boundary:
    risk_register_is_not_owner_acceptance: true
    upstream_artifacts_are_read_only: true
  required_output_shapes:
    project_binding: templates/project_binding.template.yaml
notes:
  - This workflow is a risk/open-question governance lane. It keeps uncertainty visible and routable; it does not resolve it by itself.
  - Public workflow canon stores only portable orchestration rules, state semantics, and sanitized templates.


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: technical_risk_open_question_burndown_v0
kind: step_graph
status: active
steps:
  - step_id: prepare_risk_binding
    title: Prepare Risk Binding
    actor_slot: workflow_runner
    action:
      kind: project_local_risk_binding_setup
    summary: Resolve bounded risk scope and output root.
  - step_id: curate_risk_rows
    title: Curate Risk Rows
    actor_slot: risk_curator
    action:
      kind: risk_and_open_question_inventory
    summary: Inventory risk and open-question rows from upstream packets.
  - step_id: map_burndown_routes
    title: Map Burndown Routes
    actor_slot: burndown_mapper
    action:
      kind: closure_criteria_and_rerun_route_mapping
    summary: Map closure criteria, owner follow-up, and rerun routes.
  - step_id: write_bundle_and_boundary_review
    title: Write Bundle And Boundary Review
    actor_slot: boundary_reviewer
    action:
      kind: risk_bundle_write_and_boundary_review
    summary: Confirm no acceptance or mutation overclaim before publication.


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "workflow_id": "technical_risk_open_question_burndown_v0",
  "fixture_id": "PUBLIC_SYNTH_TECHNICAL_RISK_OPEN_QUESTION_BURNDOWN_V0",
  "source_kind": "synthetic_from_workflow_contract",
  "public_safe": true,
  "workflow_title": "Technical Risk Open Question Burndown v0",
  "workflow_summary": "Convert source gaps, ambiguous interfaces, unresolved quantitative fields, blocked simulation needs, and review action items into a bounded technical-risk and open-question register with closure criteria and burndown status.",
  "workflow_readiness_label": "pilot-executed",
  "input_refs": [
    "risk_scope_refs",
    "approved_risk_register_policy"
  ],
  "expected_output_groups": [
    "technical_risk_register",
    "open_question_register",
    "burndown_summary",
    "closure_criteria_register",
    "owner_followup_needed",
    "rerun_routes",
    "boundary_review_note"
  ],
  "must_preserve": [
    "risk",
    "open question",
    "closure criteria",
    "boundary",
    "no false resolution"
  ],
  "scenario_facts": [
    "one medium technical risk",
    "one open question",
    "one closure criterion",
    "one rerun route"
  ],
  "boundary_policy": [
    "Do not claim tool use, file edits, runtime paths, or hidden private evidence.",
    "Do not mutate upstream artifacts or promote stronger source/canon authority than the contract supports.",
    "Keep public-safe synthetic boundaries explicit."
  ]
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
