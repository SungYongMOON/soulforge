You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-sol; reasoning_effort=low; species=dwarf; class=archivist.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: dual_deep_research_v0
kind: workflow
status: active
title: Dual Deep Research v0
summary: Run NotebookLM CLI Deep Research and Codex direct source research as the core independent advisory paths, optionally add Gemini or GPT web Deep Research packets as separate advisory lanes, then compare, deduplicate common claims from the delta view, and hand off the research packet to the Knowledge Wiki Cell for downstream registration judgment.
entrypoint: run
execution_mode: local_tool_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
classification_lane:
  primary: knowledge_management
  primary_name_ko: 지식 관리
  secondary:
    - source_research
    - notebooklm_operations
    - external_deep_research
    - wiki_preparation
  secondary_name_ko:
    - 소스 조사
    - NotebookLM 운영
    - 외부 심층 조사
    - 위키 준비
  purpose: discovery_only
  authority: none
execution_binding:
  party_required: false
  candidate_party_id: knowledge_wiki_cell
  bound_party_id: null
  binding_authority: none
inputs:
  - dual_research_request_binding
  - source_scope_policy
  - notebooklm_cli_policy
optional_inputs:
  - approved_source_handles
  - notebooklm_binding_refs
  - notebooklm_source_ledger_refs
  - notebooklm_packet_map_refs
  - external_deep_research_policy
  - gemini_deep_research_refs
  - gpt_deep_research_refs
  - codex_source_refs
  - owner_decision_refs
outputs:
  - goal_declaration
  - frozen_research_brief
  - subagent_stage_manifest
  - notebooklm_cli_research_packet
  - codex_direct_research_packet
  - external_deep_research_packet
  - dual_research_comparison_packet
  - research_delta_handoff
  - boundary_review_note
validation_level: draft
registration_policy: delegated_to_knowledge_wiki_cell_after_handoff
upstream_workflows:
  - workflow_id: workflow_knowledge_preflight_v0
    expected_outputs:
      - source_scope_recommendation
      - claim_ceiling_seed
    status: optional_front_gate
downstream_workflows:
  - workflow_id: knowledge_wiki_pipeline_v0
    party_id: knowledge_wiki_cell
    expected_input: research_delta_handoff_as_knowledge_wiki_request_packet
    status: default_downstream_handoff_owner
  - workflow_id: sourcebound_knowledge_packet_operating_loop_v0
    expected_input: delta_items_requiring_sourcebound_deepening
    status: downstream_pipeline_route_option
  - workflow_id: knowledge_candidate_triage_v0
    expected_input: repeated_claim_or_source_candidates_from_delta
    status: downstream_pipeline_route_option
  - workflow_id: wiki_curation_maintenance_v0
    expected_input: accepted_research_metadata_for_wiki_state_update
    status: downstream_pipeline_route_option
  - workflow_id: knowledge_access_event_capture_v0
    expected_input: metadata_only_research_use_event
    status: downstream_pipeline_route_option
  - workflow_id: owner_decision_packet_v0
    expected_input: source_upload_registration_or_promotion_decision_needed
    status: downstream_pipeline_route_option
  - workflow_id: post_development_review_gate_v0
    expected_input: workflow_or_skill_change_or_promotion_claim
    status: required_before_public_or_canon_promotion
operating_contract:
  owns:
    - goal_declaration_shape
    - frozen_research_brief_shape
    - subagent_stage_manifest_shape
    - fresh_subagent_execution_policy
    - notebooklm_cli_first_deep_research_sequence
    - codex_independent_research_sequence
    - optional_external_deep_research_advisory_sequence
    - dual_path_claim_comparison_shape
    - common_claim_dedupe_rule
    - delta_handoff_shape
    - knowledge_wiki_cell_handoff_shape
  does_not_own:
    - source_truth
    - notebooklm_account_auth
    - notebooklm_answer_authority
    - notebooklm_packet_map_mutation
    - gemini_account_auth
    - gemini_answer_authority
    - gpt_account_auth
    - gpt_answer_authority
    - external_deep_research_tool_availability
    - source_upload_approval
    - google_drive_registration
    - google_drive_placement
    - owner_approval
    - wiki_canon_promotion
    - knowledge_wiki_cell_routing_decision
    - registration_judgment
    - knowledge_wiki_registration_execution
    - ontology_acceptance
    - downstream_or_adjacent_workflow_creation
    - downstream_or_adjacent_workflow_evolution
    - created_or_evolved_workflow_completion_claim
    - created_or_evolved_workflow_readiness_claim
    - default_route_switching
    - default_route_safety_claim
    - subagent_runtime_binding
  workflow_authoring_contract:
    trigger_conditions:
      - downstream_or_adjacent_workflow_must_be_created_or_evolved
      - existing_downstream_workflow_is_missing_insufficient_or_stale_for_research_delta
      - repeatable_procedure_gap_is_found_outside_dual_research_scope
    required_creation_or_evolution_route: "$soulforge-workflow-generator"
    required_review_route_before_completion_or_claim: "$soulforge-workflow-check"
    dual_research_action: record_need_and_route_out
    performed_here: false
    claim_boundary:
      workflow_creation_or_evolution_claimed_here: false
      workflow_check_claimed_here: false
      registration_judgment_claimed_here: false
      owner_approval_claimed_here: false
      drive_placement_claimed_here: false
      notebooklm_packet_map_mutation_claimed_here: false
      external_deep_research_auth_or_account_claimed_here: false
      wiki_or_canon_promotion_claimed_here: false
      default_route_switch_or_safety_claimed_here: false
  notebooklm_cli_contract:
    setup_ref: docs/architecture/workspace/NOTEBOOKLM_MCP_SETUP_V0.md
    private_operating_refs:
      - _workmeta/system/reports/procedure_capture/notebooklm_operating_plan_v0.md
      - _workmeta/system/reports/procedure_capture/notebooklm_usage_manual_v0.md
    default_commands:
      - "nlm login --check"
      - "nlm notebook list --json"
      - "nlm notebook get <notebook_id> --json"
      - "nlm source list <notebook_id> --json"
      - "nlm research start \"<topic>\" --mode deep --title \"<notebook title>\""
      - "nlm research status <notebook_id> --max-wait 300"
      - "nlm research import <notebook_id> <task_id>"
      - "nlm notebook query <notebook_id> \"<question>\" --source-ids \"<source_id_1>,<source_id_2>\" --json --timeout 240"
    owner_approved_mutation_commands:
      - "nlm note create/update"
      - "nlm source add/sync"
    browser_ui_fallback_allowed_only_for:
      - cli_gap
      - login_recovery
      - visual_confirmation
      - explicit_owner_request
  external_deep_research_contract:
    status: optional
    default_lanes:
      - lane_id: gemini_web_deep_research
        surface: Gemini web app Deep Research
        default_use: standard_or_full_when_owner_requests_google_web_research
      - lane_id: gpt_web_deep_research
        surface: ChatGPT web Deep Research
        default_use: full_or_high_assurance_when_owner_requests_gpt_deep_research
    required_controls:
      - goal_and_brief_only_visible_to_external_lane
      - no_notebooklm_or_codex_findings_visible_before_external_packet_completion
      - visible_browser_or_web_app_only
      - no_cookie_local_storage_token_or_secret_inspection
      - marker_or_nonce_when_browser_dom_readback_is_used
      - record_blocker_or_skip_when_auth_tool_or_quota_is_unavailable
      - external_reports_are_advisory_until_source_supported_or_owner_reviewed
    forbidden_content:
      - raw_external_chat_transcript_in_public_package
      - account_bound_conversation_ids_or_urls_in_public_package
      - private_source_payload_or_secret_material
  boundaries:
    notebooklm_cli_first: true
    browser_ui_is_exception: true
    external_deep_research_web_lanes_are_optional: true
    notebooklm_output_is_advisory: true
    gemini_output_is_advisory: true
    gpt_output_is_advisory: true
    codex_output_is_advisory: true
    agreement_is_not_truth_by_itself: true
    codex_direct_path_independent_until_comparison: true
    external_deep_research_paths_independent_until_comparison: true
    common_findings_removed_from_delta_but_kept_as_trace: true
    no_payload_copy_into_public_package: true
    goal_declared_before_material_research: true
    material_research_runs_through_fresh_subagents: true
    subagent_visible_inputs_are_bounded: true
    controller_does_not_merge_paths_before_comparison: true
    automatic_handoff_to_knowledge_wiki_cell_after_research: true
    handoff_is_not_registration: true
    knowledge_wiki_cell_owns_registration_judgment: true
    adjacent_workflow_authoring_routes_to_workflow_generator: true
    created_or_evolved_workflow_requires_workflow_check_before_claim: true
    dual_research_lane_is_investigation_only: true
    no_workflow_registration_or_promotion_claim_from_research_lane: true
    no_default_route_switch_or_safety_claim_from_research_lane: true
  required_output_shapes:
    project_binding: templates/project_binding.template.yaml
    goal_declaration: templates/goal_declaration.template.yaml
    frozen_research_brief: templates/frozen_research_brief.template.yaml
    subagent_stage_manifest: templates/subagent_stage_manifest.template.yaml
    notebooklm_cli_research_packet: templates/notebooklm_cli_research_packet.template.yaml
    codex_direct_research_packet: templates/codex_direct_research_packet.template.yaml
    external_deep_research_packet: templates/external_deep_research_packet.template.yaml
    dual_research_comparison_packet: templates/dual_research_comparison_packet.template.yaml
    research_delta_handoff: templates/research_delta_handoff.template.yaml
    boundary_review_note: templates/boundary_review_note.template.yaml
notes:
  - "The NotebookLM CLI command contract is recorded here from existing Soulforge NotebookLM operating docs; future agents should not rediscover it from scratch before every run."
  - "Gemini and GPT Deep Research are optional external advisory lanes added to the core dual workflow; they do not replace NotebookLM CLI or Codex direct research, and they may be skipped when auth, quota, UI state, or owner scope blocks them."
  - "Declare the goal before any NotebookLM, Codex, comparison, sourcebound, or registration stage. The goal declaration must include success conditions, stop conditions, allowed inputs, and downstream handoff limits."
  - "Material stages should run through fresh subagents when the runtime permits it: one NotebookLM operator, one Codex direct researcher, optional external Deep Research operators, and one comparison verifier/archivist. If subagents are unavailable, record the blocker and do not claim fresh-context validation."
  - "If `nlm` or `notebooklm-mcp` is missing, record a runtime blocker and use `docs/architecture/workspace/NOTEBOOKLM_MCP_SETUP_V0.md`; do not treat the browser UI as the default path."
  - "After the research packet is assembled, automatically hand it to `knowledge_wiki_cell` through `knowledge_wiki_pipeline_v0`; that downstream party/workflow judges registration, source sufficiency, owner-decision needs, and storage/wiki actions."
  - "This workflow stops at the research comparison and handoff slice. Drive upload, NotebookLM packet-map updates, wiki registration, and canon promotion are downstream owner/workflow actions."
  - "If this research lane reveals that a downstream or adjacent workflow must be created or evolved, record the need and route that work through `$soulforge-workflow-generator`; any created or evolved workflow must be reviewed through `$soulforge-workflow-check` before completion, readiness, registration, promotion, default-route switch, or default-route-safety claims."


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: dual_deep_research_v0
kind: step_graph
status: active
steps:
  - step_id: declare_goal
    title: Declare Goal
    actor_slot: research_controller
    action:
      kind: goal_declaration
      requires:
        - dual_research_request_binding
        - source_scope_policy
        - notebooklm_cli_policy
      validates:
        - objective_is_explicit
        - success_conditions_named
        - stop_conditions_named
        - allowed_inputs_named
        - downstream_handoff_limits_named
      artifact_out: goal_declaration
    summary: Declare the bounded research goal, success conditions, stop conditions, allowed inputs, and claim ceiling before any NotebookLM, Codex, comparison, or handoff stage runs.
    next:
      on_success: bind_research_brief
      on_fail: stop
  - step_id: bind_research_brief
    title: Bind Research Brief
    actor_slot: research_controller
    action:
      kind: dual_research_brief_binding
      requires:
        - goal_declaration
        - dual_research_request_binding
        - source_scope_policy
        - notebooklm_cli_policy
      validates:
        - question_is_bounded
        - source_scope_declared
        - downstream_registration_out_of_scope_or_explicit
        - public_private_boundary_declared
      artifact_out: frozen_research_brief
    summary: Freeze the question, scope, exclusions, approved source handles, claim ceiling, and stop condition before either research path runs.
    next:
      on_success: prepare_subagent_stages
      on_fail: stop
  - step_id: prepare_subagent_stages
    title: Prepare Subagent Stages
    actor_slot: research_controller
    action:
      kind: fresh_subagent_stage_preparation
      artifacts_in:
        - goal_declaration
        - frozen_research_brief
      artifact_out: subagent_stage_manifest
      stages:
        - notebooklm_operator
        - codex_researcher
        - external_deep_research_operator
        - comparison_archivist
      required_separation:
        notebooklm_operator_receives_codex_findings: false
        codex_researcher_receives_notebooklm_findings: false
        external_deep_research_operator_receives_notebooklm_or_codex_findings: false
        comparison_archivist_receives_all_completed_packets_after_packets_complete: true
      blocked_if:
        - subagent_runtime_unavailable_and_fresh_context_required_for_claim
        - visible_inputs_include_raw_payload_or_secret
    summary: Prepare fresh subagent prompts, visible inputs, expected outputs, optional external Deep Research lane policy, and isolation rules before material research execution.
    next:
      on_success: run_notebooklm_cli_deep_research
      on_fail: stop
  - step_id: run_notebooklm_cli_deep_research
    title: Run NotebookLM CLI Deep Research
    actor_slot: notebooklm_operator
    action:
      kind: notebooklm_cli_first_deep_research
      artifacts_in:
        - subagent_stage_manifest
        - frozen_research_brief
        - approved_source_handles
        - notebooklm_binding_refs
        - notebooklm_source_ledger_refs
      artifact_out: notebooklm_cli_research_packet
      fixed_cli_contract:
        - "nlm login --check"
        - "nlm notebook list --json"
        - "nlm source list <notebook_id> --json"
        - "nlm research start \"<topic>\" --mode deep --title \"<notebook title>\""
        - "nlm research status <notebook_id> --max-wait 300"
        - "nlm research import <notebook_id> <task_id>"
      owner_approval_required_for:
        - source_upload
        - source_sync
        - notebook_mutation_beyond_research_note
      forbidden_content:
        - raw_notebooklm_answer_payload_in_public_package
        - secret_or_session_material
        - host_local_absolute_path
      execution_contract: fresh_subagent_required_when_available
    summary: In a fresh NotebookLM-operator subagent, use the repo-defined CLI path to create or reuse the research notebook/note, start Deep Research, import the result metadata, and summarize advisory findings.
    next:
      on_success: run_codex_direct_research
      on_fail: record_notebooklm_runtime_blocker
  - step_id: record_notebooklm_runtime_blocker
    title: Record NotebookLM Runtime Blocker
    actor_slot: notebooklm_operator
    action:
      kind: notebooklm_cli_blocker_record
      artifacts_in:
        - subagent_stage_manifest
        - frozen_research_brief
      artifact_out: notebooklm_cli_research_packet
      setup_ref: docs/architecture/workspace/NOTEBOOKLM_MCP_SETUP_V0.md
    summary: If the CLI is missing, logged out, or blocked, record the blocker and setup route instead of pretending NotebookLM ran.
    next:
      on_success: run_codex_direct_research
      on_fail: stop
  - step_id: run_codex_direct_research
    title: Run Codex Direct Research
    actor_slot: codex_researcher
    action:
      kind: independent_codex_source_research
      artifacts_in:
        - subagent_stage_manifest
        - frozen_research_brief
        - codex_source_refs
      artifact_out: codex_direct_research_packet
      isolation_rule: do_not_read_notebooklm_findings_before_direct_packet_is_complete
      source_policy:
        prefer_primary_or_official_sources: true
        browse_for_current_or_unstable_facts: true
        cite_source_refs_or_mark_gap: true
      execution_contract: fresh_subagent_required_when_available
    summary: In a fresh Codex-researcher subagent, research the same frozen question independently from NotebookLM so the comparison is not contaminated by NotebookLM's answer.
    next:
      on_success: run_optional_external_deep_research
      on_fail: stop
  - step_id: run_optional_external_deep_research
    title: Run Optional External Deep Research
    actor_slot: external_deep_research_operator
    action:
      kind: optional_external_web_deep_research
      artifacts_in:
        - subagent_stage_manifest
        - frozen_research_brief
      optional_inputs:
        - external_deep_research_policy
        - gemini_deep_research_refs
        - gpt_deep_research_refs
      artifact_out: external_deep_research_packet
      lanes:
        - lane_id: gemini_web_deep_research
          surface: Gemini web app Deep Research
          default_when: external_deep_research_policy.requests_google_web_research
        - lane_id: gpt_web_deep_research
          surface: ChatGPT web Deep Research
          default_when: external_deep_research_policy.requests_gpt_deep_research_or_full_mode
      skip_allowed_when:
        - external_deep_research_policy_not_requested
        - auth_or_quota_unavailable
        - browser_or_tool_state_blocked
      blocked_if:
        - visible_inputs_include_notebooklm_or_codex_findings_before_external_packet_completion
        - secret_cookie_token_or_local_storage_access_required
        - raw_external_transcript_would_be_copied_to_public_package
      execution_contract: fresh_subagent_required_when_available
    summary: Optionally run Gemini and/or GPT web Deep Research from the same frozen brief, keeping those outputs advisory and independent until comparison; write a skip or blocker record when the lane is unavailable.
    next:
      on_success: normalize_and_compare_claims
      on_fail: normalize_and_compare_claims
  - step_id: normalize_and_compare_claims
    title: Normalize And Compare Claims
    actor_slot: comparison_archivist
    action:
      kind: dual_path_claim_normalization_and_comparison
      artifacts_in:
        - subagent_stage_manifest
        - notebooklm_cli_research_packet
        - codex_direct_research_packet
      optional_artifacts_in:
        - external_deep_research_packet
      artifact_out: dual_research_comparison_packet
      claim_buckets:
        - common
        - notebooklm_only
        - codex_only
        - gemini_only
        - gpt_only
        - external_only
        - conflict
        - gap
      dedupe_rule: common_claims_remain_trace_metadata_but_are_excluded_from_delta_recommendations
      execution_contract: fresh_subagent_required_when_available
    summary: In a fresh comparison-archivist subagent, convert NotebookLM, Codex, and any optional Gemini/GPT Deep Research outputs into atomic claims, identify common overlap, isolate one-sided claims, conflicts, and gaps, and avoid treating agreement as validation.
    next:
      on_success: assemble_delta_handoff
      on_fail: stop
  - step_id: assemble_delta_handoff
    title: Assemble Delta Handoff
    actor_slot: handoff_router
    action:
      kind: research_delta_and_downstream_route_assembly
      artifacts_in:
        - frozen_research_brief
        - dual_research_comparison_packet
        - external_deep_research_packet
        - owner_decision_refs
      artifacts_out:
        - research_delta_handoff
        - boundary_review_note
      default_downstream_handoff:
        party_id: knowledge_wiki_cell
        workflow_id: knowledge_wiki_pipeline_v0
        handoff_mode: automatic_after_boundary_pass
        registration_judgment_owner: downstream_workflow
        registration_performed_here: false
      workflow_authoring_guard:
        trigger: downstream_or_adjacent_workflow_creation_or_evolution_needed
        required_creation_or_evolution_route: "$soulforge-workflow-generator"
        required_review_before_completion_or_claim: "$soulforge-workflow-check"
        performed_here: false
        registration_or_promotion_claim_here: false
        default_route_switch_or_safety_claim_here: false
      route_targets:
        - knowledge_wiki_cell_pipeline
        - none
        - sourcebound_review
        - knowledge_candidate_triage
        - wiki_curation_maintenance
        - knowledge_access_event_capture
        - owner_decision
        - workflow_creation_or_evolution_needed
      route_hints_are_advisory: true
      checks:
        - no_source_truth_overclaim
        - no_owner_approval_inference
        - no_notebooklm_answer_as_verdict
        - no_canon_promotion_inference
        - no_registration_judgment_in_research_workflow
        - downstream_or_adjacent_workflow_authoring_routed_to_workflow_generator
        - created_or_evolved_workflow_review_route_required_before_claim
        - no_default_route_switch_or_safety_claim
        - handoff_packet_prepared_for_knowledge_wiki_cell
    summary: Package only the non-overlap, conflicts, and gaps as research delta items, then prepare the automatic Knowledge Wiki Cell handoff while leaving registration judgment to the downstream party/workflow. If a downstream or adjacent workflow must be created or evolved, route that separate workflow work through `$soulforge-workflow-generator` and require `$soulforge-workflow-check` before any completion, readiness, registration, promotion, or default-route claim.
    next:
      on_success: complete
      on_fail: stop


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "schema_version": "gpt56_portfolio_gate_fixture_v1",
  "workflow_id": "dual_deep_research_v0",
  "fixture_id": "public_synthetic_cli_blocker_independent_research",
  "public_safe": true,
  "request": "Produce a dry-run orchestration and packet set for the research question. Do not browse, invoke NotebookLM, or use external web apps; represent unavailable lanes honestly and still prepare the bounded comparison/handoff path.",
  "inputs": {
    "dual_research_request_binding": {
      "question": "What source-supported controls should a public workflow apply when summarizing synthetic hardware-layout evidence?",
      "success_conditions": [
        "separate advisory claims by lane",
        "identify overlap, delta, conflict, and gaps",
        "prepare downstream handoff"
      ],
      "stop_conditions": [
        "secret or raw payload required",
        "source identity cannot be represented by approved refs"
      ],
      "downstream_handoff_limits": [
        "no registration judgment",
        "no canon promotion",
        "no source upload"
      ]
    },
    "source_scope_policy": {
      "approved_source_handles": [
        "fixture://official/layout-guide-A",
        "fixture://official/tool-manual-B"
      ],
      "primary_or_official_only": true,
      "current_fact_browsing_allowed": false
    },
    "notebooklm_cli_policy": {
      "cli_available": false,
      "blocker": "synthetic runtime capability unavailable",
      "browser_fallback_authorized": false
    },
    "external_deep_research_policy": {
      "requested": false
    },
    "codex_source_refs": [
      "fixture://official/layout-guide-A",
      "fixture://official/tool-manual-B"
    ]
  },
  "synthetic_lane_evidence": {
    "codex_direct_packet_claims": [
      {
        "claim_id": "C1",
        "source_ref": "fixture://official/layout-guide-A",
        "claim_summary": "retain page-level provenance"
      },
      {
        "claim_id": "C2",
        "source_ref": "fixture://official/tool-manual-B",
        "claim_summary": "record extraction limitations"
      }
    ],
    "notebooklm_packet_state": "blocked_before_research",
    "external_packet_state": "skipped_not_requested"
  },
  "requested_deliverable": [
    "goal declaration and frozen brief",
    "fresh-subagent stage manifest and isolation rules",
    "NotebookLM blocker packet plus Codex direct packet and external skip packet",
    "atomic comparison buckets and common-claim trace/delta rule",
    "research delta and automatic Knowledge Wiki Cell handoff with authority boundaries"
  ],
  "prohibitions": [
    "no actual external action, auth claim, source upload, notebook mutation, browser fallback, or invented research result",
    "no agreement-as-truth, registration judgment, workflow creation claim, default-route claim, or public payload copy"
  ],
  "boundary_attestation": "All question text, refs, and lane claims are synthetic and public-safe."
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
