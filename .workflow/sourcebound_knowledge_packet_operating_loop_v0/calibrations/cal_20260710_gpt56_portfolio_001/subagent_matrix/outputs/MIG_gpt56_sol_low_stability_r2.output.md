schema_version: sourcebound_knowledge_packet_dry_run_v0
workflow_id: sourcebound_knowledge_packet_operating_loop_v0
fixture_id: public_synthetic_mixed_evidence_projection
execution_state: stopped_at_scope_binding
public_safe: true
dry_run_only: true

project_binding:
  source_scope_binding: fixture://knowledge/demo_connector_rules
  topic: synthetic connector constraint semantics
  source_truth_owner: unresolved
  private_output_root: unresolved
  public_payload_copy: false
  advisory_tool_authority: none
  owner_held_archive:
    requested: true
    agent_upload_authority: none
  promotion_policy:
    public_canon_requires_owner_or_applicable_delegation_plus_review: true
    applicable_delegated_policy_ref: null
    owner_decision_ref: null

binding_validation:
  status: blocked
  checks:
    private_output_root_declared: unknown
    source_truth_owner_declared: unknown
    archive_policy_declared: pass
    public_package_payload_free: pass
    advisory_tool_non_authority_policy_declared: pass
  blockers:
    - blocker_id: synthetic-blocker-private-root
      condition: No explicit private output root is present in the fixture.
      required_resolution: Supply a synthetic private output-root reference.
    - blocker_id: synthetic-blocker-truth-owner
      condition: No explicit source-truth owner declaration is present in the fixture.
      required_resolution: Supply the applicable synthetic source-truth owner or policy reference.
  stop_condition: bind_source_scope.on_fail
  continuation_allowed: false

source_intake_manifest:
  state: not_produced_due_to_upstream_stop
  approved_source_refs: []
  rejected_or_gap_refs: []
  note: Source states are visible in the fixture, but intake is downstream of the failed binding step.

source_gap_handoff:
  state: not_produced_due_to_upstream_stop
  prospective_items:
    - source_ref: fixture://sources/candidate-C
      visible_fixture_state: candidate_official
      prospective_route: source_gap_followup
      non_claim: Not accepted as approved truth.
    - source_ref: fixture://sources/conflict-D
      visible_fixture_state: conflicting
      prospective_route: contradiction_review
      non_claim: Not accepted as approved truth.

sourcebound_knowledge_packet_manifest:
  state: not_produced_due_to_upstream_stop
  projection_boundary: private_derivative_only
  payload_included: false

compiled_projection_index:
  state: not_produced_due_to_upstream_stop
  authority: none
  payload_included: false

compiled_projection_log:
  state: not_produced_due_to_upstream_stop
  authority: none
  payload_included: false

contradiction_gap_lint_report:
  state: not_produced_due_to_upstream_stop
  unresolved_visible_risks:
    - risk_id: synthetic-risk-family-mapping-conflict
      refs:
        - fixture://sources/owner-local-B
        - fixture://sources/conflict-D
      note: The fixture describes differing connector-family mappings; no resolution is established.
    - risk_id: synthetic-risk-unverified-limit
      refs:
        - fixture://sources/candidate-C
      note: The alternate limit remains unverified and outside approved source states.
    - risk_id: synthetic-risk-condition-detail
      refs:
        - fixture://sources/official-A
      note: The fixture supports only that maximum current is conditional on ambient temperature; no threshold, curve, value, or formula is supplied.

concept_candidate_register:
  state: not_produced_due_to_upstream_stop
  candidates: []

claim_ceiling_and_promotion_route:
  state: not_produced_due_to_upstream_stop
  global_ceiling: no_claim
  default_route: hold_private
  canon_candidate_blocked: true
  canon_entry_blocked: true
  blockers:
    - initial scope binding incomplete
    - no applicable delegated canon policy
    - no owner decision
    - no post-development review-gate result

knowledge_package_archive_manifest:
  state: not_produced_due_to_upstream_stop
  requested_archive_status: working_packet
  upload_authorized: false
  upload_performed: false
  archive_authority: storage_and_backup_only
  canon_package_allowed: false

ontology_candidate_rule_register:
  state: not_produced_due_to_upstream_stop
  candidate_only: true
  rules: []
  ontology_acceptance: false
  ontology_mutation: false

optional_notebooklm_advisory_handoff:
  state: skipped
  reason: Upstream binding is blocked and no advisory return refs are supplied.
  owner_operated_upload_required: true
  payload_included: false
  credentials_or_sessions_included: false
  advisory_answer_authority: none

notebooklm_handoff_validation:
  state: skipped
  tool_answer_used_as_verdict: false
  source_and_review_authority_preserved: true

workflowization_review_packet:
  state: not_assembled_due_to_upstream_stop
  source_truth_boundary: Source truth remains exclusively with approved source packets or owner-held sources.
  projection_boundary: No private projection is represented as having been compiled.
  concept_candidate_routes: []
  claim_ceiling_summary: No downstream claim is authorized.
  knowledge_package_archive_summary: Archive requested, but upload authority is none.
  ontology_candidate_rule_summary: No ontology rules were extracted or accepted.
  notebooklm_handoff_validation_summary: Skipped; no advisory verdict exists.
  workflow_or_ontology_candidate_delta: none
  review_gate_required: true

boundary_review_note:
  disposition: stop
  ready_for_review_gate: false
  required_next_inputs:
    - explicit synthetic private output-root reference
    - explicit synthetic source-truth owner or applicable policy reference
  preserved_boundaries:
    - candidate and conflicting sources are not approved truth
    - no source or projection payload is included
    - no archive or advisory upload is authorized
    - no advisory result is treated as truth
    - no ontology or workflow candidate is accepted
    - no canon promotion is permitted
  future_gate_requirement:
    workflow_id: post_development_review_gate_v0
    minimum_level: inspector_and_judge
    prerequisite: Successful completion of all preceding workflow steps.
