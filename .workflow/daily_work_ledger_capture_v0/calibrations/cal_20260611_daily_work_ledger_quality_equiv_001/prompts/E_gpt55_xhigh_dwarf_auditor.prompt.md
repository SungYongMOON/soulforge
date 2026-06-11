You are running a public-safe optimizer candidate for Soulforge workflow `daily_work_ledger_capture_v0`.

Profile:
- candidate_id: E_gpt55_xhigh_dwarf_auditor
- model: gpt-5.5
- reasoning_effort: xhigh
- species: dwarf
- class: auditor

Task:
Use only the synthetic fixture below. Do not run commands, inspect files, read real `_workmeta` material, read `_workspaces`, parse mail bodies, inspect attachments, read Office/PDF/HWP payloads, copy source text, expose secrets, write ledgers, or claim any real run occurred. Produce one compact JSON object with these top-level keys: `profile_metadata`, `capture_scope`, `metadata_source_inventory`, `normalized_entries`, `project_daily_work_ledgers`, `soulforge_subledger_daily_work_ledgers`, `skipped_source_register`, `review_needed_register`, `ledger_capture_receipt`, `downstream_report_handoff`, `boundary_review_note`, `completion_state`.

Quality bar:
- Route `M1` to `P01-SYNTH`; flag duplicate `M8` as review-needed instead of silently merging.
- Route `M2` to `P00-000_INBOX` as company general or unresolved company work, never as Soulforge system/personal work.
- Route `M3` to Soulforge `workflow` and `M4` to Soulforge `automation` under `_workmeta/system/daily_ledger/<subledger>/`.
- Put `M5` and `M7` in `review_needed_register`; do not infer unapproved project codes or subledger ids.
- Put `M6` in `skipped_source_register` because raw mail body placeholders are not approved metadata sources.
- Use metadata refs and summary labels only; do not copy source bodies, raw payloads, local absolute paths, secrets, mail bodies, attachments, or real work logs.
- Emit a receipt and downstream handoff that state this is a synthetic preview, no ledger files were written, and report renderers must read ledgers only.
- Keep the claim ceiling at observed metadata, not source truth, owner acceptance, pilot execution, or production readiness.

Synthetic fixture:
```json
{
  "fixture_id": "daily_work_ledger_capture_v0_public_synthetic_metadata_001",
  "workflow_id": "daily_work_ledger_capture_v0",
  "public_safety": {
    "contains_real_work_log": false,
    "contains_real_mail_body": false,
    "contains_attachment_payload": false,
    "contains_office_pdf_hwp_payload": false,
    "contains_project_source_file_body": false,
    "contains_secret_value": false,
    "contains_runtime_absolute_path": false
  },
  "daily_work_ledger_capture_scope": {
    "mode": "daily_capture",
    "ledger_date": "2026-06-10",
    "timezone": "Asia/Seoul",
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
    "write_mode": "synthetic_preview_no_files_written"
  },
  "ledger_category_policy": {
    "company_project_work_requires_confirmed_project_code": true,
    "projectless_company_work_routes_to_p00": true,
    "p00_is_not_soulforge_system_or_personal_work": true,
    "soulforge_work_routes_to_declared_subledger": true,
    "unknown_project_code_goes_to_review_needed": true,
    "unknown_soulforge_subledger_goes_to_review_needed": true,
    "raw_payload_sources_are_skipped": true,
    "source_refs_are_metadata_refs_only": true,
    "company_project_and_p00_entries_sort_before_soulforge_entries": true
  },
  "synthetic_metadata_rows": [
    {
      "source_id": "M1",
      "source_ref": "_workmeta/P01-SYNTH/reports/procedure_capture/synthetic_status_packet.yaml",
      "source_kind": "procedure_capture_metadata",
      "event_or_packet_id": "pkt-synth-project-001",
      "timestamp": "2026-06-10T09:10:00+09:00",
      "status_label": "applied",
      "summary_label": "Synthetic project checklist prepared for owner review",
      "project_code_hint": "P01-SYNTH",
      "ledger_family_hint": "company_project",
      "ledger_code_hint": "P01-SYNTH",
      "soulforge_subledger_hint": null,
      "owner_review_state": "observed_metadata"
    },
    {
      "source_id": "M2",
      "source_ref": "_workmeta/P00-000_INBOX/reports/mail_work_status/synthetic_unassigned_company_request.yaml",
      "source_kind": "mail_work_status_metadata",
      "event_or_packet_id": "pkt-synth-p00-001",
      "timestamp": "2026-06-10T10:20:00+09:00",
      "status_label": "needs_project_binding",
      "summary_label": "Synthetic company request logged without confirmed project code",
      "project_code_hint": null,
      "ledger_family_hint": "company_general_unassigned",
      "ledger_code_hint": "P00-000_INBOX",
      "soulforge_subledger_hint": null,
      "owner_review_state": "needs_owner_project_binding"
    },
    {
      "source_id": "M3",
      "source_ref": "_workmeta/system/reports/procedure_capture/workflow_optimizer/synthetic_optimizer_status.yaml",
      "source_kind": "workflow_optimizer_metadata",
      "event_or_packet_id": "pkt-synth-workflow-001",
      "timestamp": "2026-06-10T11:30:00+09:00",
      "status_label": "calibration_recorded",
      "summary_label": "Synthetic workflow calibration archive prepared",
      "project_code_hint": null,
      "ledger_family_hint": "soulforge",
      "ledger_code_hint": "_workmeta/system/daily_ledger/workflow",
      "soulforge_subledger_hint": "workflow",
      "owner_review_state": "observed_metadata"
    },
    {
      "source_id": "M4",
      "source_ref": "guild_hall/state/operations/soulforge_activity/synthetic_automation_rollup.jsonl#row-004",
      "source_kind": "activity_metadata",
      "event_or_packet_id": "evt-synth-automation-004",
      "timestamp": "2026-06-10T12:40:00+09:00",
      "status_label": "automation_checked",
      "summary_label": "Synthetic daily automation preflight status refreshed",
      "project_code_hint": null,
      "ledger_family_hint": "soulforge",
      "ledger_code_hint": "_workmeta/system/daily_ledger/automation",
      "soulforge_subledger_hint": "automation",
      "owner_review_state": "observed_metadata"
    },
    {
      "source_id": "M5",
      "source_ref": "_workmeta/P99-UNKNOWN/reports/procedure_capture/synthetic_unbound_project.yaml",
      "source_kind": "procedure_capture_metadata",
      "event_or_packet_id": "pkt-synth-unknown-project-001",
      "timestamp": "2026-06-10T13:50:00+09:00",
      "status_label": "ambiguous_project_code",
      "summary_label": "Synthetic project-like metadata has a code outside declared scope",
      "project_code_hint": "P99-UNKNOWN",
      "ledger_family_hint": "company_project",
      "ledger_code_hint": "P99-UNKNOWN",
      "soulforge_subledger_hint": null,
      "owner_review_state": "needs_owner_project_binding"
    },
    {
      "source_id": "M6",
      "source_ref": "synthetic_forbidden_payload/raw_mail_body_001",
      "source_kind": "raw_mail_body",
      "event_or_packet_id": "raw-synth-mail-001",
      "timestamp": "2026-06-10T14:00:00+09:00",
      "status_label": "payload_not_metadata",
      "summary_label": "Synthetic forbidden raw mail body placeholder without body text",
      "project_code_hint": "P01-SYNTH",
      "ledger_family_hint": "company_project",
      "ledger_code_hint": "P01-SYNTH",
      "soulforge_subledger_hint": null,
      "owner_review_state": "blocked_by_boundary"
    },
    {
      "source_id": "M7",
      "source_ref": "_workmeta/system/reports/procedure_capture/synthetic_unknown_subledger.yaml",
      "source_kind": "procedure_capture_metadata",
      "event_or_packet_id": "pkt-synth-subledger-unknown-001",
      "timestamp": "2026-06-10T15:10:00+09:00",
      "status_label": "unknown_soulforge_subledger",
      "summary_label": "Synthetic Soulforge row declares an unsupported subledger",
      "project_code_hint": null,
      "ledger_family_hint": "soulforge",
      "ledger_code_hint": "_workmeta/system/daily_ledger/unknown_lab",
      "soulforge_subledger_hint": "unknown_lab",
      "owner_review_state": "needs_owner_subledger_binding"
    },
    {
      "source_id": "M8",
      "source_ref": "_workmeta/P01-SYNTH/reports/procedure_capture/synthetic_status_packet.yaml",
      "source_kind": "procedure_capture_metadata",
      "event_or_packet_id": "pkt-synth-project-001",
      "timestamp": "2026-06-10T09:10:00+09:00",
      "status_label": "duplicate_candidate_key",
      "summary_label": "Synthetic duplicate of M1 used to test duplicate flagging",
      "project_code_hint": "P01-SYNTH",
      "ledger_family_hint": "company_project",
      "ledger_code_hint": "P01-SYNTH",
      "soulforge_subledger_hint": null,
      "owner_review_state": "duplicate_review_needed"
    }
  ]
}
```
