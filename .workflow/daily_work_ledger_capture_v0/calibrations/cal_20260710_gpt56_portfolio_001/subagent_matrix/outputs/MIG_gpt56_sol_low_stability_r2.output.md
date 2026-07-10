schema_version: soulforge.daily_work_ledger_capture.deliverable.v0
workflow_id: daily_work_ledger_capture_v0
fixture_id: daily_work_ledger_capture_v0_public_synthetic_metadata_001
synthetic_public_safe: true

capture_scope:
  mode: daily_capture
  ledger_date: "2026-06-10"
  timezone: Asia/Seoul
  write_mode: synthetic_preview_no_files_written
  company_project_codes:
    - P01-SYNTH
  company_general_unassigned_code: P00-000_INBOX
  soulforge_subledgers:
    - workflow
    - automation
  output_roots:
    company_project_ledgers: "_workmeta/<project_code>/daily_ledger/"
    company_general_unassigned: "_workmeta/P00-000_INBOX/daily_ledger/"
    soulforge_subledgers: "_workmeta/system/daily_ledger/<subledger>/"
  raw_payload_reading: forbidden
  claim_ceiling: observed_metadata
  source_truth_authority: not_claimed
  owner_acceptance: not_claimed

metadata_source_inventory:
  - source_id: M1
    source_ref: "_workmeta/P01-SYNTH/reports/procedure_capture/synthetic_status_packet.yaml"
    source_kind: procedure_capture_metadata
    event_or_packet_id: pkt-synth-project-001
    timestamp: "2026-06-10T09:10:00+09:00"
    summary_label: Synthetic project checklist prepared for owner review
    inventory_state: approved_metadata_candidate
    disposition: normalized
  - source_id: M2
    source_ref: "_workmeta/P00-000_INBOX/reports/mail_work_status/synthetic_unassigned_company_request.yaml"
    source_kind: mail_work_status_metadata
    event_or_packet_id: pkt-synth-p00-001
    timestamp: "2026-06-10T10:20:00+09:00"
    summary_label: Synthetic company request logged without confirmed project code
    inventory_state: approved_metadata_candidate
    disposition: normalized
  - source_id: M3
    source_ref: "_workmeta/system/reports/procedure_capture/workflow_optimizer/synthetic_optimizer_status.yaml"
    source_kind: workflow_optimizer_metadata
    event_or_packet_id: pkt-synth-workflow-001
    timestamp: "2026-06-10T11:30:00+09:00"
    summary_label: Synthetic workflow calibration archive prepared
    inventory_state: approved_metadata_candidate
    disposition: normalized
  - source_id: M4
    source_ref: "guild_hall/state/operations/soulforge_activity/synthetic_automation_rollup.jsonl#row-004"
    source_kind: activity_metadata
    event_or_packet_id: evt-synth-automation-004
    timestamp: "2026-06-10T12:40:00+09:00"
    summary_label: Synthetic daily automation preflight status refreshed
    inventory_state: approved_metadata_candidate
    disposition: normalized
  - source_id: M5
    source_ref: "_workmeta/P99-UNKNOWN/reports/procedure_capture/synthetic_unbound_project.yaml"
    source_kind: procedure_capture_metadata
    event_or_packet_id: pkt-synth-unknown-project-001
    timestamp: "2026-06-10T13:50:00+09:00"
    summary_label: Synthetic project-like metadata has a code outside declared scope
    inventory_state: outside_declared_project_scope
    disposition: review_needed
  - source_id: M6
    source_ref: "synthetic_forbidden_payload/raw_mail_body_001"
    source_kind: raw_mail_body
    event_or_packet_id: raw-synth-mail-001
    timestamp: "2026-06-10T14:00:00+09:00"
    summary_label: Synthetic forbidden raw mail body placeholder without body text
    inventory_state: forbidden_payload_kind
    disposition: skipped
  - source_id: M7
    source_ref: "_workmeta/system/reports/procedure_capture/synthetic_unknown_subledger.yaml"
    source_kind: procedure_capture_metadata
    event_or_packet_id: pkt-synth-subledger-unknown-001
    timestamp: "2026-06-10T15:10:00+09:00"
    summary_label: Synthetic Soulforge row declares an unsupported subledger
    inventory_state: outside_declared_subledger_scope
    disposition: review_needed
  - source_id: M8
    source_ref: "_workmeta/P01-SYNTH/reports/procedure_capture/synthetic_status_packet.yaml"
    source_kind: procedure_capture_metadata
    event_or_packet_id: pkt-synth-project-001
    timestamp: "2026-06-10T09:10:00+09:00"
    summary_label: Synthetic duplicate of M1 used to test duplicate flagging
    inventory_state: duplicate_candidate_key
    disposition: review_needed

normalized_entries:
  - entry_id: "2026-06-10|P01-SYNTH|procedure_capture_metadata|pkt-synth-project-001"
    ledger_date: "2026-06-10"
    ledger_family: company_project
    ledger_code: P01-SYNTH
    project_code: P01-SYNTH
    soulforge_subledger: null
    entry_kind: project_work_metadata
    timestamp: "2026-06-10T09:10:00+09:00"
    status_label: applied
    summary_label: Synthetic project checklist prepared for owner review
    source_refs:
      - "_workmeta/P01-SYNTH/reports/procedure_capture/synthetic_status_packet.yaml"
    confidence: observed_metadata
    owner_review_state: observed_metadata
    report_visibility: include_with_observation_ceiling
  - entry_id: "2026-06-10|P00-000_INBOX|mail_work_status_metadata|pkt-synth-p00-001"
    ledger_date: "2026-06-10"
    ledger_family: company_general_unassigned
    ledger_code: P00-000_INBOX
    project_code: null
    soulforge_subledger: null
    entry_kind: unresolved_company_work_metadata
    timestamp: "2026-06-10T10:20:00+09:00"
    status_label: needs_project_binding
    summary_label: Synthetic company request logged without confirmed project code
    source_refs:
      - "_workmeta/P00-000_INBOX/reports/mail_work_status/synthetic_unassigned_company_request.yaml"
    confidence: observed_metadata
    owner_review_state: needs_owner_project_binding
    report_visibility: include_with_review_state
  - entry_id: "2026-06-10|workflow|workflow_optimizer_metadata|pkt-synth-workflow-001"
    ledger_date: "2026-06-10"
    ledger_family: soulforge
    ledger_code: "_workmeta/system/daily_ledger/workflow"
    project_code: null
    soulforge_subledger: workflow
    entry_kind: soulforge_workflow_metadata
    timestamp: "2026-06-10T11:30:00+09:00"
    status_label: calibration_recorded
    summary_label: Synthetic workflow calibration archive prepared
    source_refs:
      - "_workmeta/system/reports/procedure_capture/workflow_optimizer/synthetic_optimizer_status.yaml"
    confidence: observed_metadata
    owner_review_state: observed_metadata
    report_visibility: include_with_observation_ceiling
  - entry_id: "2026-06-10|automation|activity_metadata|evt-synth-automation-004"
    ledger_date: "2026-06-10"
    ledger_family: soulforge
    ledger_code: "_workmeta/system/daily_ledger/automation"
    project_code: null
    soulforge_subledger: automation
    entry_kind: soulforge_automation_metadata
    timestamp: "2026-06-10T12:40:00+09:00"
    status_label: automation_checked
    summary_label: Synthetic daily automation preflight status refreshed
    source_refs:
      - "guild_hall/state/operations/soulforge_activity/synthetic_automation_rollup.jsonl#row-004"
    confidence: observed_metadata
    owner_review_state: observed_metadata
    report_visibility: include_with_observation_ceiling

project_daily_work_ledgers:
  - ledger_date: "2026-06-10"
    ledger_family: company_project
    ledger_code: P01-SYNTH
    preview_output_ref: "_workmeta/P01-SYNTH/daily_ledger/2026-06-10"
    write_state: preview_only_not_written
    entries:
      - "2026-06-10|P01-SYNTH|procedure_capture_metadata|pkt-synth-project-001"
    coverage:
      state: partial
      note: Duplicate candidate M8 requires review; it was not silently merged.
  - ledger_date: "2026-06-10"
    ledger_family: company_general_unassigned
    ledger_code: P00-000_INBOX
    preview_output_ref: "_workmeta/P00-000_INBOX/daily_ledger/2026-06-10"
    write_state: preview_only_not_written
    entries:
      - "2026-06-10|P00-000_INBOX|mail_work_status_metadata|pkt-synth-p00-001"
    coverage:
      state: review_pending
      note: M2 is company work without a confirmed project binding; it remains in P00 pending owner review.

soulforge_subledger_daily_work_ledgers:
  - ledger_date: "2026-06-10"
    ledger_family: soulforge
    ledger_code: "_workmeta/system/daily_ledger/workflow"
    soulforge_subledger: workflow
    preview_output_ref: "_workmeta/system/daily_ledger/workflow/2026-06-10"
    write_state: preview_only_not_written
    entries:
      - "2026-06-10|workflow|workflow_optimizer_metadata|pkt-synth-workflow-001"
    execution_authority_created: false
    coverage:
      state: metadata_rows_in_fixture_captured
      completeness_beyond_fixture: unknown
  - ledger_date: "2026-06-10"
    ledger_family: soulforge
    ledger_code: "_workmeta/system/daily_ledger/automation"
    soulforge_subledger: automation
    preview_output_ref: "_workmeta/system/daily_ledger/automation/2026-06-10"
    write_state: preview_only_not_written
    entries:
      - "2026-06-10|automation|activity_metadata|evt-synth-automation-004"
    execution_authority_created: false
    coverage:
      state: metadata_rows_in_fixture_captured
      completeness_beyond_fixture: unknown

skipped_source_register:
  - source_id: M6
    source_ref: "synthetic_forbidden_payload/raw_mail_body_001"
    source_kind: raw_mail_body
    reason_code: forbidden_payload_source
    reason: Raw mail body sources are outside the approved metadata-only boundary.
    payload_read: false
    ledger_entry_created: false
    review_required: false

review_needed_register:
  - review_id: review-M5-project-binding
    source_id: M5
    source_ref: "_workmeta/P99-UNKNOWN/reports/procedure_capture/synthetic_unbound_project.yaml"
    issue_code: unknown_project_code
    observed_hint: P99-UNKNOWN
    reason: Project code is outside the declared capture scope and cannot be inferred or reassigned.
    requested_owner_decision: Confirm a valid project binding or explicitly exclude the row.
    provisional_ledger: null
    ledger_entry_created: false
  - review_id: review-M7-subledger-binding
    source_id: M7
    source_ref: "_workmeta/system/reports/procedure_capture/synthetic_unknown_subledger.yaml"
    issue_code: unknown_soulforge_subledger
    observed_hint: unknown_lab
    reason: Soulforge subledger is unsupported and cannot default to system.
    requested_owner_decision: Bind the row to a declared owner-facing subledger or explicitly exclude it.
    provisional_ledger: null
    ledger_entry_created: false
  - review_id: review-M8-duplicate-candidate
    source_id: M8
    source_ref: "_workmeta/P01-SYNTH/reports/procedure_capture/synthetic_status_packet.yaml"
    issue_code: duplicate_candidate_key
    duplicate_of_source_id: M1
    candidate_key: "2026-06-10|P01-SYNTH|procedure_capture_metadata|pkt-synth-project-001"
    reason: The date, ledger code, source kind, and packet identifier duplicate M1.
    requested_owner_decision: Confirm whether M8 is redundant or represents separately attributable metadata.
    provisional_ledger: P01-SYNTH
    ledger_entry_created: false
    silently_merged: false

ledger_capture_receipt:
  receipt_id: receipt-daily-work-ledger-capture-2026-06-10-synthetic-001
  workflow_id: daily_work_ledger_capture_v0
  fixture_id: daily_work_ledger_capture_v0_public_synthetic_metadata_001
  ledger_date: "2026-06-10"
  timezone: Asia/Seoul
  execution_representation: synthetic_preview
  files_written: false
  runtime_execution_claimed: false
  source_rows_accounted_for: 8
  normalized_entry_count: 4
  project_ledger_preview_count: 2
  soulforge_subledger_preview_count: 2
  skipped_source_count: 1
  review_needed_count: 3
  routing_summary:
    M1: P01-SYNTH
    M2: P00-000_INBOX
    M3: workflow
    M4: automation
    M5: review_needed
    M6: skipped
    M7: review_needed
    M8: review_needed_duplicate
  claims:
    source_truth_verified: false
    owner_acceptance_obtained: false
    timesheet_finalized: false
    report_authored: false
    public_canon_changed: false

downstream_report_handoff:
  handoff_id: handoff-daily-work-ledger-2026-06-10-synthetic-001
  ledger_date: "2026-06-10"
  consumer_policy:
    daily_report_reads_ledgers_only: true
    weekly_worklog_reads_ledgers_only: true
    source_rediscovery_at_report_time: forbidden
    missing_or_incomplete_sections_render_as_explicit_gaps: true
    collector_sends_owner_facing_report: false
  ledger_refs:
    - "_workmeta/P01-SYNTH/daily_ledger/2026-06-10"
    - "_workmeta/P00-000_INBOX/daily_ledger/2026-06-10"
    - "_workmeta/system/daily_ledger/workflow/2026-06-10"
    - "_workmeta/system/daily_ledger/automation/2026-06-10"
  ref_state: preview_refs_only_not_written
  unresolved_review_refs:
    - review-M5-project-binding
    - review-M7-subledger-binding
    - review-M8-duplicate-candidate
  explicit_gaps:
    - Completeness beyond the supplied synthetic metadata rows is unknown.
    - M5 has no ledger placement pending owner project binding.
    - M7 has no ledger placement pending owner subledger binding.
    - M8 has no separate ledger entry pending duplicate review.
    - M6 is excluded by the raw-payload boundary.

boundary_review_note:
  review_state: contract_consistent_preview
  statements:
    - Only synthetic metadata references and summary labels are represented.
    - No raw payload content is included or treated as an approved source.
    - No secret, credential, session material, or local absolute payload path is included.
    - M5 remains review-needed because P99-UNKNOWN is outside the declared project scope.
    - M7 remains review-needed because unknown_lab is outside the declared Soulforge subledger scope.
    - M8 is flagged as a duplicate candidate and is not silently merged.
    - P00 contains only synthetic unresolved company work.
    - Soulforge workflow and automation entries do not route to P00.
    - Soulforge subledger outputs create no execution authority.
    - Downstream renderers are limited to ledger inputs and must display gaps.
  non_claims:
    - No source truth was established.
    - No owner decision or acceptance was established.
    - No runtime state was inspected or verified.
    - No files were written.
    - No messages or reports were sent.
    - No public canon or scheduler state was changed.

completion_state:
  state: completed_synthetic_preview
  stop_conditions:
    - Do not write ledger files under this preview mode.
    - Do not inspect or ingest M6 or any other forbidden payload source.
    - Do not assign M5 without an owner-confirmed project binding.
    - Do not assign M7 without an owner-confirmed subledger binding.
    - Do not merge or create a separate entry for M8 without duplicate review.
    - Do not infer completeness beyond the supplied fixture.
    - Do not treat observed metadata as source truth or owner acceptance.
  pending_owner_decisions:
    - review-M5-project-binding
    - review-M7-subledger-binding
    - review-M8-duplicate-candidate
