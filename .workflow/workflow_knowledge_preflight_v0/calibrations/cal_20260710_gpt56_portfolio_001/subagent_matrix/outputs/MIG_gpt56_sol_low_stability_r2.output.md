schema_version: knowledge_preflight_packet_v0
fixture_id: public_synthetic_query_first_early_resolution
public_safe: true
boundary_attestation: "All knowledge refs, target requests, and coverage statements are synthetic metadata."

project_binding:
  target_workflow_id: outbound_mail_authoring_v0
  workflow_request:
    request: "Draft a synthetic outbound status mail using the current subject-keyword and footer rules."
    knowledge_need:
      - subject keyword precedence
      - footer authority boundary
  project_knowledge_context_refs:
    - fixture://projects/demo-mail-context
  preflight_policy:
    query_first: true
    source_deepening_only_when_needed: true
    no_payload_copy: true
  binding_status: bound_for_preflight_only
  non_claims:
    - target workflow completion
    - rule payload availability
    - owner approval
    - source truth
    - ontology acceptance
    - canon promotion

query_first_plan:
  investigation_order:
    - order: 1
      surfaces:
        - .registry/knowledge
        - canon_backed_obsidian_export
        - wiki_index_refs
      purpose: "Resolve the requested knowledge needs from canon-facing metadata refs."
      result: sufficient
      stop_condition: "Stop before advisory and source-heavy surfaces when all knowledge needs have sufficient coverage."
    - order: 2
      surfaces:
        - NotebookLM bindings
        - notebook/source maps
      condition: "Only if order 1 is insufficient."
      disposition: skipped_due_to_early_resolution
    - order: 3
      surfaces:
        - _workmeta evidence
        - source packets
        - prior sourcebound claim routes
      condition: "Only if preceding surfaces are insufficient."
      disposition: skipped_due_to_early_resolution
    - order: 4
      surfaces:
        - Drive refs
        - canon-package refs
      condition: "Only if all earlier surfaces leave the request unresolved."
      disposition: skipped_due_to_early_resolution

knowledge_preflight_packet:
  resolution_status: resolved_at_canon_surface_metadata
  used_refs:
    - ref: registry://knowledge/mail_subject_rules
      surface: .registry/knowledge
      coverage:
        - subject keyword precedence
      supplied_status: sufficient
      use_boundary: "Coverage metadata only; no rule payload copied."
    - ref: obsidian://canon/mail_footer_boundary
      surface: canon_backed_obsidian_export
      coverage:
        - footer authority boundary
      supplied_status: sufficient
      use_boundary: "Coverage metadata only; no footer text or authority decision copied."
  skipped_refs:
    - ref: fixture://notebook/binding-not-needed
      surface: NotebookLM
      reason: "Canon-facing refs already cover all declared knowledge needs."
    - ref: fixture://rollup/not-needed
      surface: knowledge_access_rollup
      reason: "Later evidence context was unnecessary after early resolution."
    - ref: fixture://sources/not-needed
      surface: source_packet
      reason: "Source deepening was not triggered."
    - ref: fixture://archive/not-needed
      surface: drive_archive
      reason: "Archive inspection is last-resort and was not triggered."
  absent_optional_refs:
    sourcebound_packet_refs: []
    owner_decision_refs: []
  uncertainty:
    - "The fixture establishes metadata coverage and supplied sufficiency status, but does not contain the substantive subject-keyword rules."
    - "The fixture identifies a footer authority boundary ref, but does not supply footer wording or grant authority to approve it."
    - "No target-workflow output can be derived from coverage metadata alone."

source_scope_recommendation:
  current_scope:
    include:
      - registry://knowledge/mail_subject_rules
      - obsidian://canon/mail_footer_boundary
    exclude:
      - fixture://notebook/binding-not-needed
      - fixture://rollup/not-needed
      - fixture://sources/not-needed
      - fixture://archive/not-needed
  recommendation: no_source_deepening
  rationale: "The two declared knowledge needs are marked sufficient at the first investigation stage."
  approved_route_required_for_deepening: true
  reroute_conditions:
    - "A used ref is unavailable to the target workflow."
    - "A used ref does not contain the rule represented by its coverage metadata."
    - "The two refs conflict or leave precedence ambiguous."
    - "The requested mail requires knowledge outside the two declared needs."
    - "Footer use requires an owner decision not already represented by an authorized ref."
  reroute_targets:
    unresolved_source_scope: sourcebound_knowledge_packet_operating_loop_v0
    repeated_or_reusable_gap: knowledge_candidate_triage_v0
    reusable_missing_knowledge: knowledge_wiki_pipeline_v0
    owner_decision_needed: owner_decision_packet_v0
    public_or_canon_promotion: post_development_review_gate_v0

claim_ceiling_seed:
  ceiling: metadata_coverage_only
  strength: weakest
  allowed_seed_claims:
    - "registry://knowledge/mail_subject_rules is identified as covering subject keyword precedence."
    - "obsidian://canon/mail_footer_boundary is identified as covering the footer authority boundary."
    - "The supplied metadata marks both refs sufficient for the declared preflight needs."
  prohibited_claims:
    - "The actual subject-keyword precedence is known."
    - "Any specific footer text is authorized."
    - "The refs establish raw-source truth."
    - "The outbound mail is complete, compliant, approved, or ready to send."
    - "An owner decision, ontology acceptance, or canon promotion occurred."
  promotion_requirement: "Any stronger claim must be established within an authorized downstream process using the referenced content and applicable review gates."
  final_claim: false

target_workflow_handoff:
  target_workflow_id: outbound_mail_authoring_v0
  handoff_status: preflight_metadata_ready
  metadata_refs:
    subject_keyword_precedence: registry://knowledge/mail_subject_rules
    footer_authority_boundary: obsidian://canon/mail_footer_boundary
    project_context: fixture://projects/demo-mail-context
  instructions:
    - "Resolve the synthetic subject using the referenced subject-rule content."
    - "Apply only footer content and authority permitted by the referenced footer-boundary content."
    - "Keep drafting and any approval or sending authority separate."
    - "Do not infer rule text from this preflight packet."
  uncertainty:
    - "The operative rule contents are not present in this metadata-only handoff."
    - "No owner-decision ref was supplied."
    - "No claim is made that the target workflow can access or interpret the referenced content."
  stop_conditions:
    - "Stop if either required ref is unavailable."
    - "Stop if subject precedence remains ambiguous."
    - "Stop before asserting or exercising footer approval authority."
    - "Stop if the requested draft requires knowledge beyond the declared scope."
  reroute_triggers:
    - trigger: missing_or_inadequate_reference_content
      route: sourcebound_knowledge_packet_operating_loop_v0
    - trigger: recurring_knowledge_gap
      route: knowledge_candidate_triage_v0
    - trigger: reusable_missing_guidance
      route: knowledge_wiki_pipeline_v0
    - trigger: owner_authority_required
      route: owner_decision_packet_v0
    - trigger: public_or_canon_promotion_requested
      route: post_development_review_gate_v0
  excluded_actions:
    - NotebookLM operation
    - workmeta inspection
    - source-packet inspection
    - archive inspection
    - payload copying
    - final mail drafting within this preflight
    - approval or sending
    - canon promotion

boundary_review_note:
  result: boundary_preserved
  checks:
    fixed_investigation_order: preserved
    early_stop_after_sufficient_canon_refs: preserved
    notebooklm_advisory_only: preserved_and_not_used
    later_surface_inspection: not_required
    metadata_only: preserved
    payload_copy: excluded
    claim_seed_treated_as_final_claim: false
    source_truth_claimed: false
    target_workflow_completed: false
    owner_authority_claimed: false
    ontology_acceptance_claimed: false
    canon_promotion_claimed: false
  residual_risk:
    - "Coverage labels do not expose the underlying rule content."
    - "The target workflow must preserve the separation between drafting, approval, and sending authority."
