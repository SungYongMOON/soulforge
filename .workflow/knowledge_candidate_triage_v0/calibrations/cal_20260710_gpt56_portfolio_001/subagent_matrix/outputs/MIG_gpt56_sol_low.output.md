workflow_id: knowledge_candidate_triage_v0
fixture_id: PUBLIC_SYNTH_KNOWLEDGE_CANDIDATE_TRIAGE_V0
deliverable_kind: synthetic_public_safe_candidate_triage
authority_status: triage_only
source_truth_claimed: false
owner_approval_inferred: false
canon_promotion_inferred: false

project_binding:
  candidate_scope_ref: synthetic_scope_public_candidates_v0
  candidate_family: synthetic_knowledge_candidates
  bookshelf_state_policy_ref: synthetic_bookshelf_state_policy_v0
  triage_policy_ref: synthetic_triage_policy_v0
  scope_status: bound_from_fixture_only
  payload_policy: metadata_only
  uncertainty:
    - Source contents and truth are not available.
    - Approval, provenance, and runtime status are not established beyond synthetic fixture facts.

candidate_triage_register:
  register_id: synthetic_candidate_triage_register_v0
  candidates:
    - stable_candidate_ref: synthetic_candidate_packet_001
      candidate_type: synthetic_derived_knowledge_artifact
      current_bookshelf_state: canon_candidate
      visible_gap_or_reason: Fixture requires one packet-eligible candidate.
      approval_basis_ref: synthetic_fixture_packet_eligibility_basis
      usage_signal_ref: null
      source_truth_status: not_assessed

    - stable_candidate_ref: synthetic_candidate_owner_002
      candidate_type: synthetic_candidate_source
      current_bookshelf_state: inbox_candidate
      visible_gap_or_reason: Owner judgment is required before any stronger placement or use.
      approval_basis_ref: null
      usage_signal_ref: null
      source_truth_status: not_assessed

    - stable_candidate_ref: synthetic_candidate_private_003
      candidate_type: synthetic_private_context_candidate
      current_bookshelf_state: rejected_or_unclear
      visible_gap_or_reason: Public-safe eligibility and disclosure boundaries are unresolved.
      approval_basis_ref: null
      usage_signal_ref: null
      source_truth_status: not_assessed

    - stable_candidate_ref: synthetic_candidate_reject_004
      candidate_type: synthetic_unbound_candidate
      current_bookshelf_state: rejected_or_unclear
      visible_gap_or_reason: Rejected because no stable approval-basis reference or sufficient classification metadata is supplied.
      approval_basis_ref: null
      usage_signal_ref: null
      source_truth_status: not_assessed

bookshelf_placement_decision:
  decision_id: synthetic_bookshelf_placement_decision_v0
  placements:
    - stable_candidate_ref: synthetic_candidate_packet_001
      decided_state: canon_candidate
      placement_effect: retain_as_candidate
      canon_status: not_approved
      rationale: Packet eligibility is stipulated by the synthetic fixture but does not establish source support or canon authority.

    - stable_candidate_ref: synthetic_candidate_owner_002
      decided_state: inbox_candidate
      placement_effect: await_owner_review
      canon_status: not_approved
      rationale: No owner decision is present.

    - stable_candidate_ref: synthetic_candidate_private_003
      decided_state: rejected_or_unclear
      placement_effect: hold_private
      canon_status: not_approved
      rationale: Boundary uncertainty prevents public or active placement.

    - stable_candidate_ref: synthetic_candidate_reject_004
      decided_state: rejected_or_unclear
      placement_effect: reject
      canon_status: not_approved
      rationale: Required classification and approval-basis metadata are absent.

notebooklm_packet_eligibility_note:
  note_id: synthetic_notebooklm_packet_eligibility_note_v0
  determinations:
    - stable_candidate_ref: synthetic_candidate_packet_001
      packet_eligible: true
      eligibility_basis: Explicit synthetic scenario fact.
      limitations:
        - Eligibility does not claim source truth.
        - Eligibility does not grant packet membership or canon promotion.
        - Any membership update remains a separate controlled action.

    - stable_candidate_ref: synthetic_candidate_owner_002
      packet_eligible: false
      reason: Owner review is unresolved.

    - stable_candidate_ref: synthetic_candidate_private_003
      packet_eligible: false
      reason: Candidate remains hold-private.

    - stable_candidate_ref: synthetic_candidate_reject_004
      packet_eligible: false
      reason: Candidate is rejected for insufficient classification metadata.

owner_review_queue:
  queue_id: synthetic_owner_review_queue_v0
  items:
    - queue_ref: synthetic_owner_review_item_001
      stable_candidate_ref: synthetic_candidate_owner_002
      requested_decision: Determine whether the candidate may advance, requires sourcebound deepening, or should be rejected.
      current_authority: inbox_candidate_only
      owner_decision_ref: null
      blocked_actions:
        - packet_membership_update
        - canon_approval
        - canon_promotion
  nonqueued_notes:
    - synthetic_candidate_private_003 remains private pending boundary resolution; this is not approval.
    - synthetic_candidate_reject_004 requires no owner action unless reconsideration is explicitly requested.

downstream_route_map:
  map_id: synthetic_downstream_route_map_v0
  routes:
    - stable_candidate_ref: synthetic_candidate_packet_001
      route_target: packet_membership_update
      route_status: eligible_not_executed
      preconditions:
        - Confirm applicable packet policy.
        - Preserve candidate-level authority.
        - Do not infer source support.

    - stable_candidate_ref: synthetic_candidate_owner_002
      route_target: owner_decision
      downstream_workflow_id: owner_decision_packet_v0
      route_status: queued_not_executed
      stop_condition: Stop until an explicit owner decision reference exists.

    - stable_candidate_ref: synthetic_candidate_private_003
      route_target: hold_private
      route_status: held_not_executed
      stop_condition: Stop public routing while disclosure or source boundaries remain unresolved.

    - stable_candidate_ref: synthetic_candidate_reject_004
      route_target: reject
      route_status: classified_not_executed
      rejection_reason: No stable approval-basis reference or sufficient classification metadata is supplied.
      reconsideration_condition: Re-enter triage only with new bounded metadata or an explicit owner request.

boundary_review_note:
  note_id: synthetic_boundary_review_note_v0
  review_status: boundary_preserved_with_explicit_uncertainty
  checks:
    no_candidate_overclaims: pass
    no_payload_copy: pass
    no_owner_approval_inference: pass
    no_canon_promotion_inference: pass
  preserved_boundaries:
    - Candidate labels are classifications, not authority.
    - Inbox and canon-candidate states are not active canon.
    - Packet eligibility is not evidence of source support.
    - No raw source, answer, secret, or session payload is included.
    - No archive, retirement, promotion, or packet update is represented as executed.
  unresolved:
    - Raw source truth remains unknown.
    - Owner approval remains absent.
    - Ontology acceptance remains outside workflow ownership.
    - Runtime and private-evidence facts are not asserted.
  terminal_stop_conditions:
    - Stop before canon approval or promotion.
    - Stop before owner-gated action without an explicit owner decision reference.
    - Stop public routing for hold-private material.
    - Stop if classification would require unavailable payload inspection.
