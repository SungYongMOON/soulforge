owner_decision_packet:
  workflow_id: owner_decision_packet_v0
  fixture_id: PUBLIC_SYNTH_OWNER_DECISION_PACKET
  status: recorded
  source_kind: synthetic_from_workflow_contract
  public_safe: true
  decision:
    scope: public sample release naming convention only
    statement: Owner approves renaming the public sample output field from old_label to display_label for future examples.
    policy: Record scope, affected artifacts, downstream effects, and non-claims. Do not mutate upstream artifacts or claim tests passed.
  binding:
    applies_to:
      - workflow:project_readiness_digest_v0
    evidence_basis_refs:
      - decision-note:public-synthetic-001
    effective_surface: future public examples within the stated scope
    upstream_mutation_authorized: false
  uncertainty:
    - No affected page, asset, harness, or connection references were supplied.
    - No implementation status, migration completion, compatibility behavior, or validation result was supplied.

decision_effect_register:
  - effect_id: synthetic-effect-001
    decision_ref: decision-note:public-synthetic-001
    affected_ref: workflow:project_readiness_digest_v0
    surface: future public sample outputs
    approved_change:
      from: old_label
      to: display_label
    required_treatment: Use display_label when authoring future examples within the approved scope.
    upstream_change_status: not established
    implementation_status: not established
    validation_status: not established
  - effect_id: synthetic-effect-002
    decision_ref: decision-note:public-synthetic-001
    affected_ref: unspecified existing examples
    surface: previously authored public samples
    approved_change: No retroactive mutation is authorized by this packet.
    required_treatment: Obtain explicit scope and artifact references before modifying existing examples.
    implementation_status: not applicable

downstream_effect_map:
  decision_ref: decision-note:public-synthetic-001
  effects:
    - downstream_surface: future example authoring
      effect: Emit display_label instead of old_label within the stated naming scope.
      condition: The example is public and governed by this decision.
    - downstream_surface: documentation or consumers referencing future examples
      effect: May require corresponding naming alignment.
      condition: Apply only after the affected artifacts are explicitly identified.
    - downstream_surface: existing artifacts and upstream workflow definitions
      effect: No mutation follows from this packet alone.
      condition: Separate authorization and bounded artifact references are required.
  non_claims:
    - This decision does not prove that workflow:project_readiness_digest_v0 has been changed.
    - This decision does not prove that any example, schema, page, asset, harness, or connection has been updated.
    - This decision does not establish backward compatibility or removal behavior for old_label.
    - This decision does not establish that tests, validators, builds, or runtime checks passed.
    - This decision does not establish deployment, publication, registration, or consumer adoption.
    - The evidence reference records the stated decision basis; it does not establish technical correctness.

boundary_review_note:
  result: bounded_with_unresolved_execution
  scope_preserved: true
  owner_boundary_preserved: true
  source_boundary_preserved: true
  upstream_mutation_permitted: false
  technical_evidence_overclaim_detected: false
  stop_conditions:
    - Stop before editing existing or upstream artifacts because no mutation authority is supplied.
    - Stop before asserting implementation, compatibility, validation, deployment, or runtime behavior.
    - Stop before extending the decision beyond future public examples or the stated naming convention.
    - Stop and request owner clarification if old_label retention, deprecation, migration, or retroactive updates are required.
  unresolved_items:
    - Exact future example artifacts are unspecified.
    - Compatibility policy for old_label is unspecified.
    - Effective date or release boundary is unspecified.
    - Implementation and validation evidence are absent.
