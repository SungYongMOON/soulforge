```yaml
workflow_id: outlook_mail_reconcile_v0
fixture_id: public_synthetic_metadata_dry_run
mode: dry_run
public_safe: true

reconcile_scope:
  scope_mode: codex_managed_projects_default
  date_window: "2026-07-01/2026-07-10"
  outlook_source_alias: fixture_outlook
  refresh_requested: true
  output_mode: dry_run

scope_inventory:
  included:
    - project_code: DEMO-A
      ledger_ref: fixture://ledgers/demo-a-mail.csv
    - project_code: DEMO-B
      ledger_ref: fixture://ledgers/demo-b-mail.csv
  excluded:
    - project_code: P00-000_INBOX
      ledger_ref: fixture://ledgers/unresolved.csv
      reason: unresolved_holding_ledger

preflight:
  requested: true
  attempted: false
  result: not_attempted_fixture_only
  note: Send/Receive preflight is described as requested; no Outlook access occurred.

normalized_sent_rows:
  - row_id: sent-entry-1
    direction: sent
    sent_at: "2026-07-03T09:00:00Z"
    subject_normalized: demo update
    subject_fingerprint: subj-1
    conversation_fingerprint: conv-1
    sender_account_alias: work
    recipient_count: 2
    recipient_domain_fingerprints:
      - domain-x
    attachment_count: 1
    message_size_bucket: small
    source_entry_fingerprint: entry-1
    source_folder_alias: sent

  - row_id: sent-entry-x
    direction: sent
    sent_at: "2026-07-04T10:00:00Z"
    subject_normalized: ambiguous request
    subject_fingerprint: subj-x
    conversation_fingerprint: conv-x
    sender_account_alias: work
    recipient_count: 1
    recipient_domain_fingerprints:
      - domain-y
    attachment_count: 0
    message_size_bucket: small
    source_entry_fingerprint: entry-x
    source_folder_alias: sent

normalized_received_rows:
  - row_id: received-entry-2
    direction: received
    received_at: "2026-07-05T11:00:00Z"
    subject_normalized: demo response
    subject_fingerprint: recv-2
    conversation_fingerprint: conv-2
    sender_alias_or_fingerprint: sender-z
    recipient_account_alias: work
    attachment_count: 0
    message_size_bucket: small
    source_entry_fingerprint: recv-entry-2
    source_folder_alias: inbox

project_sent_history_delta:
  mode: dry_run
  proposed_rows: []
  suppressed_duplicates:
    - source_entry_fingerprint: entry-1
      subject_fingerprint: subj-1
      project_code: DEMO-A
      reason: exact existing metadata match
  owner_review_rows:
    - source_entry_fingerprint: entry-x
      subject_fingerprint: subj-x
      conversation_fingerprint: conv-x
      project_code: null
      reason: ambiguous project match
      action: do_not_auto_upsert

inbox_cross_validation_report:
  deletion_performed: false
  rewrite_performed: false
  classifications:
    matched: []
    missing_in_project_ledger:
      - source_entry_fingerprint: recv-entry-2
        subject_fingerprint: recv-2
        project_code: null
        reason: no matching existing received-ledger metadata
    extra_in_project_ledger:
      - source_entry_fingerprint: recv-entry-1
        subject_fingerprint: recv-1
        project_code: DEMO-B
        reason: no corresponding synthetic inbox metadata row
    duplicate_candidate: []
    project_mismatch_candidate: []
    ambiguous_owner_review_required:
      - source_entry_fingerprint: recv-entry-2
        project_code: null
        reason: project binding is not established by supplied metadata

owner_followup_needed:
  required: true
  rows:
    - source_entry_fingerprint: entry-x
      direction: sent
      reason: ambiguous project match
    - source_entry_fingerprint: recv-entry-2
      direction: received
      reason: project binding unavailable for reconciliation discrepancy

dry_run_receipts:
  project_mail_history_update:
    written: false
    reason: dry_run
  workspace_xlsx_export:
    written: false
    reason: not enabled by supplied scope
  reconciliation_summary:
    written: false
    counts_only_preview:
      included_projects: 2
      excluded_projects: 1
      sent_metadata_rows: 2
      received_metadata_rows: 1
      duplicate_sent_rows_suppressed: 1
      proposed_sent_rows: 0
      sent_owner_review_rows: 1
      received_missing_rows: 1
      received_extra_rows: 1
      received_owner_review_rows: 1

boundary_review:
  status: public_safe_fixture_deliverable
  outlook_mutation: none
  outlook_folder_or_rule_action: none
  body_or_html_access: none
  attachment_access_or_copy: none
  ledger_write: none
  received_history_deleted_or_rewritten: false
  ambiguous_rows_auto_upserted: false
  runtime_absolute_paths: none
  raw_mail_payloads: none
  claim_ceiling:
    - Synthetic metadata only.
    - No assertion is made about live Outlook state.
    - No assertion is made about ledger state beyond supplied fixture records.
```
