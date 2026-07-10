workflow_id: technical_risk_open_question_burndown_v0
fixture_id: PUBLIC_SYNTH_TECHNICAL_RISK_OPEN_QUESTION_BURNDOWN_V0

technical_risk_register:
  - risk_id: SYN-RISK-001
    title: Interface compatibility remains uncertain
    severity: medium
    status: open
    basis: synthetic_fixture_scenario_fact
    description: An interface dependency may not be compatible with the intended harness or downstream integration.
    unresolved_uncertainty: Compatibility evidence is not supplied.
    owner_acceptance: not_assessed
    false_resolution: not_resolved

open_question_register:
  - question_id: SYN-Q-001
    question: Which interface contract and compatibility evidence are authoritative for integration?
    status: open
    answer: unknown
    owner: unassigned
    source_boundary: No authoritative source packet is supplied in this fixture.

closure_criteria_register:
  - criterion_id: SYN-CRIT-001
    applies_to:
      - SYN-RISK-001
      - SYN-Q-001
    criterion: An approved interface contract and compatibility result are supplied, reviewed by the designated owner, and linked to the affected integration boundary.
    completion_state: not_met
    acceptance_authority: designated_owner
    workflow_authority: register_only

burndown_summary:
  total_risks: 1
  total_open_questions: 1
  open_risks: 1
  unresolved_questions: 1
  closure_criteria_pending: 1
  status: open
  resolution_claim: none

owner_followup_needed:
  - followup_id: SYN-FU-001
    target_refs:
      - SYN-RISK-001
      - SYN-Q-001
    requested_action: Provide or approve the governing interface contract and compatibility evidence.
    owner: designated_owner
    due: not_specified
    acceptance_status: pending

rerun_routes:
  - route_id: SYN-RERUN-001
    trigger: Approved interface evidence or an owner decision becomes available.
    rerun_workflow_id: technical_risk_open_question_burndown_v0
    expected_update:
      - technical_risk_register
      - open_question_register
      - closure_criteria_register
      - burndown_summary
    downstream_trigger_candidates:
      - review_gate_evidence_pack_v0
      - review_action_item_closure_loop_v0

boundary_review_note:
  public_safe: true
  source_kind: synthetic_from_workflow_contract
  upstream_artifacts: read_only
  owner_acceptance: not_claimed
  upstream_mutation: not_performed
  tool_use: not_claimed
  runtime_facts: not_claimed
  hidden_private_evidence: not_used
  authority_note: This register preserves uncertainty and routing; it does not resolve the risk, answer the question, or constitute owner acceptance.
