source_gap_followup_packet:
  workflow_id: source_gap_followup_packet_v0
  fixture_id: source_gap_followup_packet_v0_public_synthetic_mixed_gap_dedup
  project_scope_key: public_source_gap_fixture
  source_mode: contract_only_synthetic
  public_safe: true
  authority:
    is_source_evidence: false
    owner_batch_is_source_evidence_before_reindex: false
    owning_workflow_must_reindex_new_sources: true
    unsupported_claims_remain_blocked_or_review_required: true
  summary:
    upstream_gap_count: 5
    aggregate_gap_count: 5
    owner_action_count: 4
    retry_ready_gap_count: 0
    owner_waiting_gap_count: 5
  aggregate_gaps:
    - aggregate_gap_id: AG-PUBLIC-001
      owning_workflow_id: official_source_packet_collect_v0
      source_kind: datasheet
      gap_family: blocked_access
      component_refdes: U1
      component_identity: FIXTURE-OPAMP-01
      upstream_gap_refs:
        - official:G001
      downstream_impact:
        - materials
        - quantitative
      current_state: owner_waiting
      blocking_levels:
        - blocks_materials
        - blocks_quantitative

    - aggregate_gap_id: AG-PUBLIC-002
      owning_workflow_id: page_quantitative_enrichment_v0
      source_kind: datasheet
      gap_family: blocked_access
      component_refdes: U1
      component_identity: FIXTURE-OPAMP-01
      upstream_gap_refs:
        - quant:G009
      downstream_impact:
        - quantitative
      current_state: owner_waiting
      blocking_levels:
        - blocks_quantitative

    - aggregate_gap_id: AG-PUBLIC-003
      owning_workflow_id: component_pcb_layout_guide_extraction
      source_kind: layout_guide
      gap_family: missing_layout_guidance
      component_refdes: U1
      component_identity: FIXTURE-OPAMP-01
      upstream_gap_refs:
        - layout:L014
      downstream_impact:
        - layout
      current_state: owner_waiting
      blocking_levels:
        - blocks_layout

    - aggregate_gap_id: AG-PUBLIC-004
      owning_workflow_id: xml_harness_composition_v0
      source_kind: interface_context
      gap_family: missing_harness_context
      interface_id: IF_PWR
      upstream_gap_refs:
        - harness:H002
      downstream_impact:
        - harness
      current_state: owner_waiting
      blocking_levels:
        - blocks_harness

    - aggregate_gap_id: AG-PUBLIC-005
      owning_workflow_id: exp_xml_component_materials
      source_kind: material_source
      gap_family: identity_ambiguity
      component_refdes: J1
      component_identity: FIXTURE-CONN-02
      upstream_gap_refs:
        - materials:M006
      downstream_impact:
        - materials
        - harness
      current_state: owner_waiting
      blocking_levels:
        - blocks_materials
        - blocks_harness

gap_dedup_index:
  invariant: every_upstream_gap_ref_maps_to_exactly_one_aggregate_gap_id
  mappings:
    - upstream_gap_ref: official:G001
      aggregate_gap_id: AG-PUBLIC-001
    - upstream_gap_ref: quant:G009
      aggregate_gap_id: AG-PUBLIC-002
    - upstream_gap_ref: layout:L014
      aggregate_gap_id: AG-PUBLIC-003
    - upstream_gap_ref: harness:H002
      aggregate_gap_id: AG-PUBLIC-004
    - upstream_gap_ref: materials:M006
      aggregate_gap_id: AG-PUBLIC-005
  crosswalk:
    - aggregate_gap_id: AG-PUBLIC-001
      aggregate_key:
        project_scope_key: public_source_gap_fixture
        owning_workflow_id: official_source_packet_collect_v0
        source_kind: datasheet
        gap_family: blocked_access
        component_refdes: U1
        component_identity: FIXTURE-OPAMP-01
      upstream_gap_refs:
        - official:G001
      dedup_reason: Single bounded upstream gap.
      lineage_events:
        - normalized_from_upstream_gap

    - aggregate_gap_id: AG-PUBLIC-002
      aggregate_key:
        project_scope_key: public_source_gap_fixture
        owning_workflow_id: page_quantitative_enrichment_v0
        source_kind: datasheet
        gap_family: blocked_access
        component_refdes: U1
        component_identity: FIXTURE-OPAMP-01
      upstream_gap_refs:
        - quant:G009
      dedup_reason: Single bounded upstream gap.
      split_reason_when_not_merged: Kept separate from AG-PUBLIC-001 because the owning workflow and retry ownership differ.
      lineage_events:
        - normalized_from_upstream_gap

    - aggregate_gap_id: AG-PUBLIC-003
      aggregate_key:
        project_scope_key: public_source_gap_fixture
        owning_workflow_id: component_pcb_layout_guide_extraction
        source_kind: layout_guide
        gap_family: missing_layout_guidance
        component_refdes: U1
        component_identity: FIXTURE-OPAMP-01
      upstream_gap_refs:
        - layout:L014
      dedup_reason: Separate source kind, gap family, and owning workflow require distinct follow-up and retry ownership.
      lineage_events:
        - normalized_from_upstream_gap

    - aggregate_gap_id: AG-PUBLIC-004
      aggregate_key:
        project_scope_key: public_source_gap_fixture
        owning_workflow_id: xml_harness_composition_v0
        source_kind: interface_context
        gap_family: missing_harness_context
        interface_id: IF_PWR
      upstream_gap_refs:
        - harness:H002
      dedup_reason: Interface-scoped owner decision requires distinct follow-up.
      lineage_events:
        - normalized_from_upstream_gap

    - aggregate_gap_id: AG-PUBLIC-005
      aggregate_key:
        project_scope_key: public_source_gap_fixture
        owning_workflow_id: exp_xml_component_materials
        source_kind: material_source
        gap_family: identity_ambiguity
        component_refdes: J1
        component_identity: FIXTURE-CONN-02
      upstream_gap_refs:
        - materials:M006
      dedup_reason: Component identity decision has distinct scope and retry ownership.
      lineage_events:
        - normalized_from_upstream_gap

owner_action_queue:
  - action_id: OA-PUBLIC-001
    aggregate_gap_ids:
      - AG-PUBLIC-001
      - AG-PUBLIC-002
    action_type: manual_download
    owner_action: Manually obtain the applicable datasheet for synthetic component FIXTURE-OPAMP-01 and provide it through the declared batch intake.
    target_drop_path: owner_batch/datasheets/
    expected_manifest_fields:
      - aggregate_gap_ids
      - synthetic_file_ref
      - source_kind
      - claimed_identity
      - claimed_revision
      - source_origin
      - checksum
      - approval_scope
      - public_summary_allowed
      - terms_status
    downstream_reason: The same owner acquisition may address both source-collection and quantitative gaps, but each owning workflow must independently reindex it.
    blocks_workflows:
      - official_source_packet_collect_v0
      - page_quantitative_enrichment_v0
      - exp_xml_component_materials
    status: owner_waiting

  - action_id: OA-PUBLIC-002
    aggregate_gap_ids:
      - AG-PUBLIC-003
    action_type: provide_file
    owner_action: Provide the applicable layout-guide file for synthetic component FIXTURE-OPAMP-01.
    target_drop_path: owner_batch/layout_guides/
    expected_manifest_fields:
      - aggregate_gap_ids
      - synthetic_file_ref
      - source_kind
      - claimed_identity
      - claimed_revision
      - source_origin
      - checksum
      - approval_scope
      - public_summary_allowed
      - terms_status
    downstream_reason: Layout guidance remains unavailable to the owning extraction workflow.
    blocks_workflows:
      - component_pcb_layout_guide_extraction
    status: owner_waiting

  - action_id: OA-PUBLIC-003
    aggregate_gap_ids:
      - AG-PUBLIC-004
    action_type: domain_decision
    owner_action: Confirm the intended connection role for synthetic interface IF_PWR.
    target_drop_path: owner_batch/decisions/
    expected_manifest_fields:
      - aggregate_gap_ids
      - decision_ref
      - interface_id
      - decision_scope
      - owner_approval_status
      - public_summary_allowed
    downstream_reason: Harness composition cannot approve the interface connection without owner-supplied context.
    blocks_workflows:
      - xml_harness_composition_v0
    status: owner_waiting

  - action_id: OA-PUBLIC-004
    aggregate_gap_ids:
      - AG-PUBLIC-005
    action_type: confirm_identity
    owner_action: Confirm the intended identity and applicable revision for synthetic component J1 / FIXTURE-CONN-02.
    target_drop_path: owner_batch/identity_confirmations/
    expected_manifest_fields:
      - aggregate_gap_ids
      - decision_ref
      - component_refdes
      - confirmed_identity
      - confirmed_revision
      - approval_scope
      - owner_approval_status
      - public_summary_allowed
    downstream_reason: Materials processing and dependent harness work remain blocked by component identity ambiguity.
    blocks_workflows:
      - exp_xml_component_materials
      - xml_harness_composition_v0
    status: owner_waiting

owner_source_batch_manifest_template:
  manifest_id: BATCH-PUBLIC-TEMPLATE
  project_scope_key: public_source_gap_fixture
  authority_notice:
    source_evidence_before_reindex: false
    filenames_alone_are_evidence: false
    owning_workflow_reindex_required: true
  batch_status: planned
  entries:
    - entry_id: BATCH-ENTRY-SYNTHETIC
      aggregate_gap_ids: []
      synthetic_file_ref: null
      source_kind: null
      claimed_identity: null
      claimed_revision: null
      source_origin: null
      checksum: null
      approval_scope: null
      public_summary_allowed: false
      terms_status: unclear
      acquisition_state: planned
      owning_workflows_to_reindex: []
      notes: null
  required_before_intake:
    - each_file_maps_to_at_least_one_aggregate_gap_id
    - checksum_is_present_for_each_local_file
    - approval_scope_is_explicit
    - public_summary_permission_is_explicit
    - unclear_terms_remain_owner_followup_needed

download_or_reuse_batch_manifest:
  manifest_id: DRM-PUBLIC-001
  project_scope_key: public_source_gap_fixture
  entries:
    - acquisition_id: ACQ-PUBLIC-001
      aggregate_gap_ids:
        - AG-PUBLIC-001
        - AG-PUBLIC-002
      source_kind: datasheet
      acquisition_method: owner_manual_download
      acquisition_state: planned
      reuse_allowed: unknown
      terms_status: unclear
      owner_action_id: OA-PUBLIC-001
      owning_workflows_to_reindex:
        - official_source_packet_collect_v0
        - page_quantitative_enrichment_v0
      evidence_status: not_source_evidence

    - acquisition_id: ACQ-PUBLIC-002
      aggregate_gap_ids:
        - AG-PUBLIC-003
      source_kind: layout_guide
      acquisition_method: owner_provided_file
      acquisition_state: planned
      reuse_allowed: unknown
      terms_status: unclear
      owner_action_id: OA-PUBLIC-002
      owning_workflows_to_reindex:
        - component_pcb_layout_guide_extraction
      evidence_status: not_source_evidence

retry_trigger_register:
  - trigger_id: RT-PUBLIC-001
    aggregate_gap_ids:
      - AG-PUBLIC-001
    trigger_type: owner_file_present
    condition: A manifest-complete datasheet entry is present for AG-PUBLIC-001.
    target_workflow_id: official_source_packet_collect_v0
    target_scope:
      component_refdes: U1
      component_identity: FIXTURE-OPAMP-01
      source_kind: datasheet
    status: pending
    required_result_before_downstream_unblock: Owning workflow reindexes the file and emits refreshed provenance and source-state evidence.
    preserve_aggregate_gap_id_on_failed_retry: true

  - trigger_id: RT-PUBLIC-002
    aggregate_gap_ids:
      - AG-PUBLIC-002
    trigger_type: owner_file_present
    condition: A manifest-complete datasheet entry is present for AG-PUBLIC-002.
    target_workflow_id: page_quantitative_enrichment_v0
    target_scope:
      component_refdes: U1
      component_identity: FIXTURE-OPAMP-01
      source_kind: datasheet
    status: pending
    required_result_before_downstream_unblock: Owning workflow reindexes the source and reassesses only the affected quantitative claims.
    preserve_aggregate_gap_id_on_failed_retry: true

  - trigger_id: RT-PUBLIC-003
    aggregate_gap_ids:
      - AG-PUBLIC-003
    trigger_type: owner_file_present
    condition: A manifest-complete layout-guide entry is present for AG-PUBLIC-003.
    target_workflow_id: component_pcb_layout_guide_extraction
    target_scope:
      component_refdes: U1
      component_identity: FIXTURE-OPAMP-01
      source_kind: layout_guide
    status: pending
    required_result_before_downstream_unblock: Owning workflow reindexes the file and emits refreshed layout source-state evidence.
    preserve_aggregate_gap_id_on_failed_retry: true

  - trigger_id: RT-PUBLIC-004
    aggregate_gap_ids:
      - AG-PUBLIC-004
    trigger_type: conflict_resolved
    condition: The owner records a bounded connection-role decision for IF_PWR.
    target_workflow_id: xml_harness_composition_v0
    target_scope:
      interface_id: IF_PWR
      source_kind: interface_context
    status: pending
    required_result_before_downstream_unblock: Harness composition re-evaluates the affected interface; this packet does not approve the connection.
    preserve_aggregate_gap_id_on_failed_retry: true

  - trigger_id: RT-PUBLIC-005
    aggregate_gap_ids:
      - AG-PUBLIC-005
    trigger_type: identity_confirmed
    condition: The owner records the confirmed identity and applicable revision for J1.
    target_workflow_id: exp_xml_component_materials
    target_scope:
      component_refdes: J1
      current_component_identity: FIXTURE-CONN-02
      source_kind: material_source
    status: pending
    required_result_before_downstream_unblock: Materials workflow refreshes its component identity and evidence packet before any dependent harness retry.
    preserve_aggregate_gap_id_on_failed_retry: true

downstream_unblock_map:
  official_source_packet_collect_v0:
    closed_gap_ids: []
    open_gap_ids:
      - AG-PUBLIC-001
    retry_ready_gap_ids: []
    owner_waiting_gap_ids:
      - AG-PUBLIC-001
    downstream_consumers_to_notify:
      - exp_xml_component_materials
      - page_quantitative_enrichment_v0
    not_claimed:
      - datasheet_obtained
      - source_provenance_confirmed
      - source_supported

  exp_xml_component_materials:
    closed_gap_ids: []
    open_gap_ids:
      - AG-PUBLIC-001
      - AG-PUBLIC-005
    retry_ready_gap_ids: []
    owner_waiting_gap_ids:
      - AG-PUBLIC-001
      - AG-PUBLIC-005
    downstream_consumers_to_notify:
      - xml_harness_composition_v0
    not_claimed:
      - component_identity_confirmed
      - component_material_truth_established
      - harness_ready

  component_pcb_layout_guide_extraction:
    closed_gap_ids: []
    open_gap_ids:
      - AG-PUBLIC-003
    retry_ready_gap_ids: []
    owner_waiting_gap_ids:
      - AG-PUBLIC-003
    downstream_consumers_to_notify: []
    not_claimed:
      - layout_guide_obtained
      - layout_guidance_extracted
      - layout_supported

  page_quantitative_enrichment_v0:
    closed_gap_ids: []
    open_gap_ids:
      - AG-PUBLIC-001
      - AG-PUBLIC-002
    retry_ready_gap_ids: []
    owner_waiting_gap_ids:
      - AG-PUBLIC-001
      - AG-PUBLIC-002
    downstream_consumers_to_notify:
      - xml_harness_composition_v0
    not_claimed:
      - quantitative_value_verified
      - quantitative_claim_supported
      - harness_ready

  xml_harness_composition_v0:
    closed_gap_ids: []
    open_gap_ids:
      - AG-PUBLIC-004
      - AG-PUBLIC-005
    retry_ready_gap_ids: []
    owner_waiting_gap_ids:
      - AG-PUBLIC-004
      - AG-PUBLIC-005
    downstream_consumers_to_notify: []
    retry_order:
      - Refresh materials evidence for AG-PUBLIC-005 before retrying dependent harness composition.
      - Re-evaluate IF_PWR only after the bounded owner decision for AG-PUBLIC-004 is recorded.
    not_claimed:
      - connection_approved
      - composition_ready
      - candidate_safe

boundary_review_note:
  disposition: stopped_owner_input_required
  confirmed_from_fixture:
    - Five upstream gap references are represented.
    - Each upstream gap reference maps to exactly one aggregate gap identifier.
    - The two U1 datasheet gaps remain separate because their owning workflows and retry ownership differ.
    - Their shared manual acquisition request is batched into one owner action without merging their aggregate gap identities.
    - All five aggregate gaps remain owner-waiting.
    - No retry trigger is currently ready.
  uncertainty:
    - No source file presence, checksum, provenance, revision, approval scope, license status, or owner decision is established.
    - Applicability of any future owner-provided file remains unknown until the owning workflow reindexes it.
    - The intended role of IF_PWR and the identity or revision of J1 remain unconfirmed.
  boundary_findings:
    followup_packet_is_source_evidence: false
    owner_batch_file_is_source_evidence_before_reindex: false
    official_source_provenance_claimed: false
    component_material_truth_claimed: false
    layout_guidance_claimed: false
    quantitative_value_truth_claimed: false
    harness_connection_approval_claimed: false
    unsupported_claims_remain_blocked_or_review_required: true
    raw_payloads_included: false
    runtime_absolute_paths_included: false
    secrets_or_account_state_requested: false
  stop_conditions:
    - Stop until the applicable owner action is completed or explicitly accepted as not applicable.
    - A dropped file alone does not close a gap.
    - Each owning workflow must reindex new material before its gap can become resolved.
    - Harness composition must not retry dependent gaps before refreshed upstream evidence packets exist.
    - Failed retries preserve the aggregate gap identifier and append retry history rather than creating duplicate gaps.
