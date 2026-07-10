```yaml
workflow_id: accepted_verification_result_packet_v0
fixture_id: PUBLIC_SYNTH_ACCEPTED_VERIFICATION_RESULT
public_safe: true

project_binding:
  workflow_id: accepted_verification_result_packet_v0
  fixture_id: PUBLIC_SYNTH_ACCEPTED_VERIFICATION_RESULT
  result_scope_refs:
    - scope:interface-smoke-public

result_summary:
  scope_refs:
    - scope:interface-smoke-public
  accepted_count: 1
  blocked_or_inconclusive_count: 1
  overall_status: partially_accepted
  statement: One scoped pass result is accepted; one inconclusive result remains blocked because its measurement artifact is missing.
  non_claims:
    - No broader execution or project-wide verdict is claimed.
    - No owner acceptance beyond the supplied scope is claimed.
    - No upstream artifact mutation is claimed.

accepted_result_rows:
  - id: VR-001
    scope_refs:
      - scope:interface-smoke-public
    result_artifact_ref: public synthetic smoke log ref
    verdict: pass
    acceptance: accepted
    acceptance_basis: public synthetic smoke log ref

blocked_or_inconclusive_rows:
  - id: VR-002
    scope_refs:
      - scope:interface-smoke-public
    result_artifact_ref: null
    verdict: inconclusive
    acceptance: blocked
    blocking_basis: missing measurement artifact
    required_next_evidence:
      - measurement artifact scoped to VR-002

acceptance_provenance:
  policy: Accept only rows with scoped result artifact and acceptance basis; blocked or inconclusive rows remain explicit.
  verification_plan_refs:
    - plan:interface-contract-v0
  result_scope_refs:
    - scope:interface-smoke-public
  accepted_rows:
    - VR-001
  blocked_or_inconclusive_rows:
    - VR-002
  source_kind: synthetic_from_workflow_contract

boundary_review_note:
  upstream_artifacts_read_only: true
  execution_artifact_mutation: not_claimed
  owner_acceptance_beyond_scope: not_claimed
  source_authority_replacement: not_claimed
  acceptance_basis_required: true
  review_status: bounded_public_safe_packet
```
