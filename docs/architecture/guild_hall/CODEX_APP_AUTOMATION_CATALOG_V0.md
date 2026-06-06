# Codex App Automation Catalog v0

## Purpose

This document is the version-controlled catalog for Soulforge Codex app
automations.

It records why each automation exists, what it may do, what a person is
expected to read, and which owner surface controls the durable prompt or
contract. It does not record the live on/off state of a specific PC.

The project-wide concept of recurring automation parties is owned by
`docs/architecture/guild_hall/AUTOMATION_PARTY_OPERATING_MODEL_V0.md`. This
catalog lists Codex app automation concepts that may invoke or support those
parties on one local machine.

## Source of truth split

| Layer | Stored where | Meaning |
| --- | --- | --- |
| Automation catalog | `docs/architecture/guild_hall/CODEX_APP_AUTOMATION_CATALOG_V0.md` | Human-readable list of expected Codex app automations and their purpose. |
| Automation party model | `docs/architecture/guild_hall/AUTOMATION_PARTY_OPERATING_MODEL_V0.md` | Project-wide rule for how recurring jobs become workflow, party, cadence party, scheduler, ledger, and report layers. |
| Prompt/spec source | `guild_hall/**/automations/*.spec.json`, `*.prompt.txt`, and owner docs | Version-controlled prompt intent and output contract where a renderer exists. |
| Local Codex app state | `$CODEX_HOME/automations/<automation_id>/automation.toml` | Actual ACTIVE/PAUSED state, local schedule, local cwd, local prompt rendering, and model on one PC. |
| Runtime reports | `guild_hall/state/operations/soulforge_activity/**` and private mirrors where allowed | Execution summaries, recent context, and safe carry-forward state. |

Do not commit local Codex app `automation.toml` files. They may contain
machine-local paths, schedules, and owner-local operational choices.

## Operating rule

Use this document for "what should exist and why." Use the local Codex app
automation files for "what is currently turned on here."

When adding or changing a Codex app automation:

1. Classify the job through `AUTOMATION_PARTY_OPERATING_MODEL_V0.md`.
2. Add or update one row in this catalog.
3. Link the owner document or prompt/spec source.
4. State whether it is a human report or a background job.
5. State the expected reader action.
6. Keep actual `ACTIVE` / `PAUSED`, local path, and local schedule as PC-local
   settings unless the owner explicitly promotes them to a default.

## Reader tiers

| Tier | Meaning | Default reading habit |
| --- | --- | --- |
| Primary report | The owner is expected to read it routinely. | Read daily or weekly. |
| Exception report | Useful mainly when something looks wrong. | Skim only on warning or when debugging. |
| Background job | A machine maintenance task, not a report. | Do not read unless it fails. |
| Advisory review | A slower strategic or planning review. | Read when making direction decisions. |

## Current default Codex app automations

These are the expected Codex app automation concepts for the active
`always_on_node`. A different PC may keep the same automation `PAUSED` or not
installed.

| Automation | Default cadence | Tier | Purpose | Owner/source |
| --- | --- | --- | --- | --- |
| `Soulforge 운영 감시` | Frequent heartbeat | Background job | Check operating health, sync safety, and whether activity/workmeta/mail-related lanes are blocked. | `docs/architecture/bootstrap/ALWAYS_ON_HEALER_ROLLOUT_PLAN_V0.md` |
| `always-on activity sync morning` | Daily morning | Background job | Sync safe activity events into the continuity surface before morning reports. | `docs/architecture/bootstrap/ALWAYS_ON_ACTIVITY_SYNC_PROMPT_V0.md` |
| `Soulforge Daily Status Email` | Daily morning | Exception report | Send a plain-language operational status report: repository state, automation health, mail/watch status, and recent safe context. | Cataloged here; local email prompt is still PC-local |
| `Soulforge Daily Work Report Email` | Daily morning | Primary report | Send a plain-language report of the previous day's work using safe activity evidence. | Cataloged here; local email prompt is still PC-local |
| `always-on activity sync` | Daily evening | Background job | Sync safe activity events after the workday so other PCs can pick up continuity. | `docs/architecture/bootstrap/ALWAYS_ON_ACTIVITY_SYNC_PROMPT_V0.md` |
| `Soulforge Night Watch Pipeline` | Daily night | Background job | Run preflight, boundary, portability, context drift, and optional fix-draft review as one ordered pipeline. | `docs/architecture/guild_hall/NIGHT_WATCH_AUTOMATION_V0.md`; `guild_hall/night_watch/automations/` |
| `Soulforge Night Watch Report Email` | Daily night after pipeline | Exception report | Convert the night watch result into a short plain-language report email. | Cataloged here; local email prompt is still PC-local |
| `Soulforge Friday Weekly Timesheet Draft` | Weekly Friday | Primary report | Produce a copy-friendly weekly work-log draft grouped by day and project. | Cataloged here; local email prompt is still PC-local |
| `Soulforge Weekly Ouroboros Review` | Weekly Sunday | Advisory review | Check whether Soulforge is still aligned with vision, roadmap, and owner intent. | `docs/architecture/guild_hall/ALWAYS_ON_STRATEGIC_REVIEW_V0.md`; `.workflow/ouroboros_strategic_review_harness_v0/` |

## Paused companion automations

These automations may exist in a local Codex app, but the current default is to
keep them `PAUSED` when `Soulforge Night Watch Pipeline` is active. They are
kept as separate concepts for debugging, migration, or one-off reruns.

| Automation | Purpose | Default reason to keep paused |
| --- | --- | --- |
| `Soulforge Boundary Check` | Check owner-boundary and public/private mixing. | Covered by the daily night watch pipeline. |
| `Soulforge Portability Check` | Check machine-specific paths and portability risks. | Covered by the daily night watch pipeline. |
| `Soulforge Context Drift Check` | Check instruction drift and misplaced rule ownership. | Covered by the daily night watch pipeline. |
| `Soulforge Fix Draft` | Draft one narrow follow-up from recent checks without editing tracked docs/code. | Should run only after stable findings, and the pipeline can create a conditional draft. |

## Human reading default

The normal reading load should stay small:

1. Read `Soulforge Daily Work Report Email` on ordinary days.
2. Read `Soulforge Friday Weekly Timesheet Draft` when preparing the weekly
   work log.
3. Read `Soulforge Weekly Ouroboros Review` when making direction decisions.
4. Treat `Daily Status` and `Night Watch` report emails as exception reports,
   not daily required reading.

If reports become noisy, reduce human-facing email first. Keep background
sync/check jobs quiet unless they are blocked or need owner action.

## Tracking gaps

Some automations have tracked prompt/spec sources today, such as
`Soulforge Night Watch Pipeline`. Some report email automations are only
cataloged here and still rely on local Codex app prompts.

Before copying those report email automations to another PC or treating them as
stable shared defaults, split their prompt text into tracked prompt templates
under the appropriate `guild_hall/**/automations/` owner surface and update
this catalog row to point at the new source.

## Registered split: daily ledger before reports

The daily automation chain splits daily work collection from daily or weekly
reporting.

In the project-wide model, this is a `daily_automation_party` stage. The
collector writes ledgers first; the report renderers consume those ledgers
later.

| Local automation or package | Tier | Purpose | Report-time rule |
| --- | --- | --- | --- |
| `soulforge-daily-work-ledger-collector-morning` | Background job | After the morning activity sync job finishes, collect safe metadata about the day's work into project, `P00-000_INBOX`, and Soulforge sub-ledger daily ledger files. | It does not send the owner-facing report. |
| `soulforge-daily-work-ledger-collector-evening` | Background job | After the evening activity sync job finishes, update or backfill the same metadata-only daily ledgers. | It does not send the owner-facing report. |
| `Soulforge Daily Work Report Email` | Primary report | Format the already-written daily ledger into a readable report. | It reads the daily ledger only; missing ledger data is reported as a gap. |
| `Soulforge Friday Weekly Timesheet Draft` | Primary report | Format the week of daily ledger entries into a copy-friendly weekly work log. | It reads daily ledgers only; it does not rediscover work from raw sources. |

This keeps the collecting worker small and routine, and keeps the reporting
worker from becoming a late-stage search and inference job.

The registered party chain for this split is
`.party/daily_automation_party/`. The local always-on node runs ledger
collector automations after the morning and evening activity sync jobs. The
Codex app automation files remain PC-local scheduler state and are not public
canon.

`P00-000_INBOX` is the reserved ledger code for real company work that has no
confirmed project code. It is not the Soulforge system ledger, and it is not a
personal or promotional mail bucket.

Soulforge work uses the owner-facing sub-ledger ids in
`docs/architecture/workspace/DAILY_WORK_LEDGER_TAXONOMY_V0.md`; it should not
be reported as one undifferentiated system bucket.

## Local audit command

To inspect what the current PC actually has configured, read only the safe
metadata fields from local Codex app automation files:

```bash
rg -n "^(id|kind|name|status|rrule|model|cwds)\\s*=" "$CODEX_HOME/automations" -g "automation.toml"
```

If `CODEX_HOME` is not set, Codex usually stores local automations under
`~/.codex/automations/`.

Do not print full prompts by default when auditing automations. Prompts may
include local paths or operational details that are not useful for a quick
human inventory.
