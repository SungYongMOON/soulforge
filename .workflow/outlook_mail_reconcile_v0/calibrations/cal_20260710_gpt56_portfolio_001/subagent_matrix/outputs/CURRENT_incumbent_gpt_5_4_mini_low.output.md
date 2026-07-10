**outlook_mail_reconcile_v0 deliverable**

**Scope inventory**
- Scope mode: `codex_managed_projects_default`
- Date window: `2026-07-01/2026-07-10`
- Outlook source alias: `fixture_outlook`
- Output mode: `dry_run`
- Refresh requested: `true`
- Included project codes: `DEMO-A`, `DEMO-B`
- Excluded project code: `P00-000_INBOX`
- Exclusion basis: unresolved holding ledger is explicitly excluded by scope policy

**Preflight status**
- Requested: `yes`
- Attempted: `not executed in this synthetic dry-run deliverable`
- Result: `described only; no Outlook access and no mutation`
- Boundary note: preflight is represented as requested state, not as runtime verification

**Normalized metadata rows**

Sent rows:
- `sent_at`: `2026-07-03T09:00:00Z`
- `subject_normalized`: `demo update`
- `subject_fingerprint`: `subj-1`
- `conversation_fingerprint`: `conv-1`
- `sender_account_alias`: `work`
- `recipient_count`: `2`
- `recipient_domain_fingerprints`: `["domain-x"]`
- `attachment_count`: `1`
- `message_size_bucket`: `small`
- `source_entry_fingerprint`: `entry-1`
- `source_folder_alias`: `sent`
- `direction`: `sent`

- `sent_at`: `2026-07-04T10:00:00Z`
- `subject_normalized`: `ambiguous request`
- `subject_fingerprint`: `subj-x`
- `conversation_fingerprint`: `conv-x`
- `sender_account_alias`: `work`
- `recipient_count`: `1`
- `recipient_domain_fingerprints`: `["domain-y"]`
- `attachment_count`: `0`
- `message_size_bucket`: `small`
- `source_entry_fingerprint`: `entry-x`
- `source_folder_alias`: `sent`
- `direction`: `sent`

Received rows:
- `received_at`: `2026-07-05T11:00:00Z`
- `subject_normalized`: `demo response`
- `subject_fingerprint`: `recv-2`
- `conversation_fingerprint`: `conv-2`
- `sender_alias_or_fingerprint`: `sender-z`
- `recipient_account_alias`: `work`
- `attachment_count`: `0`
- `message_size_bucket`: `small`
- `source_entry_fingerprint`: `recv-entry-2`
- `source_folder_alias`: `inbox`
- `direction`: `received`

**Sent history delta**
- `DEMO-A`
  - Matched existing sent history by exact metadata identifiers:
    - `subject_fingerprint`: `subj-1`
    - `source_entry_fingerprint`: `entry-1`
  - Delta outcome: `duplicate suppressed`
  - New row created: `no`
- Ambiguous sent candidate:
  - `project_code`: `unresolved`
  - `subject_fingerprint`: `subj-x`
  - `source_entry_fingerprint`: `entry-x`
  - Match basis: insufficient for automatic project binding
  - Delta outcome: `owner_review_only`
  - New row created: `no auto-upsert`
- Write mode: `dry_run`
- Ledger write: `not performed`

**Inbox cross-validation**
- Incoming candidate:
  - `subject_fingerprint`: `recv-2`
  - `source_entry_fingerprint`: `recv-entry-2`
- Existing received history reference:
  - `DEMO-B`
  - `subject_fingerprint`: `recv-1`
  - `source_entry_fingerprint`: `recv-entry-1`
- Classification: `missing_in_project_ledger`
- Deletion or rewrite: `not permitted`
- Additional classifications: none asserted
- Ambiguity status: no owner-review classification required for the received row based on the supplied synthetic metadata alone

**Dry-run receipts / summary**
- Private project metadata ledger update: `not written`
- Workspace xlsx export: `not written`
- Reconciliation summary: `counts-and-hashes-only representation implied; no file output`
- Public package contents: `no raw mail rows, no payloads, no runtime absolute paths`

**Boundary review**
- No Outlook mutation represented beyond the requested preflight description
- No mail body, HTML, attachment filename, or attachment payload accessed
- No folder, rule, move, delete, read/unread, category, or message-copy action represented
- No ambiguous row was auto-upserted
- `P00-000_INBOX` remained excluded from default project sync scope
- All identifiers in this deliverable remain synthetic and public-safe
- Uncertainty preserved: the ambiguous sent item cannot be bound to a project from the provided metadata alone
