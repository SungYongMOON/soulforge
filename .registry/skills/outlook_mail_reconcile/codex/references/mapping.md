# Outlook Mail Reconcile Launcher Mapping

## Canon Linkage

- Canon skill id: `outlook_mail_reconcile`
- Codex installed skill: `soulforge-outlook-mail-reconcile`
- Human workflow alias: `/outlook-reconcile`
- Source workflow: `.workflow/outlook_mail_reconcile_v0/`
- Canon skill package: `.registry/skills/outlook_mail_reconcile/`
- Party binding: none; the workflow declares `party_required: false`

## Runtime Resolution

When invoked, resolve `/outlook-reconcile` to `outlook_mail_reconcile_v0`, then read:

1. `.workflow/outlook_mail_reconcile_v0/workflow.yaml`
2. `.workflow/outlook_mail_reconcile_v0/step_graph.yaml`
3. `.workflow/outlook_mail_reconcile_v0/profile_policy.yaml`

The workflow owns the procedure, profile policy, output templates, and boundary posture. This launcher must not copy optimizer values, step graphs, Outlook runtime state, or project mail payloads into the skill body.

## Scope Contract

Before any Outlook metadata read, bind:

- project scope
- date window or explicit all-history marker
- Outlook source alias
- output mode: `dry_run`, `apply_metadata_ledger_delta`, or `cross_validate_only`

If the user does not name a project, use `codex_managed_projects` as the default
scope. Build that scope from project-specific `_workmeta` mail history ledgers,
and exclude unresolved holding or mapping-review ledgers such as
`P00-000_INBOX` from automatic project sync.

Sent mail can produce a private project metadata ledger delta when the selected mode allows it. Received mail is cross-validation only unless a separate owner decision grants a stronger action.

## Outlook Folder Tree Boundary

The planned Outlook folder-tree target is a dedicated Codex-managed area. This
launcher can notice that such a folder plan is needed, but it must not create,
rename, move, or rule-route Outlook folders. Folder-tree cleanup belongs to a
separate owner-approved Outlook operations workflow or manual action.

## Boundary With Old MSG Skills

This launcher is not a `.msg` collection or expansion route. If the user asks for `.msg` export, attachment export, raw body extraction, or raw mail archive creation, stop and route that as a separate owner-approved workflow instead of using this launcher.

Legacy Outlook intake or expansion skills are not canonical dependencies of this workflow. Future runs should rely on the workflow-owned metadata-only contract, not on `.msg` collection or expansion packages.

## Output Shape

The workflow output sequence is:

1. `reconcile_scope`
2. `codex_managed_project_scope_inventory`
3. `outlook_sent_metadata_packet`
4. `outlook_received_metadata_packet`
5. `project_sent_history_delta`
6. `inbox_cross_validation_report`
7. `owner_followup_needed`
8. `boundary_review_note`

Use the templates under `.workflow/outlook_mail_reconcile_v0/templates/`.

## Validation Checklist

- `.workflow/outlook_mail_reconcile_v0/workflow.yaml` was read before execution.
- `.workflow/outlook_mail_reconcile_v0/profile_policy.yaml` was read before selecting or overriding any execution profile.
- Project scope, date window, Outlook source alias, and output mode were explicit before Outlook metadata access.
- When no project was named, Codex-managed project scope was built from project mail ledgers and `P00-000_INBOX` was excluded.
- Outlook access stayed metadata-only and read-only.
- No raw body text, raw HTML body, `.msg` file, attachment payload, secret, session state, or credential file was read.
- No Outlook folder, rule, send, move, delete, mark-read, category, or mail mutation action was performed.
- The Codex-managed Outlook folder area was not claimed as already created unless a separate approved Outlook operations run created it.
- Sent-mail ledger deltas used private project metadata ledger rules only.
- Received-mail history was cross-validated and not deleted or rewritten.
- Ambiguous matches were routed to owner follow-up.
- Public tracked files contain no project mail rows, runtime absolute paths, raw mail payloads, or private evidence.
- Stronger claims such as pilot-executed, production-ready, default-route-safe, or Outlook mutation authority were not made without separate evidence and owner approval.
