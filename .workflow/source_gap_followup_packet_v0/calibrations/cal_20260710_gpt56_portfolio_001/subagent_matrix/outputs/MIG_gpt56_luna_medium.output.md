```yaml
fixture_id: source_gap_followup_packet_v0_public_synthetic_mixed_gap_dedup
workflow_id: source_gap_followup_packet_v0
project_scope_key: public_source_gap_fixture
source_mode: contract_only_synthetic
public_safe: true

source_gap_followup_packet:
  status: open_followup_required
  authority:
    followup_packet_is_source_evidence: false
    owner_batch_file_is_source_evidence_before_reindex: false
    owning_workflow_must_reindex_new_sources: true
    unsupported_claims_remain_blocked_or_review_required: true
  aggregate_gap_ids:
    - AG-001
    - AG-002
    - AG-003
    - AG-004
    - AG-005

gap_dedup_index:
  invariant: every_upstream_gap_ref_maps_to_exactly_one_aggregate_gap_id
  entries:
    - aggregate_gap_id: AG-001
      aggregate_key:
        project_scope_key: public_source_gap_fixture
        owning_workflow_id: official_source_packet_collect_v0
        source_kind: datasheet
        gap_family: blocked_access
        component_refdes: U1
        component_identity: FIXTURE-OPAMP-01
      upstream_gap_refs: [official:G001]
      dedup_reason: unique owning workflow and source-follow-up scope
      state: open
      blocking_level: blocks_materials
      downstream_impact: [materials, quantitative]

    - aggregate_gap_id: AG-002
      aggregate_key:
        project_scope_key: public_source_gap_fixture
        owning_workflow_id: page_quantitative_enrichment_v0
        source_kind: datasheet
        gap_family: blocked_access
        component_refdes: U1
        component_identity: FIXTURE-OPAMP-01
      upstream_gap_refs: [quant:G009]
      dedup_reason: same component and source kind but distinct owning workflow and retry scope
      split_reason_when_not_merged: quantitative evidence refresh is owned separately
      state: open
      blocking_level: blocks_quantitative
      downstream_impact: [quantitative]

    - aggregate_gap_id: AG-003
      aggregate_key:
        project_scope_key: public_source_gap_fixture
        owning_workflow_id: component_pcb_layout_guide_extraction
        source_kind: layout_guide
        gap_family: missing_layout_guidance
        component_refdes: U1
        component_identity: FIXTURE-OPAMP-01
      upstream_gap_refs: [layout:L014]
      dedup_reason: unique layout source and extraction scope
      state: open
      blocking_level: blocks_layout
      downstream_impact: [layout]

    - aggregate_gap_id: AG-004
      aggregate_key:
        project_scope_key: public_source_gap_fixture
        owning_workflow_id: xml_harness_composition_v0
        source_kind: interface_context
        gap_family: missing_harness_context
        interface_id: IF_PWR
      upstream_gap_refs: [harness:H002]
      dedup_reason: unique interface-context and harness decision scope
      state: owner_waiting
      blocking_level: blocks_harness
      downstream_impact: [harness]

    - aggregate_gap_id: AG-005
      aggregate_key:
        project_scope_key: public_source_gap_fixture
        owning_workflow_id: exp_xml_component_materials
        source_kind: material_source
        gap_family: identity_ambiguity
        component_refdes: J1
        component_identity: FIXTURE-CONN-02
      upstream_gap_refs: [materials:M006]
      dedup_reason: unique component identity and materials ownership scope
      state: open
      blocking_level: blocks_materials
      downstream_impact: [materials, harness]

owner_action_queue:
  - action_id: OA-001
    aggregate_gap_ids: [AG-001]
    action_type: manual_download
    owner_action: Provide or manually download the official datasheet for U1.
    target_drop_path: owner_intake/AG-001/
    expected_manifest_fields:
      - source_kind
      - source_locator
      - local_filename
      - checksum
      - approval_scope
      - public_summary_allowed
    downstream_reason: materials and quantitative workflows lack an accessible official source.
    blocks_workflows:
      - official_source_packet_collect_v0
    status: owner_waiting

  - action_id: OA-002
    aggregate_gap_ids: [AG-002]
    action_type: manual_download
    owner_action: Provide or manually download the quantitative source material required for U1.
    target_drop_path: owner_intake/AG-002/
    expected_manifest_fields:
      - source_kind
      - source_locator
      - local_filename
      - checksum
      - approval_scope
      - public_summary_allowed
    downstream_reason: quantitative enrichment requires source reindexing before claims can be supported.
    blocks_workflows:
      - page_quantitative_enrichment_v0
    status: owner_waiting

  - action_id: OA-003
    aggregate_gap_ids: [AG-003]
    action_type: provide_file
    owner_action: Provide the approved layout guide for U1.
    target_drop_path: owner_intake/AG-003/
    expected_manifest_fields:
      - source_kind
      - source_locator
      - local_filename
      - checksum
      - approval_scope
      - public_summary_allowed
    downstream_reason: layout guidance extraction cannot proceed without an approved source.
    blocks_workflows:
      - component_pcb_layout_guide_extraction
    status: owner_waiting

  - action_id: OA-004
    aggregate_gap_ids: [AG-004]
    action_type: domain_decision
    owner_action: Confirm the connection role and intended context for interface IF_PWR.
    target_drop_path: owner_decisions/AG-004/
    expected_manifest_fields:
      - decision_record_ref
      - decision_scope
      - approval_scope
      - public_summary_allowed
    downstream_reason: harness composition lacks approved interface context.
    blocks_workflows:
      - xml_harness_composition_v0
    status: owner_waiting

  - action_id: OA-005
    aggregate_gap_ids: [AG-005]
    action_type: confirm_identity
    owner_action: Confirm the identity and revision of connector J1 represented by FIXTURE-CONN-02.
    target_drop_path: owner_decisions/AG-005/
    expected_manifest_fields:
      - identity_record_ref
      - confirmed_identity
      - confirmed_revision
      - approval_scope
      - public_summary_allowed
    downstream_reason: materials and dependent harness review require resolved component identity.
    blocks_workflows:
      - exp_xml_component_materials
    status: owner_waiting

owner_source_batch_manifest_template:
  required_fields:
    - batch_id
    - aggregate_gap_ids
    - source_kind
    - source_locator
    - local_filename
    - checksum
    - acquisition_state
    - approval_scope
    - public_summary_allowed
    - terms_status
  acquisition_states: [planned, completed, blocked, not_applicable]
  rules:
    - filenames_alone_are_not_evidence
    - owner_files_remain_private_run_truth_until_reindexed
    - checksum_required_for_local_files
    - unclear_terms_remain_owner_followup_needed

download_or_reuse_batch_manifest:
  - batch_id: B-001
    aggregate_gap_ids: [AG-001]
    source_kind: datasheet
    acquisition_state: planned
    source_locator: owner_to_supply
    local_filename: owner_to_supply
    checksum: pending_file_receipt
    approval_scope: pending_owner_approval
    public_summary_allowed: pending_owner_decision
    terms_status: unclear_pending_owner_review

  - batch_id: B-002
    aggregate_gap_ids: [AG-002]
    source_kind: datasheet
    acquisition_state: planned
    source_locator: owner_to_supply
    local_filename: owner_to_supply
    checksum: pending_file_receipt
    approval_scope: pending_owner_approval
    public_summary_allowed: pending_owner_decision
    terms_status: unclear_pending_owner_review

  - batch_id: B-003
    aggregate_gap_ids: [AG-003]
    source_kind: layout_guide
    acquisition_state: planned
    source_locator: owner_to_supply
    local_filename: owner_to_supply
    checksum: pending_file_receipt
    approval_scope: pending_owner_approval
    public_summary_allowed: pending_owner_decision
    terms_status: unclear_pending_owner_review

retry_trigger_register:
  - trigger_id: RT-001
    aggregate_gap_ids: [AG-001]
    trigger_type: official_url_confirmed
    target_workflow_id: official_source_packet_collect_v0
    required_change: official source becomes available for reindexing
    rerun_scope: U1 / FIXTURE-OPAMP-01 datasheet
    preserve_aggregate_gap_id: true
    harness_retry_allowed: false

  - trigger_id: RT-002
    aggregate_gap_ids: [AG-002]
    trigger_type: owner_file_present
    target_workflow_id: page_quantitative_enrichment_v0
    required_change: quantitative source packet is refreshed and reindexed
    rerun_scope: U1 quantitative evidence
    preserve_aggregate_gap_id: true
    harness_retry_allowed: false

  - trigger_id: RT-003
    aggregate_gap_ids: [AG-003]
    trigger_type: owner_file_present
    target_workflow_id: component_pcb_layout_guide_extraction
    required_change: approved layout guide is refreshed and reindexed
    rerun_scope: U1 layout guidance
    preserve_aggregate_gap_id: true
    harness_retry_allowed: false

  - trigger_id: RT-004
    aggregate_gap_ids: [AG-004]
    trigger_type: identity_confirmed
    target_workflow_id: xml_harness_composition_v0
    required_change: approved IF_PWR connection-role decision is recorded
    rerun_scope: interface IF_PWR
    preserve_aggregate_gap_id: true
    harness_retry_allowed: false

  - trigger_id: RT-005
    aggregate_gap_ids: [AG-005]
    trigger_type: identity_confirmed
    target_workflow_id: exp_xml_component_materials
    required_change: J1 identity and revision are confirmed
    rerun_scope: J1 / FIXTURE-CONN-02
    preserve_aggregate_gap_id: true
    harness_retry_allowed: false

downstream_unblock_map:
  official_source_packet_collect_v0:
    closed_gap_ids: []
    open_gap_ids: [AG-001]
    retry_ready_gap_ids: []
    owner_waiting_gap_ids: [AG-001]
    downstream_consumers_to_notify: [exp_xml_component_materials, page_quantitative_enrichment_v0]
    not_claimed: source support is not established.

  exp_xml_component_materials:
    closed_gap_ids: []
    open_gap_ids: [AG-005]
    retry_ready_gap_ids: []
    owner_waiting_gap_ids: [AG-005]
    downstream_consumers_to_notify: [xml_harness_composition_v0]
    not_claimed: component material truth and identity approval are not established.

  component_pcb_layout_guide_extraction:
    closed_gap_ids: []
    open_gap_ids: [AG-003]
    retry_ready_gap_ids: []
    owner_waiting_gap_ids: [AG-003]
    downstream_consumers_to_notify: []
    not_claimed: layout guidance is not established.

  page_quantitative_enrichment_v0:
    closed_gap_ids: []
    open_gap_ids: [AG-002]
    retry_ready_gap_ids: []
    owner_waiting_gap_ids: [AG-002]
    downstream_consumers_to_notify: [xml_harness_composition_v0]
    not_claimed: quantitative values are not source-supported.

  xml_harness_composition_v0:
    closed_gap_ids: []
    open_gap_ids: [AG-004, AG-005]
    retry_ready_gap_ids: []
    owner_waiting_gap_ids: [AG-004, AG-005]
    downstream_consumers_to_notify: []
    not_claimed: harness connections are neither approved nor candidate-safe.

boundary_review_note:
  public_safe: true
  raw_payloads_included: false
  runtime_absolute_paths_included: false
  secrets_or_account_state_requested: false
  source_evidence_claimed: false
  owner_files_counted_as_source_evidence: false
  unsupported_claims:
    - missing sources remain unresolved
    - owner-provided files require owning-workflow reindexing
    - harness composition must wait for refreshed upstream evidence packets
  stop_conditions:
    - stop before promoting any gap to source_supported
    - stop before promoting any harness connection to approved
    - stop before retrying downstream harness composition without refreshed upstream evidence
```
