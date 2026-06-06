# .registry/skills/outlook_mail_reconcile

- `outlook_mail_reconcile/skill.yaml` is the canonical Soulforge skill entry for launching `.workflow/outlook_mail_reconcile_v0`.
- `codex/` is the Codex bridge that materializes to `~/.codex/skills/soulforge-outlook-mail-reconcile/` through the repository skill sync script.
- The launcher reads workflow-owned `workflow.yaml`, `step_graph.yaml`, and `profile_policy.yaml` at execution time instead of copying workflow procedure, optimizer output, Outlook runtime state, or project payloads into the skill.
- If the user does not name a project, the launcher defaults to all Codex-managed project mail ledgers and excludes `P00-000_INBOX` from automatic project sync.
- The launcher is metadata-only: no raw body reads, `.msg` export, attachment export, Outlook rule edits, folder moves, send-mail actions, or public project mail rows.

```powershell
npm.cmd run skills:sync -- outlook_mail_reconcile
```
