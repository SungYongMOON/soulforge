workflow_deliverable:
  workflow_id: knowledge_wiki_pipeline_v0
  fixture_id: PUBLIC_SYNTH_SE_KNOWLEDGE_WIKI_PIPELINE_V0
  deliverable_id: PUBLIC_SYNTH_KNOWLEDGE_WIKI_PIPELINE_DELIVERABLE_V0
  public_safe: true
  source_kind: synthetic_from_workflow_contract_metadata_only
  execution_status: blocked_before_downstream_execution
  claim_ceiling: orchestration_plan_only

pipeline_request_packet:
  request_mode: refresh_existing_projection
  source_scope_binding: synthetic_public_safe_scope
  approved_source_policy: supplied_by_fixture_reference_only
  source_families:
    - synthetic_contract_metadata
  expected_output_surface: public_safe_synthetic_projection
  boundary:
    upstream_mutation_allowed: false
    source_authority_granted: false
    canon_authority_granted: false
    private_evidence_available: false
    runtime_facts_available: false
  archive_policy:
    owner_held_archive_status: storage_and_backup_only
    upload_authority: not_granted
    codex_skill_auto_sync_declared: false
  obsidian_request:
    requested: false
    export_authorized: false
    reason: no_canon_backed_registry_or_approved_canon_package_ref_supplied
  uncertainty:
    - No concrete existing_projection_ref was supplied.
    - No concrete approved source ref was supplied.
    - Projection freshness and source sufficiency are unknown.

routing_decision_note:
  routing_posture: query_first_then_fresh_sourcebound_work
  selected_route: refresh_existing_projection
  rationale:
    - The scenario permits reuse of an existing projection, so reuse eligibility is evaluated first.
    - No bounded existing_projection_ref is present, so query-only bypass is not authorized.
    - The scenario explicitly requires fresh sourcebound work.
  fresh_source_intake_required: true
  fresh_sourcebound_projection_required: true
  query_only_bypass_authorized: false
  stronger_gate_decisions:
    source_sufficiency_gate: not_inserted
    owner_decision_gate: not_inserted
  gate_uncertainty:
    - Insert the source sufficiency gate if exact compliance, stronger authority, page-sensitive HWP claims, or public promotion is later requested.
    - Insert the owner decision gate if a claim upgrade, public-safe abstraction, or promotion decision is later requested.

stage_chain_manifest:
  route: refresh_existing_projection
  stages:
    - order: 1
      step_id: bind_request_scope
      disposition: represented_by_pipeline_request_packet
    - order: 2
      step_id: archive_candidate_source_stage
      disposition: manifest_only
      authority_effect: none
    - order: 3
      step_id: classify_route
      disposition: represented_by_routing_decision_note
    - order: 4
      step_id: assemble_stage_chain
      disposition: represented_by_this_manifest
    - order: 5
      step_id: source_intake_stage
      disposition: required_pending
      delegates_to: official_source_packet_collect_v0
    - order: 6
      step_id: optional_source_sufficiency_gate
      disposition: skipped_unless_triggered
    - order: 7
      step_id: sourcebound_projection_stage
      disposition: required_pending
      delegates_to: sourcebound_knowledge_packet_operating_loop_v0
    - order: 8
      step_id: optional_owner_decision_gate
      disposition: skipped_unless_triggered
    - order: 9
      step_id: archive_working_package_stage
      disposition: pending_projection
      authority_effect: none
    - order: 10
      step_id: obsidian_export_decision_stage
      disposition: blocked
      reason: canon_backed_source_not_supplied
    - order: 11
      step_id: metadata_capture_stage
      disposition: pending_projection
      delegates_to: knowledge_access_event_capture_v0
    - order: 12
      step_id: rag_refresh_handoff_decision_stage
      disposition: pending_metadata_change_assessment
    - order: 13
      step_id: closeout_review_stage
      disposition: required_pending
      delegates_to: post_development_review_gate_v0
    - order: 14
      step_id: boundary_review
      disposition: pending_closeout_review
  skip_paths:
    query_only_existing_projection: not_available_without_bounded_existing_projection_ref

source_packet_refs:
  status: unresolved
  refs: []
  required_next_input:
    - approved_source_refs
    - source_scope_binding
  non_claims:
    - No source was acquired.
    - No source truth was established.

sourcebound_packet_refs:
  status: pending_fresh_sourcebound_work
  refs: []
  claim_ceiling: no_projection_claims_available

archive_manifest_refs:
  status: planned_only
  entries:
    - archive_entry_id: PUBLIC_SYNTH_ARCHIVE_CANDIDATE_ENTRY_V0
      stage: candidate_source
      authority_status: non_authoritative_storage_only
      ref_status: unresolved
    - archive_entry_id: PUBLIC_SYNTH_ARCHIVE_WORKING_ENTRY_V0
      stage: working_package
      authority_status: non_authoritative_storage_only
      ref_status: pending_projection
  non_claims:
    - Archive presence does not establish source truth.
    - Archive presence does not establish canon status.
    - No upload or synchronization authority is granted.

obsidian_export_refs:
  status: blocked
  refs: []
  decision: do_not_generate
  reason: no_canon_backed_registry_or_approved_canon_package_ref_supplied
  boundaries:
    read_only_derived_view: true
    raw_source_exposure_allowed: false
    workmeta_exposure_allowed: false
    notebook_answer_exposure_allowed: false

knowledge_access_refs:
  status: pending_projection
  refs: []
  metadata_only: true

rag_refresh_handoff_refs:
  status: not_issued
  refs: []
  decision: defer_until_metadata_change_is_established
  allowed_scope: metadata_only
  source_text_permission: false
  index_build_permission: false
  refresh_execution_inside_pipeline: false

closeout_review_refs:
  status: required_unresolved
  refs:
    - ref_id: PUBLIC_SYNTH_CLOSEOUT_REVIEW_REF_PENDING_V0
      state: placeholder_not_evidence
  completion_condition:
    - downstream_required_stages_complete
    - boundary_review_complete
    - final_claim_ceiling_confirmed

boundary_review_note:
  status: provisional_blocked
  findings:
    orchestration_only_preserved: true
    query_first_posture_preserved: true
    sourcebound_requirement_preserved: true
    archive_non_authority_preserved: true
    zip_container_used_as_truth: false
    source_authority_granted: false
    canon_authority_granted: false
    obsidian_boundary_preserved: true
    rag_metadata_only_boundary_preserved: true
    public_promotion_authorized: false
  unresolved:
    - Approved source refs are absent.
    - A bounded existing projection ref is absent.
    - Fresh sourcebound output is absent.
    - A completed closeout review ref is absent.
  stop_condition:
    active: true
    reason: downstream_required_stage_outputs_and_closeout_review_are_unresolved
  release_conditions:
    - Bind approved public-safe source refs.
    - Produce fresh sourcebound packet refs without exceeding source evidence.
    - Record metadata-only access refs.
    - Decide any metadata-only RAG handoff without granting stronger permissions.
    - Supply the required closeout review ref.
    - Complete final boundary review without claim or authority upgrade.
