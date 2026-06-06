# Task Note

## Purpose

Create a reusable workflow draft for the daily background collector that writes
company project, `P00-000_INBOX`, and Soulforge sub-ledger work ledgers before
any daily report, weekly work log, or timesheet renderer runs.

## Inputs

- `docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.md`
- `docs/architecture/guild_hall/AUTOMATION_PARTY_OPERATING_MODEL_V0.md`
- `docs/architecture/guild_hall/CODEX_APP_AUTOMATION_CATALOG_V0.md`
- `.workflow/authoring/README.md`
- `.workflow/README.md`
- `.party/README.md`

## Expected Outputs

- `workflow.yaml`
- `step_graph.yaml`
- `role_slots.yaml`
- `handoff_rules.yaml`
- `monster_rules.yaml`
- `party_compatibility.yaml`
- `profile_policy.yaml`
- `README.md`
- `templates/**`

## Work Notes

1. Keep collection separate from reporting.
2. Treat approved metadata as observation evidence, not source truth.
3. Route raw payload needs to owner review or upstream source workflows, not
   this collector.
4. Make missing or incomplete source coverage visible as a gap.
5. Leave Codex app schedule and `.party` registration for later.
6. Keep owner-facing ledger categories explicit: company project `Pxx-xxx`,
   company general/unassigned `P00-000_INBOX`, and Soulforge sub-ledgers
   `system`, `knowledge`, `workflow`, `automation`, `ingress`, `skill`, `ui`,
   and `domain_cell`.

## Common Failure Modes

- Report-time rediscovery from raw sources.
- Copying mail or attachment payloads into `_workmeta`.
- Treating local automation state as canon.
- Treating a skipped source as if no work happened.
- Registering the workflow or binding a daily party before owner review.
- Routing Soulforge work into `P00-000_INBOX` or using `system` when a narrower
  Soulforge sub-ledger is supported.
