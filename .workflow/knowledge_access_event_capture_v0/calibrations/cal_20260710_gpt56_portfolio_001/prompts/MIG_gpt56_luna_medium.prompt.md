You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-luna; reasoning_effort=medium; species=dwarf; class=archivist.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: knowledge_access_event_capture_v0
kind: workflow
status: active
title: Knowledge Access Event Capture v0
summary: Normalize and analyze metadata-only knowledge access ledger/register entries for existing knowledge nodes, packets, concepts, workflows, skills, missions, user tasks, tools, and advisory handoffs so later workflows can compute usage counts, retention labels, relation strength, orphan/redundant candidates, and graph update packets.
entrypoint: run
execution_mode: local_tool_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
inputs:
  - knowledge_access_scope
  - knowledge_node_ref_set
  - knowledge_access_ledger_refs
  - retention_label_policy
optional_inputs:
  - access_event_source_refs
  - sourcebound_knowledge_packet_refs
  - concept_candidate_register_refs
  - workflowization_review_packet_refs
  - mission_or_run_context_refs
  - prior_access_event_log_refs
  - prior_usage_rollup_refs
  - prior_knowledge_accumulation_delta_refs
  - owner_decision_refs
outputs:
  - project_binding
  - knowledge_access_event_batch
  - normalized_access_event_log
  - usage_rollup
  - retention_label_packet
  - link_strength_analysis
  - knowledge_accumulation_delta
  - graph_update_packet
  - orphan_redundancy_candidate_register
  - boundary_review_note
validation_level: reviewed_public_safe_draft
registration_policy: owner_requested_registration
upstream_workflows:
  - workflow_id: sourcebound_knowledge_packet_operating_loop_v0
    expected_outputs:
      - sourcebound_knowledge_packet_manifest
      - compiled_projection_index
      - concept_candidate_register
      - workflowization_review_packet
    status: optional_knowledge_node_source
  - workflow_id: owner_decision_packet_v0
    expected_outputs:
      - scoped_owner_decision
    status: optional_retention_or_archive_authority
downstream_workflows:
  - workflow_id: sourcebound_knowledge_packet_operating_loop_v0
    expected_input: hot_or_orphan_knowledge_refs_for_recheck_or_workflowization_context
    status: optional_rerun_context
  - workflow_id: source_packet_sufficiency_review_v0
    expected_input: stale_or_weakly_used_claim_refs_requiring_source_or_claim_ceiling_review
    status: optional_review_trigger
  - workflow_id: owner_decision_packet_v0
    expected_input: archive_retire_or_redundancy_candidate_needing_owner_decision
    status: required_before_archive_or_retire_action
  - workflow_id: post_development_review_gate_v0
    expected_input: workflow_or_retention_policy_change_packet
    status: required_before_public_or_canon_policy_change
knowledge_access_contract:
  owns:
    - knowledge_access_ledger_entry_shape
    - access_event_record_shape
    - capture_mode_metadata_shape
    - actor_target_context_metadata_shape
    - normalized_access_event_log_shape
    - usage_rollup_shape
    - retention_label_candidate_shape
    - link_strength_candidate_shape
    - knowledge_accumulation_delta_shape
    - graph_update_packet_shape
    - access_boundary_review_shape
  does_not_own:
    - raw_source_truth
    - private_knowledge_payloads
    - knowledge_packet_content_authority
    - ledger_storage_runtime_owner
    - ontology_canon_acceptance
    - workflow_canon_acceptance_without_review
    - archive_or_retire_execution
    - owner_decision_authority
    - profile_optimization
  access_event_required_fields:
    - event_id
    - timestamp_utc
    - capture_mode
    - actor.type
    - actor.id
    - target.knowledge_ref
    - access_type
    - work_context
    - outcome_state
  access_event_optional_fields:
    - ledger_ref
    - event_source_ref
    - manual_agent_note
    - reason_used
    - output_ref
    - accumulation_delta_hint
  capture_modes:
    - manual_agent_entry
    - router_appended
    - search_tool_appended
    - workflow_appended
    - automatic_end_of_task_trigger_check
    - imported_log_entry
  ledger_register_operating_model:
    primary_low_friction_record: knowledge_access_ledger_entry
    ordinary_work_capture: append_metadata_row_when_a_knowledge_ref_is_used
    workflow_run_requirement: not_required_for_each_access
    workflow_role: periodic_or_explicit_normalization_rollup_analysis_and_routing
    early_operation: agent_authored_manual_ledger_entries
    later_automation: routers_search_and_tooling_may_append_equivalent_events
    ledger_entries_are_signals_not_authority: true
  actor_types:
    - workflow
    - skill
    - mission
    - user
    - tool
    - advisory_handoff
  access_types:
    - read
    - cite
    - summarize
    - route
    - promote
    - compare
    - validate
    - advisory_handoff
    - graph_update
    - retention_review
  outcome_states:
    - useful
    - partially_useful
    - not_useful
    - blocked
    - routed
    - promoted
    - superseded
    - unknown
  relation_hint_fields:
    - relevance_score_hint
    - strength_hint
    - confidence_hint
    - relation_type_hint
    - duplicate_or_redundant_with
    - orphan_reason_hint
  retention_label_candidates:
    - hot
    - warm
    - cold
    - stale
    - archive_candidate
    - retire_candidate
  link_strength_candidates:
    - strong
    - weak
    - orphan
    - redundant
    - review_required
  authority_boundary:
    access_event_is_metadata_not_source_truth: true
    ledger_entry_is_metadata_not_source_truth: true
    target_ref_points_to_existing_knowledge_not_copied_payload: true
    usage_count_is_signal_not_acceptance: true
    retention_label_is_candidate_until_owner_policy_accepts: true
    archive_or_retire_requires_owner_decision_or_policy_gate: true
    knowledge_accumulation_delta_is_candidate_signal_not_acceptance: true
    graph_weight_is_navigation_signal_not_truth_score: true
    advisory_handoff_is_context_not_authority: true
    workflow_not_required_for_each_access: true
    public_package_payload_free: true
  required_output_shapes:
    project_binding: templates/project_binding.template.yaml
    knowledge_access_event: templates/knowledge_access_event.template.yaml
    normalized_access_event_log: templates/normalized_access_event_log.template.yaml
    usage_rollup: templates/usage_rollup.template.yaml
    retention_label_packet: templates/retention_label_packet.template.yaml
    link_strength_analysis: templates/link_strength_analysis.template.yaml
    knowledge_accumulation_delta: templates/knowledge_accumulation_delta.template.yaml
    orphan_redundancy_candidate_register: templates/orphan_redundancy_candidate_register.template.yaml
    graph_update_packet: templates/graph_update_packet.template.yaml
    boundary_review_note: templates/boundary_review_note.template.yaml
notes:
  - During ordinary work, agents or tooling append lightweight metadata-only ledger/register rows when a knowledge ref is used; this workflow is the later normalization, rollup, analysis, and routing lane for those rows.
  - This workflow must not copy source text, private packet payloads, advisory answers, credentials, or local runtime paths into public workflow canon.
  - Labels such as hot, warm, cold, stale, archive candidate, retire candidate, strong, weak, orphan, and redundant are candidate signals until a project policy or owner decision accepts an action.
  - Output packets are designed to feed later graph or Obsidian-style visualization by carrying stable node refs, edge refs, event ids, counts, recency, outcome states, and confidence hints.
  - Knowledge accumulation deltas capture metadata-only changes in observed usage or candidate linkage; they are not ontology acceptance, source truth, or canon promotion.
  - The workflow is not profile-optimized and does not claim production readiness.


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: knowledge_access_event_capture_v0
kind: step_graph
status: active
steps:
  - step_id: bind_access_capture_scope
    title: Bind Access Capture Scope
    actor_slot: capture_scope_binder
    action:
      kind: knowledge_access_scope_binding
      requires:
        - knowledge_access_scope
        - knowledge_node_ref_set
        - knowledge_access_ledger_refs
        - retention_label_policy
      validates:
        - target_refs_are_existing_knowledge_refs
        - private_ledger_or_project_output_ref_declared
        - public_package_payload_free
        - archive_retire_authority_declared
        - profile_optimization_out_of_scope
    summary: Resolve which knowledge refs and ledger/register sources are in scope before any access row is normalized.
    next:
      on_success: collect_access_event_candidates
      on_fail: stop
  - step_id: collect_access_event_candidates
    title: Collect Ledger Entry Candidates
    actor_slot: event_collector
    action:
      kind: metadata_only_ledger_entry_collection
      artifacts_in:
        - knowledge_access_scope
        - knowledge_access_ledger_refs
        - access_event_source_refs
        - mission_or_run_context_refs
        - sourcebound_knowledge_packet_refs
        - concept_candidate_register_refs
        - workflowization_review_packet_refs
      artifacts_out:
        - knowledge_access_event_batch
      allowed_content:
        - event_id
        - stable_actor_ref
        - stable_target_ref
        - capture_mode
        - access_type
        - work_context_ref
        - timestamp
        - reason_used
        - output_ref
        - outcome_state
        - usefulness_signal
        - relation_hint
      forbidden_content:
        - raw_source_text
        - private_knowledge_payload
        - copied_advisory_answer
        - credentials_or_sessions
        - host_absolute_path
    summary: Ingest candidate ledger/register rows from approved metadata surfaces without copying the accessed knowledge payload.
    next:
      on_success: normalize_access_events
      on_fail: stop
  - step_id: normalize_access_events
    title: Normalize Access Events
    actor_slot: event_normalizer
    action:
      kind: access_event_schema_normalization
      artifacts_in:
        - knowledge_access_event_batch
      artifact_out: normalized_access_event_log
      required_fields:
        - event_id
        - timestamp_utc
        - capture_mode
        - actor.type
        - actor.id
        - target.knowledge_ref
        - access_type
        - work_context
        - outcome_state
      normalization_rules:
        timestamp_utc_required: true
        capture_mode_enum_required: true
        actor_type_enum_required: true
        access_type_enum_required: true
        target_ref_must_be_stable_id_or_repo_relative_ref: true
        duplicate_event_keys_flagged_not_silently_merged: true
    summary: Convert ledger/register candidates into a stable event log with required capture mode, actor, target, context, time, and outcome fields.
    next:
      on_success: boundary_redaction_review
      on_fail: stop
  - step_id: boundary_redaction_review
    title: Boundary Redaction Review
    actor_slot: boundary_reviewer
    action:
      kind: public_private_boundary_and_payload_review
      artifacts_in:
        - normalized_access_event_log
      artifacts_out:
        - normalized_access_event_log
        - boundary_review_note
      checks:
        - no_raw_source_truth
        - no_private_payload
        - no_secret
        - no_host_absolute_path
        - no_advisory_answer_as_authority
        - no_archive_retire_execution_claim
    summary: Ensure ledger entries and normalized events remain metadata-only and safe for downstream rollups or graph packets.
    next:
      on_success: aggregate_usage_counts
      on_fail: stop
  - step_id: aggregate_usage_counts
    title: Aggregate Usage Counts
    actor_slot: usage_aggregator
    action:
      kind: usage_rollup_by_target_actor_context
      artifacts_in:
        - normalized_access_event_log
        - prior_usage_rollup_refs
      artifact_out: usage_rollup
      rollup_dimensions:
        - target.knowledge_ref
        - actor.type
        - actor.id
        - access_type
        - work_context.workflow_id
        - work_context.mission_id
        - work_context.run_id
        - outcome_state
        - time_window
      count_semantics:
        count_is_signal_not_truth: true
        duplicate_suspects_are_reported: true
        blocked_events_count_separately: true
    summary: Produce portable count and recency signals for each knowledge target without mutating the target itself.
    next:
      on_success: classify_retention_labels
      on_fail: stop
  - step_id: classify_retention_labels
    title: Classify Retention Labels
    actor_slot: retention_labeler
    action:
      kind: candidate_retention_label_assignment
      artifacts_in:
        - usage_rollup
        - retention_label_policy
        - owner_decision_refs
      artifact_out: retention_label_packet
      candidate_labels:
        - hot
        - warm
        - cold
        - stale
        - archive_candidate
        - retire_candidate
      rules:
        labels_are_candidates: true
        archive_retire_requires_owner_decision_or_declared_policy: true
        stale_can_trigger_review_not_deletion: true
        promoted_or_recently_useful_events_raise_temperature: true
        blocked_or_not_useful_events_lower_confidence_not_truth: true
    summary: Convert usage, recency, and outcome signals into reviewable retention labels.
    next:
      on_success: analyze_relation_strength
      on_fail: stop
  - step_id: analyze_relation_strength
    title: Analyze Relation Strength
    actor_slot: relation_analyst
    action:
      kind: link_strength_and_orphan_redundancy_analysis
      artifacts_in:
        - normalized_access_event_log
        - usage_rollup
        - retention_label_packet
      artifacts_out:
        - link_strength_analysis
        - orphan_redundancy_candidate_register
      link_states:
        - strong
        - weak
        - orphan
        - redundant
        - review_required
      analysis_rules:
        repeated_useful_access_strengthens_link: true
        cite_promote_validate_access_has_higher_weight_than_read_only: true
        no_recent_access_can_suggest_orphan_review: true
        duplicate_or_redundant_hints_require_review: true
        graph_weight_is_navigation_signal_not_truth_score: true
    summary: Identify strong, weak, orphan, redundant, or review-required link candidates using event metadata and usefulness signals.
    next:
      on_success: assemble_knowledge_accumulation_delta
      on_fail: stop
  - step_id: assemble_knowledge_accumulation_delta
    title: Assemble Knowledge Accumulation Delta
    actor_slot: graph_packet_author
    action:
      kind: metadata_only_knowledge_accumulation_delta_assembly
      artifacts_in:
        - normalized_access_event_log
        - usage_rollup
        - link_strength_analysis
        - orphan_redundancy_candidate_register
        - prior_knowledge_accumulation_delta_refs
      artifact_out: knowledge_accumulation_delta
      delta_rules:
        delta_is_candidate_signal_not_acceptance: true
        no_raw_knowledge_text: true
        no_private_packet_content: true
        no_ontology_acceptance: true
        no_canon_promotion: true
    summary: Produce metadata-only candidate deltas for observed usage, linkage, or routing changes without accepting ontology or canon.
    next:
      on_success: assemble_graph_update_packet
      on_fail: stop
  - step_id: assemble_graph_update_packet
    title: Assemble Graph Update Packet
    actor_slot: graph_packet_author
    action:
      kind: portable_graph_update_packet_assembly
      artifacts_in:
        - normalized_access_event_log
        - usage_rollup
        - retention_label_packet
        - link_strength_analysis
        - orphan_redundancy_candidate_register
      artifact_out: graph_update_packet
      graph_payload:
        nodes:
          - knowledge_ref
          - node_type
          - retention_label_candidate
          - access_count_summary
          - last_access_timestamp_utc
        edges:
          - actor_ref_to_knowledge_ref
          - context_ref_to_knowledge_ref
          - knowledge_ref_to_knowledge_ref
          - strength_candidate
          - evidence_event_ids
      export_targets:
        - jsonl
        - csv
        - graphml_candidate
        - obsidian_link_note_candidate
      forbidden_payloads:
        - raw_knowledge_text
        - private_packet_content
        - secret
        - runtime_absolute_path
    summary: Package node and edge update suggestions for later graph visualization without taking ownership of the graph store.
    next:
      on_success: route_review_and_downstream
      on_fail: stop
  - step_id: route_review_and_downstream
    title: Route Review And Downstream
    actor_slot: downstream_router
    action:
      kind: retention_graph_and_review_routing
      artifacts_in:
        - retention_label_packet
        - link_strength_analysis
        - knowledge_accumulation_delta
        - graph_update_packet
        - boundary_review_note
      routes:
        - owner_decision_packet_v0
        - source_packet_sufficiency_review_v0
        - sourcebound_knowledge_packet_operating_loop_v0
        - post_development_review_gate_v0
        - hold_private
      route_rules:
        archive_or_retire_candidate_goes_to_owner_decision: true
        weak_or_stale_claim_refs_can_trigger_sufficiency_review: true
        hot_or_orphan_knowledge_refs_can_trigger_sourcebound_recheck: true
        public_policy_change_requires_post_development_review: true
    summary: Route candidates to review, source recheck, owner decision, or private hold without executing archive or canon changes.
    next:
      on_success: complete
      on_fail: stop


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "workflow_id": "knowledge_access_event_capture_v0",
  "fixture_id": "PUBLIC_SYNTH_KNOWLEDGE_ACCESS_EVENT_CAPTURE_V0",
  "source_kind": "synthetic_from_workflow_contract_metadata_only",
  "public_safe": true,
  "workflow_title": "Knowledge Access Event Capture v0",
  "workflow_summary": "Normalize and analyze metadata-only knowledge access ledger/register entries for existing knowledge nodes, packets, concepts, workflows, skills, missions, user tasks, tools, and advisory handoffs so later workflows can compute usage counts, retention labels, relation strength, orphan/redundant candidates, and graph update packets.",
  "workflow_readiness_label": "draft",
  "input_refs": [
    "knowledge_access_scope",
    "knowledge_node_ref_set",
    "knowledge_access_ledger_refs",
    "retention_label_policy"
  ],
  "expected_output_groups": [
    "project_binding",
    "knowledge_access_event_batch",
    "normalized_access_event_log",
    "usage_rollup",
    "retention_label_packet",
    "link_strength_analysis",
    "knowledge_accumulation_delta",
    "graph_update_packet",
    "orphan_redundancy_candidate_register",
    "boundary_review_note"
  ],
  "must_preserve": [
    "metadata-only",
    "retention",
    "graph update",
    "boundary",
    "not source truth"
  ],
  "scenario_facts": [
    "three metadata-only access events",
    "one hot retention label",
    "one orphan candidate edge",
    "one graph update packet candidate"
  ],
  "boundary_policy": [
    "Do not claim tool use, file edits, runtime paths, or hidden private evidence.",
    "Do not mutate upstream artifacts or promote stronger source/canon authority than the contract supports.",
    "Keep public-safe synthetic boundaries explicit."
  ]
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
