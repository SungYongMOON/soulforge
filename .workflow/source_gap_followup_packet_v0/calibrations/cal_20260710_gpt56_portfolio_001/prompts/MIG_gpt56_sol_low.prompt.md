You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-sol; reasoning_effort=low; species=dwarf; class=auditor.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: source_gap_followup_packet_v0
kind: workflow
status: active
title: Source Gap Follow-Up Packet v0
summary: Aggregate unresolved source and evidence gaps from upstream hardware/XML workflows into deduplicated owner actions, source batch intake templates, narrow retry triggers, and downstream unblock maps without becoming source evidence authority.
entrypoint: run
execution_mode: local_tool_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
inputs:
  - source_gap_followup_binding
  - upstream_gap_packet_refs
  - approved_gap_intake_policy
optional_inputs:
  - source_gap_reports
  - owner_followup_needed_packets
  - download_or_reuse_manifests
  - component_materials_review_queues
  - layout_guide_source_gap_packets
  - quantitative_claims_with_gap_status
  - harness_readiness_deltas
  - blocked_or_review_required_harness_packets
outputs:
  - source_gap_followup_packet
  - gap_dedup_index
  - owner_action_queue
  - owner_source_batch_manifest_template
  - download_or_reuse_batch_manifest
  - retry_trigger_register
  - downstream_unblock_map
  - boundary_review_note
validation_level: pilot_executed_private_fixture
registration_policy: owner_requested_registration
upstream_workflows:
  - workflow_id: official_source_packet_collect_v0
    expected_outputs:
      - source_gap_report
      - owner_followup_needed
      - download_or_reuse_manifest
      - downstream_ready_refs
  - workflow_id: exp_xml_component_materials
    expected_outputs:
      - source_discovery_packet
      - download_manifest
      - circuit_design_review_queue
  - workflow_id: component_pcb_layout_guide_extraction
    expected_outputs:
      - layout_guide_source_gap_packet
      - source_map
      - extraction_manifest
  - workflow_id: page_quantitative_enrichment_v0
    expected_outputs:
      - source_gap_report
      - owner_followup_needed
      - quantitative_claims
      - harness_readiness_delta
  - workflow_id: xml_harness_composition_v0
    expected_outputs:
      - blocked_connections
      - review_required_connections
      - owner_followup_needed
      - harness_open_questions
      - composition_readiness
downstream_workflows:
  - workflow_id: official_source_packet_collect_v0
    expected_input: retry_triggers_for_source_reindex_or_official_retry
  - workflow_id: exp_xml_component_materials
    expected_input: retry_triggers_for_component_identity_or_material_source_refresh
  - workflow_id: component_pcb_layout_guide_extraction
    expected_input: retry_triggers_for_layout_source_refresh
  - workflow_id: page_quantitative_enrichment_v0
    expected_input: retry_triggers_for_quantitative_value_or_source_gap_refresh
  - workflow_id: xml_harness_composition_v0
    expected_input: retry_triggers_only_after_upstream_evidence_packets_refresh
gap_followup_contract:
  owns:
    - aggregate_gap_identity
    - duplicate_gap_crosswalk
    - owner_action_batching
    - owner_source_batch_manifest_shape
    - retry_trigger_register
    - downstream_unblock_map
  does_not_own:
    - official_source_provenance
    - component_material_truth
    - layout_guidance_extraction
    - quantitative_value_truth
    - harness_connection_approval
  aggregate_gap_id_rule:
    stable_id_basis:
      - project_scope_key
      - source_kind
      - source_or_evidence_gap_family
      - component_or_page_or_interface_or_connection_scope
      - owning_workflow
    same_id_when: repeated upstream packets describe the same unresolved owner/source action for the same bounded scope.
    split_id_when: different components, page assets, interfaces, connection ids, source kinds, or owner decisions would require different follow-up or retry ownership.
  authority_boundary:
    followup_packet_is_source_evidence: false
    owner_batch_file_is_source_evidence_before_reindex: false
    owning_workflow_must_reindex_new_sources: true
    unsupported_claims_remain_blocked_or_review_required: true
  required_output_shapes:
    source_gap_followup_packet: templates/source_gap_followup_packet.template.yaml
    owner_source_batch_manifest_template: templates/owner_source_batch_manifest.template.yaml
notes:
  - This workflow sits after upstream source, materials, layout, quantitative, and harness workflows have written explicit gaps or owner follow-up records.
  - The workflow consolidates repeated asks and retry decisions; it does not search broadly, download account-gated material, read secrets, or decide that a missing source is now source-supported.
  - Owner-provided files enter through a batch manifest and remain private run truth until an owning source or evidence workflow indexes them with provenance, checksum, approval scope, and source-state evidence.
  - Retry triggers must target the narrowest owning workflow and scope. Harness composition should rerun only after source, materials, layout, or quantitative packets feeding it have refreshed.
  - Public workflow canon stores only portable procedure, state semantics, and sanitized templates. Raw project payloads, source files, vendor text, runtime absolute paths, credentials, cookies, sessions, and private run truth do not belong in `.workflow`.


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: source_gap_followup_packet_v0
kind: step_graph
status: active
steps:
  - step_id: prepare_followup_binding
    title: Prepare Follow-Up Binding
    actor_slot: workflow_runner
    action:
      kind: project_local_followup_binding_setup
      requires:
        - source_gap_followup_binding
        - upstream_gap_packet_refs
        - approved_gap_intake_policy
      validates:
        - output_root_is_project_local_or_private_workmeta
        - upstream_refs_are_read_only
        - public_package_contains_no_payloads
        - no_runtime_absolute_paths_in_public_package
        - source_authority_boundary_is_declared
      creates:
        - source_gap_followup_output_root
        - source_gap_followup_run_log_root
    summary: Resolve where the project-local follow-up packet will be written and confirm that the workflow is a control surface, not a source evidence lane.
    next:
      on_success: collect_upstream_gap_surfaces
      on_fail: stop
  - step_id: collect_upstream_gap_surfaces
    title: Collect Upstream Gap Surfaces
    actor_slot: gap_surface_collector
    action:
      kind: read_only_gap_surface_inventory
      artifacts_in:
        - source_gap_reports
        - owner_followup_needed_packets
        - download_or_reuse_manifests
        - component_materials_review_queues
        - layout_guide_source_gap_packets
        - quantitative_claims_with_gap_status
        - harness_readiness_deltas
        - blocked_or_review_required_harness_packets
      artifact_out: upstream_gap_surface_inventory
      records:
        - source_workflow_id
        - source_artifact_ref
        - upstream_gap_ref
        - gap_state
        - source_kind
        - component_refdes
        - page_asset_id
        - interface_id
        - connection_id
        - owner_action_hint
        - downstream_impact
      forbidden_basis:
        - hidden_reference_oracle
        - verifier_report
        - accepted_output
        - previous_candidate_repair_packet
        - secret_or_session_state
        - raw_source_payload_text
    summary: Inventory gap and follow-up records from approved upstream packet refs without mutating them or treating their missing evidence as resolved.
    next:
      on_success: normalize_gap_records
      on_fail: stop
  - step_id: normalize_gap_records
    title: Normalize Gap Records
    actor_slot: gap_normalizer
    action:
      kind: source_gap_record_normalization
      artifact_in: upstream_gap_surface_inventory
      artifact_out: normalized_gap_items
      gap_families:
        - missing_official_source
        - blocked_access
        - owner_file_needed
        - unapproved_local_source
        - identity_ambiguity
        - source_conflict
        - missing_quantitative_evidence
        - missing_layout_guidance
        - missing_harness_context
        - license_or_terms_unclear
        - format_unusable
      blocking_levels:
        - blocks_materials
        - blocks_layout
        - blocks_quantitative
        - blocks_harness
        - review_required
        - informational
      current_states:
        - open
        - owner_waiting
        - agent_retryable
        - batched_for_download
        - resolved_pending_rerun
        - accepted_not_applicable
        - closed
    summary: Convert heterogeneous upstream gap records into one normalized vocabulary while preserving owning workflow and scope lineage.
    next:
      on_success: build_gap_dedup_index
      on_fail: stop
  - step_id: build_gap_dedup_index
    title: Build Gap Dedup Index
    actor_slot: dedup_indexer
    action:
      kind: aggregate_gap_identity_and_crosswalk
      artifact_in: normalized_gap_items
      artifacts_out:
        - gap_dedup_index
        - source_gap_followup_packet_draft
      aggregate_key_fields:
        - project_scope_key
        - owning_workflow_id
        - source_kind
        - gap_family
        - component_refdes
        - component_identity
        - page_asset_id
        - interface_id
        - connection_id
      records:
        - aggregate_gap_id
        - aggregate_key
        - upstream_gap_refs
        - dedup_reason
        - split_reason_when_not_merged
        - lineage_events
      invariant: every_upstream_gap_ref_maps_to_exactly_one_aggregate_gap_id
    summary: Deduplicate repeated owner/source asks into stable aggregate gap ids without collapsing distinct scopes that require separate action.
    next:
      on_success: build_owner_action_queue
      on_fail: stop
  - step_id: build_owner_action_queue
    title: Build Owner Action Queue
    actor_slot: owner_action_planner
    action:
      kind: owner_action_queue_write
      artifacts_in:
        - source_gap_followup_packet_draft
        - gap_dedup_index
      artifact_out: owner_action_queue
      action_types:
        - provide_file
        - approve_local_file
        - manual_download
        - confirm_identity
        - confirm_revision
        - approve_terms
        - domain_decision
        - accept_not_applicable
        - allow_agent_retry
      required_fields:
        - action_id
        - aggregate_gap_ids
        - action_type
        - owner_action
        - target_drop_path
        - expected_manifest_fields
        - downstream_reason
        - blocks_workflows
        - status
      secret_policy: agent_must_not_read_secret_values
    summary: Turn aggregate gaps into concrete, deduplicated owner actions that can be completed without exposing credentials, sessions, or raw payloads to public canon.
    next:
      on_success: plan_source_batches
      on_fail: stop
  - step_id: plan_source_batches
    title: Plan Source Batches
    actor_slot: batch_manifest_planner
    action:
      kind: owner_source_batch_and_download_manifest_write
      artifacts_in:
        - source_gap_followup_packet_draft
        - owner_action_queue
      artifacts_out:
        - owner_source_batch_manifest_template
        - download_or_reuse_batch_manifest
      batch_rules:
        - owner_files_must_map_to_aggregate_gap_ids
        - filenames_alone_are_not_evidence
        - approval_scope_must_be_explicit
        - checksum_required_for_local_files
        - public_summary_allowed_must_be_explicit
        - unclear_terms_remain_owner_followup_needed
      acquisition_states:
        - planned
        - completed
        - blocked
        - not_applicable
    summary: Provide a safe intake shape for owner-provided or manually downloaded sources and record acquisition plans without treating dropped files as evidence yet.
    next:
      on_success: register_retry_triggers
      on_fail: stop
  - step_id: register_retry_triggers
    title: Register Retry Triggers
    actor_slot: retry_trigger_planner
    action:
      kind: narrow_owner_workflow_retry_trigger_write
      artifacts_in:
        - source_gap_followup_packet_draft
        - gap_dedup_index
        - owner_action_queue
        - owner_source_batch_manifest_template
        - download_or_reuse_batch_manifest
      artifact_out: retry_trigger_register
      trigger_types:
        - owner_file_present
        - owner_approval_recorded
        - identity_confirmed
        - revision_confirmed
        - terms_approved
        - official_url_confirmed
        - transient_download_retry_allowed
        - gap_accepted_not_applicable
        - conflict_resolved
      target_policy:
        rerun_narrowest_owning_workflow: true
        source_material_layout_quantitative_before_harness: true
        preserve_aggregate_gap_id_on_failed_retry: true
        append_retry_attempts_instead_of_duplicate_gaps: true
    summary: Write machine-readable triggers that tell the correct owning workflow what changed and what evidence must be re-read.
    next:
      on_success: map_downstream_unblocks
      on_fail: stop
  - step_id: map_downstream_unblocks
    title: Map Downstream Unblocks
    actor_slot: downstream_unblock_mapper
    action:
      kind: downstream_unblock_map_write
      artifacts_in:
        - source_gap_followup_packet_draft
        - gap_dedup_index
        - retry_trigger_register
      artifact_out: downstream_unblock_map
      views:
        - official_source_packet_collect_v0
        - exp_xml_component_materials
        - component_pcb_layout_guide_extraction
        - page_quantitative_enrichment_v0
        - xml_harness_composition_v0
      records:
        - closed_gap_ids
        - open_gap_ids
        - retry_ready_gap_ids
        - owner_waiting_gap_ids
        - downstream_consumers_to_notify
        - not_claimed
      invariant: followup_packet_does_not_directly_promote_source_supported_or_candidate_safe_states
    summary: Produce the per-workflow view of what remains blocked, what is owner-waiting, and what can retry after an owning workflow re-indexes evidence.
    next:
      on_success: write_packet_and_boundary_review
      on_fail: stop
  - step_id: write_packet_and_boundary_review
    title: Write Packet And Boundary Review
    actor_slot: boundary_reviewer
    action:
      kind: followup_packet_boundary_and_overclaim_review
      artifacts_in:
        - source_gap_followup_packet_draft
        - gap_dedup_index
        - owner_action_queue
        - owner_source_batch_manifest_template
        - download_or_reuse_batch_manifest
        - retry_trigger_register
        - downstream_unblock_map
      artifacts_out:
        - source_gap_followup_packet
        - boundary_review_note
        - followup_summary
      checks:
        - every_upstream_gap_has_aggregate_gap_id
        - duplicate_owner_actions_are_merged_or_split_with_reason
        - retry_triggers_target_narrowest_owning_workflow
        - owner_files_are_not_counted_as_source_evidence_before_reindex
        - unsupported_claims_remain_blocked_or_review_required
        - no_raw_payloads_or_runtime_absolute_paths_in_public_package
        - no_secret_or_account_state_requested_from_agent
    summary: Finalize the packet bundle and stop unless the owner batch or owning workflow retry evidence is actually present.
    next:
      on_success: complete
      on_fail: stop


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
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


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
