You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-sol; reasoning_effort=low; species=dwarf; class=pathfinder.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: workflow_knowledge_preflight_v0
kind: workflow
status: active
title: Workflow Knowledge Preflight v0
summary: Investigate needed knowledge in a fixed order before a target workflow starts, so the target receives grounded reusable refs, uncertainty notes, claim-seed guidance, and source-deepening routes without re-reading everything from scratch.
entrypoint: run
execution_mode: local_tool_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
inputs:
  - workflow_request_binding
  - target_workflow_id
  - project_knowledge_context_refs
  - preflight_policy
optional_inputs:
  - notebooklm_binding_refs
  - notebooklm_source_ledger_refs
  - knowledge_access_rollup_refs
  - common_reference_refs
  - source_packet_refs
  - sourcebound_packet_refs
  - drive_archive_refs
  - obsidian_export_refs
  - owner_decision_refs
  - existing_mission_refs
outputs:
  - knowledge_preflight_packet
  - query_first_plan
  - source_scope_recommendation
  - claim_ceiling_seed
  - target_workflow_handoff
  - boundary_review_note
validation_level: draft
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
  - workflow_id: knowledge_candidate_triage_v0
    expected_input: repeated_gap_or_candidate_followup
    status: optional_candidate_route
  - workflow_id: knowledge_wiki_pipeline_v0
    expected_input: reusable_gap_or_missing_knowledge_candidate
    status: optional_wikiization_handoff
  - workflow_id: owner_decision_packet_v0
    expected_input: preflight_discovered_owner_decision_needed
    status: optional_owner_gate
  - workflow_id: post_development_review_gate_v0
    expected_input: workflow_or_claim_boundary_change_packet
    status: required_before_public_or_canon_promotion
operating_contract:
  owns:
    - target_workflow_binding_shape
    - investigation_surface_order
    - query_first_plan_shape
    - source_scope_recommendation_shape
    - claim_ceiling_seed_shape
    - target_workflow_handoff_shape
  does_not_own:
    - raw_source_truth
    - notebooklm_runtime_operation
    - target_workflow_completion
    - owner_decision_authority
    - canon_promotion
    - ontology_acceptance
  boundaries:
    registry_and_obsidian_checked_first: true
    notebooklm_is_optional_and_advisory: true
    workmeta_and_source_packet_truth_follow: true
    drive_archive_check_last_when_needed: true
    source_deepening_requires_approved_route: true
    no_payload_copy_into_public_package: true
    claim_seed_is_not_final_claim: true
  required_output_shapes:
    project_binding: templates/project_binding.template.yaml
    knowledge_preflight_packet: templates/knowledge_preflight_packet.template.yaml
    query_first_plan: templates/query_first_plan.template.yaml
    source_scope_recommendation: templates/source_scope_recommendation.template.yaml
    claim_ceiling_seed: templates/claim_ceiling_seed.template.yaml
    target_workflow_handoff: templates/target_workflow_handoff.template.yaml
    boundary_review_note: templates/boundary_review_note.template.yaml
notes:
  - "The investigation order is fixed as: `.registry/knowledge` and canon-backed Obsidian export first, NotebookLM bindings second, `_workmeta` evidence and source packets third, Drive/package refs last when still needed."
  - "This workflow is intended to run before another workflow starts, not as an end-to-end replacement for the target workflow."
  - "The preflight packet is metadata-only and should point at existing surfaces by ref."


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: workflow_knowledge_preflight_v0
kind: step_graph
status: active
steps:
  - step_id: bind_target_and_need
    title: Bind Target And Knowledge Need
    actor_slot: target_binding_reviewer
    action: Bind the target workflow, knowledge request scope, and allowed investigation policy.
    outputs:
      - project_binding
    next:
      - inspect_canon_surfaces
  - step_id: inspect_canon_surfaces
    title: Inspect Canon Surfaces
    actor_slot: canon_surface_inspector
    action: Inspect `.registry/knowledge`, canon-backed Obsidian export refs, and wiki index refs before any advisory or source-heavy surfaces.
    inputs:
      - project_binding
    outputs:
      - query_first_plan
    next:
      - inspect_advisory_surfaces
  - step_id: inspect_advisory_surfaces
    title: Inspect Advisory Surfaces
    actor_slot: advisory_surface_inspector
    action: Inspect NotebookLM bindings and notebook/source maps as advisory context only.
    inputs:
      - query_first_plan
    outputs:
      - knowledge_preflight_packet
    next:
      - inspect_evidence_surfaces
  - step_id: inspect_evidence_surfaces
    title: Inspect Evidence Surfaces
    actor_slot: evidence_surface_inspector
    action: Inspect `_workmeta` evidence, source packets, and prior sourcebound claim routes when canon and advisory surfaces are insufficient.
    inputs:
      - knowledge_preflight_packet
    outputs:
      - source_scope_recommendation
    next:
      - inspect_archive_surface_if_needed
  - step_id: inspect_archive_surface_if_needed
    title: Inspect Archive Surface If Needed
    actor_slot: archive_surface_inspector
    action: Inspect Drive or canon-package refs only when earlier surfaces still leave the request unresolved.
    inputs:
      - source_scope_recommendation
    outputs:
      - claim_ceiling_seed
    next:
      - assemble_handoff
  - step_id: assemble_handoff
    title: Assemble Target Workflow Handoff
    actor_slot: handoff_router
    action: Assemble the metadata-only handoff for the target workflow, including uncertainty, source scope, and reroute recommendations.
    inputs:
      - claim_ceiling_seed
    outputs:
      - target_workflow_handoff
      - boundary_review_note
    next: []


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "schema_version": "gpt56_portfolio_gate_fixture_v1",
  "workflow_id": "workflow_knowledge_preflight_v0",
  "fixture_id": "public_synthetic_query_first_early_resolution",
  "public_safe": true,
  "request": "Prepare the metadata-only knowledge preflight for the target workflow. Follow the fixed investigation order and stop before later surfaces when earlier refs are sufficient.",
  "inputs": {
    "workflow_request_binding": {
      "request": "Draft a synthetic outbound status mail using the current subject-keyword and footer rules.",
      "knowledge_need": [
        "subject keyword precedence",
        "footer authority boundary"
      ]
    },
    "target_workflow_id": "outbound_mail_authoring_v0",
    "project_knowledge_context_refs": [
      "fixture://projects/demo-mail-context"
    ],
    "preflight_policy": {
      "query_first": true,
      "source_deepening_only_when_needed": true,
      "no_payload_copy": true
    },
    "common_reference_refs": [
      {
        "surface": ".registry/knowledge",
        "ref": "registry://knowledge/mail_subject_rules",
        "coverage": [
          "subject keyword precedence"
        ],
        "status": "sufficient"
      },
      {
        "surface": "canon_backed_obsidian_export",
        "ref": "obsidian://canon/mail_footer_boundary",
        "coverage": [
          "footer authority boundary"
        ],
        "status": "sufficient"
      }
    ],
    "notebooklm_binding_refs": [
      "fixture://notebook/binding-not-needed"
    ],
    "knowledge_access_rollup_refs": [
      "fixture://rollup/not-needed"
    ],
    "source_packet_refs": [
      "fixture://sources/not-needed"
    ],
    "sourcebound_packet_refs": [],
    "drive_archive_refs": [
      "fixture://archive/not-needed"
    ],
    "owner_decision_refs": []
  },
  "requested_deliverable": [
    "project/target binding",
    "query-first plan with fixed surface order",
    "knowledge preflight packet naming used and skipped refs",
    "source-scope recommendation",
    "weakest claim-ceiling seed",
    "metadata-only target workflow handoff with uncertainty and reroute triggers",
    "boundary review"
  ],
  "prohibitions": [
    "no NotebookLM operation, workmeta/source/archive inspection after sufficient canon refs, payload copy, final target-workflow completion, owner approval, source truth, ontology acceptance, or canon promotion"
  ],
  "boundary_attestation": "All knowledge refs, target requests, and coverage statements are synthetic metadata."
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
