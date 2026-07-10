```yaml
project_binding:
  workflow_id: ouroboros_strategic_review_harness_v0
  fixture_id: PUBLIC_SYNTH_OUROBOROS_STRATEGIC_REVIEW_HARNESS_V0
  project_code: PUBLIC_SYNTHETIC_REVIEW
  review_mode: weekly_strategic_review
  source_kind: synthetic_from_workflow_contract_metadata_only
  public_safe: true
  authority_boundary:
    owner_final_intent: unavailable
    private_raw_truth: unavailable
    roadmap_mutation: prohibited
    canon_mutation: prohibited
    runtime_installation: not assessed
  evidence_status:
    vision_refs: supplied_as_input_category_only
    roadmap_refs: supplied_as_input_category_only
    canon_refs: supplied_as_input_category_only
    recent_activity_refs: supplied_as_input_category_only
    factual_detail_level: synthetic_fixture_only

vision_alignment_report:
  report_id: PUBLIC_SYNTH_VISION_ALIGNMENT_001
  workflow_id: ouroboros_strategic_review_harness_v0
  finding:
    status: aligned_at_contract_level
    statement: >-
      The workflow's two-lane review purpose is consistent with its stated
      strategic-review role: it checks vision alignment and surfaces
      owner-intent gaps without inventing missing intent.
  roadmap_alignment_confirmation:
    status: confirmed_by_fixture
    statement: >-
      One roadmap alignment confirmation is present in the synthetic fixture.
    evidence_ref: fixture.scenario_facts[0]
  active_slice: unknown
  explicit_non_goals:
    - do not determine owner_final_intent
    - do not mutate the roadmap
    - do not publish private raw truth
    - do not claim ontology convergence
  recommendation_only: true
  unresolved_alignment_questions:
    - Whether the current active slice requires any additional strategic constraint is unknown.

owner_intent_gap_register:
  register_id: PUBLIC_SYNTH_OWNER_INTENT_GAPS_001
  workflow_id: ouroboros_strategic_review_harness_v0
  gaps:
    - gap_id: PUBLIC_SYNTH_GAP_001
      type: missing_owner_intent
      question: >-
        Which next-focus direction should govern the following review cycle
        after the confirmed roadmap alignment?
      evidence:
        - one roadmap alignment confirmation exists
        - the fixture requires one owner-intent gap question
      impacted_surfaces:
        - next_focus_recommendation
        - owner_question_queue
        - possible canon_constraint_candidate
      status: unresolved
      finding_is_question_not_truth: true

ambiguity_ledger:
  ledger_id: PUBLIC_SYNTH_AMBIGUITY_001
  workflow_id: ouroboros_strategic_review_harness_v0
  dimensions:
    vision_alignment:
      status: low_ambiguity
      basis: one roadmap alignment confirmation
    owner_intent:
      status: unresolved
      basis: PUBLIC_SYNTH_GAP_001
    canon_constraint:
      status: candidate_only
      basis: no owner decision or canon patch supplied
    cadence:
      status: unknown
      basis: not provided by fixture
    promotion_threshold:
      status: unknown
      basis: not provided by fixture
    verification_expectation:
      status: unknown
      basis: not provided by fixture
  smallest_next_useful_question: PUBLIC_SYNTH_GAP_001

socratic_question_packet:
  packet_id: PUBLIC_SYNTH_SOCRATIC_PACKET_001
  workflow_id: ouroboros_strategic_review_harness_v0
  routing:
    - gap_id: PUBLIC_SYNTH_GAP_001
      classification: owner_decision
      owner_facing: true
      rationale: >-
        The fixture does not supply the missing direction, and the workflow
        must not invent owner intent.
      safe_default: continue the currently aligned slice while holding promotion
      options:
        - option_id: PUBLIC_SYNTH_OPTION_A
          label: continue_aligned_slice
          consequence: no new canon or workflow mutation
        - option_id: PUBLIC_SYNTH_OPTION_B
          label: tighten_constraint
          consequence: prepare a canon constraint candidate for owner review
        - option_id: PUBLIC_SYNTH_OPTION_C
          label: create_mission_seed
          consequence: route a bounded mission seed for owner decision
      defer_allowed: true
      defer_consequence: remains non-blocking and unresolved

owner_question_queue:
  queue_id: PUBLIC_SYNTH_OWNER_QUEUE_001
  status: awaiting_owner_decision
  questions:
    - question_id: PUBLIC_SYNTH_Q_001
      gap_id: PUBLIC_SYNTH_GAP_001
      question: >-
        For the next review cycle, should the team continue the aligned active
        slice, tighten a strategic constraint, or create a mission seed?
      evidence:
        - one roadmap alignment confirmation is recorded in the fixture
        - no owner direction is supplied
      choices:
        - continue the aligned active slice
        - tighten a strategic constraint
        - create a mission seed
      safe_default: continue the aligned active slice
      downstream_consequence: >-
        The selected direction determines whether the next output remains a
        recommendation, becomes a canon candidate, or becomes a mission seed.
      answerability: owner_decision
      no_intent_invented: true

closure_restatement_note:
  note_id: PUBLIC_SYNTH_CLOSURE_001
  status: owner_decision_required
  statement: >-
    No owner answer is present; the next focus remains unresolved pending an
    owner decision or an explicit safe-default acceptance.
  downstream_routing: held

canon_constraint_candidate_register:
  register_id: PUBLIC_SYNTH_CANON_CANDIDATES_001
  workflow_id: ouroboros_strategic_review_harness_v0
  candidates:
    - candidate_id: PUBLIC_SYNTH_CANON_CANDIDATE_001
      source_gap_id: PUBLIC_SYNTH_GAP_001
      candidate: >-
        The strategic review should preserve the currently aligned active slice
        until an owner selects a different next-focus direction.
      status: candidate_only
      confidence: provisional
      requires_owner_decision: true
      requires_canon_patch: true
      mutation_permitted_here: false
      promotion_route: owner_decision_packet_v0
      non_claims:
        - not current canon
        - not final owner intent
        - not an applied constraint

next_focus_recommendation:
  recommendation_id: PUBLIC_SYNTH_NEXT_FOCUS_001
  workflow_id: ouroboros_strategic_review_harness_v0
  recommendation: >-
    Continue the currently aligned active slice as the safe default while
    asking the owner to select the next strategic direction.
  rationale:
    - one roadmap alignment confirmation is present
    - one owner-intent gap remains unresolved
    - no owner decision or canon patch is supplied
  alternatives:
    - tighten a constraint after owner approval
    - create a mission seed after owner approval
  status: recommendation_only
  stop_condition: >-
    Stop downstream promotion if owner intent remains unanswered or if the
    candidate lacks an explicit owner decision.
  required_followup: PUBLIC_SYNTH_Q_001

ouroboros_loop_ledger:
  ledger_id: PUBLIC_SYNTH_LOOP_001
  workflow_id: ouroboros_strategic_review_harness_v0
  fixture_id: PUBLIC_SYNTH_OUROBOROS_STRATEGIC_REVIEW_HARNESS_V0
  loop_status: calibrated_public_safe_draft
  stages:
    - stage: vision_alignment
      result: one roadmap alignment confirmation
    - stage: owner_intent_gap
      result: one unresolved owner-intent question
    - stage: answerability_routing
      result: routed to owner_decision
    - stage: next_focus
      result: continue_aligned_slice_as_safe_default
    - stage: canon_routing
      result: one provisional candidate; no promotion
  outputs:
    - vision_alignment_report
    - owner_intent_gap_register
    - ambiguity_ledger
    - socratic_question_packet
    - owner_question_queue
    - closure_restatement_note
    - canon_constraint_candidate_register
    - next_focus_recommendation
  boundary_status:
    public_safe: true
    synthetic_only: true
    hidden_evidence_used: false
    tool_use_claimed: false
    file_edit_claimed: false
    runtime_fact_claimed: false
    external_contact_claimed: false
    upstream_mutation: false
    downstream_promotion: false
  stop_conditions:
    - do not promote the canon candidate without owner approval
    - do not mutate the roadmap without owner decision
    - do not treat unresolved intent as established truth
    - route applied changes through post_development_review_gate_v0
```
