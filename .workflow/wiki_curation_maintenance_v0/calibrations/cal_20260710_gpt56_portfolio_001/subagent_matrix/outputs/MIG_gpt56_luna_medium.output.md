```yaml
workflow_id: wiki_curation_maintenance_v0
fixture_id: PUBLIC_SYNTH_WIKI_CURATION_MAINTENANCE_V0
deliverable_id: SYNTH_WIKI_CUR_PACKET_001
source_kind: synthetic_from_workflow_contract_metadata_only
public_safe: true
metadata_only: true

project_binding:
  binding_id: SYNTH_PROJECT_BINDING_001
  scope_ref: SYNTH_CURATION_SCOPE_001
  project_ref: SYNTH_PROJECT_001
  status: proposed
  source_truth_status: not_established
  owner_approval_status: unknown
  payload_included: false

source_ledger_curation_packet:
  packet_id: SYNTH_SOURCE_LEDGER_CURATION_001
  scope_ref: SYNTH_CURATION_SCOPE_001
  proposed_updates:
    - update_id: SYNTH_LEDGER_UPDATE_001
      source_handle: SYNTH_SOURCE_HANDLE_001
      lifecycle_state: candidate
      change_kind: metadata_only_ledger_update
      basis_ref: SYNTH_CONTRACT_FIXTURE_001
      source_truth_claim: none
      owner_approval: not_inferred
      applied: false
  unresolved_gap_refs:
    - SYNTH_GAP_001
  payload_copied: false

packet_map_update_note:
  note_id: SYNTH_PACKET_MAP_NOTE_001
  packet_handle: SYNTH_PACKET_HANDLE_001
  proposed_membership_action: metadata_only_add_or_refresh
  membership_status: candidate
  authority_status: packet_membership_is_not_authority
  source_truth_status: not_established
  owner_approval_status: unknown
  applied: false

notebook_binding_update_note:
  note_id: SYNTH_NOTEBOOK_BINDING_NOTE_001
  notebook_binding_ref: SYNTH_NOTEBOOK_BINDING_001
  proposed_binding_action: metadata_only_binding_note
  binding_status: candidate
  notebook_runtime_status: not_assessed
  answer_payload_included: false
  source_truth_claim: none
  applied: false

lifecycle_state_delta:
  delta_id: SYNTH_LIFECYCLE_DELTA_001
  entries:
    - entity_ref: SYNTH_SOURCE_HANDLE_001
      prior_state: unknown
      proposed_state: candidate
      approval_basis: none
      owner_approval_required: true
    - entity_ref: SYNTH_PACKET_HANDLE_001
      prior_state: unknown
      proposed_state: review_required
      approval_basis: none
      owner_approval_required: true
  execution_status: not_applied

residual_gap_register:
  register_id: SYNTH_GAP_REGISTER_001
  gaps:
    - gap_id: SYNTH_GAP_001
      description: Source truth, owner approval, and downstream authority remain unresolved.
      severity: review_required
      affected_refs:
        - SYNTH_SOURCE_HANDLE_001
        - SYNTH_PACKET_HANDLE_001
        - SYNTH_NOTEBOOK_BINDING_001
      closure_owner: project_owner_unknown
      closure_condition: Explicit owner decision and sourcebound review
      status: open
  residual_gap_must_remain_visible: true

review_handoff:
  handoff_id: SYNTH_REVIEW_HANDOFF_001
  review_required: true
  reason: Curation remains metadata-only and contains unresolved approval and source-truth boundaries.
  input_refs:
    - SYNTH_SOURCE_LEDGER_CURATION_001
    - SYNTH_PACKET_MAP_NOTE_001
    - SYNTH_NOTEBOOK_BINDING_NOTE_001
    - SYNTH_LIFECYCLE_DELTA_001
    - SYNTH_GAP_REGISTER_001
  downstream_route: optional_owner_decision_and_required_post_development_review
  promotion_status: not_authorized
  archive_or_retire_status: not_authorized
  graph_mutation_status: not_authorized

boundary_review_note:
  note_id: SYNTH_BOUNDARY_REVIEW_001
  result: boundary_preserved
  checks:
    no_source_truth_overclaim: pass
    no_owner_approval_inference: pass
    no_payload_copy: pass
    no_graph_or_archive_execution: pass
    metadata_only_updates: pass
  non_claims:
    - No tool use or runtime operation is claimed.
    - No file edit, external contact, message, or state mutation is claimed.
    - No notebook answer payload or source payload is included.
    - No source, canon, approval, archive, retirement, or graph authority is asserted.
  stop_conditions:
    - Stop if required scope, curation policy, or lifecycle policy is absent.
    - Stop if payload content is requested for a public package.
    - Stop if owner approval is assumed rather than explicitly supplied.
    - Stop before public or canon promotion until required review is complete.
```
