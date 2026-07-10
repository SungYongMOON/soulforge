Calibration replay metadata: candidate_id=MIG_gpt56_luna_medium_shape_r2; model=gpt-5.6-luna; reasoning_effort=medium.
Only candidate/profile metadata was transformed in the frozen public-safe candidate prompt below; task content and fixture remain unchanged.
--- TRANSFORMED FROZEN PUBLIC-SAFE CANDIDATE PROMPT ---
You are running a public-safe optimizer candidate for Soulforge workflow `latest_update_sync_and_followup_v0`.

Profile:
- candidate_id: MIG_gpt56_luna_medium_shape_r2
- model: gpt-5.6-luna
- reasoning_effort: medium
- species: dwarf
- class: auditor

Task:
Use only the synthetic fixture below. Do not run commands, inspect files, invent private facts, or claim any real pull, skill sync, junction audit, repair, source download, or payload access occurred. Produce one compact JSON object with these top-level keys: `profile_metadata`, `latest_update_scope_packet`, `repo_sync_preflight_report`, `codex_skill_sync_audit`, `codex_skill_sync_patch_report`, `material_completeness_audit`, `workspace_junction_refresh_report`, `followup_route_packet`, `boundary_review_note`, `completion_state`.

Quality bar:
- Treat the trigger as event-driven, not morning scheduled.
- Separate public, `_workmeta`, and `private-state` repo freshness decisions.
- Sync only tracked Codex skill bridges when policy allows; block ad hoc installed skill edits.
- Use `_workmeta/system/bindings/workspace_junctions.yaml` as junction intent source and never output host-local cloud roots.
- Classify stale junction targets and extra root mirrors as follow-up gaps, not auto-repairs.
- Route source ledger and workspace creation gaps to metadata-only downstream workflows.
- State that no real command or mutation occurred in this synthetic output.

Synthetic fixture:
```json
{
  "fixture_id": "latest_update_sync_and_followup_v0_public_synthetic_update_001",
  "trigger": "new_upstream_patch_detected",
  "event_driven": true,
  "morning_scheduled": false,
  "repo_sync": [
    {"repo_id": "public", "root_ref": ".", "freshness": "behind_remote_by_1", "dirty_state": "clean", "allowed_action": "pull_latest_after_preflight"},
    {"repo_id": "workmeta", "root_ref": "_workmeta", "freshness": "up_to_date", "dirty_state": "metadata_changed", "allowed_action": "record_followup_metadata_only"},
    {"repo_id": "private_state", "root_ref": "private-state", "freshness": "unknown_remote_unavailable", "dirty_state": "clean", "allowed_action": "report_remote_check_blocker"}
  ],
  "skill_sync": [
    {"skill_id": "soulforge-outbound-mail-authoring", "tracked_bridge_ref": ".registry/skills/outbound_mail_authoring/codex/SKILL.md", "installed_mirror_ref": "codex_home/skills/soulforge-outbound-mail-authoring/SKILL.md", "state": "up_to_date", "allowed_action": "none"},
    {"skill_id": "soulforge-workflow-optimizer", "tracked_bridge_ref": "codex_home/skills/soulforge-workflow-optimizer/SKILL.md", "installed_mirror_ref": "codex_home/skills/soulforge-workflow-optimizer/SKILL.md", "state": "not_tracked_bridge", "allowed_action": "do_not_ad_hoc_edit"},
    {"skill_id": "soulforge-codex-thread-manager", "tracked_bridge_ref": ".registry/skills/codex_thread_manager/codex/SKILL.md", "installed_mirror_ref": "codex_home/skills/soulforge-codex-thread-manager/SKILL.md", "state": "update_available", "allowed_action": "sync_from_tracked_bridge_when_policy_allows"}
  ],
  "material_gaps": [
    {"project_code": "PXX-SYNTH", "gap": "source_ledger_missing", "route": "knowledge_access_event_capture_v0"},
    {"project_code": "PYY-SYNTH", "gap": "owner_decision_needed_for_workspace_creation", "route": "owner_decision_packet_v0"}
  ],
  "junctions": [
    {"alias": "p26-synth", "binding_ref": "_workmeta/system/bindings/workspace_junctions.yaml", "cloud_relative_path": "Company/Projects/P26-SYNTH", "link_state": "present", "target_suffix_matches_binding": true, "classification": "ok"},
    {"alias": "p27-synth", "binding_ref": "_workmeta/system/bindings/workspace_junctions.yaml", "cloud_relative_path": "Company/Projects/P27-SYNTH", "link_state": "present", "target_suffix_matches_binding": false, "classification": "stale_target_blocked"},
    {"alias": "company", "binding_ref": "_workmeta/system/bindings/workspace_junctions.yaml", "cloud_relative_path": null, "link_state": "present", "target_suffix_matches_binding": false, "classification": "extra_root_mirror_gap"}
  ]
}
```
