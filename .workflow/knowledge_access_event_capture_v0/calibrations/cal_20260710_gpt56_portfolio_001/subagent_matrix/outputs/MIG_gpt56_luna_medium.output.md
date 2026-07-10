```yaml
workflow_id: knowledge_access_event_capture_v0
fixture_id: PUBLIC_SYNTH_KNOWLEDGE_ACCESS_EVENT_CAPTURE_V0
deliverable_id: PUBLIC_SYNTH_DELIVERABLE_KAEC_V0_001
public_safe: true
payload_class: metadata_only
authority_status: candidate_signals_only

project_binding:
  binding_id: PUBLIC_SYNTH_BINDING_KAEC_V0_001
  knowledge_access_scope_ref: PUBLIC_SYNTH_SCOPE_001
  knowledge_node_ref_set:
    - PUBLIC_SYNTH_KNOWLEDGE_NODE_001
    - PUBLIC_SYNTH_KNOWLEDGE_NODE_002
    - PUBLIC_SYNTH_KNOWLEDGE_NODE_003
  knowledge_access_ledger_refs:
    - PUBLIC_SYNTH_LEDGER_001
  retention_label_policy_ref: PUBLIC_SYNTH_RETENTION_POLICY_001
  archive_retire_authority: owner_decision_or_declared_policy_required
  private_output_ref_declared: true
  source_truth_included: false
  profile_optimization_in_scope: false

knowledge_access_event_batch:
  batch_id: PUBLIC_SYNTH_EVENT_BATCH_001
  events:
    - event_id: PUBLIC_SYNTH_ACCESS_EVENT_001
      timestamp_utc: "2026-07-10T01:00:00Z"
      capture_mode: manual_agent_entry
      actor:
        type: workflow
        id: PUBLIC_SYNTH_WORKFLOW_001
      target:
        knowledge_ref: PUBLIC_SYNTH_KNOWLEDGE_NODE_001
      access_type: cite
      work_context:
        workflow_id: knowledge_access_event_capture_v0
        mission_id: PUBLIC_SYNTH_MISSION_001
        run_id: PUBLIC_SYNTH_RUN_001
      outcome_state: useful
      reason_used: PUBLIC_SYNTH_REASON_001
      usefulness_signal: positive
      relation_hint:
        relevance_score_hint: high
        strength_hint: strong
        confidence_hint: medium
        relation_type_hint: supports

    - event_id: PUBLIC_SYNTH_ACCESS_EVENT_002
      timestamp_utc: "2026-07-09T01:00:00Z"
      capture_mode: workflow_appended
      actor:
        type: skill
        id: PUBLIC_SYNTH_SKILL_001
      target:
        knowledge_ref: PUBLIC_SYNTH_KNOWLEDGE_NODE_002
      access_type: read
      work_context:
        workflow_id: knowledge_access_event_capture_v0
        mission_id: PUBLIC_SYNTH_MISSION_001
        run_id: PUBLIC_SYNTH_RUN_001
      outcome_state: partially_useful
      reason_used: PUBLIC_SYNTH_REASON_002
      usefulness_signal: mixed
      relation_hint:
        relevance_score_hint: medium
        strength_hint: weak
        confidence_hint: low
        relation_type_hint: references

    - event_id: PUBLIC_SYNTH_ACCESS_EVENT_003
      timestamp_utc: "2026-07-01T01:00:00Z"
      capture_mode: imported_log_entry
      actor:
        type: mission
        id: PUBLIC_SYNTH_MISSION_001
      target:
        knowledge_ref: PUBLIC_SYNTH_KNOWLEDGE_NODE_003
      access_type: route
      work_context:
        workflow_id: knowledge_access_event_capture_v0
        mission_id: PUBLIC_SYNTH_MISSION_001
        run_id: PUBLIC_SYNTH_RUN_001
      outcome_state: routed
      reason_used: PUBLIC_SYNTH_REASON_003
      usefulness_signal: unknown
      relation_hint:
        relevance_score_hint: unknown
        strength_hint: orphan
        confidence_hint: low
        relation_type_hint: candidate_route
        orphan_reason_hint: no_confirmed_followup_link

normalized_access_event_log:
  log_id: PUBLIC_SYNTH_NORMALIZED_LOG_001
  normalization_status: normalized_with_uncertainty
  duplicate_suspects: []
  events_ref:
    - PUBLIC_SYNTH_ACCESS_EVENT_001
    - PUBLIC_SYNTH_ACCESS_EVENT_002
    - PUBLIC_SYNTH_ACCESS_EVENT_003
  required_fields_present: true
  stable_target_refs: true
  source_payload_copied: false

usage_rollup:
  rollup_id: PUBLIC_SYNTH_USAGE_ROLLUP_001
  count_is_signal_not_truth: true
  time_window:
    start_utc: "2026-07-01T00:00:00Z"
    end_utc: "2026-07-10T23:59:59Z"
  targets:
    - knowledge_ref: PUBLIC_SYNTH_KNOWLEDGE_NODE_001
      access_count: 1
      useful_count: 1
      blocked_count: 0
      last_access_timestamp_utc: "2026-07-10T01:00:00Z"
      confidence_hint: medium

    - knowledge_ref: PUBLIC_SYNTH_KNOWLEDGE_NODE_002
      access_count: 1
      useful_count: 0
      partially_useful_count: 1
      blocked_count: 0
      last_access_timestamp_utc: "2026-07-09T01:00:00Z"
      confidence_hint: low

    - knowledge_ref: PUBLIC_SYNTH_KNOWLEDGE_NODE_003
      access_count: 1
      useful_count: 0
      blocked_count: 0
      routed_count: 1
      last_access_timestamp_utc: "2026-07-01T01:00:00Z"
      confidence_hint: low

retention_label_packet:
  packet_id: PUBLIC_SYNTH_RETENTION_PACKET_001
  labels_are_candidates: true
  candidates:
    - knowledge_ref: PUBLIC_SYNTH_KNOWLEDGE_NODE_001
      retention_label_candidate: hot
      basis_event_ids:
        - PUBLIC_SYNTH_ACCESS_EVENT_001
      basis: recent_useful_access
      confidence_hint: medium
      owner_acceptance_required: false

    - knowledge_ref: PUBLIC_SYNTH_KNOWLEDGE_NODE_002
      retention_label_candidate: warm
      basis_event_ids:
        - PUBLIC_SYNTH_ACCESS_EVENT_002
      basis: recent_partial_usefulness
      confidence_hint: low
      owner_acceptance_required: false

    - knowledge_ref: PUBLIC_SYNTH_KNOWLEDGE_NODE_003
      retention_label_candidate: stale
      basis_event_ids:
        - PUBLIC_SYNTH_ACCESS_EVENT_003
      basis: older_routed_event_without_confirmed_usefulness
      confidence_hint: low
      owner_acceptance_required: false
      deletion_or_archive_claim: false

link_strength_analysis:
  analysis_id: PUBLIC_SYNTH_LINK_ANALYSIS_001
  graph_weight_is_navigation_signal_not_truth_score: true
  candidates:
    - edge_id: PUBLIC_SYNTH_EDGE_001
      from_ref: PUBLIC_SYNTH_WORKFLOW_001
      to_ref: PUBLIC_SYNTH_KNOWLEDGE_NODE_001
      link_strength_candidate: strong
      basis_event_ids:
        - PUBLIC_SYNTH_ACCESS_EVENT_001
      confidence_hint: medium

    - edge_id: PUBLIC_SYNTH_EDGE_002
      from_ref: PUBLIC_SYNTH_SKILL_001
      to_ref: PUBLIC_SYNTH_KNOWLEDGE_NODE_002
      link_strength_candidate: weak
      basis_event_ids:
        - PUBLIC_SYNTH_ACCESS_EVENT_002
      confidence_hint: low

    - edge_id: PUBLIC_SYNTH_EDGE_003
      from_ref: PUBLIC_SYNTH_MISSION_001
      to_ref: PUBLIC_SYNTH_KNOWLEDGE_NODE_003
      link_strength_candidate: orphan
      basis_event_ids:
        - PUBLIC_SYNTH_ACCESS_EVENT_003
      orphan_reason_hint: no_confirmed_followup_link
      confidence_hint: low
      review_required: true

orphan_redundancy_candidate_register:
  register_id: PUBLIC_SYNTH_ORPHAN_REGISTER_001
  candidates:
    - candidate_id: PUBLIC_SYNTH_ORPHAN_CANDIDATE_001
      candidate_type: orphan
      edge_ref: PUBLIC_SYNTH_EDGE_003
      knowledge_ref: PUBLIC_SYNTH_KNOWLEDGE_NODE_003
      evidence_event_ids:
        - PUBLIC_SYNTH_ACCESS_EVENT_003
      action_status: review_only
      archive_or_retire_executed: false
  redundancy_candidates: []

knowledge_accumulation_delta:
  delta_id: PUBLIC_SYNTH_ACCUMULATION_DELTA_001
  delta_is_candidate_signal_not_acceptance: true
  changes:
    - delta_type: observed_usage
      knowledge_ref: PUBLIC_SYNTH_KNOWLEDGE_NODE_001
      access_event_ids:
        - PUBLIC_SYNTH_ACCESS_EVENT_001
      signal: recent_useful_access
    - delta_type: candidate_linkage
      knowledge_ref: PUBLIC_SYNTH_KNOWLEDGE_NODE_003
      edge_ref: PUBLIC_SYNTH_EDGE_003
      access_event_ids:
        - PUBLIC_SYNTH_ACCESS_EVENT_003
      signal: orphan_review_candidate
  ontology_acceptance: false
  canon_promotion: false
  raw_knowledge_text_included: false

graph_update_packet:
  packet_id: PUBLIC_SYNTH_GRAPH_UPDATE_001
  packet_status: candidate
  nodes:
    - knowledge_ref: PUBLIC_SYNTH_KNOWLEDGE_NODE_001
      node_type: knowledge_node
      retention_label_candidate: hot
      access_count_summary: 1
      last_access_timestamp_utc: "2026-07-10T01:00:00Z"
    - knowledge_ref: PUBLIC_SYNTH_KNOWLEDGE_NODE_002
      node_type: knowledge_node
      retention_label_candidate: warm
      access_count_summary: 1
      last_access_timestamp_utc: "2026-07-09T01:00:00Z"
    - knowledge_ref: PUBLIC_SYNTH_KNOWLEDGE_NODE_003
      node_type: knowledge_node
      retention_label_candidate: stale
      access_count_summary: 1
      last_access_timestamp_utc: "2026-07-01T01:00:00Z"
  edges:
    - edge_ref: PUBLIC_SYNTH_EDGE_001
      edge_type: actor_ref_to_knowledge_ref
      from_ref: PUBLIC_SYNTH_WORKFLOW_001
      to_ref: PUBLIC_SYNTH_KNOWLEDGE_NODE_001
      strength_candidate: strong
      evidence_event_ids:
        - PUBLIC_SYNTH_ACCESS_EVENT_001
    - edge_ref: PUBLIC_SYNTH_EDGE_002
      edge_type: actor_ref_to_knowledge_ref
      from_ref: PUBLIC_SYNTH_SKILL_001
      to_ref: PUBLIC_SYNTH_KNOWLEDGE_NODE_002
      strength_candidate: weak
      evidence_event_ids:
        - PUBLIC_SYNTH_ACCESS_EVENT_002
    - edge_ref: PUBLIC_SYNTH_EDGE_003
      edge_type: actor_ref_to_knowledge_ref
      from_ref: PUBLIC_SYNTH_MISSION_001
      to_ref: PUBLIC_SYNTH_KNOWLEDGE_NODE_003
      strength_candidate: orphan
      evidence_event_ids:
        - PUBLIC_SYNTH_ACCESS_EVENT_003
  export_candidates:
    - jsonl
    - csv
    - graphml_candidate
    - obsidian_link_note_candidate
  graph_store_mutation: false
  truth_score_claim: false

boundary_review_note:
  note_id: PUBLIC_SYNTH_BOUNDARY_NOTE_001
  status: boundary_preserved
  checks:
    raw_source_truth_included: false
    private_payload_included: false
    secrets_included: false
    runtime_absolute_paths_included: false
    advisory_answer_as_authority: false
    archive_or_retire_execution_claim: false
    ontology_acceptance_claim: false
    canon_promotion_claim: false
  uncertainty:
    - "Usefulness and relation confidence remain limited to synthetic metadata signals."
    - "Retention labels and link states remain candidates."
    - "No source sufficiency or target-content judgment is established."
  stop_conditions:
    - stop_on_missing_required_event_fields
    - stop_on_unstable_target_ref
    - stop_on_private_or_raw_payload_exposure
    - stop_before_archive_or_retire_without_owner_decision_or_policy_gate
    - stop_before_public_policy_or_canon_change_without_post_development_review

routing:
  routes:
    - route: sourcebound_knowledge_packet_operating_loop_v0
      trigger: hot_or_orphan_candidate
      refs:
        - PUBLIC_SYNTH_KNOWLEDGE_NODE_001
        - PUBLIC_SYNTH_KNOWLEDGE_NODE_003
      status: candidate_route
    - route: owner_decision_packet_v0
      trigger: archive_or_retire_candidate
      refs: []
      status: not_triggered
    - route: source_packet_sufficiency_review_v0
      trigger: weak_or_stale_claim_ref
      refs:
        - PUBLIC_SYNTH_KNOWLEDGE_NODE_002
        - PUBLIC_SYNTH_KNOWLEDGE_NODE_003
      status: candidate_route
    - route: post_development_review_gate_v0
      trigger: public_policy_or_workflow_change
      refs: []
      status: not_triggered
    - route: hold_private
      trigger: unresolved_boundary_or_owner_question
      refs: []
      status: available
  archive_or_retire_executed: false
  public_canon_changed: false
```
