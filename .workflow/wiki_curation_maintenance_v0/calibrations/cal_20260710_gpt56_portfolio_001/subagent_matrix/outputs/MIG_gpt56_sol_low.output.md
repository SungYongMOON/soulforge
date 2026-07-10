workflow_id: wiki_curation_maintenance_v0
fixture_id: PUBLIC_SYNTH_WIKI_CURATION_MAINTENANCE_V0
deliverable_kind: metadata_only_curation_bundle
public_safe: true
source_kind: synthetic_from_workflow_contract_metadata_only

source_ledger_curation_packet:
  packet_id: SYNTH_LEDGER_CURATION_PACKET_001
  project_binding_ref: SYNTH_CURATION_SCOPE_BINDING_001
  update_count: 1
  updates:
    - update_id: SYNTH_LEDGER_UPDATE_001
      source_handle: SYNTH_SOURCE_HANDLE_001
      proposed_lifecycle_state: review_required
      curation_action: add_metadata_entry
      packet_handle: SYNTH_PACKET_HANDLE_001
      notebook_binding_ref: null
      drive_ref: null
      gap_ref: SYNTH_RESIDUAL_GAP_001
      source_truth_claim: none
      owner_approval_status: not_provided
  uncertainty:
    - Source contents, provenance, and truth status are not supplied.
    - Existing ledger state is not supplied; the update remains a proposal.
  non_claims:
    - No source payload is included.
    - Packet membership does not establish source authority.
    - No owner approval is inferred.

packet_map_update_note:
  note_id: SYNTH_PACKET_MAP_NOTE_001
  update_count: 1
  updates:
    - update_id: SYNTH_PACKET_MAP_UPDATE_001
      packet_handle: SYNTH_PACKET_HANDLE_001
      source_handle: SYNTH_SOURCE_HANDLE_001
      proposed_change: add_membership_metadata
      proposed_state: review_required
      authority_effect: none
      gap_ref: SYNTH_RESIDUAL_GAP_001
  constraints:
    metadata_only: true
    membership_is_authority: false
    residual_gap_visible: true
  uncertainty:
    - Prior packet membership and packet eligibility evidence are not supplied.

notebook_binding_update_note:
  note_id: SYNTH_NOTEBOOK_BINDING_NOTE_001
  proposed_change: no_binding_change
  source_handle: SYNTH_SOURCE_HANDLE_001
  packet_handle: SYNTH_PACKET_HANDLE_001
  notebook_binding_ref: null
  reason: No notebook-binding reference or approved binding decision is supplied.
  authority_effect: none
  non_claims:
    - No notebook existence, accessibility, synchronization, or content state is asserted.
    - No NotebookLM operation is proposed or represented.

lifecycle_state_delta:
  delta_id: SYNTH_LIFECYCLE_DELTA_001
  subject_handle: SYNTH_SOURCE_HANDLE_001
  prior_state: unknown
  proposed_state: review_required
  transition_status: proposed_only
  rationale: Source truth, prior lifecycle state, and owner approval are unresolved.
  execution_effect: none
  prohibited_inferences:
    - owner_approved
    - superseded
    - rejected
    - archived
    - retired
    - canon_promoted

residual_gap_register:
  register_id: SYNTH_RESIDUAL_GAP_REGISTER_001
  gap_count: 1
  gaps:
    - gap_id: SYNTH_RESIDUAL_GAP_001
      subject_handle: SYNTH_SOURCE_HANDLE_001
      gap_type: missing_source_and_owner_evidence
      description: Source provenance, payload review, prior ledger state, packet eligibility, and owner disposition are not supplied.
      status: open
      impact:
        - Prevents a source-truth claim.
        - Prevents owner-approved lifecycle status.
        - Prevents public or canon promotion.
        - Prevents archive, retire, or graph-mutation action.
      closure_requirements:
        - Provide bounded source evidence through an authorized source-review path.
        - Establish the prior ledger and lifecycle state.
        - Obtain an explicit owner decision where required.
        - Complete the required review gate before any public or canon promotion.
      stop_condition: Keep the item in review_required and perform no authority-changing action until closure evidence is available.

review_handoff:
  handoff_id: SYNTH_REVIEW_HANDOFF_001
  review_status: ready_for_bounded_review
  artifacts:
    source_ledger_curation_packet: SYNTH_LEDGER_CURATION_PACKET_001
    packet_map_update_note: SYNTH_PACKET_MAP_NOTE_001
    notebook_binding_update_note: SYNTH_NOTEBOOK_BINDING_NOTE_001
    lifecycle_state_delta: SYNTH_LIFECYCLE_DELTA_001
    residual_gap_register: SYNTH_RESIDUAL_GAP_REGISTER_001
  reviewer_focus:
    - Confirm that all entries remain metadata-only.
    - Confirm that packet membership is not treated as authority.
    - Confirm that no source truth or owner approval is inferred.
    - Confirm that SYNTH_RESIDUAL_GAP_001 remains visible.
    - Route any authority-changing decision to the owner decision process.
    - Require the post-development review gate before public or canon promotion.
  owner_decision_required: true
  requested_owner_decision: Determine whether sufficient evidence exists to approve, reject, or retain review_required status.
  stop_conditions:
    - Stop if source payload disclosure would be required in the public package.
    - Stop if source truth cannot be established by an authorized review path.
    - Stop if owner approval is absent for an authority-changing transition.
    - Stop before graph mutation, archive, retirement, or canon promotion.

boundary_review_note:
  note_id: SYNTH_BOUNDARY_REVIEW_NOTE_001
  disposition: bounded_metadata_only_handoff
  checks:
    no_source_truth_overclaim: preserved
    no_owner_approval_inference: preserved
    no_payload_copy: preserved
    no_graph_or_archive_execution: preserved
    public_safe_synthetic_identifiers: preserved
    residual_gap_visibility: preserved
  authority_boundaries:
    source_truth: not_determined
    owner_approval: not_granted
    canon_promotion: not_performed
    archive_or_retire_execution: not_performed
    graph_mutation: not_performed
    notebook_runtime_state: not_determined
  final_non_claim: This bundle proposes metadata-only curation state and review routing; it does not establish source truth, approval, runtime state, or canon authority.
