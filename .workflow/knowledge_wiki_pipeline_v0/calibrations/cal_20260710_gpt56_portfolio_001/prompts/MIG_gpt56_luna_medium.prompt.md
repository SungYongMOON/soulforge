You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-luna; reasoning_effort=medium; species=dwarf; class=pathfinder.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: knowledge_wiki_pipeline_v0
kind: workflow
status: active
title: Knowledge Wiki Pipeline v0
summary: Composite request-level workflow candidate that routes knowledge wikiization requests through registered source intake, sourcebound projection, archive/package handoff, Obsidian export decisioning, metadata capture, and closeout review stages while inserting stronger gates only when the request demands them.
entrypoint: run
execution_mode: party_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
inputs:
  - knowledge_wiki_request_packet
  - approved_source_policy
  - source_scope_binding
optional_inputs:
  - extracted_zip_inventory_ref
  - extracted_zip_contents_ref
  - owner_held_archive_policy
  - owner_held_archive_refs
  - existing_projection_refs
  - prior_source_packet_refs
  - prior_sourcebound_packet_refs
  - source_sufficiency_refs
  - owner_decision_refs
  - routing_context_refs
outputs:
  - pipeline_request_packet
  - routing_decision_note
  - stage_chain_manifest
  - source_packet_refs
  - sourcebound_packet_refs
  - archive_manifest_refs
  - obsidian_export_refs
  - knowledge_access_refs
  - rag_refresh_handoff_refs
  - closeout_review_refs
  - boundary_review_note
validation_level: pilot_executed_private_fixture
registration_policy: owner_requested_registration
output_state: pilot-executed
constituent_workflows:
  required:
    - official_source_packet_collect_v0
    - sourcebound_knowledge_packet_operating_loop_v0
    - knowledge_access_event_capture_v0
    - post_development_review_gate_v0
  optional:
    - source_packet_sufficiency_review_v0
    - owner_decision_packet_v0
    - rag_metadata_refresh_v0
request_modes:
  - fresh_pipeline
  - refresh_existing_projection
  - query_only_with_existing_projection
  - promotion_sensitive_review
  - blocked_boundary_case
operating_contract:
  owns:
    - request_to_stage_routing
    - optional_gate_insertion_rules
    - owner_archive_stage_insertion_rules
    - obsidian_export_decision_shape
    - stage_chain_manifest_shape
    - rag_refresh_handoff_decision_shape
    - pipeline_level_boundary_review
  does_not_own:
    - source_truth
    - source_acquisition_authority
    - google_drive_or_other_archive_upload_authority
    - downstream_projection_truth
    - knowledge_access_authority
    - rag_index_build_authority
    - rag_answer_authority
    - review_gate_authority
    - workflow_registration_decision
  required_output_shapes:
    pipeline_request_packet: templates/pipeline_request_packet.template.yaml
    routing_decision_note: templates/routing_decision_note.template.yaml
    stage_chain_manifest: templates/stage_chain_manifest.template.yaml
    obsidian_export_decision_note: templates/obsidian_export_decision_note.template.yaml
    rag_refresh_handoff_decision: templates/rag_refresh_handoff_decision.template.yaml
    boundary_review_note: templates/boundary_review_note.template.md
downstream_workflows:
  - workflow_id: rag_metadata_refresh_v0
    expected_input: metadata_only_rag_refresh_handoff
    status: optional_after_metadata_or_sourcebound_projection_change
boundaries:
  orchestration_only: true
  zip_container_is_not_source_truth: true
  owner_held_archive_is_storage_and_backup_not_authority: true
  codex_skill_auto_sync_allowed_when_declared: true
  per_file_owner_confirmation_not_required_when_declared: true
  downstream_private_derivative_outputs: true
  obsidian_generated_export_is_read_only_derived_view: true
  obsidian_export_requires_canon_backed_registry_or_approved_canon_package: true
  obsidian_export_runtime_surface_is_local_generated_workspace: true
  rag_refresh_handoff_is_metadata_only: true
  rag_refresh_workflow_owns_index_refresh: true
  rag_refresh_handoff_does_not_grant_source_text_or_index_build_permission: true
  hwp_page_exact_claims_blocked_by_default: true
  public_promotion_requires_owner_decision_and_registered_authority: true
notes:
  - The package was extracted from a successful private sourcebound wiki run and an existing `knowledge_wiki_cell` smoke chain.
  - The workflow is now registered in `.workflow/index.yaml`.
  - "`knowledge_wiki_cell` may use this workflow as its default entry while the registered four-stage lane remains the downstream execution chain owned by this composite package."
  - "`query_only_with_existing_projection` may bypass fresh intake and fresh projection when a bounded existing private projection ref is already available."
  - Owner-held archive refs may be inserted before intake for Drive inbox/candidate storage and after projection/review for working or canon package backup, but storage status does not promote canon.
  - Obsidian export is a generated read-only local view over canon-backed knowledge only. It is not a canon owner surface and must not expose `_workmeta` payloads, raw source files, or NotebookLM answers.
  - RAG refresh handoff is optional metadata-only routing after sourcebound/wiki metadata changes; `rag_metadata_refresh_v0` owns refresh execution and stronger source-text/index permissions remain false unless a separate owner decision grants them.


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: knowledge_wiki_pipeline_v0
kind: step_graph
status: active
steps:
  - step_id: bind_request_scope
    title: Bind Request Scope
    actor_slot: pipeline_controller
    action: Normalize the incoming knowledge wiki request into a bounded packet with source scope, expected output surface, private/public boundary, allowed source families, owner-held archive policy, and any Obsidian read-view request posture.
    outputs:
      - pipeline_request_packet
    next:
      - archive_candidate_source_stage
  - step_id: archive_candidate_source_stage
    title: Archive Candidate Source Stage
    actor_slot: pipeline_controller
    action: Record Google Drive or another owner-held archive inbox/candidate refs for the incoming files before local/private processing. When archive policy declares codex_skill_auto_sync, an approved Codex skill or Google Drive connector may upload/sync without per-file owner confirmation.
    inputs:
      - pipeline_request_packet
    outputs:
      - archive_manifest_refs
    next:
      - classify_route
  - step_id: classify_route
    title: Classify Route
    actor_slot: request_router
    action: Decide fresh pipeline vs projection refresh vs query-only reuse vs stronger-gate insertion vs blocked boundary handling.
    inputs:
      - pipeline_request_packet
    outputs:
      - routing_decision_note
    next:
      - assemble_stage_chain
  - step_id: assemble_stage_chain
    title: Assemble Stage Chain
    actor_slot: pipeline_planner
    action: Build the registered stage order, explicit skip paths, and optional gate insertion points without changing downstream workflow ownership.
    inputs:
      - pipeline_request_packet
      - routing_decision_note
    outputs:
      - stage_chain_manifest
    next:
      default: source_intake_stage
      when_query_only_existing_projection: metadata_capture_stage
  - step_id: source_intake_stage
    title: Source Intake Stage
    actor_slot: source_intake_coordinator
    delegates_to_workflow_id: official_source_packet_collect_v0
    action: Run or reuse the official-source intake stage to bind approved source refs, extracted ZIP inventories, owner-held archive refs, visible source gaps, and downstream-ready refs. Skip this stage when the stage chain manifest is explicitly query-only over an existing projection.
    inputs:
      - stage_chain_manifest
    outputs:
      - source_packet_refs
    next:
      default: sourcebound_projection_stage
      when_authority_sensitive_or_page_sensitive: optional_source_sufficiency_gate
  - step_id: optional_source_sufficiency_gate
    title: Optional Source Sufficiency Gate
    actor_slot: optional_gate_router
    delegates_to_workflow_id: source_packet_sufficiency_review_v0
    condition: only when the request asks for exact compliance, stronger authority, page-sensitive HWP claims, or public-safe promotion posture
    inputs:
      - source_packet_refs
      - routing_decision_note
    outputs:
      - source_sufficiency_refs
    next:
      - sourcebound_projection_stage
  - step_id: sourcebound_projection_stage
    title: Sourcebound Projection Stage
    actor_slot: projection_coordinator
    delegates_to_workflow_id: sourcebound_knowledge_packet_operating_loop_v0
    action: Build or refresh the private sourcebound projection, compiled index/log, concept candidates, and claim ceiling routes.
    inputs:
      - source_packet_refs
      - routing_decision_note
    optional_inputs:
      - source_sufficiency_refs
    outputs:
      - sourcebound_packet_refs
      - archive_manifest_refs
    next:
      default: archive_working_package_stage
      when_promotion_sensitive: optional_owner_decision_gate
  - step_id: optional_owner_decision_gate
    title: Optional Owner Decision Gate
    actor_slot: optional_gate_router
    delegates_to_workflow_id: owner_decision_packet_v0
    condition: only when promotion, public-safe abstraction, or blocked authority upgrade requires owner choice
    inputs:
      - sourcebound_packet_refs
      - routing_decision_note
    outputs:
      - owner_decision_refs
    next:
      - archive_working_package_stage
  - step_id: archive_working_package_stage
    title: Archive Working Package Stage
    actor_slot: pipeline_planner
    action: Record working-packet, reviewed-private, blocked, or canon-package archive entries after projection and any owner-decision route. The stage prepares manifest refs for Drive backup and NotebookLM/Obsidian handoff eligibility without uploading or promoting by itself.
    inputs:
      - sourcebound_packet_refs
      - routing_decision_note
    optional_inputs:
      - owner_decision_refs
    outputs:
      - archive_manifest_refs
    next:
      - obsidian_export_decision_stage
  - step_id: obsidian_export_decision_stage
    title: Obsidian Export Decision Stage
    actor_slot: pipeline_planner
    action: Decide whether the run may generate a read-only Obsidian markdown export, name the local generated export surface, and block export when no canon-backed registry or approved canon package source exists.
    inputs:
      - pipeline_request_packet
      - routing_decision_note
      - archive_manifest_refs
    optional_inputs:
      - sourcebound_packet_refs
      - owner_decision_refs
    outputs:
      - obsidian_export_refs
    next:
      - metadata_capture_stage
  - step_id: metadata_capture_stage
    title: Metadata Capture Stage
    actor_slot: metadata_capture_coordinator
    delegates_to_workflow_id: knowledge_access_event_capture_v0
    action: Record metadata-only packet use, rollup, and candidate linkage signals after the projection exists, or against an explicitly supplied existing projection ref in query-only mode.
    inputs:
      - routing_decision_note
    optional_inputs:
      - sourcebound_packet_refs
      - archive_manifest_refs
      - obsidian_export_refs
      - existing_projection_refs
      - owner_decision_refs
    outputs:
      - knowledge_access_refs
    next:
      - rag_refresh_handoff_decision_stage
  - step_id: rag_refresh_handoff_decision_stage
    title: RAG Refresh Handoff Decision Stage
    actor_slot: metadata_capture_coordinator
    action: Decide whether wiki/sourcebound metadata changes should hand off to `rag_metadata_refresh_v0`, and write a metadata-only refresh request that names changed refs, allowed scope, and blocked stronger permissions without running the RAG refresh inside this pipeline.
    inputs:
      - routing_decision_note
      - knowledge_access_refs
    optional_inputs:
      - sourcebound_packet_refs
      - archive_manifest_refs
      - obsidian_export_refs
      - existing_projection_refs
      - owner_decision_refs
    outputs:
      - rag_refresh_handoff_refs
    next:
      - closeout_review_stage
  - step_id: closeout_review_stage
    title: Closeout Review Stage
    actor_slot: review_coordinator
    delegates_to_workflow_id: post_development_review_gate_v0
    action: Close the pipeline through validation, boundary review, knowledge-trigger checking, and final claim ceiling review.
    inputs:
      - knowledge_access_refs
    optional_inputs:
      - sourcebound_packet_refs
      - archive_manifest_refs
      - existing_projection_refs
      - owner_decision_refs
      - rag_refresh_handoff_refs
    outputs:
      - closeout_review_refs
    next:
      - boundary_review
  - step_id: boundary_review
    title: Boundary Review
    actor_slot: boundary_reviewer
    action: Confirm that the composite package still treats the chain as orchestration only, keeps ZIP containers out of truth, and does not upgrade claims beyond downstream evidence.
    inputs:
      - pipeline_request_packet
      - routing_decision_note
      - stage_chain_manifest
      - archive_manifest_refs
      - obsidian_export_refs
      - rag_refresh_handoff_refs
      - closeout_review_refs
    outputs:
      - boundary_review_note
    next: []
stop_conditions:
  - source_intake_bypassed_without_existing_approved_refs
  - zip_container_requested_as_source_truth
  - remote_archive_upload_requested_outside_declared_codex_skill_or_connector_policy
  - drive_archive_presence_treated_as_source_truth_or_canon_authority
  - obsidian_export_requested_without_canon_backed_source
  - hwp_page_exact_claim_requested_without_page_stable_surface
  - public_promotion_requested_without_authority_register
  - rag_refresh_handoff_attempts_to_grant_source_text_or_index_build_permission
  - rag_refresh_execution_requested_inside_wiki_pipeline
  - owner_decision_required_but_absent_for_claim_upgrade
  - downstream_stage_reports_blocked


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "workflow_id": "knowledge_wiki_pipeline_v0",
  "fixture_id": "PUBLIC_SYNTH_SE_KNOWLEDGE_WIKI_PIPELINE_V0",
  "source_kind": "synthetic_from_workflow_contract_metadata_only",
  "public_safe": true,
  "workflow_title": "Knowledge Wiki Pipeline v0",
  "workflow_summary": "Composite request-level workflow candidate that routes knowledge wikiization requests through registered source intake, sourcebound projection, archive/package handoff, Obsidian export decisioning, metadata capture, and closeout review stages while inserting stronger gates only when the request demands them.",
  "workflow_readiness_label": "pilot-executed",
  "input_refs": [
    "knowledge_wiki_request_packet",
    "approved_source_policy",
    "source_scope_binding"
  ],
  "expected_output_groups": [
    "pipeline_request_packet",
    "routing_decision_note",
    "stage_chain_manifest",
    "source_packet_refs",
    "sourcebound_packet_refs",
    "archive_manifest_refs",
    "obsidian_export_refs",
    "knowledge_access_refs",
    "closeout_review_refs",
    "boundary_review_note"
  ],
  "must_preserve": [
    "query-first",
    "sourcebound",
    "archive",
    "boundary",
    "no source authority grant"
  ],
  "scenario_facts": [
    "one request can reuse an existing projection",
    "one stage requires fresh sourcebound work",
    "one archive/storage note must remain non-authoritative",
    "one closeout review ref is required"
  ],
  "boundary_policy": [
    "Do not claim tool use, file edits, runtime paths, or hidden private evidence.",
    "Do not mutate upstream artifacts or promote stronger source/canon authority than the contract supports.",
    "Keep public-safe synthetic boundaries explicit."
  ]
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
