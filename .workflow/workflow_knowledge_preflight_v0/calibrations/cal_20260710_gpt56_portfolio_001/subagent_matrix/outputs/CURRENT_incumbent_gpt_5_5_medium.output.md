```yaml
knowledge_preflight_deliverable:
  schema_version: synthetic_knowledge_preflight_packet_v0
  workflow_id: workflow_knowledge_preflight_v0
  fixture_id: public_synthetic_query_first_early_resolution
  public_safe: true
  boundary_attestation: "All knowledge refs, target requests, and coverage statements are synthetic metadata."

project_target_binding:
  target_workflow_id: outbound_mail_authoring_v0
  workflow_request_binding:
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
  binding_limits:
    owns:
      - target workflow binding shape
      - investigation surface order
      - metadata-only handoff
    does_not_own:
      - outbound mail completion
      - source truth
      - owner approval
      - canon promotion
      - ontology acceptance

query_first_plan:
  fixed_surface_order:
    - order: 1
      surface: ".registry/knowledge and canon-backed Obsidian export"
      intended_refs:
        - registry://knowledge/mail_subject_rules
        - obsidian://canon/mail_footer_boundary
      result: sufficient
      coverage:
        - subject keyword precedence
        - footer authority boundary
    - order: 2
      surface: "NotebookLM bindings"
      intended_refs:
        - fixture://notebook/binding-not-needed
      result: skipped
      skip_reason: "Earlier canon/registry refs are sufficient for the stated knowledge need."
    - order: 3
      surface: "_workmeta evidence and source packets"
      intended_refs:
        - fixture://rollup/not-needed
        - fixture://sources/not-needed
      result: skipped
      skip_reason: "Source deepening is only allowed when earlier surfaces are insufficient."
    - order: 4
      surface: "Drive/archive refs"
      intended_refs:
        - fixture://archive/not-needed
      result: skipped
      skip_reason: "Archive checks are last and not needed after sufficient earlier refs."

knowledge_preflight_packet:
  resolution_status: early_resolution_from_canon_refs
  used_refs:
    - surface: ".registry/knowledge"
      ref: registry://knowledge/mail_subject_rules
      coverage:
        - subject keyword precedence
      status: sufficient
    - surface: "canon_backed_obsidian_export"
      ref: obsidian://canon/mail_footer_boundary
      coverage:
        - footer authority boundary
      status: sufficient
  skipped_refs:
    - ref: fixture://notebook/binding-not-needed
      reason: "Advisory surface not needed after sufficient canon refs."
    - ref: fixture://rollup/not-needed
      reason: "Evidence rollup not needed after sufficient canon refs."
    - ref: fixture://sources/not-needed
      reason: "Source packet inspection not needed after sufficient canon refs."
    - ref: fixture://archive/not-needed
      reason: "Archive inspection not needed after sufficient canon refs."
  no_payload_copy: true
  uncertainty_notes:
    - "Sufficiency is fixture-provided metadata, not an independent source-truth claim."
    - "The preflight does not validate the contents of the referenced rules."
    - "The target workflow must still apply its own outbound-mail drafting constraints."

source_scope_recommendation:
  recommendation: no_source_deepening_needed
  reason: "Both requested knowledge needs are covered by sufficient early refs."
  approved_route_needed: false
  followup_route_if_gap_appears:
    - sourcebound_knowledge_packet_operating_loop_v0
    - knowledge_candidate_triage_v0
    - owner_decision_packet_v0
  stop_condition_applied: "Stopped before NotebookLM, workmeta/source, and archive surfaces because canon/registry refs were sufficient."

claim_ceiling_seed:
  weakest_allowed_claim_type: metadata_ref_sufficiency
  allowed_seed_claims:
    - "registry://knowledge/mail_subject_rules is the synthetic metadata ref identified for subject keyword precedence."
    - "obsidian://canon/mail_footer_boundary is the synthetic metadata ref identified for footer authority boundary."
    - "Later advisory, evidence, source, and archive refs were not needed for this fixture."
  prohibited_claims:
    - "The subject rules are factually correct."
    - "The footer boundary is approved by an owner."
    - "The outbound mail is complete or send-ready."
    - "Any canon promotion, ontology acceptance, or source truth has occurred."

target_workflow_handoff:
  target_workflow_id: outbound_mail_authoring_v0
  handoff_type: metadata_only_preflight
  reusable_refs:
    subject_keyword_precedence:
      ref: registry://knowledge/mail_subject_rules
      status: sufficient
    footer_authority_boundary:
      ref: obsidian://canon/mail_footer_boundary
      status: sufficient
  skipped_surfaces:
    - NotebookLM advisory bindings
    - _workmeta evidence rollups
    - source packets
    - sourcebound packets
    - Drive/archive refs
  target_instruction_seed:
    - "Use the subject-keyword precedence ref as metadata guidance only."
    - "Use the footer authority boundary ref as metadata guidance only."
    - "Do not treat this preflight as owner approval or send authority."
  reroute_triggers:
    - "If target workflow needs actual rule text rather than ref metadata, reroute to approved source deepening."
    - "If refs conflict or coverage is disputed, reroute to sourcebound_knowledge_packet_operating_loop_v0."
    - "If an owner decision is required for footer authority or send permission, reroute to owner_decision_packet_v0."
    - "If reusable knowledge is missing or repeatedly requested, consider knowledge_wiki_pipeline_v0."

boundary_review_note:
  public_safe: true
  metadata_only: true
  payload_copy_included: false
  notebooklm_operation: false
  workmeta_or_source_packet_inspection_after_early_resolution: false
  drive_archive_inspection: false
  target_workflow_completion_claimed: false
  owner_approval_claimed: false
  source_truth_claimed: false
  ontology_acceptance_claimed: false
  canon_promotion_claimed: false
  required_review_before_public_or_canon_promotion:
    workflow: post_development_review_gate_v0
    status: not_performed_in_this_deliverable
```
