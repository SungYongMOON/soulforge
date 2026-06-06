# daily_work_ledger_capture_v0

`daily_work_ledger_capture_v0` is a registered workflow for writing daily
company project, `P00-000_INBOX`, and Soulforge sub-ledger work ledgers from
approved metadata surfaces.

## Current State

- location: `.workflow/daily_work_ledger_capture_v0/`
- package status: `registered`
- strongest workflow-check label: `registered`
- canon registration: registered in `.workflow/index.yaml`
- default-route-safe: yes for the owner-requested local daily automation party binding
- automation binding: bound by `.party/daily_automation_party/` and local Codex app collector automations

The package is registered so the daily automation party can resolve it as a
workflow entry. Registration does not claim production readiness, source
completeness, or owner acceptance of every ledger entry.

## What It Owns

- Daily ledger capture scope.
- Approved metadata source inventory.
- Owner-facing ledger category policy.
- Company project, `P00-000_INBOX`, and Soulforge sub-ledger work entry
  normalization.
- Company project daily ledger and Soulforge sub-ledger daily ledger output
  shapes.
- Skipped/review-needed source register.
- Capture receipt and downstream handoff.
- Boundary review for metadata-only ledger writing.

## What It Does Not Own

- Report writing.
- Daily or weekly email rendering.
- Codex app automation schedule.
- Local Codex app automation clock, ACTIVE/PAUSED state, or model setting.
- Source truth.
- Mail bodies, attachments, Office/PDF/HWP payloads, project files, secrets, or
  raw activity payloads.
- Owner acceptance of the work as complete.

## Operating Summary

1. Bind the date, ledger scope, output roots, and approved metadata source refs.
2. Inventory only metadata surfaces that are allowed for ledger capture.
3. Normalize candidate rows into company project, `P00-000_INBOX`, or Soulforge
   sub-ledger entries.
4. Write project ledgers under `_workmeta/<project_code>/daily_ledger/**`.
5. Write `P00-000_INBOX` ledgers under
   `_workmeta/P00-000_INBOX/daily_ledger/**`.
6. Write Soulforge sub-ledgers under
   `_workmeta/system/daily_ledger/<subledger>/**`.
7. Record skipped, blocked, or review-needed sources explicitly.
8. Emit a capture receipt and boundary review note.
9. Hand off to report renderers that read ledgers only.

`P00-000_INBOX` uses the project daily ledger shape as a reserved company
general/unresolved work code. It is for real company work without a confirmed
project code, not for Soulforge system work or personal/promotional mail.

Soulforge work uses stable owner-facing sub-ledger ids under the reserved
`_workmeta/system/` support lane:

- `system`
- `knowledge`
- `workflow`
- `automation`
- `ingress`
- `skill`
- `ui`
- `domain_cell`

These sub-ledger ids are report categories only. They do not bind a party,
create execution authority, register a workflow, or prove owner acceptance.

## Claim Ceiling

This registered workflow supports the owner-requested local automation party
binding where activity sync runs before daily work ledger capture. It does not
claim production readiness, source completeness, owner acceptance of entries, or
cross-PC default rollout.
