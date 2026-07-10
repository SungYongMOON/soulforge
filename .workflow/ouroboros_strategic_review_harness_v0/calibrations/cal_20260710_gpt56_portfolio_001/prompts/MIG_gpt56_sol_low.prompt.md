You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-sol; reasoning_effort=low; species=dwarf; class=auditor.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: ouroboros_strategic_review_harness_v0
kind: workflow
status: active
title: Ouroboros Strategic Review Harness v0
summary: Run a two-lane strategic review loop that checks Soulforge vision alignment and surfaces owner-intent gaps as questions, canon constraint candidates, and next-focus recommendations without inventing missing intent.
entrypoint: run
execution_mode: local_tool_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
inputs:
  - vision_and_goal_refs
  - roadmap_refs
  - current_canon_catalog_refs
  - recent_activity_refs
optional_inputs:
  - night_watch_report_refs
  - latest_context_ref
  - workmeta_evidence_refs
  - mission_refs
  - workflow_change_refs
  - skill_change_refs
  - owner_decision_refs
  - post_development_review_packet_refs
outputs:
  - vision_alignment_report
  - owner_intent_gap_register
  - ambiguity_ledger
  - socratic_question_packet
  - owner_question_queue
  - closure_restatement_note
  - canon_constraint_candidate_register
  - next_focus_recommendation
  - ouroboros_loop_ledger
validation_level: reviewed_public_safe_draft
registration_policy: owner_requested_registration
workflow_modes:
  - weekly_strategic_review
  - owner_triggered_gap_probe
  - pre_roadmap_change_review
  - post_major_workflow_batch_review
upstream_workflows:
  - workflow_id: post_development_review_gate_v0
    expected_outputs:
      - post_development_review_packet
      - supervisor_decision
      - followup_register
    status: preferred_recent_work_input
  - workflow_id: project_readiness_digest_v0
    expected_outputs:
      - readiness_digest
      - owner_input_backlog
    status: optional_project_state_input
  - workflow_id: technical_risk_open_question_burndown_v0
    expected_outputs:
      - open_question_burndown_register
    status: optional_gap_input
downstream_workflows:
  - workflow_id: owner_decision_packet_v0
    expected_input: owner_question_answer_or_direction_decision
    status: optional_owner_decision_route
  - workflow_id: source_bound_concept_workflow_authoring_v0
    expected_input: repeated_concept_gap_or_workflow_promotion_candidate
    status: optional_concept_workflow_route
  - workflow_id: post_development_review_gate_v0
    expected_input: changes_made_from_this_harness
    status: required_after_harness_driven_edits
ouroboros_harness_contract:
  owns:
    - vision_alignment_review
    - owner_intent_gap_probe
    - question_answerability_routing
    - ambiguity_ledger_maintenance
    - owner_question_queue_generation
    - owner_decision_restatement_gate
    - canon_constraint_candidate_routing
    - next_focus_recommendation
    - loop_ledger_for_repeated_gaps
  does_not_own:
    - owner_final_intent
    - roadmap_mutation_without_owner_decision
    - private_raw_truth_publication
    - post_development_acceptance_of_specific_changes
    - external_ouroboros_runtime_installation
    - ontology_convergence_claim_without_calibration
  two_part_review:
    vision_alignment_review:
      purpose: Compare recent work and canon growth against the Soulforge vision, roadmap, active slice, and owner boundaries.
      output: vision_alignment_report
    owner_intent_gap_probe:
      purpose: Find missing owner decisions, implicit constraints, undefined terms, and assumption-backed workflow steps, then convert them into questions.
      output: owner_intent_gap_register
    question_answerability_routing:
      purpose: Classify each gap as repo_fact, owner_decision, research_confirmation, or defer before it becomes owner-facing.
      output: socratic_question_packet
    ambiguity_ledger_maintenance:
      purpose: Track which strategic dimensions remain unclear so the workflow asks the smallest next useful question.
      output: ambiguity_ledger
    owner_decision_restatement_gate:
      purpose: When owner answers exist, restate the intended decision or next focus in one sentence before routing it toward canon, mission, or workflow changes.
      output: closure_restatement_note
  authority_boundary:
    gap_findings_are_questions_not_truth: true
    alignment_findings_are_recommendations_not_roadmap_mutations: true
    repo_fact_questions_must_be_answered_or_confirmed_before_owner_queue: true
    owner_questions_must_include_options_and_safe_default: true
    deferred_questions_are_intentional_non_blocking_deferrals: true
    answered_questions_need_owner_decision_or_canon_patch: true
    applied_reports_belong_in_workmeta: true
  required_output_shapes:
    project_binding: templates/project_binding.template.yaml
    vision_alignment_report: templates/vision_alignment_report.template.yaml
    owner_intent_gap_register: templates/owner_intent_gap_register.template.yaml
    ambiguity_ledger: templates/ambiguity_ledger.template.yaml
    socratic_question_packet: templates/socratic_question_packet.template.yaml
    owner_question_queue: templates/owner_question_queue.template.md
    closure_restatement_note: templates/closure_restatement_note.template.md
    canon_constraint_candidate_register: templates/canon_constraint_candidate_register.template.yaml
    next_focus_recommendation: templates/next_focus_recommendation.template.md
    ouroboros_loop_ledger: templates/ouroboros_loop_ledger.template.yaml
notes:
  - This workflow is a strategic review harness, not a replacement for `post_development_review_gate_v0`.
  - The first implementation should be run manually or as a read-only night_watch candidate before any local Codex automation is made active.
  - Applied reports belong under `_workmeta/system/` or project-local `_workmeta/<project_code>/`.
  - Public canon stores only portable routing rules and blank templates.


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: ouroboros_strategic_review_harness_v0
kind: step_graph
status: active
steps:
  - step_id: bind_review_window
    title: Bind Review Window
    actor_slot: harness_runner
    action:
      kind: strategic_review_scope_binding
    summary: Select the review period, source refs, owner boundary, and private evidence output root.
  - step_id: curate_reality_snapshot
    title: Curate Reality Snapshot
    actor_slot: reality_curator
    action:
      kind: recent_activity_and_canon_snapshot
    summary: Gather recent workflow, skill, mission, review, night_watch, and roadmap evidence without reading secrets or treating private notes as public truth.
  - step_id: review_vision_alignment
    title: Review Vision Alignment
    actor_slot: vision_reviewer
    action:
      kind: vision_roadmap_active_slice_alignment_review
    summary: Compare current work against `VISION_AND_GOALS.md`, `DEVELOPMENT_ROADMAP_V0.md`, current active slice, and explicit non-goals.
  - step_id: probe_owner_intent_gaps
    title: Probe Owner Intent Gaps
    actor_slot: intent_gap_probe
    action:
      kind: implicit_constraint_and_owner_intent_gap_probe
    summary: Find undefined terms, assumed constraints, owner-authority decisions, and recurring private patterns that lack canon or mission binding.
  - step_id: update_ambiguity_ledger
    title: Update Ambiguity Ledger
    actor_slot: ambiguity_keeper
    action:
      kind: strategic_ambiguity_dimension_scoring
    summary: Score unresolved dimensions such as vision alignment, owner intent, canon constraint, cadence, promotion threshold, and verification expectation.
  - step_id: route_question_answerability
    title: Route Question Answerability
    actor_slot: question_router
    action:
      kind: socratic_question_answerability_routing
    summary: Classify each gap as repo_fact, owner_decision, research_confirmation, or defer; answer or confirm non-owner facts before creating owner-facing questions.
  - step_id: forge_owner_questions
    title: Forge Owner Questions
    actor_slot: question_forge
    action:
      kind: owner_question_queue_generation
    summary: Convert only owner-decision gaps into bounded option-shaped questions, each with evidence, impacted surfaces, safe default, choices, and downstream consequence.
  - step_id: restate_answered_decisions
    title: Restate Answered Decisions
    actor_slot: closure_reviewer
    action:
      kind: owner_decision_restatement_gate
    summary: If owner answers are present, restate the decision or next-focus recommendation in one sentence before downstream routing; otherwise mark owner_decision_required.
  - step_id: route_canon_candidates
    title: Route Canon Candidates
    actor_slot: canon_router
    action:
      kind: canon_mission_workflow_constraint_candidate_routing
    summary: Route repeated or answered gaps to possible owner surfaces without mutating canon inside this workflow.
  - step_id: recommend_next_focus
    title: Recommend Next Focus
    actor_slot: supervisor
    action:
      kind: strategic_next_focus_recommendation
    summary: Decide whether to continue the active slice, ask owner questions, tighten a constraint, create a mission seed, or hold a candidate private.
  - step_id: archive_loop_ledger
    title: Archive Loop Ledger
    actor_slot: evidence_archivist
    action:
      kind: ouroboros_loop_ledger_archive
    summary: Write applied reports, owner question queue, candidate register, and loop ledger to `_workmeta/system` or project-local `_workmeta`.


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "workflow_id": "ouroboros_strategic_review_harness_v0",
  "fixture_id": "PUBLIC_SYNTH_OUROBOROS_STRATEGIC_REVIEW_HARNESS_V0",
  "source_kind": "synthetic_from_workflow_contract_metadata_only",
  "public_safe": true,
  "workflow_title": "Ouroboros Strategic Review Harness v0",
  "workflow_summary": "Run a two-lane strategic review loop that checks Soulforge vision alignment and surfaces owner-intent gaps as questions, canon constraint candidates, and next-focus recommendations without inventing missing intent.",
  "workflow_readiness_label": "draft",
  "input_refs": [
    "vision_and_goal_refs",
    "roadmap_refs",
    "current_canon_catalog_refs",
    "recent_activity_refs"
  ],
  "expected_output_groups": [
    "vision_alignment_report",
    "owner_intent_gap_register",
    "ambiguity_ledger",
    "socratic_question_packet",
    "owner_question_queue",
    "closure_restatement_note",
    "canon_constraint_candidate_register",
    "next_focus_recommendation",
    "ouroboros_loop_ledger"
  ],
  "must_preserve": [
    "vision alignment",
    "owner-intent gap",
    "question",
    "boundary",
    "no invented intent"
  ],
  "scenario_facts": [
    "one roadmap alignment confirmation",
    "one owner-intent gap question",
    "one next-focus recommendation",
    "one canon constraint candidate"
  ],
  "boundary_policy": [
    "Do not claim tool use, file edits, runtime paths, or hidden private evidence.",
    "Do not mutate upstream artifacts or promote stronger source/canon authority than the contract supports.",
    "Keep public-safe synthetic boundaries explicit."
  ]
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
