You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-sol; reasoning_effort=low; species=dwarf; class=auditor.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: latest_update_sync_and_followup_v0
kind: workflow
status: active
title: Latest Update Sync And Follow-up v0
summary: Event-driven workflow for pulling latest GitHub/upstream state, syncing Codex skill mirrors from tracked skill bridges, checking companion metadata, strictly auditing workspace junction targets from the private portable junction binding, and routing follow-up work.
entrypoint: run
execution_mode: local_tool_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
inputs:
  - latest_update_scope_binding
  - repo_sync_policy
  - skill_sync_policy
  - junction_binding_ref
optional_inputs:
  - active_project_filter
  - local_cloud_root_resolution_ref
  - material_completeness_policy
  - curation_policy
  - gateway_queue_refs
  - snapshot_policy
  - owner_decision_refs
outputs:
  - latest_update_scope_packet
  - repo_sync_preflight_report
  - codex_skill_sync_audit
  - codex_skill_sync_patch_report
  - material_completeness_audit
  - workspace_junction_refresh_report
  - followup_route_packet
  - boundary_review_note
validation_level: pilot_executed_report_only_private_evidence
registration_policy: owner_requested_registration
upstream_surfaces:
  - surface_id: github_or_upstream_update
    expected_signal: new_patch_or_latest_update
    status: trigger
  - surface_id: workspace_junction_binding
    expected_ref: _workmeta/system/bindings/workspace_junctions.yaml
    status: required_private_binding
  - surface_id: codex_skill_bridge_registry
    expected_ref: .registry/skills/**/codex/SKILL.md
    status: optional_sync_surface
downstream_workflows:
  - workflow_id: wiki_curation_maintenance_v0
    expected_input: metadata_or_source_curation_needed
    status: optional_followup
  - workflow_id: knowledge_access_event_capture_v0
    expected_input: metadata_only_usage_signal_needed
    status: optional_followup
  - workflow_id: owner_decision_packet_v0
    expected_input: local_root_or_mutation_authority_missing
    status: optional_owner_gate
  - workflow_id: post_development_review_gate_v0
    expected_input: workflow_changed_state_or_claim_posture
    status: required_before_completion_claim
operating_contract:
  owns:
    - latest_update_scope_packet_shape
    - repo_sync_preflight_report_shape
    - codex_skill_sync_audit_shape
    - codex_skill_sync_patch_report_shape
    - material_completeness_audit_shape
    - workspace_junction_refresh_report_shape
    - followup_route_packet_shape
    - boundary_review_note_shape
  does_not_own:
    - GitHub merge_or_rebase
    - host_local_cloud_root_configuration
    - secret_material_inspection
    - source_payload_download_authority
    - automatic_junction_repair_without_binding
    - NotebookLM_runtime_operation
    - ad_hoc_global_skill_editing
    - owner_approval_authority
    - canon_promotion
  boundaries:
    event_driven_not_morning_scheduled: true
    public_private_companion_state_checked_before_followup: true
    junction_intent_source_is_private_binding: true
    junction_target_suffix_verified_against_binding: true
    skill_mirror_source_is_tracked_codex_bridge: true
    host_local_absolute_paths_forbidden_in_public_package: true
    no_payload_copy_into_public_package: true
  required_output_shapes:
    project_binding: templates/project_binding.template.yaml
    latest_update_scope_packet: templates/latest_update_scope_packet.template.yaml
    repo_sync_preflight_report: templates/repo_sync_preflight_report.template.yaml
    codex_skill_sync_audit: templates/codex_skill_sync_audit.template.yaml
    codex_skill_sync_patch_report: templates/codex_skill_sync_patch_report.template.yaml
    material_completeness_audit: templates/material_completeness_audit.template.yaml
    workspace_junction_refresh_report: templates/workspace_junction_refresh_report.template.yaml
    followup_route_packet: templates/followup_route_packet.template.yaml
    boundary_review_note: templates/boundary_review_note.template.yaml
notes:
  - This workflow is triggered by latest update signals, not by a fixed time of day.
  - "Codex skill sync compares `.registry/skills/**/codex` against the local installed mirror under `CODEX_HOME/skills` or the runtime default; public workflow outputs must not store the host-local absolute install root."
  - "`_workmeta/system/bindings/workspace_junctions.yaml` is the portable junction intent source; each PC resolves its local cloud root outside workflow canon."
  - "`npm run guild-hall:workspace-junction:audit` is the canonical report-only strict audit surface; it verifies local link existence and that each target suffix matches the binding `cloud_relative_path` without printing host-local roots."
  - Report-only pilot evidence exists, but do not report production-ready, source-truth, unattended automation, or default-route claims from this package alone.


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: latest_update_sync_and_followup_v0
kind: step_graph
status: draft
steps:
  - step_id: bind_update_scope
    title: Bind Update Scope
    actor_slot: update_scope_binder
    action: Bind the triggering GitHub/upstream update, allowed repo roots, companion roots, active project filter, and mutation policy.
    outputs:
      - latest_update_scope_packet
    next:
      - run_repo_sync_preflight
  - step_id: run_repo_sync_preflight
    title: Run Repo Sync Preflight
    actor_slot: repo_sync_preflight_runner
    action: Check public `Soulforge`, `_workmeta`, and `private-state` freshness before any project or junction judgment.
    inputs:
      - latest_update_scope_packet
    outputs:
      - repo_sync_preflight_report
    next:
      - sync_codex_skill_mirrors
  - step_id: sync_codex_skill_mirrors
    title: Sync Codex Skill Mirrors
    actor_slot: codex_skill_sync_auditor
    action: Compare tracked `.registry/skills/**/codex` skill bridges to the local installed Codex skill mirror, classify latest, missing, or update_available rows, and when policy allows run the canonical skill sync command for missing or stale mirrors.
    inputs:
      - repo_sync_preflight_report
    outputs:
      - codex_skill_sync_audit
      - codex_skill_sync_patch_report
    next:
      - audit_material_completeness
  - step_id: audit_material_completeness
    title: Audit Material Completeness
    actor_slot: material_completeness_auditor
    action: Check whether the latest update implies missing project folders, metadata companions, source ledgers, or follow-up state.
    inputs:
      - codex_skill_sync_patch_report
    outputs:
      - material_completeness_audit
    next:
      - refresh_workspace_junction_state
  - step_id: refresh_workspace_junction_state
    title: Refresh Workspace Junction State
    actor_slot: workspace_junction_auditor
    action: Run `npm run guild-hall:workspace-junction:audit` or an equivalent strict audit that reads `_workmeta/system/bindings/workspace_junctions.yaml`, compares declared junction intent to local `_workspaces/<alias>` link state, verifies each link target suffix against `cloud_relative_path`, and classifies missing, stale target, extra root mirror, inactive, or repairable entries.
    inputs:
      - material_completeness_audit
    outputs:
      - workspace_junction_refresh_report
    next:
      - route_followup_work
  - step_id: route_followup_work
    title: Route Follow-up Work
    actor_slot: followup_router
    action: Route needed work to curation, gateway, snapshot, owner-decision, or blocked follow-up without copying private payloads into public surfaces.
    inputs:
      - workspace_junction_refresh_report
    outputs:
      - followup_route_packet
    next:
      - review_boundary_and_handoff
  - step_id: review_boundary_and_handoff
    title: Review Boundary And Handoff
    actor_slot: boundary_handoff_reviewer
    action: Record the weakest supported claim ceiling, public/private boundary status, next action, and whether owner approval is required.
    inputs:
      - followup_route_packet
    outputs:
      - boundary_review_note
    next: []


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "schema_version": "soulforge.workflow_optimizer.input_fixture.v0",
  "fixture_id": "latest_update_sync_and_followup_v0_public_synthetic_update_001",
  "workflow_id": "latest_update_sync_and_followup_v0",
  "fixture_kind": "public_safe_synthetic_workflow_contract_fixture",
  "public_safety": {
    "contains_real_project_payload": false,
    "contains_mail_body_or_attachment": false,
    "contains_secret_value": false,
    "contains_runtime_absolute_path": false,
    "contains_private_raw_source": false,
    "basis": "Synthetic latest-update, skill mirror, metadata, and junction observations derived from the public workflow contract only."
  },
  "update_signal": {
    "signal_id": "synthetic_latest_update_001",
    "trigger": "new_upstream_patch_detected",
    "event_driven": true,
    "morning_scheduled": false,
    "owner_requested_pull": true,
    "mutation_policy": {
      "repo_pull_allowed_after_clean_preflight": true,
      "skill_sync_allowed_for_tracked_codex_bridges": true,
      "junction_repair_allowed": false,
      "source_payload_download_allowed": false,
      "secret_inspection_allowed": false
    }
  },
  "repo_sync_observations": [
    {
      "repo_id": "public",
      "root_ref": ".",
      "freshness": "behind_remote_by_1",
      "dirty_state": "clean",
      "allowed_action": "pull_latest_after_preflight"
    },
    {
      "repo_id": "workmeta",
      "root_ref": "_workmeta",
      "freshness": "up_to_date",
      "dirty_state": "metadata_changed",
      "allowed_action": "record_followup_metadata_only"
    },
    {
      "repo_id": "private_state",
      "root_ref": "private-state",
      "freshness": "unknown_remote_unavailable",
      "dirty_state": "clean",
      "allowed_action": "report_remote_check_blocker"
    }
  ],
  "skill_sync_observations": [
    {
      "skill_id": "soulforge-outbound-mail-authoring",
      "tracked_bridge_ref": ".registry/skills/outbound_mail_authoring/codex/SKILL.md",
      "installed_mirror_ref": "codex_home/skills/soulforge-outbound-mail-authoring/SKILL.md",
      "state": "up_to_date",
      "allowed_action": "none"
    },
    {
      "skill_id": "soulforge-workflow-optimizer",
      "tracked_bridge_ref": "codex_home/skills/soulforge-workflow-optimizer/SKILL.md",
      "installed_mirror_ref": "codex_home/skills/soulforge-workflow-optimizer/SKILL.md",
      "state": "not_tracked_bridge",
      "allowed_action": "do_not_ad_hoc_edit"
    },
    {
      "skill_id": "soulforge-codex-thread-manager",
      "tracked_bridge_ref": ".registry/skills/codex_thread_manager/codex/SKILL.md",
      "installed_mirror_ref": "codex_home/skills/soulforge-codex-thread-manager/SKILL.md",
      "state": "update_available",
      "allowed_action": "sync_from_tracked_bridge_when_policy_allows"
    }
  ],
  "material_observations": [
    {
      "project_code": "PXX-SYNTH",
      "state": "metadata_companion_present",
      "gap": "source_ledger_missing",
      "route": "knowledge_access_event_capture_v0"
    },
    {
      "project_code": "PYY-SYNTH",
      "state": "project_folder_missing",
      "gap": "owner_decision_needed_for_workspace_creation",
      "route": "owner_decision_packet_v0"
    }
  ],
  "workspace_junction_observations": [
    {
      "alias": "p26-synth",
      "binding_ref": "_workmeta/system/bindings/workspace_junctions.yaml",
      "cloud_relative_path": "Company/Projects/P26-SYNTH",
      "link_state": "present",
      "target_suffix_matches_binding": true,
      "classification": "ok"
    },
    {
      "alias": "p27-synth",
      "binding_ref": "_workmeta/system/bindings/workspace_junctions.yaml",
      "cloud_relative_path": "Company/Projects/P27-SYNTH",
      "link_state": "present",
      "target_suffix_matches_binding": false,
      "classification": "stale_target_blocked"
    },
    {
      "alias": "company",
      "binding_ref": "_workmeta/system/bindings/workspace_junctions.yaml",
      "cloud_relative_path": null,
      "link_state": "present",
      "target_suffix_matches_binding": false,
      "classification": "extra_root_mirror_gap"
    }
  ],
  "expected_boundary_behavior": {
    "use_private_binding_as_junction_intent_source": true,
    "do_not_store_host_local_cloud_roots": true,
    "do_not_auto_repair_junctions_without_binding_and_mutation_authority": true,
    "do_not_copy_source_payloads_or_notebooklm_answers": true,
    "do_not_treat_skill_sync_as_ad_hoc_global_skill_edit": true,
    "route_followups_metadata_only": true,
    "actual_pull_sync_or_repair_commands_must_not_be_claimed_in_fixture_output": true
  },
  "required_output_shapes": [
    "latest_update_scope_packet",
    "repo_sync_preflight_report",
    "codex_skill_sync_audit",
    "codex_skill_sync_patch_report",
    "material_completeness_audit",
    "workspace_junction_refresh_report",
    "followup_route_packet",
    "boundary_review_note"
  ],
  "acceptance_summary": [
    "Treat the trigger as event-driven, not scheduled.",
    "Separate public, workmeta, and private-state repo freshness checks.",
    "Sync only tracked Codex bridges when policy allows; block ad hoc skill edits.",
    "Use the private junction binding as intent source while keeping host-local roots out of output.",
    "Classify stale target and extra root mirror as follow-up gaps, not repairs.",
    "Route source ledger and workspace creation gaps to metadata-only downstream workflows.",
    "Do not claim real pull, skill sync, junction audit, repair, or payload access occurred."
  ]
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
