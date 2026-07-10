workflow_deliverable:
  workflow_id: knowledge_access_event_capture_v0
  fixture_id: PUBLIC_SYNTH_KNOWLEDGE_ACCESS_EVENT_CAPTURE_V0
  deliverable_status: reviewed_public_safe_draft
  source_kind: synthetic_from_workflow_contract_metadata_only
  public_safe: true

  project_binding:
    project_ref: synth_project:knowledge_access_calibration
    scope_ref: synth_scope:knowledge_access_capture
    knowledge_node_refs:
      - synth_knowledge:node_alpha
      - synth_knowledge:node_beta
      - synth_knowledge:node_gamma
    ledger_refs:
      - synth_ledger:public_access_register
    retention_policy_ref: synth_policy:retention_candidate_policy
    archive_retire_authority: owner_decision_required
    profile_optimization: out_of_scope
    binding_state: bounded
    uncertainty:
      - Synthetic timestamps, actors, contexts, and outcomes are fixture-local examples.
      - No underlying knowledge payload or source truth is represented.

  knowledge_access_event_batch:
    batch_id: synth_batch:access_events_001
    event_count: 3
    events:
      - event_id: synth_event:001
        timestamp_utc: "2026-07-01T09:00:00Z"
        capture_mode: manual_agent_entry
        actor:
          type: workflow
          id: synth_workflow:consumer_alpha
        target:
          knowledge_ref: synth_knowledge:node_alpha
        access_type: validate
        work_context:
          workflow_id: synth_workflow:consumer_alpha
          mission_id: null
          run_id: synth_run:001
        reason_used: synth_reason:validation_context
        output_ref: synth_output:validation_note
        outcome_state: useful
        relation_hint:
          strength_hint: strong
          confidence_hint: medium

      - event_id: synth_event:002
        timestamp_utc: "2026-07-02T10:00:00Z"
        capture_mode: workflow_appended
        actor:
          type: skill
          id: synth_skill:consumer_beta
        target:
          knowledge_ref: synth_knowledge:node_alpha
        access_type: cite
        work_context:
          workflow_id: synth_workflow:consumer_beta
          mission_id: null
          run_id: synth_run:002
        reason_used: synth_reason:citation_context
        output_ref: synth_output:citation_record
        outcome_state: useful
        relation_hint:
          strength_hint: strong
          confidence_hint: medium

      - event_id: synth_event:003
        timestamp_utc: "2026-07-03T11:00:00Z"
        capture_mode: imported_log_entry
        actor:
          type: tool
          id: synth_tool:router_gamma
        target:
          knowledge_ref: synth_knowledge:node_beta
        access_type: route
        work_context:
          workflow_id: synth_workflow:routing_context
          mission_id: null
          run_id: synth_run:003
        reason_used: synth_reason:routing_context
        output_ref: synth_output:routing_record
        outcome_state: routed
        relation_hint:
          relation_type_hint: synth_relation:possible_link_to_node_gamma
          orphan_reason_hint: no_supporting_access_event_for_candidate_edge
          confidence_hint: low

  normalized_access_event_log:
    log_id: synth_log:normalized_access_events_001
    normalization_state: complete_for_synthetic_fixture
    event_count: 3
    duplicate_suspect_event_ids: []
    events:
      - event_id: synth_event:001
        timestamp_utc: "2026-07-01T09:00:00Z"
        capture_mode: manual_agent_entry
        actor:
          type: workflow
          id: synth_workflow:consumer_alpha
        target:
          knowledge_ref: synth_knowledge:node_alpha
        access_type: validate
        work_context:
          workflow_id: synth_workflow:consumer_alpha
          mission_id: null
          run_id: synth_run:001
        outcome_state: useful

      - event_id: synth_event:002
        timestamp_utc: "2026-07-02T10:00:00Z"
        capture_mode: workflow_appended
        actor:
          type: skill
          id: synth_skill:consumer_beta
        target:
          knowledge_ref: synth_knowledge:node_alpha
        access_type: cite
        work_context:
          workflow_id: synth_workflow:consumer_beta
          mission_id: null
          run_id: synth_run:002
        outcome_state: useful

      - event_id: synth_event:003
        timestamp_utc: "2026-07-03T11:00:00Z"
        capture_mode: imported_log_entry
        actor:
          type: tool
          id: synth_tool:router_gamma
        target:
          knowledge_ref: synth_knowledge:node_beta
        access_type: route
        work_context:
          workflow_id: synth_workflow:routing_context
          mission_id: null
          run_id: synth_run:003
        outcome_state: routed
    normalization_nonclaims:
      - Events are metadata signals, not source truth.
      - No duplicate merging was required.
      - No target payload was copied or assessed.

  usage_rollup:
    rollup_id: synth_rollup:usage_001
    time_window:
      start_utc: "2026-07-01T09:00:00Z"
      end_utc: "2026-07-03T11:00:00Z"
      basis: synthetic_event_timestamps
    total_event_count: 3
    blocked_event_count: 0
    duplicate_suspect_count: 0
    targets:
      - knowledge_ref: synth_knowledge:node_alpha
        access_count: 2
        last_access_timestamp_utc: "2026-07-02T10:00:00Z"
        outcome_counts:
          useful: 2
        access_type_counts:
          validate: 1
          cite: 1
        actor_type_counts:
          workflow: 1
          skill: 1

      - knowledge_ref: synth_knowledge:node_beta
        access_count: 1
        last_access_timestamp_utc: "2026-07-03T11:00:00Z"
        outcome_counts:
          routed: 1
        access_type_counts:
          route: 1
        actor_type_counts:
          tool: 1

      - knowledge_ref: synth_knowledge:node_gamma
        access_count: 0
        last_access_timestamp_utc: null
        outcome_counts: {}
        access_type_counts: {}
        actor_type_counts: {}
    count_semantics: usage_signal_not_truth_or_acceptance

  retention_label_packet:
    packet_id: synth_packet:retention_001
    policy_ref: synth_policy:retention_candidate_policy
    labels:
      - knowledge_ref: synth_knowledge:node_alpha
        retention_label_candidate: hot
        evidence_event_ids:
          - synth_event:001
          - synth_event:002
        rationale:
          - repeated_useful_access
          - cite_or_validate_access_present
        confidence_hint: medium
        acceptance_state: candidate_only

      - knowledge_ref: synth_knowledge:node_beta
        retention_label_candidate: null
        evidence_event_ids:
          - synth_event:003
        rationale:
          - insufficient_fixture_evidence_for_retention_classification
        confidence_hint: low
        acceptance_state: unresolved

      - knowledge_ref: synth_knowledge:node_gamma
        retention_label_candidate: null
        evidence_event_ids: []
        rationale:
          - absence_of_access_is_insufficient_without_policy_thresholds
        confidence_hint: low
        acceptance_state: unresolved
    archive_or_retire_actions: none
    owner_decision_required_for_archive_or_retire: true

  link_strength_analysis:
    analysis_id: synth_analysis:link_strength_001
    links:
      - edge_ref: synth_edge:consumer_alpha_to_node_alpha
        source_ref: synth_workflow:consumer_alpha
        target_ref: synth_knowledge:node_alpha
        strength_candidate: strong
        evidence_event_ids:
          - synth_event:001
        confidence_hint: medium

      - edge_ref: synth_edge:consumer_beta_to_node_alpha
        source_ref: synth_skill:consumer_beta
        target_ref: synth_knowledge:node_alpha
        strength_candidate: strong
        evidence_event_ids:
          - synth_event:002
        confidence_hint: medium

      - edge_ref: synth_edge:node_beta_to_node_gamma
        source_ref: synth_knowledge:node_beta
        target_ref: synth_knowledge:node_gamma
        strength_candidate: orphan
        evidence_event_ids:
          - synth_event:003
        confidence_hint: low
        review_reason: candidate_relation_has_no_supporting_target_access_event
    interpretation_boundary: navigation_signal_not_truth_score

  orphan_redundancy_candidate_register:
    register_id: synth_register:orphan_redundancy_001
    candidates:
      - candidate_id: synth_candidate:orphan_001
        edge_ref: synth_edge:node_beta_to_node_gamma
        candidate_state: orphan
        evidence_event_ids:
          - synth_event:003
        confidence_hint: low
        required_disposition: review
        prohibited_automatic_actions:
          - delete_edge
          - archive_node
          - retire_node
          - accept_ontology_relation
    redundant_candidates: []

  knowledge_accumulation_delta:
    delta_id: synth_delta:knowledge_accumulation_001
    candidate_changes:
      - change_id: synth_change:usage_node_alpha
        change_type: observed_usage
        knowledge_ref: synth_knowledge:node_alpha
        event_count_delta: 2
        evidence_event_ids:
          - synth_event:001
          - synth_event:002

      - change_id: synth_change:usage_node_beta
        change_type: observed_usage
        knowledge_ref: synth_knowledge:node_beta
        event_count_delta: 1
        evidence_event_ids:
          - synth_event:003

      - change_id: synth_change:orphan_edge_review
        change_type: candidate_linkage_review
        edge_ref: synth_edge:node_beta_to_node_gamma
        candidate_state: orphan
        evidence_event_ids:
          - synth_event:003
    acceptance_state: candidate_signal_only
    ontology_acceptance: none
    canon_promotion: none

  graph_update_packet:
    packet_id: synth_packet:graph_update_001
    packet_state: candidate
    nodes:
      - knowledge_ref: synth_knowledge:node_alpha
        node_type: synthetic_knowledge_node
        retention_label_candidate: hot
        access_count_summary: 2
        last_access_timestamp_utc: "2026-07-02T10:00:00Z"

      - knowledge_ref: synth_knowledge:node_beta
        node_type: synthetic_knowledge_node
        retention_label_candidate: null
        access_count_summary: 1
        last_access_timestamp_utc: "2026-07-03T11:00:00Z"

      - knowledge_ref: synth_knowledge:node_gamma
        node_type: synthetic_knowledge_node
        retention_label_candidate: null
        access_count_summary: 0
        last_access_timestamp_utc: null

    edges:
      - edge_ref: synth_edge:consumer_alpha_to_node_alpha
        source_ref: synth_workflow:consumer_alpha
        target_ref: synth_knowledge:node_alpha
        relation_kind: actor_ref_to_knowledge_ref
        strength_candidate: strong
        evidence_event_ids:
          - synth_event:001

      - edge_ref: synth_edge:consumer_beta_to_node_alpha
        source_ref: synth_skill:consumer_beta
        target_ref: synth_knowledge:node_alpha
        relation_kind: actor_ref_to_knowledge_ref
        strength_candidate: strong
        evidence_event_ids:
          - synth_event:002

      - edge_ref: synth_edge:node_beta_to_node_gamma
        source_ref: synth_knowledge:node_beta
        target_ref: synth_knowledge:node_gamma
        relation_kind: knowledge_ref_to_knowledge_ref
        strength_candidate: orphan
        evidence_event_ids:
          - synth_event:003
        review_required: true

    eligible_export_shapes:
      - jsonl
      - csv
      - graphml_candidate
      - obsidian_link_note_candidate
    graph_store_mutation: none
    graph_weight_semantics: navigation_signal_not_truth_score

  boundary_review_note:
    review_id: synth_review:boundary_001
    review_state: public_safe_synthetic_draft
    findings:
      metadata_only: preserved
      raw_source_truth_included: false
      private_payload_included: false
      advisory_answer_included: false
      credentials_or_sessions_included: false
      host_absolute_path_included: false
      archive_or_retire_execution_claimed: false
      ontology_or_canon_acceptance_claimed: false
    authority_boundaries:
      - Access events and ledger entries are metadata signals.
      - Usage counts do not establish truth, acceptance, or importance.
      - Retention and link-strength labels remain candidates.
      - The orphan edge requires review and is not a deletion instruction.
      - The graph update packet is portable advice, not a graph-store mutation.
      - Archive, retire, ontology, canon, and policy changes require their declared authority gates.
    explicit_uncertainty:
      - Fixture-local timestamps and contextual identifiers are synthetic.
      - No prior rollup, prior delta, or owner-decision evidence was supplied.
      - The retention policy contains no numeric thresholds in the fixture.
      - Node beta and node gamma therefore receive no retention label.
      - The orphan classification is a low-confidence review signal derived only from synthetic metadata.

  downstream_routing:
    - subject_ref: synth_edge:node_beta_to_node_gamma
      route: sourcebound_knowledge_packet_operating_loop_v0
      route_state: candidate
      reason: orphan_candidate_recheck
      action_executed: false

    - subject_ref: synth_knowledge:node_alpha
      route: hold_private
      route_state: candidate
      reason: hot_label_requires_no_authority_action
      action_executed: false

  stop_conditions:
    - Stop before archive or retire action without an owner decision or accepted policy gate.
    - Stop before ontology, canon, or public-policy acceptance.
    - Stop if normalization requires raw knowledge payloads, private evidence, secrets, or runtime paths.
    - Stop if a required event field cannot be represented without invention.
    - Stop before graph-store mutation; this deliverable provides candidate updates only.
