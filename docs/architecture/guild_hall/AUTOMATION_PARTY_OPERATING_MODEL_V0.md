# Automation Party Operating Model v0

## Purpose

This document fixes the project-wide concept for recurring Soulforge
automation.

It does not create a local Codex app automation, install a launchd job, or turn
any workflow on. It defines how recurring automation should be designed,
versioned, and reviewed before a local scheduler invokes it.

## One-line model

Automation is a local scheduled invocation of a versioned workflow, party, or
mission route.

```text
workflow = one repeatable procedure
party = an ordered chain of workflows
automation party = a cadence-based party that repeats an operating chain
local scheduler = clock, ACTIVE/PAUSED state, local paths, and local prompt
run evidence = approved metadata/state surfaces, not the scheduler itself
```

The scheduler is not the source of truth. The scheduler only wakes the system.

## Owner split

| Layer | Owner surface | Owns | Does not own |
| --- | --- | --- | --- |
| Workflow | `.workflow/<workflow_id>/` | One repeatable procedure, inputs, outputs, handoffs, profile policy. | Cadence, local on/off state, party chain. |
| Party | `.party/<party_id>/` | Workflow chain, default entry, allowed workflows, chain-level handoff. | Workflow internals, schedule time, raw run truth. |
| Automation party | `.party/<party_id>/` when registered, or this model while still conceptual | A cadence-oriented party pattern such as daily, weekly, or monthly operating chain. | Local Codex app state, launchd plist state, prompt secrets, raw payloads. |
| Mission | `.mission/<mission_id>/` | Held execution plan and readiness when automation creates or runs concrete work. | Reusable workflow canon or raw project payloads. |
| Codex app automation | `$CODEX_HOME/automations/<automation_id>/automation.toml` | Local clock, ACTIVE/PAUSED state, local cwd, local prompt rendering, local model. | Project canon, party chain authority, cross-PC default truth. |
| launchd job | User-local LaunchAgent | Deterministic local command wakeup on one machine. | Codex reasoning prompt, party chain authority, canon mutation. |
| Runtime metadata | `_workmeta/<project_code>/**`, `_workmeta/system/**`, `guild_hall/state/**`, `private-state/**` | Ledgers, receipts, recent context, reports, carry-forward state, private mirrors. | Raw source payloads unless the owner surface explicitly permits them outside `_workmeta`. |
| Worksite payloads | `_workspaces/<project_code>/**` or owner-approved shared worksite | Actual project files and source artifacts. | Public canon or metadata-only ledgers. |

## Cadence party hierarchy

Cadence automation parties group repeatable operating work by human review
rhythm.

| Cadence party pattern | Purpose | Current status |
| --- | --- | --- |
| `daily_automation_party` | Capture daily facts, write ledgers, run health checks, produce small owner-facing reports or explicit gaps. | Registered under `.party/daily_automation_party/` for the local always-on node. |
| `weekly_automation_party` | Roll up daily ledgers, prepare weekly work logs, inspect repeated blockers, run slower strategic review. | Conceptual pattern; weekly report and Ouroboros automations already exist as local concepts. |
| `monthly_automation_party` | Review trends, automation effectiveness, promotion candidates, and roadmap adjustment packets. | Candidate pattern only. |

The names above are stable design language, not a claim that the matching
`.party/<party_id>/` package already exists. Registration requires a separate
party package, allowed workflow list, README, catalog update, and validation.

## Default chain shape

The chain below is the intended worldview. Exact workflow IDs may be created or
bound later.

```text
daily_automation_party
  -> morning activity sync
  -> daily work ledger collector
  -> daily work report renderer
  -> evening activity sync
  -> daily work ledger collector update
  -> night watch pipeline
  -> exception report renderer

weekly_automation_party
  -> daily ledger rollup
  -> weekly timesheet/work-log draft
  -> repeated blocker and skipped-item review
  -> Ouroboros strategic review
  -> owner question and next-focus packet

monthly_automation_party
  -> monthly ledger rollup
  -> automation noise/effectiveness review
  -> workflow/party/skill promotion candidate review
  -> roadmap and mission adjustment packet
```

The local scheduler may run different stages at different clock times. That
does not split the party concept. A party is the operating chain; schedules are
local wakeup details.

## Core rules

1. No stray recurring automation.
   Every recurring job must be classified as one of: a workflow invocation, a
   party stage, a report renderer, a deterministic local job, or a temporary
   local experiment.
2. Party owns the chain.
   If a new daily, weekly, or monthly automation changes the operating sequence,
   update the party concept or registered party package before treating it as a
   shared default.
3. Scheduler owns the clock only.
   Codex app automation and launchd own local time, local path, ACTIVE/PAUSED
   state, and machine-specific prompt rendering. They do not define canon.
4. Collector and reporter stay separate.
   Collection writes metadata ledgers or receipts. Reporting reads already
   written ledgers and formats them. A report job must not rediscover work from
   mail, git history, raw logs, attachments, or project files at report time.
5. Missing input becomes an explicit gap.
   If a ledger or upstream receipt is missing, the downstream report states the
   gap instead of silently scanning raw sources as a fallback.
6. Human reading load is budgeted.
   Primary reports are few. Exception reports are read only on warning or when
   debugging. Background jobs should be quiet unless blocked.
7. One active always-on owner by default.
   The same shared automation party should normally be ACTIVE on one
   `always_on_node`. Other PCs may keep local copies paused or uninstalled.
8. No raw payload promotion through automation.
   Recurring jobs must not copy mail bodies, Office/PDF/HWP payloads, company
   source files, secrets, sessions, account data, or owner-only raw material
   into public canon or metadata-only `_workmeta`.
9. Prompt/spec source must be tracked before portability.
   A local Codex app prompt can be PC-local while experimental. Before copying
   it to another PC or calling it a shared default, put its prompt/spec source
   under the relevant `guild_hall/**/automations/` owner surface or another
   tracked owner document.
10. Routine automation does not self-promote canon.
    Nightly, daily, weekly, or monthly jobs may produce candidates, gaps,
    reports, and owner questions. They do not silently rewrite public canon,
    merge branches, push commits, or accept workflow/party promotion.

## Adding a new recurring workflow to a party

When a new recurring item appears, use this checklist.

1. Define the smallest workflow it represents.
2. Decide whether it belongs in an existing cadence party or needs a new party
   pattern.
3. State whether it is a collector, validator, renderer, advisory review, or
   deterministic local job.
4. Define approved inputs and write surfaces.
5. Define the downstream consumer. A collector without a consumer is not yet a
   useful recurring default.
6. Define the reader tier if it produces a human report.
7. Update the automation catalog and the relevant owner docs.
8. If it is becoming shared or portable, add tracked prompt/spec source.
9. Keep local ACTIVE/PAUSED state and schedule out of Git.
10. Validate before calling the concept accepted.

## Daily work ledger fit

The daily work ledger collector belongs in the `daily_automation_party`
worldview.

It is a background collector, not a report. It runs after the existing activity
sync automations so it can use the freshly merged other-PC activity metadata.
It writes one daily metadata ledger per project, one `P00-000_INBOX` company
general ledger, and Soulforge sub-ledgers under
`_workmeta/system/daily_ledger/<subledger_id>/**` where appropriate. The daily
report and the Friday weekly work-log draft should read those ledgers only.

The current local registered chain is:

1. `always-on-activity-sync-morning`
2. `daily_work_ledger_capture_v0`
3. `soulforge-daily-work-report-email`
4. `always-on-activity-sync`
5. `daily_work_ledger_capture_v0` update/backfill pass
6. `npm run guild-hall:snapshot`
7. `npm run validate:workmeta-payload`
8. `soulforge-night-watch-pipeline`
9. `soulforge-night-watch-report-email`

This split is required because report time is not collection time. Reports
should bring already-prepared evidence to the owner, not search for the work
while writing the report.

The snapshot refresh and workmeta-payload validation stages are deterministic
local jobs, not new workflow canon entries. They run after daily metadata has
been collected and before night-watch/report stages use that state. The
snapshot stage refreshes local read-only state for healer and operation-board
freshness checks. If the payload validator finds Office/PDF/HWP, compressed
files, mail payloads, or other forbidden raw files under `_workmeta`, the
downstream report surfaces an exception instead of opening or copying those
files.

Current registered workflow package:
`.workflow/daily_work_ledger_capture_v0/`. It is registered in
`.workflow/index.yaml` and bound to the local daily automation party by owner
request.

Current party package:
`.party/daily_automation_party/`. It is registered in `.party/index.yaml`.
The local Codex app owns the actual clock and ACTIVE/PAUSED state.

## Relationship to existing docs

- `CODEX_APP_AUTOMATION_CATALOG_V0.md` lists expected Codex app automation
  concepts and reader tiers.
- `NIGHT_WATCH_AUTOMATION_V0.md` defines the current daily night-watch
  pipeline and its local scheduler boundary.
- `ALWAYS_ON_STRATEGIC_REVIEW_V0.md` defines healer, night_watch, and weekly
  Ouroboros split for the always-on node.
- `.party/README.md` defines party as reusable workflow-chain/loadout canon.
- `.workflow/README.md` defines workflow as individual reusable procedure
  canon.
- `DEVELOPMENT_ROADMAP_V0.md` owns future development priority and candidates.

This document sits above the automation catalog and below the foundation world
model: it defines how recurring operating chains should be understood before
they become local schedules.
