You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-sol; reasoning_effort=low; species=dwarf; class=pathfinder.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: monster_knowledge_preflight_v0
kind: workflow
status: active
title: Monster Knowledge Preflight v0
summary: Inspect project wiki, NotebookLM bindings, source ledgers, and approved reference routes before a knowledge-heavy monster enters its main workflow, so the worker can query first and deepen only when needed.
entrypoint: run
execution_mode: local_tool_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
inputs:
  - monster_request_binding
  - project_knowledge_context_refs
  - preflight_policy
optional_inputs:
  - notebooklm_binding_refs
  - notebooklm_source_ledger_refs
  - knowledge_access_rollup_refs
  - common_reference_refs
  - source_packet_refs
  - owner_decision_refs
  - existing_mission_refs
outputs:
  - knowledge_preflight_packet
  - wiki_first_query_plan
  - source_scope_recommendation
  - claim_ceiling_seed
  - main_workflow_handoff
  - boundary_review_note
validation_level: pilot_executed_private_evidence
registration_policy: owner_requested_registration
upstream_workflows:
  - workflow_id: knowledge_access_event_capture_v0
    expected_outputs:
      - usage_rollup
      - boundary_review_note
    status: optional_usage_context
  - workflow_id: sourcebound_knowledge_packet_operating_loop_v0
    expected_outputs:
      - claim_ceiling_and_promotion_route
      - contradiction_gap_lint_report
      - concept_candidate_register
    status: optional_previous_source_context
downstream_workflows:
  - workflow_id: sourcebound_knowledge_packet_operating_loop_v0
    expected_input: source_scope_recommendation_or_gap_followup
    status: optional_source_deepening
  - workflow_id: post_development_review_gate_v0
    expected_input: workflow_or_claim_boundary_change_packet
    status: required_before_public_or_canon_promotion
  - workflow_id: owner_decision_packet_v0
    expected_input: preflight_discovered_owner_decision_needed
    status: optional_owner_gate
operating_contract:
  owns:
    - preflight_scope_binding
    - project_wiki_surface_inspection_shape
    - wiki_first_query_plan_shape
    - source_scope_recommendation_shape
    - claim_ceiling_seed_shape
    - main_workflow_handoff_shape
  does_not_own:
    - raw_source_truth
    - notebooklm_runtime_operation
    - main_workflow_completion
    - owner_decision_authority
    - canon_promotion
    - ontology_acceptance
  boundaries:
    project_wiki_first: true
    notebooklm_is_optional_and_advisory: true
    source_deepening_requires_approved_route: true
    no_payload_copy_into_public_package: true
    claim_seed_is_not_final_claim: true
  required_output_shapes:
    project_binding: templates/project_binding.template.yaml
    knowledge_preflight_packet: templates/knowledge_preflight_packet.template.yaml
    wiki_first_query_plan: templates/wiki_first_query_plan.template.yaml
    source_scope_recommendation: templates/source_scope_recommendation.template.yaml
    claim_ceiling_seed: templates/claim_ceiling_seed.template.yaml
    main_workflow_handoff: templates/main_workflow_handoff.template.yaml
    boundary_review_note: templates/boundary_review_note.template.yaml
notes:
  - Recommended class posture is pathfinder first, archivist follow-on, auditor only when the claim grows.
  - This workflow is intended to sit ahead of source-heavy or ambiguity-heavy monsters, not every workflow in the repo.
  - The preflight packet is metadata-only and should point at existing project surfaces by ref.


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: monster_knowledge_preflight_v0
kind: step_graph
status: active
steps:
  - step_id: bind_preflight_scope
    title: Bind Preflight Scope
    actor_slot: preflight_runner
    action:
      kind: monster_request_and_project_knowledge_scope_binding
      requires:
        - monster_request_binding
        - project_knowledge_context_refs
        - preflight_policy
      validates:
        - project_owner_scope_declared
        - allowed_claim_ceiling_declared
        - no_payload_copy_in_public_package
    summary: Resolve which project wiki surfaces, question scope, and source boundaries are in play before any query-first route is suggested.
    next:
      on_success: inspect_project_knowledge_surfaces
      on_fail: stop
  - step_id: inspect_project_knowledge_surfaces
    title: Inspect Project Knowledge Surfaces
    actor_slot: preflight_runner
    action:
      kind: project_binding_source_ledger_and_notebooklm_surface_inventory
      artifacts_in:
        - project_knowledge_context_refs
        - notebooklm_binding_refs
        - notebooklm_source_ledger_refs
        - common_reference_refs
      artifacts_out:
        - knowledge_preflight_packet
      allowed_content:
        - project_binding_ref
        - source_ledger_ref
        - notebook_binding_ref
        - common_reference_ref
        - visible_gap_ref
        - known_claim_ceiling_ref
      forbidden_content:
        - source_payload_body
        - notebooklm_answer_payload
        - auth_or_session_material
    summary: Inventory the existing project wiki surfaces first so the main workflow can reuse prior work before reopening source packets.
    next:
      on_success: build_wiki_first_query_plan
      on_fail: stop
  - step_id: build_wiki_first_query_plan
    title: Build Wiki-first Query Plan
    actor_slot: query_planner
    action:
      kind: notebooklm_and_project_wiki_query_first_planning
      artifacts_in:
        - knowledge_preflight_packet
        - preflight_policy
      artifact_out: wiki_first_query_plan
      route_states:
        - query_existing_project_wiki_first
        - query_notebooklm_first
        - sourcebound_deepening_required
        - owner_input_required
    summary: Decide whether the monster should query the existing wiki first, use NotebookLM first, deepen into approved sources, or stop for owner input.
    next:
      on_success: route_source_scope_and_claim_seed
      on_fail: stop
  - step_id: route_source_scope_and_claim_seed
    title: Route Source Scope And Claim Seed
    actor_slot: route_curator
    action:
      kind: source_scope_gap_and_claim_seed_routing
      artifacts_in:
        - knowledge_preflight_packet
        - wiki_first_query_plan
        - source_packet_refs
        - owner_decision_refs
      artifacts_out:
        - source_scope_recommendation
        - claim_ceiling_seed
      rules:
        claim_seed_is_not_authority: true
        source_gap_must_remain_visible: true
        notebooklm_is_never_final_verdict: true
    summary: Capture the next safe source route and the weakest safe initial claim ceiling before the monster enters the main workflow.
    next:
      on_success: assemble_main_workflow_handoff
      on_fail: stop
  - step_id: assemble_main_workflow_handoff
    title: Assemble Main Workflow Handoff
    actor_slot: boundary_reviewer
    action:
      kind: metadata_only_main_workflow_handoff_assembly_and_boundary_review
      artifacts_in:
        - knowledge_preflight_packet
        - wiki_first_query_plan
        - source_scope_recommendation
        - claim_ceiling_seed
      artifacts_out:
        - main_workflow_handoff
        - boundary_review_note
      checks:
        - no_raw_source_truth
        - no_notebooklm_answer_payload
        - no_secret_or_session_material
        - no_owner_approval_overclaim
    summary: Produce the metadata-only packet that the main workflow can consume and verify that the preflight did not overclaim.


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "workflow_id": "monster_knowledge_preflight_v0",
  "fixture_id": "PUBLIC_SYNTH_MONSTER_KNOWLEDGE_PREFLIGHT_V0",
  "source_kind": "synthetic_from_workflow_contract_metadata_only",
  "public_safe": true,
  "workflow_title": "Monster Knowledge Preflight v0",
  "workflow_summary": "Inspect project wiki, NotebookLM bindings, source ledgers, and approved reference routes before a knowledge-heavy monster enters its main workflow, so the worker can query first and deepen only when needed.",
  "workflow_readiness_label": "pilot-executed",
  "input_refs": [
    "monster_request_binding",
    "project_knowledge_context_refs",
    "preflight_policy"
  ],
  "expected_output_groups": [
    "knowledge_preflight_packet",
    "wiki_first_query_plan",
    "source_scope_recommendation",
    "claim_ceiling_seed",
    "main_workflow_handoff",
    "boundary_review_note"
  ],
  "must_preserve": [
    "query first",
    "metadata-only",
    "source gap",
    "boundary",
    "claim ceiling"
  ],
  "scenario_facts": [
    "existing wiki binding is available",
    "one approved source ref exists",
    "one source gap remains",
    "the packet stays metadata-only"
  ],
  "boundary_policy": [
    "Do not claim tool use, file edits, runtime paths, or hidden private evidence.",
    "Do not mutate upstream artifacts or promote stronger source/canon authority than the contract supports.",
    "Keep public-safe synthetic boundaries explicit."
  ]
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
