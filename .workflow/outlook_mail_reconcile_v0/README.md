# Outlook Mail Reconcile v0

Registered workflow for reconciling project mail history from Outlook metadata.

This workflow reads owner-approved Outlook metadata, updates project sent-mail
history candidates, and cross-validates existing received/inbox history. It is
metadata-only except for an owner-requested Outlook Send/Receive preflight that
may run immediately before metadata collection. It does not read mail body
content, copy `.msg` files, copy attachments, change Outlook folders, change
Outlook rules, or make itself a default workflow route.

## Status

- Workflow status: active
- Registration: registered in `.workflow/index.yaml`
- Short invocation alias: `/outlook-reconcile`
- Default route: no
- Claim ceiling: registered structure-only workflow; no pilot execution has
  been claimed

## Intended Use

Default scope: if the user does not name a project, run against all
Codex-managed project ledgers found from `_workmeta` that match the project mail
history contract. Exclude `P00-000_INBOX` from automatic project sync; it remains
an unresolved inbox and mapping-review bucket.

Use this when a project has a maintained mail ledger under
`_workmeta/<project_code>/reports/메일_이력/메일_이력.csv` and the owner wants to:

- refresh Outlook mailbox state with Send/Receive before reading metadata
- add missing sent-mail rows from Outlook sent-folder metadata
- compare inbox/received metadata against the existing received-mail ledger
- produce an owner review queue for uncertain project matches
- refresh `_workspaces/<project_code>/reports/메일_이력/메일_이력.xlsx` only as a
  readable export, not as source truth

## Non-Use

Outlook folder-tree cleanup, including a dedicated Codex-managed Outlook area,
is a separate owner-approved Outlook operations task. This workflow may prepare
or reference that plan, but it does not create folders, rename folders, move
mail, or edit rules.

Do not use this workflow to move Outlook mail, create or edit Outlook rules,
read raw mail bodies, export attachments, classify projects from raw body text,
or publish project mail data into the public repository.

## Invocation

Use `/outlook-reconcile` as the short human-facing alias. The resolver target is
the canonical workflow id `outlook_mail_reconcile_v0`.
