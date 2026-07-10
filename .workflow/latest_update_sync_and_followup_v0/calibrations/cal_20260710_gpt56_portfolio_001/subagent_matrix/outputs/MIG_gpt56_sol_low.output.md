schema_version: soulforge.latest_update_sync_and_followup.deliverable.v0
fixture_id: latest_update_sync_and_followup_v0_public_synthetic_update_001
workflow_id: latest_update_sync_and_followup_v0
evidence_basis: public_safe_synthetic_fixture_only

latest_update_scope_packet:
  signal_id: synthetic_latest_update_001
  trigger: new_upstream_patch_detected
  execution_basis: event_driven
  scheduled: false
  owner_requested_pull: true
  repo_roots:
    - repo_id: public
      root_ref: "."
    - repo_id: workmeta
      root_ref: _workmeta
    - repo_id: private_state
      root_ref: private-state
  active_project_filter: null
  mutation_policy:
    repo_pull_allowed_after_clean_preflight: true
    skill_sync_allowed_for_tracked_codex_bridges: true
    junction_repair_allowed: false
    source_payload_download_allowed: false
    secret_inspection_allowed: false
  scope_limits:
    - no_host_local_absolute_paths
    - no_private_payload_copy
    - no_source_payload_download
    - no_secret_inspection
    - no_unbound_junction_repair

repo_sync_preflight_report:
  overall_state: followup_required
  observations:
    - repo_id: public
      root_ref: "."
      freshness: behind_remote_by_1
      dirty_state: clean
      disposition: pull_eligible
      action_status: not_claimed
      condition: clean_preflight_and_existing_authority
    - repo_id: workmeta
      root_ref: _workmeta
      freshness: up_to_date
      dirty_state: metadata_changed
      disposition: metadata_only_followup
      action_status: not_claimed
    - repo_id: private_state
      root_ref: private-state
      freshness: unknown_remote_unavailable
      dirty_state: clean
      disposition: blocked_remote_freshness_check
      action_status: not_claimed
  uncertainty:
    - Private-state remote freshness is unknown.
    - No repository mutation or resulting post-mutation state is established.

codex_skill_sync_audit:
  overall_state: tracked_bridge_update_pending
  observations:
    - skill_id: soulforge-outbound-mail-authoring
      tracked_bridge_ref: .registry/skills/outbound_mail_authoring/codex/SKILL.md
      installed_mirror_ref: codex_home/skills/soulforge-outbound-mail-authoring/SKILL.md
      classification: latest
      disposition: no_change
    - skill_id: soulforge-workflow-optimizer
      supplied_bridge_ref: codex_home/skills/soulforge-workflow-optimizer/SKILL.md
      installed_mirror_ref: codex_home/skills/soulforge-workflow-optimizer/SKILL.md
      classification: not_tracked_bridge
      disposition: blocked_ad_hoc_edit
      reason: supplied_bridge_ref_is_not_under_tracked_codex_bridge_registry
    - skill_id: soulforge-codex-thread-manager
      tracked_bridge_ref: .registry/skills/codex_thread_manager/codex/SKILL.md
      installed_mirror_ref: codex_home/skills/soulforge-codex-thread-manager/SKILL.md
      classification: update_available
      disposition: canonical_sync_eligible
      condition: tracked_bridge_policy_allows
  boundary:
    mirror_source_must_be_tracked_codex_bridge: true
    ad_hoc_global_skill_edit_allowed: false
    host_local_install_root_disclosed: false

codex_skill_sync_patch_report:
  patch_state: not_claimed
  eligible_changes:
    - skill_id: soulforge-codex-thread-manager
      source_ref: .registry/skills/codex_thread_manager/codex/SKILL.md
      target_ref: codex_home/skills/soulforge-codex-thread-manager/SKILL.md
      proposed_disposition: sync_from_tracked_bridge
  unchanged:
    - soulforge-outbound-mail-authoring
  excluded:
    - skill_id: soulforge-workflow-optimizer
      reason: not_tracked_bridge
  non_claims:
    - No skill mirror synchronization is asserted.
    - No installed skill state after synchronization is asserted.

material_completeness_audit:
  overall_state: gaps_present
  projects:
    - project_code: PXX-SYNTH
      current_state: metadata_companion_present
      gap: source_ledger_missing
      disposition: metadata_only_capture_followup
      route: knowledge_access_event_capture_v0
      payload_access_authorized: false
    - project_code: PYY-SYNTH
      current_state: project_folder_missing
      gap: owner_decision_needed_for_workspace_creation
      disposition: owner_decision_required
      route: owner_decision_packet_v0
      workspace_creation_authorized: false
  non_claims:
    - Source contents and source-truth completeness are not established.
    - No project folder or source ledger creation is asserted.

workspace_junction_refresh_report:
  intent_source_ref: _workmeta/system/bindings/workspace_junctions.yaml
  overall_state: followup_required
  audit_basis: supplied_synthetic_observations
  entries:
    - alias: p26-synth
      cloud_relative_path: Company/Projects/P26-SYNTH
      link_state: present
      target_suffix_matches_binding: true
      classification: ok
      disposition: no_change
    - alias: p27-synth
      cloud_relative_path: Company/Projects/P27-SYNTH
      link_state: present
      target_suffix_matches_binding: false
      classification: stale_target_blocked
      disposition: owner_gated_followup
      repair_authorized: false
    - alias: company
      cloud_relative_path: null
      link_state: present
      target_suffix_matches_binding: false
      classification: extra_root_mirror_gap
      disposition: binding_or_owner_decision_required
      repair_authorized: false
  boundary:
    private_binding_used_as_intent_source: true
    host_local_cloud_root_recorded: false
    automatic_repair_allowed: false
  uncertainty:
    - No valid bound target is supplied for the extra root mirror.
    - Local cloud-root resolution and actual link targets remain undisclosed.
  non_claims:
    - No runtime junction audit or repair is asserted.

followup_route_packet:
  overall_state: routed_with_blockers
  routes:
    - route_id: public_repo_update
      target: local_repo_sync_followup
      subject_ref: public
      reason: behind_remote_by_1
      mode: mutation_eligible_after_preflight
      status: pending
    - route_id: workmeta_metadata_change
      target: metadata_only_followup
      subject_ref: workmeta
      reason: metadata_changed
      mode: metadata_only
      status: pending
    - route_id: private_state_remote_check
      target: blocked_followup
      subject_ref: private_state
      reason: unknown_remote_unavailable
      status: blocked
    - route_id: tracked_skill_bridge_update
      target: canonical_skill_sync_followup
      subject_ref: soulforge-codex-thread-manager
      reason: update_available
      mode: tracked_bridge_only
      status: pending
    - route_id: missing_source_ledger
      target: knowledge_access_event_capture_v0
      subject_ref: PXX-SYNTH
      reason: source_ledger_missing
      mode: metadata_only
      status: pending
    - route_id: missing_project_workspace
      target: owner_decision_packet_v0
      subject_ref: PYY-SYNTH
      reason: owner_decision_needed_for_workspace_creation
      mode: owner_gate
      status: pending
    - route_id: stale_junction_target
      target: owner_decision_packet_v0
      subject_ref: p27-synth
      reason: stale_target_blocked
      mode: owner_gate
      status: pending
    - route_id: extra_root_mirror
      target: owner_decision_packet_v0
      subject_ref: company
      reason: binding_intent_missing
      mode: owner_gate
      status: pending
  prohibited_routes:
    - ad_hoc_global_skill_edit
    - automatic_junction_repair
    - source_payload_download
    - private_payload_to_public_surface

boundary_review_note:
  claim_ceiling: synthetic_fixture_based_report_only
  boundary_status: preserved
  supported_claims:
    - The synthetic event requires repository, tracked-skill, material, and junction follow-up.
    - One tracked skill mirror is represented as update-eligible.
    - One junction is represented as suffix-matching.
    - One junction is represented as stale and blocked from repair.
    - One extra root mirror lacks binding intent.
    - Material gaps require metadata-only capture or owner decision.
  unsupported_claims:
    - actual_repository_pull
    - actual_skill_sync
    - actual_runtime_junction_audit
    - actual_junction_repair
    - actual_payload_or_secret_access
    - production_readiness
    - source_truth
    - unattended_automation
    - default_route_safety
    - canon_promotion
  owner_approval_required: true
  owner_decisions:
    - authorize_or_defer_workspace_creation_for_PYY-SYNTH
    - provide_or_reject_binding_intent_for_company
    - authorize_any_future_junction_repair_for_p27-synth
  blockers:
    - private_state_remote_unavailable
    - p27-synth_target_suffix_mismatch
    - company_binding_intent_missing
  stop_conditions:
    - Stop junction mutation because junction_repair_allowed is false.
    - Stop source acquisition because source_payload_download_allowed is false.
    - Stop secret inspection because secret_inspection_allowed is false.
    - Stop ad hoc skill editing when no tracked bridge is supplied.
    - Stop private-state freshness claims while its remote is unavailable.
    - Stop completion claims until required post-development review is satisfied for any changed-state or claim posture.
  next_action:
    route: post_development_review_gate_v0
    input: workflow_changed_state_or_claim_posture
    status: required_before_completion_claim
