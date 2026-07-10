workflow_id: frontline_assault
fixture_id: PUBLIC_SYNTH_FRONTLINE_ASSAULT
deliverable_kind: workflow_calibration_candidate
public_safe: true
source_kind: synthetic_from_workflow_contract
status: pending_runtime_execution

scout_report:
  step_id: scout
  confirmed:
    - "One frontline objective exists."
  unresolved:
    - signal: "One ambiguous threat signal exists."
      disposition: "Remain unresolved pending runtime evidence."
  source_boundary:
    - "This report derives only from the public-safe synthetic fixture."
    - "No runtime truth, hidden evidence, or stronger source authority is asserted."
  stop_conditions:
    - "Stop escalation if resolving the threat would require unavailable runtime evidence."
    - "Do not convert ambiguity into a curated lesson."

decision_note:
  step_id: decide
  decision: "Proceed with a conditional delivery handoff for the confirmed objective."
  constraints:
    - "Treat the ambiguous threat signal as unresolved."
    - "Do not represent planned delivery as completed runtime execution."
    - "Keep curated lessons distinct from runtime truth."
  owner_boundary:
    - "The later runtime executor owns execution facts and resulting runtime truth."
    - "Any promotion into curated lessons requires separately supported review."
  stop_conditions:
    - "Do not authorize claims beyond the supplied contract and fixture."
    - "Pause if safe delivery requires resolution of the ambiguous threat signal."

delivery_handoff:
  step_id: deliver
  handoff_status: ready_for_later_runtime_execution
  objective: "The single confirmed frontline objective."
  receiving_role: "Synthetic runtime executor"
  instructions:
    - "Execute only within separately established runtime authority."
    - "Record actual outcomes as runtime truth in the mission-owned runtime context."
    - "Preserve the ambiguous threat signal as unresolved unless runtime evidence resolves it."
    - "Return confirmed outcomes, blockers, and remaining uncertainty for later review."
  non_claims:
    - "Delivery has not been executed."
    - "No runtime outcome, artifact mutation, or mission completion is claimed."
    - "No curated lesson has been created or updated."
  completion_condition:
    - "The receiving runtime owner supplies evidence-backed execution results."
  stop_conditions:
    - "Stop if runtime authority, objective scope, or safe execution conditions are absent."
    - "Stop rather than infer missing runtime facts."

boundary_review_note:
  public_safe: true
  preserved_terms:
    - curated lessons
    - runtime truth
    - boundary
    - handoff
  findings:
    - "The confirmed objective is separated from the unresolved threat signal."
    - "The handoff is conditional on later runtime execution."
    - "Curated lessons remain workflow-canon material; runtime truth remains mission-runtime-owned."
    - "No upstream mutation or stronger source/canon authority is asserted."
    - "All identifiers and content remain synthetic and public-safe."
  final_state: "Usable as a planning handoff; incomplete as runtime evidence or proof of delivery."
