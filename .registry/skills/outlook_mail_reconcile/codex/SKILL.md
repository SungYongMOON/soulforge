---
name: soulforge-outlook-mail-reconcile
description: "Use when Codex should run the Soulforge Outlook mail reconciliation workflow for /outlook-reconcile: update project sent-mail history from Outlook sent-folder metadata and cross-validate received-mail history against inbox metadata without Outlook mutation or raw mail export."
---

# Soulforge Outlook Mail Reconcile

Use this skill as a thin launcher for `.workflow/outlook_mail_reconcile_v0`.

The workflow owns the actual reconciliation procedure, metadata fields, ledger delta rules, output templates, and boundary review. Do not re-create the workflow body inside this skill.

## Operating Steps

1. Read `docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md`.
2. Resolve `/outlook-reconcile` to `.workflow/outlook_mail_reconcile_v0`.
3. Read `.workflow/outlook_mail_reconcile_v0/workflow.yaml`, `step_graph.yaml`, and `profile_policy.yaml`.
4. Bind project scope, date window, Outlook source alias, and output mode before reading Outlook metadata. If no project is named, default to all Codex-managed project ledgers and exclude `P00-000_INBOX`.
5. Use only workflow-approved Outlook metadata fields. Sent mail may produce a private project ledger delta; received mail is cross-validation only.
6. Route ambiguous project matches or uncertain rows to owner follow-up instead of automatic upsert.
7. Close with the workflow boundary review before claiming the run state.

## Boundary Rules

- Do not send, move, delete, mark, categorize, or edit Outlook mail.
- Do not create or edit Outlook folders or rules from this launcher.
- Do not treat the planned Codex-managed Outlook folder area as already applied; Outlook folder-tree cleanup is a separate owner-approved operations task.
- Do not read raw body text, raw HTML body, `.msg` files, attachments, secrets, session state, or credential files.
- Do not put project mail rows, runtime absolute paths, raw mail payloads, or private evidence into public tracked files.
- Do not claim pilot-executed, production-ready, default-route-safe, or Outlook mutation authority unless separate workflow evidence and owner approval support that stronger claim.

## Load On Demand

Read [`references/mapping.md`](references/mapping.md) when you need the workflow linkage, output shape, old `.msg` skill boundary, or validation checklist.
