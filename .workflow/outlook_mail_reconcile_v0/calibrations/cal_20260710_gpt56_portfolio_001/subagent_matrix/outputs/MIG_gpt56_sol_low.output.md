schema_version: outlook_mail_reconcile_deliverable_v1
workflow_id: outlook_mail_reconcile_v0
fixture_id: public_synthetic_metadata_dry_run
run_mode: dry_run
public_safe: true
boundary_attestation: "All mail metadata and project identifiers are synthetic."

reconcile_scope:
  scope_mode: codex_managed_projects_default
  date_window: "2026-07-01/2026-07-10"
  outlook_source_alias: fixture_outlook
  output_mode: dry_run
  default_scope_applied: true

preflight:
  preflight_requested: true
  preflight_attempted: false
  preflight_attempted_at: null
  preflight_result: not_executed_synthetic_fixture
  note: "Send/Receive was requested by scope but was not performed; supplied synthetic metadata is the sole reconciliation input."

scope_inventory:
  selected_projects:
    - project_code: DEMO-A
      ledger_ref: "fixture://ledgers/demo-a-mail.csv"
    - project_code: DEMO-B
      ledger_ref: "fixture://ledgers/demo-b-mail.csv"
  excluded_projects:
    - project_code: P00-000_INBOX
      ledger_ref: "fixture://ledgers/unresolved.csv"
      reason: unresolved_holding_ledger_excluded_from_default_scope
  selected_project_count: 2
  excluded_project_count: 1
  missing_ledger_project_codes: []

normalized_metadata_rows:
  sent:
    - direction: sent
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
    - direction: sent
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
  received:
    - direction: received
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
  proposed_upserts: []
  suppressed_duplicates:
    - source_entry_fingerprint: entry-1
      subject_fingerprint: subj-1
      project_code: DEMO-A
      classification: exact_duplicate
      basis:
        - source_entry_fingerprint_exact_match
        - subject_fingerprint_exact_match
      disposition: no_new_row
  owner_review_rows:
    - source_entry_fingerprint: entry-x
      subject_fingerprint: subj-x
      conversation_fingerprint: conv-x
      candidate_project_codes:
        - DEMO-A
        - DEMO-B
      classification: ambiguous_owner_review_required
      reason: "No supplied binding, alias, conversation, or existing-ledger fingerprint associates this row with exactly one selected project."
      disposition: excluded_from_auto_upsert
  counts:
    normalized_sent_rows: 2
    proposed_upserts: 0
    suppressed_duplicates: 1
    ambiguous_owner_review: 1

inbox_cross_validation_report:
  rows:
    - source_entry_fingerprint: recv-entry-2
      subject_fingerprint: recv-2
      conversation_fingerprint: conv-2
      candidate_project_codes:
        - DEMO-A
        - DEMO-B
      classification: ambiguous_owner_review_required
      reason: "The row is absent from supplied received-history context, but no bounded metadata establishes which selected project ledger should contain it."
      non_claim: "This is not classified as missing_in_project_ledger because project ownership is unresolved."
      disposition: report_only
  existing_received_context:
    - project_code: DEMO-B
      source_entry_fingerprint: recv-entry-1
      subject_fingerprint: recv-1
      classification: extra_in_project_ledger
      qualification: "No matching row appears in the supplied date-bounded synthetic Outlook packet; absence does not establish that the ledger row is invalid."
      disposition: preserve_without_rewrite_or_deletion
  counts:
    matched: 0
    missing_in_project_ledger: 0
    extra_in_project_ledger: 1
    duplicate_candidate: 0
    project_mismatch_candidate: 0
    ambiguous_owner_review_required: 1
  mutation:
    rows_deleted: 0
    rows_rewritten: 0

owner_followup_needed:
  required: true
  items:
    - direction: sent
      source_entry_fingerprint: entry-x
      decision_needed: bind_to_DEMO-A_bind_to_DEMO-B_or_leave_unresolved
    - direction: received
      source_entry_fingerprint: recv-entry-2
      decision_needed: bind_to_DEMO-A_bind_to_DEMO-B_or_leave_unresolved
    - direction: received_context
      source_entry_fingerprint: recv-entry-1
      decision_needed: "Determine whether the unmatched existing DEMO-B row is outside the supplied packet, otherwise expected, or requires separate investigation."
  stop_condition: "Do not upsert ambiguous sent rows or alter received history without an explicit owner decision supported by approved metadata."

receipts:
  project_mail_history_update_receipt:
    mode: dry_run
    ledger_write_attempted: false
    rows_written: 0
  workspace_xlsx_export_receipt:
    enabled: false
    export_attempted: false
  outlook_metadata_receipt:
    source: supplied_synthetic_fixture
    outlook_access_attempted: false
  reconciliation_summary:
    selected_projects: 2
    excluded_projects: 1
    sent_rows_considered: 2
    sent_duplicates_suppressed: 1
    sent_rows_proposed: 0
    sent_rows_requiring_owner_review: 1
    received_rows_considered: 1
    received_rows_requiring_owner_review: 1
    existing_received_rows_unmatched_in_packet: 1
    ledger_rows_written: 0

boundary_review:
  result: pass_for_synthetic_dry_run_deliverable
  checks:
    unresolved_holding_ledger_excluded: true
    outlook_send_receive_performed: false
    outlook_metadata_accessed: false
    outlook_mail_sent: false
    outlook_mail_moved_or_deleted: false
    outlook_read_state_changed: false
    outlook_folders_or_rules_changed: false
    body_or_html_used: false
    attachment_filename_or_payload_used: false
    msg_or_attachment_copied: false
    ledger_written: false
    ambiguous_rows_auto_upserted: false
    received_history_deleted_or_rewritten: false
    runtime_absolute_paths_present: false
    raw_mail_payloads_present: false
  uncertainty:
    - "Project ownership for entry-x and recv-entry-2 is unresolved from the supplied bounded metadata."
    - "The supplied received packet does not establish why existing row recv-entry-1 is unmatched."
    - "No runtime, mailbox, ledger, registration, or production state is established by this deliverable."
  claim_ceiling: "Synthetic, metadata-only dry-run reconciliation result; no external access, execution, mutation, persistence, or runtime verification is claimed."
