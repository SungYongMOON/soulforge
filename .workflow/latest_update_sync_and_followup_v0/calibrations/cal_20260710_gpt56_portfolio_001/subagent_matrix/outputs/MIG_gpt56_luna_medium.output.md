```yaml
workflow_id: latest_update_sync_and_followup_v0
fixture_id: latest_update_sync_and_followup_v0_public_synthetic_update_001
deliverable_kind: public_safe_synthetic_calibration_candidate
claim_status: synthetic_observations_only

latest_update_scope_packet:
  scope_id: synthetic_scope_001
  trigger:
    signal_id: synthetic_latest_update_001
    type: new_upstream_patch_detected
    event_driven: true
    scheduled_trigger: false
    owner_requested_pull: true
  allowed_roots:
    - public
    - _workmeta
    - private-state
  active_project_filter:
    status: not_supplied
  mutation_policy:
    repo_pull_allowed_after_clean_preflight: true
    tracked_codex_bridge_sync_allowed: true
    junction_repair_allowed: false
    source_payload_download_allowed: false
    secret_inspection_allowed: false
  execution_status: not_claimed

repo_sync_preflight_report:
  report_id: synthetic_repo_preflight_001
  observations:
    - repo_id: public
      root_ref: "."
      freshness: behind_remote_by_1
      dirty_state: clean
      permitted_next_action: pull_latest_after_preflight
      action_status: not_claimed
    - repo_id: workmeta
      root_ref: "_workmeta"
      freshness: up_to_date
      dirty_state: metadata_changed
      permitted_next_action: record_followup_metadata_only
      action_status: not_claimed
    - repo_id: private_state
      root_ref: "private-state"
      freshness: unknown_remote_unavailable
      dirty_state: clean
      blocker: remote_check_unavailable
      permitted_next_action: report_remote_check_blocker
      action_status: not_claimed
  preflight_ceiling:
    - private-state remote freshness remains unknown
    - no pull or mutation is evidenced by this fixture

codex_skill_sync_audit:
  audit_id: synthetic_skill_sync_audit_001
  source_boundary: tracked_codex_bridges_only
  rows:
    - skill_id: soulforge-outbound-mail-authoring
      tracked_bridge_ref: ".registry/skills/outbound_mail_authoring/codex/SKILL.md"
      installed_mirror_ref: "runtime_default/skills/soulforge-outbound-mail-authoring/SKILL.md"
      state: up_to_date
      action: none
    - skill_id: soulforge-workflow-optimizer
      tracked_bridge_ref: null
      installed_mirror_ref: "runtime_default/skills/soulforge-workflow-optimizer/SKILL.md"
      state: not_tracked_bridge
      action: do_not_ad_hoc_edit
    - skill_id: soulforge-codex-thread-manager
      tracked_bridge_ref: ".registry/skills/codex_thread_manager/codex/SKILL.md"
      installed_mirror_ref: "runtime_default/skills/soulforge-codex-thread-manager/SKILL.md"
      state: update_available
      action: sync_from_tracked_bridge_when_policy_allows
  execution_status: not_claimed
  forbidden_actions:
    - ad_hoc_global_skill_editing
    - copying untracked skill content into public surfaces

codex_skill_sync_patch_report:
  patch_report_id: synthetic_skill_sync_patch_001
  proposed_scope:
    - skill_id: soulforge-codex-thread-manager
      source: ".registry/skills/codex_thread_manager/codex/SKILL.md"
      destination_class: runtime_default_codex_skill_mirror
      reason: update_available
  patch_status: proposed_only
  commands_or_mutations: not_claimed
  payload_boundary:
    source_payload_copy_into_public_package: forbidden

material_completeness_audit:
  audit_id: synthetic_material_audit_001
  rows:
    - project_code: PXX-SYNTH
      state: metadata_companion_present
      gap: source_ledger_missing
      route: knowledge_access_event_capture_v0
      route_mode: metadata_only
    - project_code: PYY-SYNTH
      state: project_folder_missing
      gap: owner_decision_needed_for_workspace_creation
      route: owner_decision_packet_v0
      route_mode: owner_gate
  completeness_status: gaps_present
  source_payload_access: not performed_and_not_claimed

workspace_junction_refresh_report:
  report_id: synthetic_junction_refresh_001
  intent_source: "_workmeta/system/bindings/workspace_junctions.yaml"
  host_local_cloud_root: omitted
  rows:
    - alias: p26-synth
      binding_ref: "_workmeta/system/bindings/workspace_junctions.yaml"
      cloud_relative_path: "Company/Projects/P26-SYNTH"
      link_state: present
      target_suffix_matches_binding: true
      classification: ok
      repair_status: not_applicable
    - alias: p27-synth
      binding_ref: "_workmeta/system/bindings/workspace_junctions.yaml"
      cloud_relative_path: "Company/Projects/P27-SYNTH"
      link_state: present
      target_suffix_matches_binding: false
      classification: stale_target_blocked
      repair_status: blocked
    - alias: company
      binding_ref: "_workmeta/system/bindings/workspace_junctions.yaml"
      cloud_relative_path: null
      link_state: present
      target_suffix_matches_binding: false
      classification: extra_root_mirror_gap
      repair_status: blocked
  audit_execution: not_claimed
  repair_authority: absent
  stop_condition: do_not_repair_without_binding_and_mutation_authority

followup_route_packet:
  packet_id: synthetic_followup_routes_001
  routes:
    - route_id: synthetic_route_001
      target_workflow: knowledge_access_event_capture_v0
      trigger: PXX-SYNTH source ledger missing
      scope: metadata_only_usage_signal
      payload_transfer: prohibited
    - route_id: synthetic_route_002
      target_workflow: owner_decision_packet_v0
      trigger: PYY-SYNTH workspace creation requires owner decision
      scope: decision request only
      mutation_authority: missing
    - route_id: synthetic_route_003
      target_workflow: owner_decision_packet_v0
      trigger: p27-synth stale junction target
      scope: owner review and authority determination
      repair: not authorized
    - route_id: synthetic_route_004
      target_workflow: owner_decision_packet_v0
      trigger: company extra root mirror gap
      scope: owner review and classification
      repair: not authorized
    - route_id: synthetic_route_005
      target_workflow: post_development_review_gate_v0
      trigger: completion claim posture review required
      scope: boundary and claim review
  routing_status: proposed_metadata_only
  copied_private_payloads: false

boundary_review_note:
  note_id: synthetic_boundary_review_001
  weakest_supported_claim_ceiling:
    - synthetic fixture observations were classified
    - no real pull, skill synchronization, junction audit, repair, payload access, or service interaction is established
    - private-state remote freshness remains unknown
    - production readiness, source-truth status, unattended automation, and default-route status are not claimed
  boundary_checks:
    private_binding_used_as_junction_intent_source: true
    host_local_absolute_paths_stored: false
    source_payloads_or_notebooklm_answers_copied: false
    untracked_skill_edited: false
    junctions_repaired: false
    followups_metadata_only: true
  owner_approval_required: true
  stop_conditions:
    - stop on unavailable private-state remote verification
    - stop junction repair pending binding and mutation authority
    - stop workspace creation pending owner decision
    - stop source-payload handling because download authority is absent
  next_action:
    - obtain applicable owner decisions and authority references
    - preserve all follow-up handling as metadata-only
  completion_claim: not supported by this fixture alone
```
