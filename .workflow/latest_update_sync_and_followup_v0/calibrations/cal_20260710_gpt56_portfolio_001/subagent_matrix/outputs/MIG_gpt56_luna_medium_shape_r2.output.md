{
  "profile_metadata": {
    "candidate_id": "MIG_gpt56_luna_medium_shape_r2",
    "model": "gpt-5.6-luna",
    "reasoning_effort": "medium",
    "species": "dwarf",
    "class": "auditor"
  },
  "latest_update_scope_packet": {
    "trigger": "new_upstream_patch_detected",
    "event_driven": true,
    "morning_scheduled": false,
    "scope": [
      "public_repo_preflight_and_pull_scope",
      "workmeta_followup_metadata_only",
      "private_state_remote_check_blocker",
      "tracked_skill_bridge_audit",
      "junction_and_material_gap_followup"
    ]
  },
  "repo_sync_preflight_report": {
    "public": {
      "freshness": "behind_remote_by_1",
      "dirty_state": "clean",
      "decision": "pull_latest_after_preflight"
    },
    "workmeta": {
      "freshness": "up_to_date",
      "dirty_state": "metadata_changed",
      "decision": "record_followup_metadata_only"
    },
    "private_state": {
      "freshness": "unknown_remote_unavailable",
      "dirty_state": "clean",
      "decision": "report_remote_check_blocker"
    }
  },
  "codex_skill_sync_audit": [
    {
      "skill_id": "soulforge-outbound-mail-authoring",
      "state": "up_to_date",
      "policy_decision": "no_action"
    },
    {
      "skill_id": "soulforge-workflow-optimizer",
      "state": "not_tracked_bridge",
      "policy_decision": "block_ad_hoc_installed_skill_edit"
    },
    {
      "skill_id": "soulforge-codex-thread-manager",
      "state": "update_available",
      "policy_decision": "eligible_for_sync_from_tracked_bridge_when_policy_allows"
    }
  ],
  "codex_skill_sync_patch_report": {
    "mutation_performed": false,
    "eligible_bridge_sync": [
      "soulforge-codex-thread-manager"
    ],
    "blocked_ad_hoc_edits": [
      "soulforge-workflow-optimizer"
    ],
    "reason": "synthetic_public_safe_replay"
  },
  "material_completeness_audit": [
    {
      "project_code": "PXX-SYNTH",
      "gap": "source_ledger_missing",
      "route": "knowledge_access_event_capture_v0",
      "mode": "metadata_only"
    },
    {
      "project_code": "PYY-SYNTH",
      "gap": "owner_decision_needed_for_workspace_creation",
      "route": "owner_decision_packet_v0",
      "mode": "metadata_only"
    }
  ],
  "workspace_junction_refresh_report": {
    "intent_source": "_workmeta/system/bindings/workspace_junctions.yaml",
    "junctions": [
      {
        "alias": "p26-synth",
        "classification": "ok",
        "action": "none"
      },
      {
        "alias": "p27-synth",
        "classification": "stale_target_blocked",
        "action": "followup_gap"
      },
      {
        "alias": "company",
        "classification": "extra_root_mirror_gap",
        "action": "followup_gap"
      }
    ],
    "host_local_cloud_roots_output": false,
    "auto_repairs": false
  },
  "followup_route_packet": {
    "knowledge_access_event_capture_v0": [
      "PXX-SYNTH"
    ],
    "owner_decision_packet_v0": [
      "PYY-SYNTH"
    ],
    "junction_followup_gaps": [
      "p27-synth",
      "company"
    ]
  },
  "boundary_review_note": {
    "public_safe": true,
    "real_commands_run": false,
    "real_mutations_occurred": false,
    "real_pull_or_skill_sync_occurred": false,
    "private_facts_invented": false,
    "host_local_cloud_roots_exposed": false
  },
  "completion_state": {
    "status": "synthetic_replay_complete",
    "real_world_execution": "none",
    "blockers": [
      "private_state_remote_unavailable"
    ],
    "followups_required": true
  }
}
