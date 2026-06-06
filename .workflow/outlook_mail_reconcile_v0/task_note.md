# Outlook Mail Reconcile v0 Task Note

## Goal

Create a reusable Soulforge workflow for reading Outlook metadata, updating
project sent-mail history, and cross-validating received-mail history.

## Operating Assumptions

- Outlook access is read-only and owner-approved.
- Sent-folder metadata can supply missing sent-mail ledger rows.
- Received-folder metadata is used to check existing received history, not to
  erase or rewrite it automatically.
- `_workmeta/<project_code>/reports/메일_이력/메일_이력.csv` remains the source
  truth for project mail history metadata.
- `_workspaces/<project_code>/reports/메일_이력/메일_이력.xlsx` is a readable
  owner-facing export only.

## Claim Ceiling

This package is registered as `outlook_mail_reconcile_v0` with short alias
`/outlook-reconcile`. Registration does not claim pilot execution, Outlook
mutation authority, or default-route authority.
