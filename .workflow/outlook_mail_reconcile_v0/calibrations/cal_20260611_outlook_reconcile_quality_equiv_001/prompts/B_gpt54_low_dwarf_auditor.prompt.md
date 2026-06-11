You are running a public-safe optimizer candidate for Soulforge workflow `outlook_mail_reconcile_v0`.

Profile:
- candidate_id: B_gpt54_low_dwarf_auditor
- model: gpt-5.4
- reasoning_effort: low
- species: dwarf
- class: auditor

Task:
Use only the synthetic fixture below. Do not inspect Outlook, read mail bodies, read HTML bodies, copy `.msg` files, copy attachments, move/delete/mark mail, edit folders/rules/categories, send mail, write project ledgers, or claim real Outlook access occurred. Produce one compact JSON object with these top-level keys: `profile_metadata`, `reconcile_scope_binding`, `codex_managed_project_scope_inventory`, `outlook_sent_metadata_packet`, `outlook_received_metadata_packet`, `project_sent_history_delta`, `inbox_cross_validation_report`, `owner_followup_needed`, `boundary_review_note`, `completion_state`.

Quality bar:
- Preserve dry-run mode because `apply_metadata_ledger_delta_authorized` is false.
- Exclude `P00-000_INBOX` from automatic project sync.
- Use only allowed Outlook metadata fields and fixture-provided hashes/fingerprints.
- Do not use body text, HTML, raw msg/eml, attachment payloads, attachment filenames, hidden local folder paths, or secret/session state as match basis.
- Sent row `sent_synth_001` may produce a dry-run proposed sent-history delta for `PXX-SYNTH-A`.
- Ambiguous sent row `sent_synth_002` must route to owner follow-up, not auto-upsert.
- Received rows must be cross-validated only; do not delete or rewrite received history.
- Boundary review must state no Outlook mutation, no ledger write, no public repo publication, no raw payload, and no real external action occurred.

Synthetic fixture:
```json
{
  "fixture_id": "outlook_mail_reconcile_v0_public_synthetic_metadata_001",
  "fixture_kind": "public_safe_synthetic_workflow_contract_fixture",
  "workflow_id": "outlook_mail_reconcile_v0",
  "reconcile_scope": {
    "mode": "dry_run",
    "project_scope": "codex_managed_projects",
    "date_window": "synthetic_2026_Q2",
    "apply_metadata_ledger_delta_authorized": false,
    "workspace_xlsx_export_enabled": false
  },
  "project_binding": {
    "selected_project_codes": [
      "PXX-SYNTH-A",
      "PXX-SYNTH-B"
    ],
    "excluded_project_codes": [
      "P00-000_INBOX"
    ],
    "ambiguous_project_matches_are_owner_review_only": true
  },
  "existing_project_mail_history_refs": [
    {
      "project_code": "PXX-SYNTH-A",
      "ledger_ref": "_workmeta/PXX-SYNTH-A/reports/mail_history/mail_history.csv",
      "direction_counts": {
        "received": 2,
        "sent": 1
      },
      "ledger_hash": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    },
    {
      "project_code": "PXX-SYNTH-B",
      "ledger_ref": "_workmeta/PXX-SYNTH-B/reports/mail_history/mail_history.csv",
      "direction_counts": {
        "received": 1,
        "sent": 0
      },
      "ledger_hash": "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    }
  ],
  "approved_outlook_metadata_read_policy": {
    "synthetic_only": true,
    "read_body_text_or_html": false,
    "copy_msg_files": false,
    "copy_attachments": false,
    "move_or_delete_mail": false,
    "mark_read_or_unread": false,
    "edit_categories_or_rules": false,
    "send_mail": false,
    "allowed_fields": [
      "sent_at",
      "received_at",
      "subject_normalized",
      "subject_fingerprint",
      "conversation_fingerprint",
      "sender_or_account_alias",
      "recipient_count",
      "recipient_domain_fingerprints",
      "attachment_count",
      "message_size_bucket",
      "source_entry_fingerprint",
      "source_folder_alias"
    ]
  },
  "outlook_sent_metadata_rows": [
    {
      "row_id": "sent_synth_001",
      "sent_at": "2026-06-03T10:00:00Z",
      "subject_normalized": "[SYNTH-A] interface review",
      "subject_fingerprint": "subj-a-001",
      "conversation_fingerprint": "conv-a-001",
      "sender_account_alias": "owner_alias",
      "recipient_count": 2,
      "recipient_domain_fingerprints": [
        "domain-alpha"
      ],
      "attachment_count": 1,
      "message_size_bucket": "small",
      "source_entry_fingerprint": "entry-sent-a-001",
      "source_folder_alias": "sent"
    },
    {
      "row_id": "sent_synth_002",
      "sent_at": "2026-06-04T11:30:00Z",
      "subject_normalized": "[SYNTH-X] ambiguous routing note",
      "subject_fingerprint": "subj-x-ambiguous",
      "conversation_fingerprint": "conv-x-ambiguous",
      "sender_account_alias": "owner_alias",
      "recipient_count": 1,
      "recipient_domain_fingerprints": [
        "domain-beta"
      ],
      "attachment_count": 0,
      "message_size_bucket": "tiny",
      "source_entry_fingerprint": "entry-sent-x-001",
      "source_folder_alias": "sent"
    }
  ],
  "outlook_received_metadata_rows": [
    {
      "row_id": "recv_synth_001",
      "received_at": "2026-06-02T09:00:00Z",
      "subject_normalized": "[SYNTH-A] interface review",
      "subject_fingerprint": "subj-a-001",
      "conversation_fingerprint": "conv-a-001",
      "sender_alias_or_fingerprint": "sender-alpha",
      "recipient_account_alias": "owner_alias",
      "attachment_count": 1,
      "message_size_bucket": "small",
      "source_entry_fingerprint": "entry-recv-a-001",
      "source_folder_alias": "inbox"
    },
    {
      "row_id": "recv_synth_002",
      "received_at": "2026-06-05T12:00:00Z",
      "subject_normalized": "[SYNTH-B] status update",
      "subject_fingerprint": "subj-b-001",
      "conversation_fingerprint": "conv-b-001",
      "sender_alias_or_fingerprint": "sender-beta",
      "recipient_account_alias": "owner_alias",
      "attachment_count": 0,
      "message_size_bucket": "tiny",
      "source_entry_fingerprint": "entry-recv-b-001",
      "source_folder_alias": "inbox"
    }
  ],
  "expected_output_requirements": {
    "top_level_keys": [
      "profile_metadata",
      "reconcile_scope_binding",
      "codex_managed_project_scope_inventory",
      "outlook_sent_metadata_packet",
      "outlook_received_metadata_packet",
      "project_sent_history_delta",
      "inbox_cross_validation_report",
      "owner_followup_needed",
      "boundary_review_note",
      "completion_state"
    ],
    "must_remain_dry_run": true,
    "must_exclude_p00_inbox_from_auto_project_sync": true,
    "must_not_read_or_claim_mail_body_html_msg_or_attachment_payload": true,
    "must_not_mutate_outlook_or_project_ledgers": true,
    "ambiguous_sent_row_must_go_to_owner_followup": true
  }
}
```
