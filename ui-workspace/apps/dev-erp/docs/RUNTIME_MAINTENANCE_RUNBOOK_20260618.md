# dev-ERP Runtime Maintenance Runbook

Status: first-release operating draft
Date: 2026-06-18
Scope: company-PC runtime checkout, `<runtime-root>`

## Operating Rule

The runtime checkout runs the ERP. The development checkout creates and tests
patches. The runtime DB is not shared through Git.

Canonical runtime data:

- Live app and DB: `<runtime-root>\ui-workspace\apps\dev-erp`
- Live DB: `<runtime-root>\ui-workspace\apps\dev-erp\data\dev-erp.db`
- Local runtime logs: `<runtime-root>\ui-workspace\apps\dev-erp\logs`
- NAS backup root: `<nas-root>`
- Canonical DB backup namespace: `<nas-root>\01_db_backups`
- Restore-test reports: `<nas-root>\02_restore_tests`

Do not run the live DB directly from the NAS. Keep the live DB local to the
company PC, then back it up to the NAS with SQLite-safe tooling.

## States

`healthy`: `/api/health` returns `ok=true`, audit has no blockers, and recent
DB backup/restore-test evidence exists.

`degraded`: ERP is reachable but a non-critical warning exists, such as stale
restore-test evidence or incomplete optional mail setup.

`down`: `/api/health` is unreachable or the service cannot start.

`maintenance`: an operator intentionally pauses watchdog recovery by creating:

```text
<runtime-root>\ui-workspace\apps\dev-erp\logs\maintenance.lock
```

Remove that file after maintenance.

## Service Model

Preferred service runner: NSSM.

Install or update from an elevated PowerShell window after NSSM is available:

```powershell
<runtime-root>\ui-workspace\apps\dev-erp\ops\install-dev-erp-nssm.ps1 -RuntimeRoot <runtime-root> -HostName 127.0.0.1 -Port 4300
nssm start dev-erp
```

NSSM responsibilities:

- start on Windows boot
- restart the Node process when it exits
- write service stdout/stderr logs under `logs\service`
- keep runtime environment knobs together with the service

Use `127.0.0.1` plus HTTPS/Tailscale for the default tunnel-only posture.
Use `0.0.0.0` only for owner-approved trusted LAN HTTP, and pass
`-CookieSecure 0` for that HTTP-only pilot so login cookies work.

## Watchdog

`ops/dev-erp-watchdog.ps1` is a one-shot health and recovery script. Run it
from Task Scheduler every 1 minute during the pilot.

It does this:

1. check `http://127.0.0.1:4300/api/health`
2. if healthy, reset failure count
3. if down and the `dev-erp` service exists, restart or start the service
4. if no service exists, start a hidden Node runtime process as a fallback
5. write JSONL events under `logs\watchdog`
6. after repeated failed recoveries, optionally request Windows reboot only
   when `-AllowReboot` is explicitly passed

Suggested scheduled task action:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File <runtime-root>\ui-workspace\apps\dev-erp\ops\dev-erp-watchdog.ps1 -RuntimeRoot <runtime-root>
```

Optional last-resort reboot action:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File <runtime-root>\ui-workspace\apps\dev-erp\ops\dev-erp-watchdog.ps1 -RuntimeRoot <runtime-root> -AllowReboot -FailureThreshold 3 -RebootCooldownHours 6
```

Do not enable `-AllowReboot` until the owner approves it. A NAS outage, audit
warning, or planned maintenance marker must not reboot the PC.

## Health Checks

Quick check:

```powershell
npm.cmd run dev-erp:health -- --json
```

Release-grade check:

```powershell
npm.cmd run dev-erp:audit-runtime -- --runtime-root <runtime-root> --workspaces <dev-checkout>\_workspaces --nas-root <nas-root> --require-live --target-members 0
```

Use `--target-members <n>` after team accounts are created. Add
`--allow-lan-http` only after the owner approves direct LAN HTTP exposure.

## Backup Policy

Use SQLite `VACUUM INTO`; do not copy only `dev-erp.db` while a WAL file may
exist.

Manual backup:

```powershell
npm.cmd run dev-erp:backup-runtime -- --db <runtime-root>\ui-workspace\apps\dev-erp\data\dev-erp.db --nas-root <nas-root> --tag manual --json
```

Restore-test latest backup:

```powershell
npm.cmd run dev-erp:restore-test -- --nas-root <nas-root> --json
```

Pilot schedule:

- 07:00 daily DB backup and restore-test, before people arrive
- every 15 minutes during pilot service hours while early team data is changing
- before maintenance, reboot, Git pull, runtime update, or schema/data patch
- 02:00 workspace/NAS mirror job, separate from DB backup

Retention target:

- 15-minute pilot backups: keep at least 48 hours
- daily 07:00 backups: keep at least 30 days
- weekly snapshots: keep at least 12 weeks

The `latest/runtime_live` copy is for quick restore. Scheduled stamped backup
folders are the history.

## Update Procedure

1. Confirm development patch is committed and pushed.
2. Create maintenance marker if the change needs a quiet window.
3. Run a pre-update backup and restore-test.
4. Pull the approved commit into `<runtime-root>`.
5. Restart `dev-erp` service or Node process.
6. Run health and runtime audit.
7. Run a post-update backup and restore-test.
8. Remove maintenance marker.

## Troubleshooting

ERP page does not open:

- check the URL includes `http://` or `https://`
- run `npm.cmd run dev-erp:health -- --json`
- check `Get-Service dev-erp`
- check `netstat -ano -p tcp | findstr :4300`
- inspect `logs\service` and `logs\watchdog`

Service exists but page is down:

- `nssm restart dev-erp`
- run health again after 10 seconds
- if repeated, create `logs\maintenance.lock`, run backup if DB is reachable,
  then inspect recent service logs

NAS unavailable:

- keep ERP local runtime running
- local logs and DB remain on the company PC
- queue the next NAS backup for when `Z:` returns
- do not reboot only because NAS backup failed

DB backup stale:

- run `dev-erp:backup-runtime`
- run `dev-erp:restore-test`
- rerun `dev-erp:audit-runtime --require-live`

PC restart needed:

- first try service restart
- if Windows itself is unhealthy, owner approves reboot
- after boot, NSSM should start the service and watchdog should verify it

## Owner Gates

The owner must approve:

- final team opening
- firewall inbound rule for LAN HTTP
- NSSM installation or update on the company PC
- enabling watchdog `-AllowReboot`
- Tailscale Funnel or public internet exposure
