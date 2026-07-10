{
  "schema_version": "soulforge.daily_work_ledger_capture.deliverable.v0",
  "fixture_id": "daily_work_ledger_capture_v0_public_synthetic_metadata_001",
  "workflow_id": "daily_work_ledger_capture_v0",
  "capture_scope": {
    "mode": "daily_capture",
    "ledger_date": "2026-06-10",
    "timezone": "Asia/Seoul",
    "write_mode": "synthetic_preview_no_files_written",
    "company_project_codes": [
      "P01-SYNTH"
    ],
    "company_general_unassigned_code": "P00-000_INBOX",
    "soulforge_subledgers": [
      "workflow",
      "automation"
    ],
    "output_roots": {
      "company_project_ledgers": "_workmeta/<project_code>/daily_ledger/",
      "company_general_unassigned": "_workmeta/P00-000_INBOX/daily_ledger/",
      "soulforge_subledgers": "_workmeta/system/daily_ledger/<subledger>/"
    },
    "payload_policy": "metadata_only",
    "claim_ceiling": "observed_metadata"
  },
  "metadata_source_inventory": [
    {
      "source_id": "M1",
      "source_ref": "_workmeta/P01-SYNTH/reports/procedure_capture/synthetic_status_packet.yaml",
      "source_kind": "procedure_capture_metadata",
      "event_or_packet_id": "pkt-synth-project-001",
      "timestamp": "2026-06-10T09:10:00+09:00",
      "inventory_state": "eligible",
      "classification_state": "company_project_work",
      "ledger_code": "P01-SYNTH"
    },
    {
      "source_id": "M2",
      "source_ref": "_workmeta/P00-000_INBOX/reports/mail_work_status/synthetic_unassigned_company_request.yaml",
      "source_kind": "mail_work_status_metadata",
      "event_or_packet_id": "pkt-synth-p00-001",
      "timestamp": "2026-06-10T10:20:00+09:00",
      "inventory_state": "eligible",
      "classification_state": "company_general_unassigned_work",
      "ledger_code": "P00-000_INBOX"
    },
    {
      "source_id": "M3",
      "source_ref": "_workmeta/system/reports/procedure_capture/workflow_optimizer/synthetic_optimizer_status.yaml",
      "source_kind": "workflow_optimizer_metadata",
      "event_or_packet_id": "pkt-synth-workflow-001",
      "timestamp": "2026-06-10T11:30:00+09:00",
      "inventory_state": "eligible",
      "classification_state": "soulforge_workflow_work",
      "ledger_code": "_workmeta/system/daily_ledger/workflow"
    },
    {
      "source_id": "M4",
      "source_ref": "guild_hall/state/operations/soulforge_activity/synthetic_automation_rollup.jsonl#row-004",
      "source_kind": "activity_metadata",
      "event_or_packet_id": "evt-synth-automation-004",
      "timestamp": "2026-06-10T12:40:00+09:00",
      "inventory_state": "eligible",
      "classification_state": "soulforge_automation_work",
      "ledger_code": "_workmeta/system/daily_ledger/automation"
    },
    {
      "source_id": "M5",
      "source_ref": "_workmeta/P99-UNKNOWN/reports/procedure_capture/synthetic_unbound_project.yaml",
      "source_kind": "procedure_capture_metadata",
      "event_or_packet_id": "pkt-synth-unknown-project-001",
      "timestamp": "2026-06-10T13:50:00+09:00",
      "inventory_state": "review_needed",
      "classification_state": "review_needed",
      "reason_code": "project_code_outside_declared_scope"
    },
    {
      "source_id": "M6",
      "source_ref": "synthetic_forbidden_payload/raw_mail_body_001",
      "source_kind": "raw_mail_body",
      "event_or_packet_id": "raw-synth-mail-001",
      "timestamp": "2026-06-10T14:00:00+09:00",
      "inventory_state": "skipped",
      "classification_state": "blocked",
      "reason_code": "forbidden_raw_payload_kind"
    },
    {
      "source_id": "M7",
      "source_ref": "_workmeta/system/reports/procedure_capture/synthetic_unknown_subledger.yaml",
      "source_kind": "procedure_capture_metadata",
      "event_or_packet_id": "pkt-synth-subledger-unknown-001",
      "timestamp": "2026-06-10T15:10:00+09:00",
      "inventory_state": "review_needed",
      "classification_state": "review_needed",
      "reason_code": "soulforge_subledger_outside_declared_scope"
    },
    {
      "source_id": "M8",
      "source_ref": "_workmeta/P01-SYNTH/reports/procedure_capture/synthetic_status_packet.yaml",
      "source_kind": "procedure_capture_metadata",
      "event_or_packet_id": "pkt-synth-project-001",
      "timestamp": "2026-06-10T09:10:00+09:00",
      "inventory_state": "review_needed",
      "classification_state": "review_needed",
      "reason_code": "duplicate_candidate_key"
    }
  ],
  "normalized_entries": [
    {
      "entry_id": "2026-06-10__P01-SYNTH__procedure_capture_metadata__pkt-synth-project-001",
      "ledger_date": "2026-06-10",
      "ledger_family": "company_project",
      "ledger_code": "P01-SYNTH",
      "project_code": "P01-SYNTH",
      "soulforge_subledger": null,
      "entry_kind": "procedure_capture_metadata",
      "summary_label": "Synthetic project checklist prepared for owner review",
      "status_label": "applied",
      "source_refs": [
        "_workmeta/P01-SYNTH/reports/procedure_capture/synthetic_status_packet.yaml"
      ],
      "confidence": "observed_metadata",
      "owner_review_state": "observed_metadata",
      "report_visibility": "include_as_observed_metadata",
      "source_ids": [
        "M1"
      ]
    },
    {
      "entry_id": "2026-06-10__P00-000_INBOX__mail_work_status_metadata__pkt-synth-p00-001",
      "ledger_date": "2026-06-10",
      "ledger_family": "company_general_unassigned",
      "ledger_code": "P00-000_INBOX",
      "project_code": null,
      "soulforge_subledger": null,
      "entry_kind": "mail_work_status_metadata",
      "summary_label": "Synthetic company request logged without confirmed project code",
      "status_label": "needs_project_binding",
      "source_refs": [
        "_workmeta/P00-000_INBOX/reports/mail_work_status/synthetic_unassigned_company_request.yaml"
      ],
      "confidence": "observed_metadata",
      "owner_review_state": "needs_owner_project_binding",
      "report_visibility": "include_with_review_state",
      "source_ids": [
        "M2"
      ]
    },
    {
      "entry_id": "2026-06-10__workflow__workflow_optimizer_metadata__pkt-synth-workflow-001",
      "ledger_date": "2026-06-10",
      "ledger_family": "soulforge",
      "ledger_code": "_workmeta/system/daily_ledger/workflow",
      "project_code": null,
      "soulforge_subledger": "workflow",
      "entry_kind": "workflow_optimizer_metadata",
      "summary_label": "Synthetic workflow calibration archive prepared",
      "status_label": "calibration_recorded",
      "source_refs": [
        "_workmeta/system/reports/procedure_capture/workflow_optimizer/synthetic_optimizer_status.yaml"
      ],
      "confidence": "observed_metadata",
      "owner_review_state": "observed_metadata",
      "report_visibility": "include_as_observed_metadata",
      "source_ids": [
        "M3"
      ]
    },
    {
      "entry_id": "2026-06-10__automation__activity_metadata__evt-synth-automation-004",
      "ledger_date": "2026-06-10",
      "ledger_family": "soulforge",
      "ledger_code": "_workmeta/system/daily_ledger/automation",
      "project_code": null,
      "soulforge_subledger": "automation",
      "entry_kind": "activity_metadata",
      "summary_label": "Synthetic daily automation preflight status refreshed",
      "status_label": "automation_checked",
      "source_refs": [
        "guild_hall/state/operations/soulforge_activity/synthetic_automation_rollup.jsonl#row-004"
      ],
      "confidence": "observed_metadata",
      "owner_review_state": "observed_metadata",
      "report_visibility": "include_as_observed_metadata",
      "source_ids": [
        "M4"
      ]
    }
  ],
  "project_daily_work_ledgers": [
    {
      "ledger_date": "2026-06-10",
      "ledger_family": "company_project",
      "ledger_code": "P01-SYNTH",
      "project_code": "P01-SYNTH",
      "preview_output_ref": "_workmeta/P01-SYNTH/daily_ledger/2026-06-10",
      "entries": [
        "2026-06-10__P01-SYNTH__procedure_capture_metadata__pkt-synth-project-001"
      ],
      "coverage_state": "partial_metadata_fixture",
      "gap_notes": [
        "M8 shares the candidate key of M1 and remains unresolved in review_needed; it was not merged or emitted as a second entry.",
        "The synthetic fixture cannot establish completeness of any real project activity."
      ],
      "write_state": "preview_only_no_file_written"
    },
    {
      "ledger_date": "2026-06-10",
      "ledger_family": "company_general_unassigned",
      "ledger_code": "P00-000_INBOX",
      "project_code": null,
      "preview_output_ref": "_workmeta/P00-000_INBOX/daily_ledger/2026-06-10",
      "entries": [
        "2026-06-10__P00-000_INBOX__mail_work_status_metadata__pkt-synth-p00-001"
      ],
      "coverage_state": "partial_metadata_fixture",
      "gap_notes": [
        "M2 has no confirmed project binding and remains owner-reviewable company work.",
        "No Soulforge or personal work is represented in this ledger."
      ],
      "write_state": "preview_only_no_file_written"
    }
  ],
  "soulforge_subledger_daily_work_ledgers": [
    {
      "ledger_date": "2026-06-10",
      "ledger_family": "soulforge",
      "ledger_code": "_workmeta/system/daily_ledger/workflow",
      "soulforge_subledger": "workflow",
      "preview_output_ref": "_workmeta/system/daily_ledger/workflow/2026-06-10",
      "entries": [
        "2026-06-10__workflow__workflow_optimizer_metadata__pkt-synth-workflow-001"
      ],
      "coverage_state": "partial_metadata_fixture",
      "gap_notes": [
        "The entry records supplied synthetic metadata only and does not establish source truth or owner acceptance."
      ],
      "authority_created": false,
      "write_state": "preview_only_no_file_written"
    },
    {
      "ledger_date": "2026-06-10",
      "ledger_family": "soulforge",
      "ledger_code": "_workmeta/system/daily_ledger/automation",
      "soulforge_subledger": "automation",
      "preview_output_ref": "_workmeta/system/daily_ledger/automation/2026-06-10",
      "entries": [
        "2026-06-10__automation__activity_metadata__evt-synth-automation-004"
      ],
      "coverage_state": "partial_metadata_fixture",
      "gap_notes": [
        "The status label is an observed synthetic metadata claim, not evidence of runtime success or scheduler state."
      ],
      "authority_created": false,
      "write_state": "preview_only_no_file_written"
    }
  ],
  "skipped_source_register": [
    {
      "source_id": "M6",
      "source_ref": "synthetic_forbidden_payload/raw_mail_body_001",
      "source_kind": "raw_mail_body",
      "skip_reason": "Raw mail bodies are forbidden payloads and are not approved metadata sources.",
      "payload_read": false,
      "ledger_entry_created": false,
      "review_state": "blocked_by_boundary"
    }
  ],
  "review_needed_register": [
    {
      "review_id": "review__2026-06-10__M5__unknown-project",
      "source_id": "M5",
      "source_ref": "_workmeta/P99-UNKNOWN/reports/procedure_capture/synthetic_unbound_project.yaml",
      "issue": "Project code P99-UNKNOWN is outside the declared capture scope and lacks an owner-approved project binding.",
      "uncertainty": "The workflow cannot determine whether the row belongs to a declared project, P00, or no ledger.",
      "required_owner_decision": "Confirm an owner-facing project binding or direct exclusion.",
      "provisional_route": null,
      "ledger_entry_created": false
    },
    {
      "review_id": "review__2026-06-10__M7__unknown-subledger",
      "source_id": "M7",
      "source_ref": "_workmeta/system/reports/procedure_capture/synthetic_unknown_subledger.yaml",
      "issue": "Soulforge subledger unknown_lab is unsupported and outside the declared capture scope.",
      "uncertainty": "No narrower supported subledger can be inferred from the supplied metadata.",
      "required_owner_decision": "Bind the row to an approved Soulforge subledger or direct exclusion.",
      "provisional_route": null,
      "ledger_entry_created": false
    },
    {
      "review_id": "review__2026-06-10__M8__duplicate",
      "source_id": "M8",
      "source_ref": "_workmeta/P01-SYNTH/reports/procedure_capture/synthetic_status_packet.yaml",
      "issue": "The date, ledger code, source kind, and event_or_packet_id duplicate M1 while the summary and review labels differ.",
      "uncertainty": "The fixture does not establish whether M8 is redundant, corrective, or independently meaningful.",
      "required_owner_decision": "Retain M1, replace it, or provide an explicit distinct source identity for M8.",
      "conflicts_with_source_id": "M1",
      "candidate_entry_id": "2026-06-10__P01-SYNTH__procedure_capture_metadata__pkt-synth-project-001",
      "provisional_route": null,
      "silently_merged": false,
      "ledger_entry_created": false
    }
  ],
  "ledger_capture_receipt": {
    "receipt_id": "receipt__daily_work_ledger_capture_v0__2026-06-10__public-synthetic-001",
    "ledger_date": "2026-06-10",
    "timezone": "Asia/Seoul",
    "mode": "daily_capture",
    "execution_representation": "synthetic_preview",
    "write_state": "no_files_written",
    "input_row_count": 8,
    "normalized_entry_count": 4,
    "project_ledger_preview_count": 2,
    "soulforge_subledger_preview_count": 2,
    "skipped_source_count": 1,
    "review_needed_count": 3,
    "source_outcomes": {
      "normalized": [
        "M1",
        "M2",
        "M3",
        "M4"
      ],
      "skipped": [
        "M6"
      ],
      "review_needed": [
        "M5",
        "M7",
        "M8"
      ]
    },
    "manual_review_marks_preserved": "not_applicable_to_preview",
    "source_truth_confirmed": false,
    "owner_acceptance_confirmed": false,
    "runtime_state_confirmed": false
  },
  "downstream_report_handoff": {
    "handoff_id": "handoff__daily_work_ledger_capture_v0__2026-06-10__public-synthetic-001",
    "ledger_date": "2026-06-10",
    "consumer_policy": {
      "daily_report_reads_ledgers_only": true,
      "weekly_worklog_reads_ledgers_only": true,
      "missing_or_incomplete_sections_are_reported_as_gaps": true,
      "collector_sends_owner_facing_report": false
    },
    "ordered_ledger_refs": [
      "_workmeta/P01-SYNTH/daily_ledger/2026-06-10",
      "_workmeta/P00-000_INBOX/daily_ledger/2026-06-10",
      "_workmeta/system/daily_ledger/workflow/2026-06-10",
      "_workmeta/system/daily_ledger/automation/2026-06-10"
    ],
    "handoff_state": "synthetic_preview_refs_only",
    "coverage_warning": "These preview ledgers represent only the supplied synthetic metadata rows and must not be treated as complete work history.",
    "unresolved_review_refs": [
      "review__2026-06-10__M5__unknown-project",
      "review__2026-06-10__M7__unknown-subledger",
      "review__2026-06-10__M8__duplicate"
    ]
  },
  "boundary_review_note": {
    "review_state": "contract_consistent_preview_with_explicit_gaps",
    "findings": {
      "metadata_only_content": true,
      "raw_payload_copied": false,
      "secret_or_session_material_present": false,
      "local_absolute_payload_path_present": false,
      "unknown_project_routed_to_review": true,
      "unknown_subledger_routed_to_review": true,
      "duplicate_silently_merged": false,
      "p00_limited_to_company_general_or_unassigned_work": true,
      "soulforge_work_routed_to_p00": false,
      "execution_authority_created": false,
      "missing_or_incomplete_coverage_visible": true,
      "downstream_input_limited_to_ledgers": true
    },
    "non_claims": [
      "No source payload content is represented.",
      "No real work activity, source truth, runtime success, scheduler state, owner acceptance, or timesheet finalization is established.",
      "Preview output references do not establish that any ledger artifact exists."
    ],
    "remaining_uncertainties": [
      "M5 requires an owner-approved project decision.",
      "M7 requires an owner-approved Soulforge subledger decision.",
      "M8 requires duplicate resolution.",
      "Completeness beyond the supplied synthetic fixture is unknown."
    ]
  },
  "completion_state": {
    "state": "completed_as_synthetic_preview_with_review_items",
    "terminal_step": "emit_receipt_and_handoff",
    "files_written": false,
    "owner_facing_report_sent": false,
    "stop_conditions": [
      {
        "condition": "Do not route M5 until its project binding is owner-confirmed.",
        "status": "active"
      },
      {
        "condition": "Do not route M7 until its Soulforge subledger is owner-confirmed.",
        "status": "active"
      },
      {
        "condition": "Do not merge or emit M8 until its duplicate relationship to M1 is resolved.",
        "status": "active"
      },
      {
        "condition": "Do not inspect or normalize M6 as ledger metadata because its declared source kind is forbidden.",
        "status": "active"
      },
      {
        "condition": "Do not promote preview references into claims of written artifacts or runtime facts.",
        "status": "active"
      }
    ]
  }
}
