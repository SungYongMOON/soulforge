accepted_verification_result_packet:
  workflow_id: accepted_verification_result_packet_v0
  fixture_id: PUBLIC_SYNTH_ACCEPTED_VERIFICATION_RESULT
  source_kind: synthetic_from_workflow_contract
  public_safe: true
  result_scope_identity:
    verification_result_scope_refs:
      - scope:interface-smoke-public
    verification_plan_refs:
      - plan:interface-contract-v0
    trace_matrix_refs: []
    owner_decision_refs: []
  acceptance_policy:
    statement: "Accept only rows with scoped result artifact and acceptance basis; blocked or inconclusive rows remain explicit."
    scope_limit: scope:interface-smoke-public
  accepted_result_row_identity:
    - VR-001

result_summary:
  total_rows: 2
  accepted_rows: 1
  blocked_or_inconclusive_rows: 1
  verdict_counts:
    pass: 1
    fail: 0
    inconclusive: 1
  summary: "VR-001 is accepted within the supplied synthetic scope and stated acceptance policy. VR-002 remains blocked and inconclusive because its measurement artifact is missing."
  non_claims:
    - "No acceptance beyond the supplied result scope is asserted."
    - "No owner acceptance beyond the stated synthetic acceptance basis is asserted."
    - "No upstream artifact mutation or source-authority replacement is asserted."
    - "No runtime verification is asserted."

accepted_result_rows:
  - accepted_result_row_id: VR-001
    result_artifact_ref:
      id: VR-001
      basis: "public synthetic smoke log ref"
    scope_ref: scope:interface-smoke-public
    verdict: pass
    acceptance_status: accepted
    acceptance_basis: "public synthetic smoke log ref"
    acceptance_limit: "Accepted only within scope:interface-smoke-public under the supplied policy."
    uncertainty: "The fixture supplies a reference and basis but no underlying artifact contents; no broader technical conclusion is claimed."

blocked_or_inconclusive_rows:
  - result_row_id: VR-002
    result_artifact_ref:
      id: VR-002
    scope_ref: scope:interface-smoke-public
    verdict: inconclusive
    acceptance_status: blocked
    blocking_basis: "missing measurement artifact"
    stop_condition: "Remain blocked and inconclusive until a scoped measurement artifact and valid acceptance basis are supplied."
    prohibited_inference: "Do not infer pass, fail, acceptance, or owner approval from the available fixture."

acceptance_provenance:
  policy_source: approved_result_acceptance_policy
  scope_sources:
    - scope:interface-smoke-public
  optional_alignment_sources:
    verification_plan_refs:
      - plan:interface-contract-v0
  row_provenance:
    - row_id: VR-001
      source_ref: VR-001
      supplied_verdict: pass
      supplied_acceptance: accepted
      supplied_basis: "public synthetic smoke log ref"
      disposition: accepted_within_scope
    - row_id: VR-002
      source_ref: VR-002
      supplied_verdict: inconclusive
      supplied_acceptance: blocked
      supplied_basis: "missing measurement artifact"
      disposition: blocked_or_inconclusive
  authority_boundary:
    upstream_artifacts_read_only: true
    source_authority_replaced: false
    owner_acceptance_extended: false

boundary_review_note:
  status: bounded
  findings:
    - "Accepted and blocked rows are explicitly separated."
    - "VR-001 acceptance is limited to the supplied synthetic scope and basis."
    - "VR-002 retains its blocked and inconclusive state."
    - "Missing evidence is not converted into a verdict or acceptance claim."
  stop_conditions:
    - "Do not promote VR-002 without a scoped measurement artifact and acceptance basis."
    - "Do not extend VR-001 to another scope without a corresponding scoped acceptance basis."
    - "Do not treat this packet as mutation or independent verification of upstream artifacts."
