```yaml
project_binding:
  workflow_request_binding:
    request: "Draft a synthetic outbound status mail using the current subject-keyword and footer rules."
    knowledge_need:
      - "subject keyword precedence"
      - "footer authority boundary"
  target_workflow_id: outbound_mail_authoring_v0
  project_knowledge_context_refs:
    - "fixture://projects/demo-mail-context"
  preflight_policy:
    query_first: true
    source_deepening_only_when_needed: true
    no_payload_copy: true

query_first_plan:
  investigation_order:
    - surface: ".registry/knowledge"
      ref: "registry://knowledge/mail_subject_rules"
      purpose: "subject keyword precedence"
      fixture_status: sufficient
    - surface: "canon_backed_obsidian_export"
      ref: "obsidian://canon/mail_footer_boundary"
      purpose: "footer authority boundary"
      fixture_status: sufficient
    - surface: "NotebookLM bindings"
      ref: "fixture://notebook/binding-not-needed"
      action: skipped
      reason: "Earlier canon surfaces are sufficient."
    - surface: "_workmeta evidence and source packets"
      refs:
        - "fixture://rollup/not-needed"
        - "fixture://sources/not-needed"
      action: skipped
      reason: "Earlier canon surfaces are sufficient."
    - surface: "prior sourcebound claim routes"
      refs: []
      action: skipped
      reason: "No source deepening is needed."
    - surface: "Drive or canon-package archive"
      ref: "fixture://archive/not-needed"
      action: skipped
      reason: "Earlier canon surfaces are sufficient."
  stop_condition: "Stop after canon surfaces resolve both requested knowledge needs."

knowledge_preflight_packet:
  packet_id: "synthetic://knowledge-preflight/workflow_knowledge_preflight_v0/public_synthetic_query_first_early_resolution"
  target_workflow_id: outbound_mail_authoring_v0
  metadata_only: true
  reusable_refs:
    - ref: "registry://knowledge/mail_subject_rules"
      supports: "subject keyword precedence"
      fixture_status: sufficient
    - ref: "obsidian://canon/mail_footer_boundary"
      supports: "footer authority boundary"
      fixture_status: sufficient
  used_refs:
    - "fixture://projects/demo-mail-context"
    - "registry://knowledge/mail_subject_rules"
    - "obsidian://canon/mail_footer_boundary"
  skipped_refs:
    - "fixture://notebook/binding-not-needed"
    - "fixture://rollup/not-needed"
    - "fixture://sources/not-needed"
    - "fixture://archive/not-needed"
  uncertainty:
    - "The fixture provides coverage statuses and metadata only; it does not provide the underlying subject or footer content."
    - "No final outbound mail content is established by this preflight."

source_scope_recommendation:
  scope: "No additional source packet or archive scope required."
  basis:
    - "The supplied registry ref is marked sufficient for subject keyword precedence."
    - "The supplied canon-backed Obsidian ref is marked sufficient for footer authority boundary."
  source_deepening:
    status: not_required
    reroute_trigger: "Reopen sourcebound or archive surfaces only if the target workflow identifies an unresolved or contradictory rule."

claim_ceiling_seed:
  seed_status: provisional
  weakest_supported_claim: "The target workflow may use the two supplied metadata refs as pointers for the requested topics."
  claim_ceiling:
    may_claim:
      - "A registry knowledge ref is designated sufficient for subject keyword precedence."
      - "A canon-backed Obsidian ref is designated sufficient for footer authority boundary."
    may_not_claim:
      - "The underlying source truth or exact rule wording."
      - "Final subject selection or footer text."
      - "Owner approval, canon promotion, or target-workflow completion."
  promotion_route: "Resolve any needed exact wording through the target workflow's approved source and owner-boundary process."

target_workflow_handoff:
  target_workflow_id: outbound_mail_authoring_v0
  handoff_id: "synthetic://handoff/outbound_mail_authoring_v0/public_synthetic_query_first_early_resolution"
  metadata_only: true
  knowledge_refs:
    - "registry://knowledge/mail_subject_rules"
    - "obsidian://canon/mail_footer_boundary"
  guidance:
    - "Use the registry ref for subject keyword precedence."
    - "Use the canon-backed Obsidian ref for footer authority boundary."
    - "Do not treat this preflight as the final outbound mail result."
  uncertainty:
    - "Exact rule contents are not included in this handoff."
    - "All refs and coverage statements are synthetic metadata."
  reroute_triggers:
    - "A requested rule is not resolved by the supplied refs."
    - "The target workflow detects contradiction or missing authority."
    - "Exact source wording is required for a claim beyond the provisional ceiling."
    - "An owner decision is required."
  stop_conditions:
    - "Do not inspect NotebookLM, _workmeta/source packets, or archive refs while the supplied canon refs remain sufficient."
    - "Do not copy source payload into the public package."

boundary_review_note:
  review_id: "synthetic://boundary-review/workflow_knowledge_preflight_v0/public_synthetic_query_first_early_resolution"
  result: boundary_preserved
  confirmed:
    - "Investigation order begins with registry and canon-backed Obsidian surfaces."
    - "Later advisory, evidence, sourcebound, and archive refs remain skipped because earlier refs are marked sufficient."
    - "NotebookLM remains optional and advisory."
    - "The packet and handoff are metadata-only."
    - "The claim seed is provisional and not a final claim."
    - "Target-workflow completion, owner approval, source truth, ontology acceptance, and canon promotion are not asserted."
  non_claims:
    - "No NotebookLM operation."
    - "No workmeta, source-packet, or archive inspection."
    - "No payload copied."
    - "No owner approval."
    - "No final outbound status mail produced."
    - "No canon promotion."
```
