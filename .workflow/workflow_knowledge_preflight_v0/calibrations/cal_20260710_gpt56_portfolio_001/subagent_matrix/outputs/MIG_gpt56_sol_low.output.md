schema_version: knowledge_preflight_packet_v0
fixture_id: public_synthetic_query_first_early_resolution
public_safe: true
boundary_attestation: "All knowledge refs, target requests, and coverage statements are synthetic metadata."

project_binding:
  workflow_request_binding:
    request: "Draft a synthetic outbound status mail using the current subject-keyword and footer rules."
    knowledge_need:
      - subject keyword precedence
      - footer authority boundary
  target_workflow_id: outbound_mail_authoring_v0
  project_knowledge_context_refs:
    - fixture://projects/demo-mail-context
  policy:
    query_first: true
    source_deepening_only_when_needed: true
    no_payload_copy: true
  preflight_scope: metadata_only
  target_workflow_completion_authorized: false

query_first_plan:
  fixed_surface_order:
    - order: 1
      surfaces:
        - .registry/knowledge
        - canon_backed_obsidian_export
        - wiki_index_refs
      disposition: resolve_first
    - order: 2
      surfaces:
        - notebooklm_bindings
        - notebook_source_maps
      disposition: skip_if_order_1_is_sufficient
    - order: 3
      surfaces:
        - _workmeta_evidence
        - source_packets
        - prior_sourcebound_claim_routes
      disposition: skip_if_earlier_surfaces_are_sufficient
    - order: 4
      surfaces:
        - drive_archive_refs
        - canon_package_refs
      disposition: use_only_if_request_remains_unresolved
  query_map:
    - knowledge_need: subject keyword precedence
      first_ref: registry://knowledge/mail_subject_rules
      supplied_coverage_status: sufficient
    - knowledge_need: footer authority boundary
      first_ref: obsidian://canon/mail_footer_boundary
      supplied_coverage_status: sufficient
  early_stop_condition: "Stop after the first surface tier because the supplied metadata marks both knowledge needs as sufficiently covered."
  source_deepening_planned: false

knowledge_preflight_packet:
  resolution_status: early_resolution_from_supplied_canon_reference_metadata
  used_refs:
    - ref: registry://knowledge/mail_subject_rules
      surface: .registry/knowledge
      supports:
        - subject keyword precedence
      supplied_status: sufficient
    - ref: obsidian://canon/mail_footer_boundary
      surface: canon_backed_obsidian_export
      supports:
        - footer authority boundary
      supplied_status: sufficient
  skipped_refs:
    - ref: fixture://notebook/binding-not-needed
      surface: notebooklm_binding
      reason: sufficient earlier-tier reference metadata
    - ref: fixture://rollup/not-needed
      surface: knowledge_access_rollup
      reason: sufficient earlier-tier reference metadata
    - ref: fixture://sources/not-needed
      surface: source_packet
      reason: sufficient earlier-tier reference metadata
    - ref: fixture://archive/not-needed
      surface: drive_archive
      reason: sufficient earlier-tier reference metadata
  unused_empty_ref_sets:
    sourcebound_packet_refs: []
    owner_decision_refs: []
  payload_included: false
  non_claims:
    - No referenced payload content is reproduced.
    - No raw-source truth is established.
    - No NotebookLM operation is represented.
    - No _workmeta, source-packet, sourcebound-packet, or archive inspection is represented.
    - No owner decision or approval is represented.
    - No target-workflow result is produced.

source_scope_recommendation:
  recommendation: use_existing_canon_refs_only
  required_refs:
    - registry://knowledge/mail_subject_rules
    - obsidian://canon/mail_footer_boundary
  additional_source_scope: none_at_preflight
  approved_source_deepening_route: not_requested
  stop_reason: "The supplied coverage metadata marks both requested knowledge areas as sufficient at the first investigation tier."
  reopen_conditions:
    - A required rule is absent, ambiguous, conflicting, stale, or inaccessible to the target workflow.
    - The target workflow needs a claim beyond the stated coverage of either reference.
    - The two references produce incompatible instructions.
    - A source-backed factual assertion is required rather than rule-routing metadata.
    - An owner-authority question remains unresolved.

claim_ceiling_seed:
  ceiling: reference_routing_only
  strength: weakest
  permitted_seed:
    - "The supplied metadata routes subject-keyword precedence to registry://knowledge/mail_subject_rules."
    - "The supplied metadata routes the footer authority boundary to obsidian://canon/mail_footer_boundary."
  prohibited_inference:
    - The actual precedence order.
    - The actual footer text or security content.
    - Currency, correctness, completeness, or accessibility of referenced payloads.
    - Permission to alter, omit, approve, or send a footer.
    - Completion or approval of the outbound mail.
    - Source truth, ontology acceptance, or canon promotion.
  promotion_requirement: "Any stronger claim must follow an approved evidence or owner-decision route and the required post-development review gate before public or canon promotion."

target_workflow_handoff:
  target_workflow_id: outbound_mail_authoring_v0
  handoff_type: metadata_only
  request: "Draft a synthetic outbound status mail using the current subject-keyword and footer rules."
  knowledge_routes:
    subject_keyword_precedence:
      ref: registry://knowledge/mail_subject_rules
      supplied_coverage_status: sufficient
    footer_authority_boundary:
      ref: obsidian://canon/mail_footer_boundary
      supplied_coverage_status: sufficient
  handling_instructions:
    - Resolve subject-keyword behavior from the routed registry reference.
    - Resolve footer authority limits from the routed canon-backed Obsidian reference.
    - Do not infer rule contents from this packet.
    - Do not treat this handoff as send authority, owner approval, or target-workflow completion.
    - Preserve metadata-only handling and do not copy referenced payloads into a public package.
  uncertainty:
    - Reference payload contents are not present in this packet.
    - Reference currency, accessibility, internal consistency, and completeness are not established.
    - No owner decision is supplied.
  reroute_triggers:
    - trigger: missing_or_ambiguous_rule
      route: approved_source_deepening
      candidate_workflow: sourcebound_knowledge_packet_operating_loop_v0
    - trigger: repeated_or_reusable_knowledge_gap
      route: candidate_triage_or_wikiization
      candidate_workflows:
        - knowledge_candidate_triage_v0
        - knowledge_wiki_pipeline_v0
    - trigger: authority_or_policy_choice_required
      route: owner_gate
      candidate_workflow: owner_decision_packet_v0
    - trigger: workflow_or_claim_boundary_change
      route: required_review
      candidate_workflow: post_development_review_gate_v0
  stop_condition: "Stop this preflight before advisory, evidence, and archive surfaces unless a reroute trigger is established."

boundary_review_note:
  result: within_declared_preflight_boundary
  affirmed:
    - Fixed investigation order is preserved.
    - Early stopping follows the supplied sufficient coverage statuses.
    - NotebookLM remains optional and unused.
    - Evidence, source-packet, sourcebound, and archive tiers remain unused.
    - The deliverable contains references and coverage metadata only.
    - The claim seed is explicitly non-final.
  authority_boundaries:
    raw_source_truth: not_owned
    notebooklm_runtime_operation: not_performed_or_claimed
    target_workflow_completion: not_owned
    owner_decision_authority: not_granted
    canon_promotion: not_granted
    ontology_acceptance: not_granted
  prohibited_outcomes:
    payload_copy: absent
    outbound_message_send: not_authorized
    owner_approval: not_claimed
    final_rule_interpretation: not_claimed
    public_or_canon_promotion: not_authorized
  final_status: ready_for_metadata_only_target_handoff
