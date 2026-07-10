You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-sol; reasoning_effort=low; species=dwarf; class=archivist.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: sourcebound_knowledge_packet_operating_loop_v0
kind: workflow
status: active
title: Sourcebound Knowledge Packet Operating Loop v0
summary: Operate a Karpathy-style source-bound knowledge packet loop from approved source intake through private compiled projection, contradiction/gap lint, concept-candidate extraction, claim ceiling review, optional advisory bookshelf handoff, and workflowization routing.
entrypoint: run
execution_mode: local_tool_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
inputs:
  - source_scope_binding
  - approved_source_policy
  - knowledge_packet_scope
  - promotion_policy
optional_inputs:
  - source_packet_refs
  - owner_approved_local_source_manifest
  - owner_held_archive_policy
  - owner_held_archive_refs
  - owner_delegated_canon_policy_refs
  - prior_projection_refs
  - source_sufficiency_refs
  - notebooklm_advisory_return_refs
  - ontology_review_policy_refs
  - owner_decision_refs
  - post_development_review_gate_refs
outputs:
  - source_intake_manifest
  - sourcebound_knowledge_packet_manifest
  - compiled_projection_index
  - compiled_projection_log
  - contradiction_gap_lint_report
  - concept_candidate_register
  - claim_ceiling_and_promotion_route
  - knowledge_package_archive_manifest
  - optional_notebooklm_advisory_handoff
  - notebooklm_handoff_validation
  - ontology_candidate_rule_register
  - workflowization_review_packet
  - boundary_review_note
validation_level: pilot_executed_private_evidence
registration_policy: owner_requested_or_delegated_policy_registration
upstream_workflows:
  - workflow_id: official_source_packet_collect_v0
    expected_outputs:
      - source_packet_manifest
      - source_inventory
      - source_gap_report
      - owner_followup_needed
    status: preferred_source_intake
  - workflow_id: source_packet_sufficiency_review_v0
    expected_outputs:
      - allowed_claim_ceiling
      - blocked_fields_register
      - owner_followup_needed
    status: preferred_claim_ceiling_context
downstream_workflows:
  - workflow_id: knowledge_access_event_capture_v0
    expected_input: sourcebound_knowledge_packet_manifest_or_concept_candidate_refs
    status: optional_usage_lineage_capture
  - workflow_id: source_packet_sufficiency_review_v0
    expected_input: contradiction_gap_lint_report_or_source_gap
    status: optional_rerun_trigger
  - workflow_id: owner_decision_packet_v0
    expected_input: ontology_or_workflow_promotion_owner_decision_needed
    status: optional_owner_decision
  - workflow_id: post_development_review_gate_v0
    expected_input: workflowization_review_packet
    status: required_before_public_or_canon_promotion
operating_contract:
  owns:
    - sourcebound_knowledge_packet_shape
    - private_compiled_projection_index_log_shape
    - contradiction_gap_lint_shape
    - concept_candidate_register_shape
    - claim_ceiling_and_promotion_route_shape
    - optional_advisory_handoff_shape
    - knowledge_package_archive_manifest_shape
    - notebooklm_handoff_validation_shape
    - ontology_candidate_rule_register_shape
    - workflowization_review_packet_shape
    - delegated_canon_policy_ref_capture
    - public_canon_guard_routing_shape
  does_not_own:
    - raw_source_truth
    - source_acquisition_authority
    - final_domain_doctrine
    - ontology_canon_acceptance
    - ontology_rule_acceptance
    - workflow_canon_acceptance_without_review
    - owner_delegation_creation
    - default_route_mutation_authority
    - NotebookLM_or_other_advisory_tool_verdicts
    - NotebookLM_upload_or_notebook_operation
    - Google_Drive_or_other_archive_upload_operation
  boundaries:
    source_truth_lives_in_source_packets_or_owner_held_files: true
    knowledge_packet_is_private_derivative_projection: true
    projection_index_log_are_navigation_not_authority: true
    concept_candidates_require_source_refs_or_blockers: true
    claim_ceiling_controls_promotion_route: true
    notebooklm_handoff_is_optional_owner_operated_and_advisory_only: true
    owner_held_archive_is_storage_and_backup_not_authority: true
    codex_skill_auto_sync_allowed_when_declared: true
    per_file_owner_confirmation_not_required_when_declared: true
    notebooklm_handoff_validation_checks_safety_not_truth: true
    ontology_candidate_rules_are_candidates_until_owner_review: true
    workflowization_requires_review_gate_or_owner_decision: true
    delegated_policy_can_replace_per_item_owner_prompt_only_when_existing_policy_ref_applies: true
    delegated_policy_does_not_delegate_source_truth_ontology_domain_doctrine_upload_or_default_routes: true
    canon_candidate_or_entry_requires_owner_decision_or_delegated_policy_plus_review_gate: true
    failed_or_unknown_public_canon_guard_routes_to_hold_private_or_owner_decision: true
  required_output_shapes:
    project_binding: templates/project_binding.template.yaml
    knowledge_packet_manifest: templates/knowledge_packet_manifest.template.yaml
    contradiction_gap_lint_report: templates/contradiction_gap_lint_report.template.yaml
    concept_candidate_register: templates/concept_candidate_register.template.yaml
    claim_ceiling_and_promotion_route: templates/claim_ceiling_and_promotion_route.template.yaml
    knowledge_package_archive_manifest: templates/knowledge_package_archive_manifest.template.yaml
    notebooklm_advisory_handoff: templates/notebooklm_advisory_handoff.template.yaml
    notebooklm_handoff_validation: templates/notebooklm_handoff_validation.template.yaml
    ontology_candidate_rule_register: templates/ontology_candidate_rule_register.template.yaml
    workflowization_review_packet: templates/workflowization_review_packet.template.yaml
karpathy_style_interpretation: >-
  The workflow adopts the LLM-wiki pattern as an operating loop: ingest bounded
  source refs, compile a private projection, maintain index/log/query surfaces,
  lint contradictions and gaps, then extract cited concept candidates. In
  Soulforge, this layer is useful because it makes source reasoning repeatable,
  but it never replaces source packets, owner decisions, or review gates.
notes:
  - Public package files contain only portable orchestration rules and blank templates.
  - Runtime source payloads, copied documents, extracted text, hashes for private files, and project-local run truth belong only in private/project-local evidence.
  - Optional NotebookLM or similar handoff is preparation metadata only; the tool answer is advisory context, never acceptance authority.
  - Owner-held archive surfaces such as Google Drive may hold source candidates, private working bundles, reviewed private packets, and canon packages for backup; archive presence does not promote canon or prove truth.
  - When archive policy declares `codex_skill_auto_sync`, an approved Codex skill or Google Drive connector may upload or sync bounded package files without per-file owner confirmation.
  - Automatic upload/sync must remain inside the declared archive policy and cannot promote canon, approve source truth, or bypass secret/private boundaries.
  - NotebookLM validation confirms bounded handoff metadata and return handling only; it must not evaluate the tool answer as truth.
  - Ontology-facing candidate rules preserve source-backed concepts for later review, but cannot accept ontology canon or mutate public ontology by themselves.
  - Owner-delegated canon policy refs are optional inputs for applying an existing owner surface policy; this workflow does not create owner approval.
  - If the authority guard, source-support guard, and six public canon guards pass under an applicable delegated policy or owner decision plus post-development review gate, the route may require same-task canon registration and record the target refs, empty failed guards, and claim ceiling after registration.
  - If the delegated policy is missing, inapplicable, or any guard is unknown, canon_candidate and canon_entry routes are blocked and the packet stays hold_private or owner_decision.
  - This package is not profile-optimized and does not claim production readiness.


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: sourcebound_knowledge_packet_operating_loop_v0
kind: step_graph
status: active
steps:
  - step_id: bind_source_scope
    title: Bind Source Scope
    actor_slot: workflow_runner
    action:
      kind: source_scope_and_private_output_binding
      requires:
        - source_scope_binding
        - approved_source_policy
        - knowledge_packet_scope
        - promotion_policy
      validates:
        - private_output_root_declared
        - source_truth_owner_declared
        - owner_held_archive_policy_declared_when_archive_package_requested
        - public_package_payload_free
        - advisory_tool_non_authority_policy_declared
    summary: Resolve the bounded source scope, private output root, and promotion ceiling before any projection work.
    next:
      on_success: intake_source_packet_refs
      on_fail: stop
  - step_id: intake_source_packet_refs
    title: Intake Source Packet Refs
    actor_slot: source_intake_curator
    action:
      kind: source_packet_ref_inventory
      artifacts_in:
        - source_scope_binding
        - source_packet_refs
        - owner_approved_local_source_manifest
      artifacts_out:
        - source_intake_manifest
        - source_gap_handoff
      allowed_states:
        - official_present
        - owner_approved_local
      blocked_states:
        - missing
        - blocked
        - conflicting
        - candidate_official
        - third_party_unapproved
    summary: Record approved source refs and visible gaps; route missing or weak evidence upstream instead of inventing source truth.
    next:
      on_success: compile_sourcebound_projection
      on_fail: stop
  - step_id: compile_sourcebound_projection
    title: Compile Sourcebound Projection
    actor_slot: projection_compiler
    action:
      kind: private_sourcebound_knowledge_packet_compile
      artifacts_in:
        - source_intake_manifest
        - knowledge_packet_scope
      artifacts_out:
        - sourcebound_knowledge_packet_manifest
        - compiled_projection_index
        - compiled_projection_log
      rules:
        derivative_private_projection_only: true
        every_claim_links_to_source_ref_or_gap: true
        index_and_log_are_navigation_surfaces: true
        public_package_stores_no_projection_payload: true
    summary: Create the private compiled projection, index, and log that make later query/lint/concept work repeatable.
    next:
      on_success: lint_contradictions_and_gaps
      on_fail: stop
  - step_id: lint_contradictions_and_gaps
    title: Lint Contradictions And Gaps
    actor_slot: lint_reviewer
    action:
      kind: contradiction_gap_lint
      artifacts_in:
        - sourcebound_knowledge_packet_manifest
        - compiled_projection_index
        - compiled_projection_log
        - source_gap_handoff
      artifact_out: contradiction_gap_lint_report
      checks:
        - unsupported_projection_claim
        - source_conflict_or_revision_drift
        - citation_gap
        - missing_page_map
        - figure_table_formula_ocr_gate_needed
        - advisory_tool_overreach
    summary: Surface contradictions, source gaps, extraction limits, and advisory-tool risks before concept extraction.
    next:
      on_success: extract_concept_candidates
      on_fail: stop
  - step_id: extract_concept_candidates
    title: Extract Concept Candidates
    actor_slot: concept_candidate_extractor
    action:
      kind: source_cited_concept_candidate_extraction
      artifacts_in:
        - sourcebound_knowledge_packet_manifest
        - contradiction_gap_lint_report
      artifact_out: concept_candidate_register
      required_fields:
        - candidate_id
        - concept_label
        - source_refs
        - projection_refs
        - evidence_state
        - blocker_or_review_note
        - possible_promotion_target
      forbidden_outputs:
        - final_doctrine
        - ontology_canon_without_owner_decision
        - workflow_canon_without_review_gate
    summary: Extract only cited concept candidates, preserving blockers and separating projection refs from source refs.
    next:
      on_success: route_claim_ceiling_and_promotion
      on_fail: stop
  - step_id: route_claim_ceiling_and_promotion
    title: Route Claim Ceiling And Promotion
    actor_slot: promotion_router
    action:
      kind: claim_ceiling_and_workflowization_routing
      artifacts_in:
        - concept_candidate_register
        - contradiction_gap_lint_report
        - source_sufficiency_refs
      artifact_out: claim_ceiling_and_promotion_route
      route_states:
        - source_supported_candidate
        - review_required
        - blocked_pending_source
        - blocked_pending_owner_decision
        - advisory_only
      promotion_targets:
        - workflow_candidate
        - ontology_candidate
        - mission_or_owner_decision
        - source_gap_followup
        - hold_private
    summary: Decide the maximum safe claim and next route for each concept candidate before workflowization.
    next:
      on_success: prepare_knowledge_package_archive_manifest
      on_fail: stop
  - step_id: prepare_knowledge_package_archive_manifest
    title: Prepare Knowledge Package Archive Manifest
    actor_slot: promotion_router
    action:
      kind: owner_held_archive_package_manifest_prepare
      artifacts_in:
        - sourcebound_knowledge_packet_manifest
        - compiled_projection_index
        - compiled_projection_log
        - concept_candidate_register
        - claim_ceiling_and_promotion_route
      artifact_out: knowledge_package_archive_manifest
      archive_status_labels:
        - working_packet
        - reviewed_private
        - canon_package
        - obsolete_or_blocked
      rules:
        archive_is_storage_and_backup_not_authority: true
        canon_package_requires_review_or_owner_decision: true
        codex_skill_auto_sync_allowed_when_declared: true
        per_file_owner_confirmation_not_required_when_declared: true
        public_package_stores_no_projection_payload: true
    summary: Prepare the manifest for Drive or another owner-held archive so working packets and later canon packages can be backed up without treating storage as approval.
    next:
      on_success: capture_ontology_candidate_rules
      on_skip: capture_ontology_candidate_rules
      on_fail: stop
  - step_id: capture_ontology_candidate_rules
    title: Capture Ontology Candidate Rules
    actor_slot: promotion_router
    action:
      kind: ontology_candidate_rule_capture
      artifacts_in:
        - concept_candidate_register
        - claim_ceiling_and_promotion_route
        - ontology_review_policy_refs
      artifact_out: ontology_candidate_rule_register
      required_fields:
        - candidate_rule_id
        - source_concept_candidate_ids
        - ontology_candidate_type
        - entity_or_relation_label
        - evidence_source_refs
        - candidate_only_state
        - required_review_route
      forbidden_outputs:
        - ontology_canon_acceptance
        - ontology_mutation
        - final_domain_doctrine
    summary: Capture ontology-facing entity, relation, or rule candidates for later review without accepting ontology canon.
    next:
      on_success: prepare_optional_notebooklm_advisory_handoff
      on_skip: prepare_optional_notebooklm_advisory_handoff
      on_fail: stop
  - step_id: prepare_optional_notebooklm_advisory_handoff
    title: Prepare Optional NotebookLM Advisory Handoff
    actor_slot: advisory_handoff_preparer
    action:
      kind: owner_operated_advisory_bookshelf_handoff_prep
      artifacts_in:
        - source_intake_manifest
        - concept_candidate_register
        - claim_ceiling_and_promotion_route
      artifact_out: optional_notebooklm_advisory_handoff
      allowed_content:
        - source_ref_ids
        - owner_visible_source_labels
        - bounded_question_set
        - non_authority_warning
        - expected_return_shape
      forbidden_content:
        - credentials
        - cookies
        - sessions
        - upload_secrets
        - public_embedded_private_payload
        - tool_answer_as_verdict
    summary: Prepare optional NotebookLM-style handoff metadata while keeping upload/action with the owner and authority with sources/review gates.
    next:
      on_success: validate_optional_notebooklm_handoff
      on_skip: validate_optional_notebooklm_handoff
      on_fail: stop
  - step_id: validate_optional_notebooklm_handoff
    title: Validate Optional NotebookLM Handoff
    actor_slot: advisory_handoff_preparer
    action:
      kind: notebooklm_handoff_boundary_validation
      artifacts_in:
        - optional_notebooklm_advisory_handoff
        - notebooklm_advisory_return_refs
      artifact_out: notebooklm_handoff_validation
      checks:
        - owner_operated_upload_required
        - bounded_question_set_present_or_skip_recorded
        - no_credentials_cookies_sessions_or_upload_secrets
        - no_private_payload_embedded_in_public_package
        - tool_answer_not_used_as_verdict
        - source_refs_and_review_gate_remain_authority
      allowed_states:
        - valid_advisory_handoff
        - skipped
        - blocked_boundary_risk
        - blocked_authority_overreach
    summary: Validate the optional handoff shape and return handling while keeping NotebookLM advisory-only.
    next:
      on_success: assemble_workflowization_review_packet
      on_skip: assemble_workflowization_review_packet
      on_fail: stop
  - step_id: assemble_workflowization_review_packet
    title: Assemble Workflowization Review Packet
    actor_slot: workflowization_author
    action:
      kind: workflowization_packet_assembly
      artifacts_in:
        - sourcebound_knowledge_packet_manifest
        - concept_candidate_register
        - claim_ceiling_and_promotion_route
        - knowledge_package_archive_manifest
        - optional_notebooklm_advisory_handoff
        - notebooklm_handoff_validation
        - ontology_candidate_rule_register
      artifact_out: workflowization_review_packet
      required_sections:
        - source_truth_boundary
        - projection_boundary
        - concept_candidate_routes
        - claim_ceiling_summary
        - knowledge_package_archive_summary
        - ontology_candidate_rule_summary
        - notebooklm_handoff_validation_summary
        - workflow_or_ontology_candidate_delta
        - review_gate_required
    summary: Package the verified conceptualization into a reviewable workflowization packet without accepting canon by itself.
    next:
      on_success: boundary_review_and_gate_handoff
      on_fail: stop
  - step_id: boundary_review_and_gate_handoff
    title: Boundary Review And Gate Handoff
    actor_slot: boundary_reviewer
    action:
      kind: source_projection_promotion_boundary_review
      artifacts_in:
        - workflowization_review_packet
        - contradiction_gap_lint_report
        - claim_ceiling_and_promotion_route
      artifact_out: boundary_review_note
      required_review_gate:
        workflow_id: post_development_review_gate_v0
        minimum_level: inspector_and_judge
        escalate_to_full_b_v_gate_when:
          - production_ready_claim
          - reference_or_oracle_claim
          - public_canon_promotion_without_owner_approval
    summary: Confirm the packet is ready for review or stop with explicit source, boundary, owner-decision, or verifier blockers.
    next:
      on_success: complete
      on_fail: stop


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "schema_version": "gpt56_portfolio_gate_fixture_v1",
  "workflow_id": "sourcebound_knowledge_packet_operating_loop_v0",
  "fixture_id": "public_synthetic_mixed_evidence_projection",
  "public_safe": true,
  "request": "Produce a dry-run sourcebound knowledge-loop packet from the supplied synthetic source refs. Keep the projection private-by-contract, surface contradictions and gaps, and route candidates without promoting canon.",
  "inputs": {
    "source_scope_binding": "fixture://knowledge/demo_connector_rules",
    "approved_source_policy": {
      "allowed_states": [
        "official_present",
        "owner_approved_local"
      ],
      "public_payload_copy": false
    },
    "knowledge_packet_scope": {
      "topic": "synthetic connector constraint semantics",
      "target_consumers": [
        "workflow_candidate",
        "ontology_candidate"
      ]
    },
    "promotion_policy": {
      "public_canon_requires_owner_or_applicable_delegation_plus_review": true
    },
    "source_packet_refs": [
      {
        "source_ref": "fixture://sources/official-A",
        "state": "official_present",
        "supports": [
          "maximum current is conditional on ambient temperature"
        ]
      },
      {
        "source_ref": "fixture://sources/owner-local-B",
        "state": "owner_approved_local",
        "approval_scope": "private_projection",
        "supports": [
          "connector family mapping"
        ]
      },
      {
        "source_ref": "fixture://sources/candidate-C",
        "state": "candidate_official",
        "supports": [
          "unverified alternate limit"
        ]
      },
      {
        "source_ref": "fixture://sources/conflict-D",
        "state": "conflicting",
        "supports": [
          "different connector family mapping"
        ]
      }
    ],
    "source_sufficiency_refs": [
      {
        "claim_scope": "conditional current limit",
        "allowed_claim_ceiling": "source_supported"
      }
    ],
    "owner_held_archive_policy": {
      "requested": true,
      "agent_upload_authority": "none"
    },
    "owner_delegated_canon_policy_refs": [],
    "notebooklm_advisory_return_refs": [],
    "ontology_review_policy_refs": [],
    "owner_decision_refs": []
  },
  "requested_deliverable": [
    "source intake and gap handoff",
    "private projection manifest/index/log references, not payload",
    "contradiction/gap lint",
    "cited concept candidate register",
    "claim-ceiling and promotion routes",
    "archive manifest labels",
    "candidate-only ontology rules",
    "optional NotebookLM handoff as skipped or owner-operated metadata",
    "workflowization review packet and gate handoff"
  ],
  "prohibitions": [
    "no use of candidate/conflicting sources as approved truth, no payload copy/upload, no NotebookLM verdict, no ontology/workflow acceptance, no canon entry without policy/review"
  ],
  "boundary_attestation": "All source claims, refs, topics, and policy values are synthetic."
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
