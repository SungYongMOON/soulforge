workflow_id: frontline_assault
fixture_id: PUBLIC_SYNTH_FRONTLINE_ASSAULT
deliverable_status: candidate
source_kind: synthetic_from_workflow_contract
public_safe: true

scout_report:
  workflow_title: Frontline Assault
  confirmed_objective: one confirmed frontline objective
  ambiguous_threat_signal:
    status: unresolved
    action: retain ambiguity; do not infer or resolve
  source_boundary:
    supported_by: supplied synthetic fixture and public workflow contract
    not_supported_by: runtime evidence, private evidence, tool output, or file state

decision_note:
  decision_scope: coordinate the next workflow step
  decision:
    status: conditional
    basis: confirmed frontline objective
  unresolved_constraints:
    - ambiguous threat signal remains unresolved
    - runtime execution has not established delivery readiness
  stop_conditions:
    - stop if the objective becomes unconfirmed
    - stop if resolution of the ambiguous threat signal is required
    - stop if runtime evidence is required but unavailable
  authority_boundary:
    - do not promote synthetic fixture facts into runtime truth
    - do not convert curated lessons into mission-specific evidence

delivery_handoff:
  handoff_status: pending_later_runtime_execution
  handoff_target: deliver
  dependency: later runtime execution
  transfer_payload:
    - confirmed frontline objective
    - unresolved ambiguous threat signal
    - decision scope and stop conditions
  recipient_actions:
    - establish runtime execution truth
    - record runtime evidence in the mission runtime workspace
    - return delivery outcome for owner review
  non_claims:
    - delivery has not been completed
    - runtime paths and artifacts are unspecified
    - no tool use, file edit, message send, or service contact is asserted

boundary_review_note:
  boundary_status: explicit
  curated_lessons:
    location: workflow canon
    use: reusable guidance only
  runtime_truth:
    location: mission runtime workspace
    use: execution-specific evidence only
  prohibited_claims:
    - no hidden private evidence
    - no unprovided runtime facts
    - no upstream artifact mutation
    - no stronger source or canon authority than supplied
  review_gate:
    status: pending
    release_condition: owner confirms runtime evidence and delivery outcome
