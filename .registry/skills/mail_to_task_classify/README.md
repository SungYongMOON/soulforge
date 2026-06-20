# .registry/skills/mail_to_task_classify

- `mail_to_task_classify/skill.yaml` is the canonical Soulforge skill entry for the dev-erp mail→할일 intake run with LLM judgment.
- `codex/` is the Codex bridge that materializes to `~/.codex/skills/soulforge-mail-to-task-classify/` through the repository skill sync script.
- The skill packages the LLM judgment (which mail is a real task + fields) around the deterministic dev-erp engines (`tools/mail_to_task_pending.mjs` detects unconverted mail; `tools/mail_to_task_ledger.mjs` writes the 할일_장부). It does not reimplement the CSV/ledger logic.
- The classification contract (candidates JSON schema, include/omit rules, work_type mapping, open conditions, limits) lives in `codex/references/rubric.md`.
- Metadata-only and idempotent: no mail body/attachment/secret reads, no mail rows in public tracked files, converted mail is excluded from the next pending scan.

```powershell
npm.cmd run skills:sync -- mail_to_task_classify
```
