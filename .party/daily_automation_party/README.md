# daily_automation_party

`daily_automation_party` is the registered party for the daily Soulforge automation
chain.

## Current State

- location: `.party/daily_automation_party/`
- package status: `registered`
- `.party/index.yaml` registration: yes
- default-route-safe: yes for this local always-on node
- Codex app automation changed: yes, daily ledger collector automations added and daily work report timing moved after collector
- command-backed handoffs recorded: yes, snapshot refresh and workmeta-payload validation now sit before night watch
- local scheduler changed: yes, via Codex app automation state

This party records the active local daily chain. It is not a cross-PC rollout
and does not make the scheduler a source of truth.

## Plain Model

The daily party should first collect what the other PCs did, then write the
work ledger, then let reports read that ledger.

```text
morning activity sync
  -> daily work ledger capture
  -> daily work report

evening activity sync
  -> daily work ledger capture update
  -> Soulforge snapshot refresh
  -> workmeta metadata-boundary check
  -> night watch and exception report later
```

The important rule is that daily reports should not rediscover the day's work
from mail, git history, raw logs, attachments, or project files. The collector
writes the ledger first; the reporter reads the ledger later.

## Chain Intent

1. Run the existing `always-on activity sync morning` local automation.
2. After it completes or records an explicit sync gap, run
   `daily_work_ledger_capture_v0` over approved metadata surfaces.
3. Let `Soulforge Daily Work Report Email` read the prepared daily ledger.
4. Run the existing evening `always-on activity sync`.
5. After it completes or records an explicit sync gap, run
   `daily_work_ledger_capture_v0` again as an update/backfill pass.
6. Refresh the sanitized Soulforge snapshot with `npm run guild-hall:snapshot`
   after daily metadata changed, so healer and operation-board consumers do not
   treat stale snapshot state as current.
7. Run and record `npm run validate:workmeta-payload` as the explicit
   metadata-boundary check before night-watch/report stages.
8. Let night-watch and exception reports use the updated activity/ledger
   context without becoming source truth.

## Boundary

- Local Codex app automations own clock time, ACTIVE/PAUSED state, local cwd,
  prompt rendering, and local model.
- This party owns only the intended chain and handoff order.
- Runtime state and receipts stay in `_workmeta/**`,
  `guild_hall/state/operations/soulforge_activity/**`, or private mirrors.
- Command-backed stages record pass/fail summaries or explicit gaps; they do
  not create workflow ids or Codex app automation ids.
- Raw mail bodies, attachments, Office/PDF/HWP payloads, project source bodies,
  secrets, sessions, cookies, and local absolute payload paths must not be
  copied into this party package.
- Snapshot refresh follows `docs/architecture/guild_hall/SOULFORGE_SNAPSHOT_V0.md`
  and writes local ignored state under `guild_hall/state/snapshot/**`.
- Payload-boundary validation is a deterministic local check; if it fails, the
  downstream report should surface an exception instead of reading raw files.

## Next Step

Inspect the next scheduled metadata-only collector and post-ledger check runs,
then use the receipts and review register to decide whether the local default
should be copied to another always-on node.
