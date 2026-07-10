```yaml
workflow_id: daily_work_ledger_capture_v0
fixture_id: daily_work_ledger_capture_v0_public_synthetic_metadata_001
completion_state: synthetic_preview_complete_no_files_written

capture_scope:
  mode: daily_capture
  ledger_date: "2026-06-10"
  timezone: Asia/Seoul
  company_project_codes: [P01-SYNTH]
  company_general_unassigned_code: P00-000_INBOX
  soulforge_subledgers: [workflow, automation]
  write_mode: synthetic_preview_no_files_written
  output_roots:
    company_project_ledgers: _workmeta/<project_code>/daily_ledger/
    company_general_unassigned: _workmeta/P00-000_INBOX/daily_ledger/
    soulforge_subledgers: _workmeta/system/daily_ledger/<subledger>/
  payload_policy: metadata_refs_and_summary_labels_only

metadata_source_inventory:
  - source_id: M1
    source_ref: _workmeta/P01-SYNTH/reports/procedure_capture/synthetic_status_packet.yaml
    source_kind: procedure_capture_metadata
    event_or_packet_id: pkt-synth-project-001
    timestamp: "2026-06-10T09:10:00+09:00"
    status_label: applied
    ledger_family_hint: company_project
    ledger_code_hint: P01-SYNTH
    inventory_state: eligible

  - source_id: M2
    source_ref: _workmeta/P00-000_INBOX/reports/mail_work_status/synthetic_unassigned_company_request.yaml
    source_kind: mail_work_status_metadata
    event_or_packet_id: pkt-synth-p00-001
    timestamp: "2026-06-10T10:20:00+09:00"
    status_label: needs_project_binding
    ledger_family_hint: company_general_unassigned
    ledger_code_hint: P00-000_INBOX
    inventory_state: eligible

  - source_id: M3
    source_ref: _workmeta/system/reports/procedure_capture/workflow_optimizer/synthetic_optimizer_status.yaml
    source_kind: workflow_optimizer_metadata
    event_or_packet_id: pkt-synth-workflow-001
    timestamp: "2026-06-10T11:30:00+09:00"
    status_label: calibration_recorded
    ledger_family_hint: soulforge
    ledger_code_hint: _workmeta/system/daily_ledger/workflow
    soulforge_subledger_hint: workflow
    inventory_state: eligible

  - source_id: M4
    source_ref: guild_hall/state/operations/soulforge_activity/synthetic_automation_rollup.jsonl#row-004
    source_kind: activity_metadata
    event_or_packet_id: evt-synth-automation-004
    timestamp: "2026-06-10T12:40:00+09:00"
    status_label: automation_checked
    ledger_family_hint: soulforge
    ledger_code_hint: _workmeta/system/daily_ledger/automation
    soulforge_subledger_hint: automation
    inventory_state: eligible

  - source_id: M5
    source_ref: _workmeta/P99-UNKNOWN/reports/procedure_capture/synthetic_unbound_project.yaml
    source_kind: procedure_capture_metadata
    event_or_packet_id: pkt-synth-unknown-project-001
    timestamp: "2026-06-10T13:50:00+09:00"
    status_label: ambiguous_project_code
    ledger_family_hint: company_project
    ledger_code_hint: P99-UNKNOWN
    inventory_state: review_needed_outside_declared_scope

  - source_id: M6
    source_ref: synthetic_forbidden_payload/raw_mail_body_001
    source_kind: raw_mail_body
    event_or_packet_id: raw-synth-mail-001
    timestamp: "2026-06-10T14:00:00+09:00"
    status_label: payload_not_metadata
    inventory_state: skipped_forbidden_payload

  - source_id: M7
    source_ref: _workmeta/system/reports/procedure_capture/synthetic_unknown_subledger.yaml
    source_kind: procedure_capture_metadata
    event_or_packet_id: pkt-synth-subledger-unknown-001
    timestamp: "2026-06-10T15:10:00+09:00"
    status_label: unknown_soulforge_subledger
    ledger_family_hint: soulforge
    ledger_code_hint: _workmeta/system/daily_ledger/unknown_lab
    soulforge_subledger_hint: unknown_lab
    inventory_state: review_needed_outside_declared_scope

  - source_id: M8
    source_ref: _workmeta/P01-SYNTH/reports/procedure_capture/synthetic_status_packet.yaml
    source_kind: procedure_capture_metadata
    event_or_packet_id: pkt-synth-project-001
    timestamp: "2026-06-10T09:10:00+09:00"
    status_label: duplicate_candidate_key
    ledger_family_hint: company_project
    ledger_code_hint: P01-SYNTH
    inventory_state: review_needed_duplicate_candidate

normalized_entries:
  - entry_id: "2026-06-10__P01-SYNTH__procedure_capture_metadata__pkt-synth-project-001"
    ledger_date: "2026-06-10"
    ledger_family: company_project
    ledger_code: P01-SYNTH
    project_code: P01-SYNTH
    soulforge_subledger: null
    entry_kind: observed_metadata_work
    summary_label: Synthetic project checklist prepared for owner review
    source_refs:
      - _workmeta/P01-SYNTH/reports/procedure_capture/synthetic_status_packet.yaml
    confidence: observed_metadata
    owner_review_state: observed_metadata
    report_visibility: visible_with_observed_metadata_ceiling

  - entry_id: "2026-06-10__P00-000_INBOX__mail_work_status_metadata__pkt-synth-p00-001"
    ledger_date: "2026-06-10"
    ledger_family: company_general_unassigned
    ledger_code: P00-000_INBOX
    project_code: null
    soulforge_subledger: null
    entry_kind: observed_metadata_work
    summary_label: Synthetic company request logged without confirmed project code
    source_refs:
      - _workmeta/P00-000_INBOX/reports/mail_work_status/synthetic_unassigned_company_request.yaml
    confidence: observed_metadata
    owner_review_state: needs_owner_project_binding
    report_visibility: visible_with_unresolved_project_binding

  - entry_id: "2026-06-10___workmeta_system_daily_ledger_workflow__workflow_optimizer_metadata__pkt-synth-workflow-001"
    ledger_date: "2026-06-10"
    ledger_family: soulforge
    ledger_code: _workmeta/system/daily_ledger/workflow
    project_code: null
    soulforge_subledger: workflow
    entry_kind: observed_metadata_work
    summary_label: Synthetic workflow calibration archive prepared
    source_refs:
      - _workmeta/system/reports/procedure_capture/workflow_optimizer/synthetic_optimizer_status.yaml
    confidence: observed_metadata
    owner_review_state: observed_metadata
    report_visibility: visible_as_soulforge_work

  - entry_id: "2026-06-10___workmeta_system_daily_ledger_automation__activity_metadata__evt-synth-automation-004"
    ledger_date: "2026-06-10"
    ledger_family: soulforge
    ledger_code: _workmeta/system/daily_ledger/automation
    project_code: null
    soulforge_subledger: automation
    entry_kind: observed_metadata_work
    summary_label: Synthetic daily automation preflight status refreshed
    source_refs:
      - guild_hall/state/operations/soulforge_activity/synthetic_automation_rollup.jsonl#row-004
    confidence: observed_metadata
    owner_review_state: observed_metadata
    report_visibility: visible_as_soulforge_work

project_daily_work_ledgers:
  - ledger_code: P01-SYNTH
    ledger_ref: _workmeta/P01-SYNTH/daily_ledger/2026-06-10.yaml
    entries:
      - "2026-06-10__P01-SYNTH__procedure_capture_metadata__pkt-synth-project-001"

  - ledger_code: P00-000_INBOX
    ledger_ref: _workmeta/P00-000_INBOX/daily_ledger/2026-06-10.yaml
    entries:
      - "2026-06-10__P00-000_INBOX__mail_work_status_metadata__pkt-synth-p00-001"

soulforge_subledger_daily_work_ledgers:
  - subledger: workflow
    ledger_ref: _workmeta/system/daily_ledger/workflow/2026-06-10.yaml
    entries:
      - "2026-06-10___workmeta_system_daily_ledger_workflow__workflow_optimizer_metadata__pkt-synth-workflow-001"

  - subledger: automation
    ledger_ref: _workmeta/system/daily_ledger/automation/2026-06-10.yaml
    entries:
      - "2026-06-10___workmeta_system_daily_ledger_automation__activity_metadata__evt-synth-automation-004"

skipped_source_register:
  - source_id: M6
    source_ref: synthetic_forbidden_payload/raw_mail_body_001
    reason: raw_mail_body_is_forbidden_payload
    action: skipped
    claim_ceiling: no_work_entry_created

review_needed_register:
  - source_id: M5
    source_ref: _workmeta/P99-UNKNOWN/reports/procedure_capture/synthetic_unbound_project.yaml
    reason: project_code_outside_declared_scope
    required_owner_action: confirm_project_binding_or_reclassify
    no_p00_routing: true

  - source_id: M7
    source_ref: _workmeta/system/reports/procedure_capture/synthetic_unknown_subledger.yaml
    reason: soulforge_subledger_outside_declared_scope
    required_owner_action: confirm_supported_subledger
    no_default_system_routing: true

  - source_id: M8
    source_ref: _workmeta/P01-SYNTH/reports/procedure_capture/synthetic_status_packet.yaml
    event_or_packet_id: pkt-synth-project-001
    reason: duplicate_candidate_key_with_M1
    action: flag_for_review
    silently_merged: false

ledger_capture_receipt:
  receipt_id: daily_work_ledger_capture_v0__2026-06-10__synthetic_001
  ledger_date: "2026-06-10"
  mode: daily_capture
  write_mode: synthetic_preview_no_files_written
  files_written: false
  normalized_entry_count: 4
  skipped_source_count: 1
  review_needed_count: 3
  source_refs_are_metadata_only: true
  claim_ceiling: observed_metadata
  owner_acceptance: not_claimed
  source_truth: not_claimed

downstream_report_handoff:
  handoff_id: daily_work_ledger_capture_v0__handoff__2026-06-10__synthetic_001
  ledger_inputs_only:
    - _workmeta/P01-SYNTH/daily_ledger/2026-06-10.yaml
    - _workmeta/P00-000_INBOX/daily_ledger/2026-06-10.yaml
    - _workmeta/system/daily_ledger/workflow/2026-06-10.yaml
    - _workmeta/system/daily_ledger/automation/2026-06-10.yaml
  report_renderer_must_read_ledgers_only: true
  missing_or_incomplete_sections_must_be_reported_as_gaps: true
  owner_facing_report_sent: false
  execution_authority_created: false

boundary_review_note:
  status: boundary_safe_synthetic_preview
  raw_payload_reading: not_claimed
  raw_payload_copied: false
  secrets_or_session_material: not included
  local_absolute_payload_paths: not included
  p00_contains_only_company_general_or_unassigned_work: true
  soulforge_work_routed_to_p00: false
  unknown_project_code_reviewed: true
  unknown_soulforge_subledger_reviewed: true
  duplicate_candidate_silently_merged: false
  soulforge_outputs_create_execution_authority: false
  report_handoff_is_ledger_only: true
  source_truth_or_owner_acceptance: not_claimed
```
