You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-sol; reasoning_effort=low; species=dwarf; class=pathfinder.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: llm_wiki_builder_v0
kind: workflow
status: active
title: LLM Wiki Builder v0
summary: Orchestrate query-first project wiki use, candidate triage, optional sourcebound deepening, curation planning, usage-capture handoff, and governance routing for bounded knowledge-heavy project work.
entrypoint: run
execution_mode: local_tool_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
inputs:
  - builder_request_binding
  - project_wiki_context_refs
  - builder_policy
optional_inputs:
  - notebooklm_binding_refs
  - source_ledger_refs
  - notebooklm_packet_map_refs
  - candidate_source_refs
  - source_packet_refs
  - knowledge_access_rollup_refs
  - owner_decision_refs
  - existing_mission_refs
outputs:
  - builder_scope_packet
  - preflight_result_ref
  - candidate_triage_ref
  - sourcebound_route_ref
  - curation_result_ref
  - usage_capture_note
  - final_builder_handoff
  - boundary_review_note
validation_level: pilot_executed_private_evidence
registration_policy: owner_requested_registration
upstream_workflows:
  - workflow_id: monster_knowledge_preflight_v0
    expected_outputs:
      - main_workflow_handoff
      - source_scope_recommendation
      - claim_ceiling_seed
    status: preferred_front_gate
  - workflow_id: knowledge_candidate_triage_v0
    expected_outputs:
      - bookshelf_placement_decision
      - notebooklm_packet_eligibility_note
      - downstream_route_map
    status: preferred_candidate_filter
  - workflow_id: sourcebound_knowledge_packet_operating_loop_v0
    expected_outputs:
      - sourcebound_knowledge_packet_manifest
      - claim_ceiling_and_promotion_route
    status: optional_source_deepening
  - workflow_id: wiki_curation_maintenance_v0
    expected_outputs:
      - source_ledger_curation_packet
      - review_handoff
    status: preferred_curation_layer
  - workflow_id: knowledge_access_event_capture_v0
    expected_outputs:
      - usage_rollup
      - boundary_review_note
    status: optional_usage_signal_layer
downstream_workflows:
  - workflow_id: owner_decision_packet_v0
    expected_input: builder_discovers_owner_decision_needed
    status: optional_owner_gate
  - workflow_id: post_development_review_gate_v0
    expected_input: builder_changed_claim_or_policy_posture
    status: required_before_public_or_canon_promotion
operating_contract:
  owns:
    - builder_scope_binding
    - stack_route_assembly
    - preflight_triage_sourcebound_curation_handoff_shape
    - usage_capture_note_shape
    - final_builder_handoff_shape
  does_not_own:
    - source_truth
    - notebooklm_runtime_operation
    - owner_approval_authority
    - canon_promotion
    - ontology_acceptance
    - archive_or_retire_execution
  boundaries:
    query_first_before_raw_source_when_possible: true
    sourcebound_deepening_is_conditional: true
    curation_is_required_for_reusable_result: true
    notebooklm_is_advisory_only: true
    no_payload_copy_into_public_package: true
  required_output_shapes:
    project_binding: templates/project_binding.template.yaml
    builder_scope_packet: templates/builder_scope_packet.template.yaml
    preflight_result_ref: templates/preflight_result_ref.template.yaml
    candidate_triage_ref: templates/candidate_triage_ref.template.yaml
    sourcebound_route_ref: templates/sourcebound_route_ref.template.yaml
    curation_result_ref: templates/curation_result_ref.template.yaml
    usage_capture_note: templates/usage_capture_note.template.yaml
    final_builder_handoff: templates/final_builder_handoff.template.yaml
    boundary_review_note: templates/boundary_review_note.template.yaml
notes:
  - The builder exists so a knowledge-heavy monster can be handled as one explicit route instead of scattered manual memory.
  - It still leaves authority with sources, owner decisions, and the review gate.


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: llm_wiki_builder_v0
kind: step_graph
status: active
steps:
  - step_id: bind_builder_scope
    title: Bind Builder Scope
    actor_slot: builder_runner
    action:
      kind: project_wiki_builder_scope_binding
      requires:
        - builder_request_binding
        - project_wiki_context_refs
        - builder_policy
      validates:
        - project_owner_scope_declared
        - query_first_policy_declared
        - no_payload_copy_in_public_package
    summary: Resolve the monster question, project wiki surfaces, and allowed claim posture before stack orchestration begins.
    next:
      on_success: assemble_query_first_front_gate
      on_fail: stop
  - step_id: assemble_query_first_front_gate
    title: Assemble Query-first Front Gate
    actor_slot: builder_runner
    action:
      kind: monster_preflight_handoff_assembly
      artifacts_in:
        - project_wiki_context_refs
        - notebooklm_binding_refs
        - source_ledger_refs
        - notebooklm_packet_map_refs
      artifact_out: preflight_result_ref
    summary: Bind the project wiki and NotebookLM surfaces needed for the front-gate preflight.
    next:
      on_success: assemble_candidate_filter
      on_fail: stop
  - step_id: assemble_candidate_filter
    title: Assemble Candidate Filter
    actor_slot: builder_runner
    action:
      kind: knowledge_candidate_triage_handoff_assembly
      artifacts_in:
        - candidate_source_refs
        - source_ledger_refs
        - notebooklm_packet_map_refs
      artifact_out: candidate_triage_ref
    summary: Bind the candidate-triage context that says which source and packet candidates can be used safely now.
    next:
      on_success: decide_sourcebound_route
      on_fail: stop
  - step_id: decide_sourcebound_route
    title: Decide Sourcebound Route
    actor_slot: route_curator
    action:
      kind: query_first_then_sourcebound_route_decision
      artifacts_in:
        - preflight_result_ref
        - candidate_triage_ref
        - source_packet_refs
      artifact_out: sourcebound_route_ref
      route_states:
        - wiki_first_only
        - notebooklm_first
        - sourcebound_deepening_required
        - owner_input_required
    summary: Decide whether the builder can stay query-first or must route into approved-source deepening.
    next:
      on_success: assemble_curation_layer
      on_fail: stop
  - step_id: assemble_curation_layer
    title: Assemble Curation Layer
    actor_slot: curation_archivist
    action:
      kind: wiki_curation_handoff_assembly
      artifacts_in:
        - preflight_result_ref
        - candidate_triage_ref
        - sourcebound_route_ref
        - knowledge_access_rollup_refs
      artifact_out: curation_result_ref
    summary: Prepare the curation step that will keep the project wiki reusable after the bounded task.
    next:
      on_success: assemble_usage_and_review_handoff
      on_fail: stop
  - step_id: assemble_usage_and_review_handoff
    title: Assemble Usage And Review Handoff
    actor_slot: boundary_reviewer
    action:
      kind: usage_capture_and_final_builder_handoff_assembly
      artifacts_in:
        - preflight_result_ref
        - candidate_triage_ref
        - sourcebound_route_ref
        - curation_result_ref
        - owner_decision_refs
      artifacts_out:
        - usage_capture_note
        - final_builder_handoff
        - boundary_review_note
      checks:
        - no_source_truth_overclaim
        - no_owner_approval_inference
        - no_payload_copy
        - no_notebooklm_answer_as_verdict
    summary: Package the whole stack as one bounded route and confirm the builder did not collapse authority boundaries.


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "workflow_id": "llm_wiki_builder_v0",
  "fixture_id": "PUBLIC_SYNTH_LLM_WIKI_BUILDER_V0",
  "source_kind": "synthetic_from_workflow_contract_metadata_only",
  "public_safe": true,
  "workflow_title": "LLM Wiki Builder v0",
  "workflow_summary": "Orchestrate query-first project wiki use, candidate triage, optional sourcebound deepening, curation planning, usage-capture handoff, and governance routing for bounded knowledge-heavy project work.",
  "workflow_readiness_label": "pilot-executed",
  "input_refs": [
    "builder_request_binding",
    "project_wiki_context_refs",
    "builder_policy"
  ],
  "expected_output_groups": [
    "builder_scope_packet",
    "preflight_result_ref",
    "candidate_triage_ref",
    "sourcebound_route_ref",
    "curation_result_ref",
    "usage_capture_note",
    "final_builder_handoff",
    "boundary_review_note"
  ],
  "must_preserve": [
    "query-first",
    "triage",
    "sourcebound",
    "boundary",
    "authority stays with sources"
  ],
  "scenario_facts": [
    "preflight passes with one source gap",
    "triage routes one candidate to sourcebound deepening",
    "one curation follow-up remains",
    "one usage-capture handoff is explicit"
  ],
  "boundary_policy": [
    "Do not claim tool use, file edits, runtime paths, or hidden private evidence.",
    "Do not mutate upstream artifacts or promote stronger source/canon authority than the contract supports.",
    "Keep public-safe synthetic boundaries explicit."
  ]
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
