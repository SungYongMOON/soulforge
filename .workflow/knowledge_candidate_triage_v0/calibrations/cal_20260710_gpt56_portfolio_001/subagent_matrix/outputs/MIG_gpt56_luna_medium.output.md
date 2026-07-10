```yaml
workflow_id: knowledge_candidate_triage_v0
fixture_id: PUBLIC_SYNTH_KNOWLEDGE_CANDIDATE_TRIAGE_V0
public_safe: true
source_kind: synthetic_from_workflow_contract_metadata_only

project_binding:
  project_ref: SYNTH-PROJECT-KCT-001
  owner_scope_ref: SYNTH-OWNER-SCOPE-001
  payload_policy: metadata_only
  source_truth_status: unverified
  canon_status: not_promoted

candidate_triage_register:
  register_ref: SYNTH-CTR-001
  candidates:
    - candidate_ref: SYNTH-CANDIDATE-PACKET-001
      candidate_type: derived_knowledge_candidate
      current_bookshelf_state: inbox_candidate
      visible_gap_or_reason: candidate may support a bounded source-deepening packet
      approval_basis_ref: SYNTH-APPROVAL-BASIS-UNRESOLVED-001
      usage_signal_ref: SYNTH-USAGE-SIGNAL-001
      source_truth_claim: none
      owner_approval_status: not_recorded

    - candidate_ref: SYNTH-CANDIDATE-OWNER-001
      candidate_type: promotion_candidate
      current_bookshelf_state: inbox_candidate
      visible_gap_or_reason: possible promotion requires explicit owner decision
      approval_basis_ref: SYNTH-APPROVAL-BASIS-OWNER-GATE-001
      usage_signal_ref: SYNTH-USAGE-SIGNAL-002
      source_truth_claim: none
      owner_approval_status: pending

    - candidate_ref: SYNTH-CANDIDATE-PRIVATE-001
      candidate_type: access_event_derived_candidate
      current_bookshelf_state: hold_private
      visible_gap_or_reason: public-safe eligibility is not established
      approval_basis_ref: SYNTH-APPROVAL-BASIS-PRIVATE-001
      usage_signal_ref: SYNTH-USAGE-SIGNAL-003
      source_truth_claim: none
      owner_approval_status: not_recorded

    - candidate_ref: SYNTH-CANDIDATE-REJECT-001
      candidate_type: unclear_candidate
      current_bookshelf_state: rejected_or_unclear
      visible_gap_or_reason: insufficient metadata to establish candidate identity or permitted use
      approval_basis_ref: SYNTH-APPROVAL-BASIS-INSUFFICIENT-001
      usage_signal_ref: SYNTH-USAGE-SIGNAL-004
      source_truth_claim: none
      owner_approval_status: not_recorded

bookshelf_placement_decision:
  decision_ref: SYNTH-BPD-001
  placements:
    - candidate_ref: SYNTH-CANDIDATE-PACKET-001
      placement: inbox_candidate
      canon_promotion: not authorized
      uncertainty: packet eligibility does not establish source support

    - candidate_ref: SYNTH-CANDIDATE-OWNER-001
      placement: inbox_candidate
      canon_promotion: blocked_pending_owner_decision
      uncertainty: no owner approval is inferred

    - candidate_ref: SYNTH-CANDIDATE-PRIVATE-001
      placement: hold_private
      canon_promotion: not authorized
      uncertainty: public-safe release status is unresolved

    - candidate_ref: SYNTH-CANDIDATE-REJECT-001
      placement: rejected_or_unclear
      canon_promotion: not authorized
      rejection_reason: insufficient metadata for safe classification

notebooklm_packet_eligibility_note:
  note_ref: SYNTH-NLM-ELIGIBILITY-001
  eligible_candidates:
    - candidate_ref: SYNTH-CANDIDATE-PACKET-001
      packet_status: packet_eligible
      eligibility_scope: bounded metadata reference only
      source_support_claim: none
      payload_copy: prohibited
  ineligible_candidates:
    - candidate_ref: SYNTH-CANDIDATE-OWNER-001
      packet_status: hold_pending_owner_decision
    - candidate_ref: SYNTH-CANDIDATE-PRIVATE-001
      packet_status: hold_private
    - candidate_ref: SYNTH-CANDIDATE-REJECT-001
      packet_status: rejected

owner_review_queue:
  queue_ref: SYNTH-ORQ-001
  items:
    - candidate_ref: SYNTH-CANDIDATE-OWNER-001
      review_status: pending_owner_review
      requested_decision: approve, reject, or request sourcebound deepening
      decision_authority: owner_only
      approval_inference: prohibited

downstream_route_map:
  map_ref: SYNTH-DRM-001
  routes:
    - candidate_ref: SYNTH-CANDIDATE-PACKET-001
      route: sourcebound_deepening
      next_workflow: sourcebound_knowledge_packet_operating_loop_v0
      trigger: candidate_requires_sourcebound_deepening

    - candidate_ref: SYNTH-CANDIDATE-OWNER-001
      route: owner_decision
      next_workflow: owner_decision_packet_v0
      trigger: candidate_requires_owner_decision

    - candidate_ref: SYNTH-CANDIDATE-PRIVATE-001
      route: hold_private
      next_workflow: none
      stop_condition: do not publish, packet, or promote without an explicit safe-release basis

    - candidate_ref: SYNTH-CANDIDATE-REJECT-001
      route: reject
      next_workflow: none
      stop_condition: do not route further unless new admissible metadata is supplied

boundary_review_note:
  note_ref: SYNTH-BRN-001
  status: boundary_preserved
  checks:
    no_candidate_overclaims: pass
    no_payload_copy: pass
    no_owner_approval_inference: pass
    no_canon_promotion_inference: pass
  explicit_non_claims:
    - No raw source truth was established.
    - No candidate was treated as active CANON.
    - Packet eligibility was not treated as source support.
    - No owner approval was inferred.
    - No NotebookLM runtime operation was asserted.
    - No archive, retirement, or promotion execution was authorized.
  stop_conditions:
    - stop on missing owner scope
    - stop on unresolved public/private boundary
    - stop on insufficient candidate metadata
    - stop before canon or public promotion without the required downstream review gate
```
