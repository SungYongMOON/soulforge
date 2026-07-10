{
  "latest_update_scope_packet": {
    "fixture_id": "latest_update_sync_and_followup_v0_public_synthetic_update_001",
    "trigger_id": "synthetic_latest_update_001",
    "trigger": "new_upstream_patch_detected",
    "event_driven": true,
    "morning_scheduled": false,
    "scope": {
      "repo_roots": [".", "_workmeta", "private-state"],
      "active_project_filter": null,
      "public_safe_only": true
    },
    "mutation_policy": {
      "repo_pull_allowed_after_clean_preflight": true,
      "skill_sync_allowed_for_tracked_codex_bridges": true,
      "junction_repair_allowed": false,
      "source_payload_download_allowed": false,
      "secret_inspection_allowed": false
    },
    "claim_boundary": "Synthetic fixture interpretation only; no pull, sync, repair, or payload access is asserted."
  },
  "repo_sync_preflight_report": {
    "status": "followup_required",
    "repositories": [
      {
        "repo_id": "public",
        "root_ref": ".",
        "freshness": "behind_remote_by_1",
        "dirty_state": "clean",
        "allowed_action": "pull_latest_after_preflight",
        "recommended_next_action": "Owner-authorized latest-update handling may proceed only under the stated policy."
      },
      {
        "repo_id": "workmeta",
        "root_ref": "_workmeta",
        "freshness": "up_to_date",
        "dirty_state": "metadata_changed",
        "allowed_action": "record_followup_metadata_only",
        "recommended_next_action": "Preserve the metadata-only follow-up boundary."
      },
      {
        "repo_id": "private_state",
        "root_ref": "private-state",
        "freshness": "unknown_remote_unavailable",
        "dirty_state": "clean",
        "allowed_action": "report_remote_check_blocker",
        "recommended_next_action": "Route remote-freshness uncertainty to an owner decision or later authorized check."
      }
    ],
    "blockers": [
      "private-state remote freshness is unknown because the remote is unavailable in the fixture."
    ],
    "claim_boundary": "These are supplied synthetic observations, not runtime preflight results."
  },
  "codex_skill_sync_audit": {
    "status": "one_tracked_bridge_update_available",
    "rows": [
      {
        "skill_id": "soulforge-outbound-mail-authoring",
        "tracked_bridge_ref": ".registry/skills/outbound_mail_authoring/codex/SKILL.md",
        "installed_mirror_ref": "codex_home/skills/soulforge-outbound-mail-authoring/SKILL.md",
        "state": "up_to_date",
        "allowed_action": "none",
        "disposition": "no_followup"
      },
      {
        "skill_id": "soulforge-workflow-optimizer",
        "tracked_bridge_ref": "codex_home/skills/soulforge-workflow-optimizer/SKILL.md",
        "installed_mirror_ref": "codex_home/skills/soulforge-workflow-optimizer/SKILL.md",
        "state": "not_tracked_bridge",
        "allowed_action": "do_not_ad_hoc_edit",
        "disposition": "blocked_from_sync",
        "reason": "The supplied source is not a tracked Codex bridge."
      },
      {
        "skill_id": "soulforge-codex-thread-manager",
        "tracked_bridge_ref": ".registry/skills/codex_thread_manager/codex/SKILL.md",
        "installed_mirror_ref": "codex_home/skills/soulforge-codex-thread-manager/SKILL.md",
        "state": "update_available",
        "allowed_action": "sync_from_tracked_bridge_when_policy_allows",
        "disposition": "eligible_for_policy_bound_sync"
      }
    ],
    "host_local_install_root": "withheld",
    "claim_boundary": "No skill mirror comparison or synchronization is asserted beyond the synthetic fixture observations."
  },
  "codex_skill_sync_patch_report": {
    "status": "proposed_policy_bound_patch_only",
    "eligible_patch_rows": [
      {
        "skill_id": "soulforge-codex-thread-manager",
        "source_ref": ".registry/skills/codex_thread_manager/codex/SKILL.md",
        "target_ref": "codex_home/skills/soulforge-codex-thread-manager/SKILL.md",
        "proposed_action": "sync_from_tracked_bridge_when_policy_allows",
        "authority_condition": "skill_sync_allowed_for_tracked_codex_bridges"
      }
    ],
    "non_patch_rows": [
      {
        "skill_id": "soulforge-outbound-mail-authoring",
        "reason": "up_to_date"
      },
      {
        "skill_id": "soulforge-workflow-optimizer",
        "reason": "not_tracked_bridge; ad hoc global skill editing is prohibited"
      }
    ],
    "applied": false,
    "claim_boundary": "This is a proposed synthetic patch disposition; no files were changed."
  },
  "material_completeness_audit": {
    "status": "gaps_routed_metadata_only",
    "projects": [
      {
        "project_code": "PXX-SYNTH",
        "state": "metadata_companion_present",
        "gap": "source_ledger_missing",
        "route": "knowledge_access_event_capture_v0",
        "route_payload_boundary": "metadata-only usage signal; no source payload or NotebookLM output"
      },
      {
        "project_code": "PYY-SYNTH",
        "state": "project_folder_missing",
        "gap": "owner_decision_needed_for_workspace_creation",
        "route": "owner_decision_packet_v0",
        "route_payload_boundary": "decision request only; no workspace creation is authorized"
      }
    ],
    "unresolved_gaps": [
      "PXX-SYNTH source-ledger state requires metadata-only follow-up.",
      "PYY-SYNTH workspace creation requires owner approval."
    ],
    "claim_boundary": "Completeness states are fixture-supplied synthetic observations."
  },
  "workspace_junction_refresh_report": {
    "status": "followup_required_no_repair",
    "intent_source_ref": "_workmeta/system/bindings/workspace_junctions.yaml",
    "host_local_cloud_root": "withheld",
    "entries": [
      {
        "alias": "p26-synth",
        "cloud_relative_path": "Company/Projects/P26-SYNTH",
        "link_state": "present",
        "target_suffix_matches_binding": true,
        "classification": "ok",
        "disposition": "no_followup"
      },
      {
        "alias": "p27-synth",
        "cloud_relative_path": "Company/Projects/P27-SYNTH",
        "link_state": "present",
        "target_suffix_matches_binding": false,
        "classification": "stale_target_blocked",
        "disposition": "blocked_followup",
        "reason": "Automatic junction repair is not authorized."
      },
      {
        "alias": "company",
        "cloud_relative_path": null,
        "link_state": "present",
        "target_suffix_matches_binding": false,
        "classification": "extra_root_mirror_gap",
        "disposition": "followup_required",
        "reason": "No portable binding path is supplied for this root-mirror entry."
      }
    ],
    "repair_applied": false,
    "claim_boundary": "This classifies supplied synthetic observations only; no junction audit or repair is asserted."
  },
  "followup_route_packet": {
    "status": "owner_and_metadata_followup_required",
    "routes": [
      {
        "route_id": "synthetic-route-source-ledger-001",
        "workflow_id": "knowledge_access_event_capture_v0",
        "subject_ref": "PXX-SYNTH",
        "reason": "source_ledger_missing",
        "payload_scope": "metadata-only",
        "owner_approval_required": false
      },
      {
        "route_id": "synthetic-route-workspace-decision-001",
        "workflow_id": "owner_decision_packet_v0",
        "subject_ref": "PYY-SYNTH",
        "reason": "owner_decision_needed_for_workspace_creation",
        "payload_scope": "decision metadata only",
        "owner_approval_required": true
      },
      {
        "route_id": "synthetic-route-private-state-001",
        "workflow_id": "owner_decision_packet_v0",
        "subject_ref": "private-state",
        "reason": "remote_freshness_unknown_remote_unavailable",
        "payload_scope": "blocker metadata only",
        "owner_approval_required": true
      },
      {
        "route_id": "synthetic-route-junction-001",
        "workflow_id": "owner_decision_packet_v0",
        "subject_ref": "p27-synth",
        "reason": "stale_target_blocked",
        "payload_scope": "binding and classification metadata only",
        "owner_approval_required": true
      },
      {
        "route_id": "synthetic-route-junction-002",
        "workflow_id": "owner_decision_packet_v0",
        "subject_ref": "company",
        "reason": "extra_root_mirror_gap",
        "payload_scope": "binding-gap metadata only",
        "owner_approval_required": true
      }
    ],
    "not_routed": [
      "No source payload download.",
      "No automatic workspace-junction repair.",
      "No ad hoc global skill edit."
    ]
  },
  "boundary_review_note": {
    "status": "public_safe_fixture_deliverable",
    "weakest_supported_claim_ceiling": "Synthetic, report-only workflow disposition based solely on supplied fixture observations.",
    "public_private_boundary": {
      "private_junction_binding_used_as_intent_source": true,
      "host_local_absolute_paths_excluded": true,
      "source_payloads_excluded": true,
      "secret_material_excluded": true,
      "notebooklm_runtime_output_excluded": true
    },
    "stop_conditions": [
      "Stop before any repository pull if clean-preflight conditions are not established under authorized execution.",
      "Stop before any skill update unless the source is a tracked Codex bridge and policy permits synchronization.",
      "Stop before junction repair without binding support and explicit mutation authority.",
      "Stop before workspace creation without an owner decision.",
      "Stop when private-state remote freshness remains unavailable; retain the uncertainty."
    ],
    "next_action": "Obtain owner decisions for private-state freshness, PYY-SYNTH workspace creation, and the two junction gaps; retain PXX-SYNTH follow-up as metadata-only.",
    "owner_approval_required": true,
    "non_claims": [
      "No runtime command execution is claimed.",
      "No repository, skill mirror, junction, workspace, or external service state change is claimed.",
      "No production-ready, source-truth, unattended-automation, or default-route claim is made."
    ]
  }
}
