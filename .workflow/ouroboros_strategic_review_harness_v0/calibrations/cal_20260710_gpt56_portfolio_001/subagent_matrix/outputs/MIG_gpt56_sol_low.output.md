deliverable:
  workflow_id: ouroboros_strategic_review_harness_v0
  fixture_id: PUBLIC_SYNTH_OUROBOROS_STRATEGIC_REVIEW_HARNESS_V0
  deliverable_id: PUBLIC_SYNTH_OUROBOROS_REVIEW_DELIVERABLE_001
  source_kind: synthetic_from_workflow_contract_metadata_only
  public_safe: true
  review_mode: owner_triggered_gap_probe
  readiness: reviewed_public_safe_draft
  evidence_boundary:
    available:
      - workflow contract metadata
      - public step graph
      - public-safe synthetic fixture
    unavailable:
      - resolved vision content
      - resolved roadmap content
      - current canon contents
      - recent activity details
      - owner answers
      - private evidence
      - runtime state
    non_claims:
      - No roadmap mutation is claimed.
      - No owner intent is inferred.
      - No canon change is claimed.
      - No runtime execution, archival, or verification is claimed.

  project_binding:
    binding_id: PUBLIC_SYNTH_BINDING_001
    review_window: synthetic_fixture_only
    input_refs:
      - vision_and_goal_refs
      - roadmap_refs
      - current_canon_catalog_refs
      - recent_activity_refs
    owner_boundary: Owner retains final intent and authority over roadmap, canon, mission, and workflow changes.
    evidence_output_root: unspecified
    stop_conditions:
      - Stop before treating placeholder references as resolved evidence.
      - Stop before converting a recommendation into a roadmap mutation.
      - Stop before promoting a candidate constraint without owner decision or supporting canon.
      - Stop before publishing or inferring private evidence.

  vision_alignment_report:
    report_id: PUBLIC_SYNTH_ALIGNMENT_001
    status: limited_confirmation
    review_lane: vision_alignment_review
    confirmation:
      id: PUBLIC_SYNTH_ROADMAP_CONFIRMATION_001
      finding: The workflow summary and required outputs are structurally aligned with the fixture’s stated strategic-review scenario.
      basis:
        - Both preserve vision alignment review.
        - Both preserve owner-intent gaps as questions.
        - Both require a next-focus recommendation.
        - Both prohibit invented owner intent.
      confidence: confirmed_at_contract_metadata_level_only
      limitation: Alignment with the substantive Soulforge vision, roadmap priorities, active slice, or recent work cannot be determined from unresolved references.
    roadmap_effect: recommendation_only
    unresolved_alignment_question: Does the current active roadmap slice prioritize running this harness now?
    prohibited_inference: The workflow’s structural fit does not establish substantive roadmap approval.

  owner_intent_gap_register:
    register_id: PUBLIC_SYNTH_INTENT_GAPS_001
    gaps:
      - gap_id: PUBLIC_SYNTH_GAP_001
        dimension: promotion_threshold
        finding_type: owner_intent_gap
        status: unresolved
        question: What evidence threshold should make a repeated strategic gap eligible for canon-constraint consideration?
        known_basis:
          - Repeated or answered gaps may be routed as candidates.
          - The contract does not define a numeric or categorical promotion threshold.
        unknowns:
          - Required recurrence count
          - Required review evidence
          - Whether an explicit owner answer is always mandatory
        authority: owner_decision
        boundary: This gap is a question, not evidence that any threshold already exists.

  ambiguity_ledger:
    ledger_id: PUBLIC_SYNTH_AMBIGUITY_001
    scale:
      clear: Explicitly established by supplied metadata.
      partial: Structurally addressed but substantively unresolved.
      unclear: Requires evidence or owner direction not supplied.
    dimensions:
      - dimension: vision_alignment
        state: partial
        rationale: Structural alignment is confirmable; substantive alignment is not.
      - dimension: owner_intent
        state: unclear
        rationale: No owner answer establishes a promotion threshold.
      - dimension: canon_constraint
        state: partial
        rationale: Candidate routing exists, but promotion authority and threshold remain bounded.
      - dimension: cadence
        state: partial
        rationale: Supported modes are listed, but no current cadence is selected.
      - dimension: promotion_threshold
        state: unclear
        rationale: No threshold is supplied.
      - dimension: verification_expectation
        state: partial
        rationale: Reviewed public-safe draft is required, but runtime verification is outside this fixture.
    smallest_next_useful_question_id: PUBLIC_SYNTH_QUESTION_001

  socratic_question_packet:
    packet_id: PUBLIC_SYNTH_QUESTION_PACKET_001
    routes:
      - gap_id: PUBLIC_SYNTH_GAP_001
        classification: owner_decision
        owner_facing: true
        reason: The answer establishes governance intent rather than resolving a supplied repository fact.
        prerequisite_repo_fact_status: not_applicable_to_available_fixture
    held_routes:
      - classification: repo_fact
        status: none_created
        reason: Placeholder references cannot be treated as resolved repository facts.
      - classification: research_confirmation
        status: none_created
        reason: No external research claim is required by the fixture.
      - classification: defer
        status: none_created
        reason: The single owner decision is useful for bounded next-focus routing.

  owner_question_queue:
    queue_id: PUBLIC_SYNTH_OWNER_QUEUE_001
    status: owner_decision_required
    questions:
      - question_id: PUBLIC_SYNTH_QUESTION_001
        priority: next_useful_question
        question: What evidence threshold should make a repeated strategic gap eligible for canon-constraint consideration?
        evidence:
          - The workflow routes repeated or answered gaps toward possible owner surfaces.
          - No promotion threshold is supplied.
        impacted_surfaces:
          - canon constraint candidate routing
          - ouroboros loop ledger
          - future workflow or mission authoring
        options:
          - option_id: A
            label: Owner answer required
            effect: A gap becomes promotion-eligible only after explicit owner direction.
          - option_id: B
            label: Recurrence plus review
            effect: A gap becomes eligible after repeated ledger entries and a separate review, while final promotion still requires owner authority.
          - option_id: C
            label: Keep case-by-case
            effect: No standing threshold is created; each candidate remains individually bounded.
        safe_default:
          option_id: C
          rationale: It preserves uncertainty and prevents premature canon promotion.
        downstream_consequence: The answer may define a candidate constraint but does not itself mutate canon.

  closure_restatement_note:
    note_id: PUBLIC_SYNTH_CLOSURE_001
    status: owner_decision_required
    restatement: No owner decision is available; therefore the promotion threshold remains undefined and no canon, mission, roadmap, or workflow change is authorized.

  canon_constraint_candidate_register:
    register_id: PUBLIC_SYNTH_CANON_CANDIDATES_001
    candidates:
      - candidate_id: PUBLIC_SYNTH_CONSTRAINT_CANDIDATE_001
        title: Strategic-gap promotion threshold
        candidate_statement: A repeated strategic gap should not be promoted into canon solely because it recurs; promotion requires a declared evidence threshold and retained owner authority.
        source_gap_id: PUBLIC_SYNTH_GAP_001
        status: candidate_only
        support_level: workflow_contract_and_fixture_metadata
        owner_decision_required: true
        eligible_targets:
          - workflow routing rule
          - mission constraint
          - canon constraint
        prohibited_action: Do not apply or register this candidate as canon from this deliverable.

  next_focus_recommendation:
    recommendation_id: PUBLIC_SYNTH_NEXT_FOCUS_001
    recommendation: Keep the harness at reviewed public-safe draft status and obtain the single bounded owner decision on the strategic-gap promotion threshold before proposing stronger routing or canon constraints.
    rationale:
      - Structural roadmap alignment is confirmed only at metadata level.
      - The unresolved threshold directly affects candidate promotion.
      - The safe default avoids invented intent and unintended canon mutation.
    disposition: ask_owner_question
    safe_default_if_unanswered: Retain case-by-case handling and keep the candidate private or synthetic.
    non_authority: This recommendation does not change the roadmap or active slice.

  ouroboros_loop_ledger:
    ledger_id: PUBLIC_SYNTH_LOOP_LEDGER_001
    entries:
      - loop_entry_id: PUBLIC_SYNTH_LOOP_ENTRY_001
        gap_id: PUBLIC_SYNTH_GAP_001
        first_observed_in: PUBLIC_SYNTH_OUROBOROS_STRATEGIC_REVIEW_HARNESS_V0
        recurrence_status: not_established
        route: owner_decision
        question_id: PUBLIC_SYNTH_QUESTION_001
        candidate_id: PUBLIC_SYNTH_CONSTRAINT_CANDIDATE_001
        current_state: awaiting_owner_direction
        closure_condition:
          - Owner selects or supplies a promotion-threshold policy.
          - The decision is restated in one sentence.
          - Any resulting change is routed to its proper owner surface.
          - Harness-driven edits, if any, receive the required downstream review.
        archive_status: deliverable_only_not_claimed_archived

  final_stop_state:
    state: owner_decision_required
    permitted_next_action: Present PUBLIC_SYNTH_QUESTION_001 for owner direction.
    prohibited_next_actions:
      - Infer the owner’s preferred option.
      - Claim substantive roadmap alignment.
      - Promote PUBLIC_SYNTH_CONSTRAINT_CANDIDATE_001.
      - Mutate canon, roadmap, mission, or workflow artifacts.
      - Claim archival, execution, or runtime verification.
