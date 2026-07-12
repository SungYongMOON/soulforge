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
- Runtime supplemental data: `<runtime-root>\DATA`
- NAS backup root: `<nas-root>`
- Additive runtime-data backup: `<nas-root>\RUNTIME_DATA_BACKUP`
- Canonical DB backup namespace: `<nas-root>\01_db_backups`
- Restore-test reports: `<nas-root>\02_restore_tests`
- Coherent Codex payload generations: `<nas-root>\03_codex_payload_backups`
- Coherent Codex restore verification: `<nas-root>\04_codex_payload_restore_tests`

Do not run the live DB directly from the NAS. Keep the live DB local to the
company PC, then back it up to the NAS with SQLite-safe tooling.

## States

`healthy`: `/api/health` returns `ok=true`, audit has no blockers, and recent
DB backup/restore-test evidence plus the latest committed Codex payload
generation's matching restore verification exist.

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

First pre-provision `dev-erp` and `dev-erp-codex-worker` with distinct,
owner-approved non-SYSTEM Windows identities. Configure each service's required
environment through the approved ACL-restricted service secret store. Then bind
the already provisioned services to the reviewed entrypoints from an elevated
PowerShell window:

```powershell
<runtime-root>\ui-workspace\apps\dev-erp\ops\configure-dev-erp-codex-nssm.ps1 -RuntimeRoot <runtime-root> -HostName 127.0.0.1 -Port 4300
nssm start dev-erp-codex-worker
nssm start dev-erp
```

The configurator deliberately does not create identities or read/write secret
environment values. The old `install-dev-erp-nssm.ps1` is blocked unless
`-DevelopmentOnly` is supplied and must not be used for production.

NSSM responsibilities:

- start on Windows boot
- restart the Node process when it exits
- write service stdout/stderr logs under `logs\service`
- keep runtime environment knobs together with the service

Run the ERP HTTP/mail service and Codex worker as two services under different
Windows identities. The ERP identity owns the DB, mail settings, and service
payload roots but receives no team-share ACL. The Codex worker identity owns a
dedicated `DEV_ERP_CODEX_HOME`, receives read ACL only on approved shares and
write ACL only on separately approved output subfolders, and receives no ERP
DB/mail/private-state ACL. It also receives read-only ACL on the Soulforge-owned
attachment root so verified attachments can be supplied to Codex. Do not point either service at an owner's personal
Codex home. Production worker skills are always disabled. Its home and workspace
root must not contain `.codex`, `AGENTS.md`, `AGENTS.override.md`, hooks, plugins,
marketplaces, rules, or `config.toml`. Direct in-process app-server mode is
development-only.

Start and supervise the worker before starting ERP. The following shows service
environment names; inject the token from an ACL-restricted Windows service
secret store and never place its value in a command line, repo file, DB, or log.
Generate exactly 32 random bytes once, encode them as canonical unpadded
base64url (43 characters), write the value directly to the approved service
secret store without printing it, inject the same secret into both services,
and clear the generation variable. The worker rejects every other token shape.

```powershell
# Dedicated Codex worker Windows identity
$env:DEV_ERP_CODEX_WORKER_HOST="127.0.0.1"
$env:DEV_ERP_CODEX_WORKER_PORT="4391"
$env:DEV_ERP_CODEX_WORKER_BRIDGE="app-server"
$env:DEV_ERP_CODEX_WORKER_TOKEN="<32-byte-base64url-HMAC-HKDF-key>"
$env:DEV_ERP_CODEX_WORKER_REF_KEYS_JSON='{"active_kid":"2026q3","keys":{"2026q3":"<32-byte-base64url>"}}'
$env:DEV_ERP_CODEX_WORKER_ATTEST_PRIVATE_KEY_FILE="<worker-only-ed25519-private-key.pem>"
$env:DEV_ERP_CODEX_HOME="<codex-worker-home>"
$env:DEV_ERP_CODEX_WORKSPACE_REGISTRY="<runtime-root>\ui-workspace\apps\dev-erp\data\codex-workspaces.runtime.json"
$env:DEV_ERP_CODEX_TRUST_DOMAIN="<trust-domain-id>"
$env:DEV_ERP_CODEX_TASK_ATTACHMENT_ROOT="<soulforge-root>\_workspaces\system\dev-erp\codex-task-attachments"
$env:DEV_ERP_CODEX_MESSAGE_PAYLOAD_ROOT="<soulforge-root>\_workspaces\system\dev-erp\codex-message-payloads"
$env:DEV_ERP_CODEX_WORKER_EXPECTED_RUNTIME_IDENTITY_SHA256="<owner-approved-codex-runtime-sha256>"
npm.cmd run dev-erp:codex-worker
```

Before setting that expected value, run the following metadata-only command under
the worker identity and owner-approve the aggregate 64-hex result. It exposes no
runtime path or component hash. On every Codex update, stop the worker, recompute
the value, rerun the exact-path permission probe, approve the new value, and only
then restart both services.

```powershell
node ui-workspace/apps/dev-erp/tools/codex_dedicated_worker.mjs --codex-runtime-identity-fingerprint
```

Run `codex login status` as that worker identity. Compute its expected identity
proof once as `SHA-256(utf8(lowercase(whoami name) + NUL + uppercase(SID)))` and
store only that expected hash in the ERP service's private configuration. The
audit reports only configured/match booleans, never the hash, identity name, or
token.

```powershell
# ERP HTTP/mail Windows identity
$env:DEV_ERP_CODEX_TASK_BRIDGE="worker"
$env:DEV_ERP_CODEX_WORKER_URL="http://127.0.0.1:4391"
$env:DEV_ERP_CODEX_WORKER_TOKEN="<same-32-byte-base64url-HMAC-HKDF-key>"
$env:DEV_ERP_CODEX_WORKER_EXPECTED_IDENTITY_HASH="<expected-worker-identity-sha256>"
$env:DEV_ERP_CODEX_WORKER_EXPECTED_RUNTIME_IDENTITY_SHA256="<same-owner-approved-codex-runtime-sha256>"
$env:DEV_ERP_CODEX_WORKER_ATTEST_PUBLIC_KEY_FILE="<erp-readable-ed25519-public-key.pem>"
$env:DEV_ERP_CODEX_WORKER_EXPECTED_ATTESTATION_KEY_ID="<approved-public-key-sha256>"
$env:DEV_ERP_BACKEND_ROOT="<soulforge-root>"
$env:DEV_ERP_CODEX_WORKSPACE_REGISTRY="<runtime-root>\ui-workspace\apps\dev-erp\data\codex-workspaces.runtime.json"
$env:DEV_ERP_CODEX_TRUST_DOMAIN="<trust-domain-id>"
$env:DEV_ERP_CODEX_TASK_ATTACHMENT_ROOT="<soulforge-root>\_workspaces\system\dev-erp\codex-task-attachments"
$env:DEV_ERP_CODEX_MESSAGE_PAYLOAD_ROOT="<soulforge-root>\_workspaces\system\dev-erp\codex-message-payloads"
node ui-workspace/apps/dev-erp/server.mjs --host 127.0.0.1 --port 4300
```

Pass the same approved runtime fingerprint to release audit as
`--codex-worker-expected-runtime-identity-sha256 <sha256>`.

The token value is never sent over HTTP. It is a shared HMAC key for timestamped,
nonce-bound request and response authentication; real operations also consume a
one-time channel nonce signed by the worker. Request and response JSON for those
operations is encrypted with AES-256-GCM using an HKDF-SHA256 key derived from
the HMAC key and signed channel; redirects are rejected. The worker encrypts real Codex thread
IDs into `dwr2.<kid>.*` refs with a separate AES-256-GCM keyring, so HMAC-key
rotation does not invalidate existing refs. Rotate a ref key by adding
the new key as `active_kid` while retaining the previous key, restarting the
worker, and removing the previous key only after every retained binding has been
reissued. If the ref keyring is lost, retire affected bindings and open new
threads; never fall back to in-process execution or another workspace.

Keep the Ed25519 private key and ref keyring readable only by the worker service.
ERP receives only the public key, approved public-key fingerprint, shared HMAC key,
expected worker identity hash, and owner-approved aggregate Codex runtime hash. Do not inherit the private key or ref keyring
into the ERP process. Back up the keyring and attestation private key only in the
owner-approved secret backup system; the repository, SQLite DB, `_workmeta`, and
ordinary NAS payload backup must contain pointers or fingerprints only.

Before and after every real turn, ERP requests a fresh signed nonce and requires
the same signed worker PID, identity, pinned Codex runtime, source commit, port, Codex-home boundary,
attachment boundary, and key. Any mismatch makes the turn fail before its result
is persisted.

The worker also forces the `dev_erp_bounded` named Codex permission profile:
deny the disk by default, read only the exact workspace and verified attachment
paths, write only approved existing output roots, and disable network. Startup
runs exact-path probe v3 and verifies workspace reads, approved-output writes,
unapproved workspace write denial, exact attachment read-only access, sibling and
parent-listing denial, outside-root read/write denial, junction/hardlink denial,
and attachment delete/move denial. It refuses app-server
mode with `worker_permission_boundary_unproven` unless every check passes. The
live release audit requires the signed profile and runtime revisions and
probe result. Codex 0.144.1 on the current development PC does not pass this
native-Windows read-denial probe, so do not deploy there; use a team PC/backend
and each real UNC mapping that pass the worker-identity sentinel preflight.
WSL/container is not a currently implemented fallback profile.

Run this under the worker identity before starting services. It emits only a
metadata-only verdict and must return `proven:true`:

```powershell
npm.cmd run dev-erp:probe-codex-permission-boundary
```

Enabled workspace roots must also pass lexical and realpath isolation. Junction,
share-alias, same-filesystem-object, and parent/child overlaps are rejected. The
UNC check runs in a bounded child that receives paths only over stdin; an offline
share timeout is fail-closed and does not block the ERP event loop indefinitely.
Enabled roots cannot mix local and UNC authorities; an UNC registry uses one
case-folded server/share namespace. Roots are recursively metadata-scanned for
protected names and link/reparse/hardlink evidence. This scan does not replace
SMB/NTFS ACLs that prevent mutation during a turn or an immutable projection.

Ed25519/HMAC/ref keys and the two service identities remain owner provisioning
inputs. This repository intentionally does not print or persist generated secrets.
Do not mark deployment ready until the owner-selected secret store paths and ACLs
are verified and the fingerprint-only commands above pass.
If any enabled workspace is UNC, pass a fresh metadata-only receipt through
`--codex-share-boundary-receipt`. The release audit rejects a missing, stale, raw-field,
wrong-registry, wrong-worker, non-v3, non-overlap, ADS-uncleared, or mutation-uncontrolled receipt.

Use `127.0.0.1` plus HTTPS/Tailscale for the default tunnel-only posture.
Use `0.0.0.0` only for owner-approved trusted LAN HTTP, and pass
`-CookieSecure 0` for that HTTP-only pilot so login cookies work.

## Watchdog

`ops/dev-erp-watchdog.ps1` is a one-shot health and recovery script. Run it
from Task Scheduler every 1 minute during the pilot.

It does this:

1. check `http://127.0.0.1:4300/api/health` and require the separate worker,
   signed attestation, distinct identity, and filesystem boundary to be ready
2. if healthy, reset failure count
3. if unhealthy, restart or start `dev-erp-codex-worker` first, then `dev-erp`
4. fail closed when either service is missing; there is no single-process fallback
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
npm.cmd run dev-erp:audit-runtime -- --source-root <soulforge-root> --runtime-root <runtime-root> --workspaces <soulforge-root>\_workspaces --nas-root <nas-root> --workspace-registry <runtime-root>\ui-workspace\apps\dev-erp\data\codex-workspaces.runtime.json --codex-home <codex-worker-home> --codex-trust-domain <trust-domain-id> --codex-worker-url http://127.0.0.1:4391 --codex-worker-expected-identity-sha256 <expected-worker-identity-sha256> --expected-commit <approved-40-char-sha> --require-live --target-members 0
```

Use `--target-members <n>` after team accounts are created. Add
`--allow-lan-http` only after the owner approves direct LAN HTTP exposure.

`--require-live` is fail-closed: it rejects `--skip-git`, `--skip-nas`, and
`--no-nas`. It also requires
`<runtime-root>\ui-workspace\apps\dev-erp\data\codex-workspaces.runtime.json`.
The audit validates the complete v1 registry contract, including non-empty
`allowed_project_ids`, read-only default access, and bounded local/UNC roots.
It then probes every enabled root with asynchronous directory checks, an
approximately 1.5 second per-root timeout, and at most eight concurrent probes.
Offline and timed-out roots block release. Results contain only logical
workspace IDs, counts, status, and fixed error codes; raw local/UNC roots are
never copied into the audit result. Disabled rows are contract-validated but
are not availability-probed until enabled.

The live worker gate is also fail-closed. `/api/health` must attest
`codex_execution_boundary=dedicated_worker`, worker ready, the audited worker
release, expected identity match, a process separate from ERP, the same
registry revision, and `bridge_mode=app-server`. The audit accepts the worker
URL only as exact `http://127.0.0.1:<port>` and never emits identity/token data.

## Codex Model And Turn Smoke

Run this under the dedicated Codex worker Windows identity, not the ERP
HTTP/mail identity. Do not
copy Codex auth files, cookies, tokens, or API keys into the ERP repo, DB,
registry, command line, or review log.

```powershell
codex login status
```

Then sign in to ERP with a synthetic operator account and open the synthetic
task used for this smoke. The item-scoped authenticated
`/api/codex-task/capabilities?item_id=<synthetic-item-id>` response must report
`model_catalog_source=codex_app_server` and at least one `gpt-5.6*` slug when
that family is available to the runtime account. Do not copy the session cookie
into a shell command or review log; inspect the response in the authenticated
browser session.

Bind the task only after explicitly selecting an approved read-only workspace,
select the discovered GPT-5.6 model, and send one bounded turn that does not
request a write. Record only timestamp, logical workspace ID, model slug,
catalog source, and turn success/failure. Do not record the prompt body,
response body, raw workspace root, attachment path, or auth state. A GPT-5.5
fallback can keep the UI usable, but it does not satisfy a GPT-5.6 rollout
claim.

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

Release-grade Codex backup is one coherent generation across the SQLite DB,
immutable message payload objects, and attachment manifests/files. A DB-only
backup does not satisfy this gate. Before creating the generation, create
`logs\maintenance.lock`, stop both the ERP service and the dedicated Codex
worker, and confirm no turn or attachment write can begin. Then run:

```powershell
npm.cmd run dev-erp:backup-codex-payloads -- --db <runtime-root>\ui-workspace\apps\dev-erp\data\dev-erp.db --attachment-root <soulforge-root>\_workspaces\system\dev-erp\codex-task-attachments --message-root <soulforge-root>\_workspaces\system\dev-erp\codex-message-payloads --backup-root <nas-root>\03_codex_payload_backups
```

Record only `generation_id` and `manifest_sha256` from the metadata-only JSON
result. Verify that exact generation into the separate restore-test namespace:

```powershell
npm.cmd run dev-erp:restore-verify-codex-payloads -- --backup-root <nas-root>\03_codex_payload_backups --generation-id <cpb-generation-id> --restore-root <nas-root>\04_codex_payload_restore_tests
```

The verifier must finish with the same manifest SHA-256 and publish
`RESTORE_VERIFIED` before the maintenance boundary can be used for release or
rollback. Do not restart either service between backup and restore verification.
The `--require-live` audit selects the newest `COMMITTED` generation, validates
its bounded v1 manifest and hash marker, rejects evidence older than the live
DB/WAL state, and requires the matching restore marker. Audit output keeps only
the logical generation ID, hashes, counts, sizes, timestamps, and status.

Pilot schedule:

- 07:00 daily DB backup and restore-test, before people arrive
- every 15 minutes during pilot service hours while early team data is changing
- before maintenance, reboot, Git pull, runtime update, or schema/data patch
- at each release/rollback boundary, a maintenance-locked coherent Codex
  payload generation and restore verification
- 02:00 workspace/NAS mirror job, separate from DB backup

Retention target:

- 15-minute pilot backups: keep at least 48 hours
- daily 07:00 backups: keep at least 30 days
- weekly snapshots: keep at least 12 weeks

The `latest/runtime_live` copy is for quick restore. Scheduled stamped backup
folders are the history.

The `DATA` backup is additive and copy-only. It does not replace the existing
SQLite-safe DB backup, restore test, coherent Codex payload backup, workspace
mirror, workmeta backup, or release backup. Do not use delete, purge, or mirror
semantics. Secrets, Codex home/auth material, private keys, and the live SQLite
DB must not enter this backup. Preserve the previous runtime checkout as rollback
until the new runtime path, DATA copy, DB restore, and ERP health checks pass and
the owner separately approves cleanup.

Run the bounded copy helper manually or from a dedicated scheduled task:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File <runtime-root>\ui-workspace\apps\dev-erp\ops\backup-runtime-data.ps1 -Source <runtime-root>\DATA -Destination <nas-root>\RUNTIME_DATA_BACKUP -Json
```

## Update Procedure

1. Confirm the development patch is committed, pushed, and independently
   reviewed. Record the currently deployed commit as `<old-commit>`.
2. Create the maintenance marker and stop the `dev-erp` service or Node process
   so no new write begins during the release boundary.
3. While both services remain stopped, create a WAL-safe DB backup and a
   coherent Codex payload generation, run both restore verifiers, and retain
   their exact refs/hashes as `<pre-update-backup>`. Do not use a raw live DB
   copy or a DB-only backup for a release that contains Codex turns.
4. Pull the approved commit into `<runtime-root>` and confirm the runtime
   checkout is clean.
5. Run the owner-approved legacy Codex migration dry-run. Apply only after its
   explicit item/workspace map is complete and the DB+payload backup generation
   has passed restore verification. Then start the new ERP and worker code once;
   do not open the migrated DB with two code versions at once.

   ```powershell
   npm.cmd run dev-erp:migrate-legacy-codex -- --db <runtime-root>\ui-workspace\apps\dev-erp\data\dev-erp.db --payload-root <soulforge-root>\_workspaces\system\dev-erp\codex-message-payloads --mapping <owner-approved-mapping.json>
   npm.cmd run dev-erp:migrate-legacy-codex -- --db <runtime-root>\ui-workspace\apps\dev-erp\data\dev-erp.db --payload-root <soulforge-root>\_workspaces\system\dev-erp\codex-message-payloads --mapping <owner-approved-mapping.json> --apply
   ```

   The first command is read-only. The second must perform exactly the reviewed
   bind/retire decisions; any unmapped legacy row remains a release blocker.
6. Run health, the zero-blocker `--require-live` audit, and the Codex model/turn
   smoke above.
7. Run a post-update backup and restore-test only after all release checks pass.
8. Remove the maintenance marker and reopen team traffic.

## Failed Update Rollback

If startup, migration, audit, or the required Codex smoke fails:

1. Keep the maintenance marker in place and stop the service/process.
2. Preserve the failed DB plus its `-wal` and `-shm` sidecars in a separate
   quarantine folder for diagnosis; never merge those sidecars into a backup.
3. Return the runtime checkout to the recorded `<old-commit>`.
4. Restore the verified `<pre-update-backup>` as the live `dev-erp.db` while the
   service is stopped. The restored DB and old code must come from the same
   pre-update boundary; do not run old code against the newly migrated DB.
5. Run SQLite integrity/foreign-key checks or the approved restore verifier,
   then start the old code.
6. Run health and the release audit appropriate to `<old-commit>`. Remove the
   maintenance marker only after the previous service state is restored.

Record the old commit, backup ref/hash, failed check code, rollback health
result, and operator identity. Do not record DB contents, mail bodies, raw
workspace roots, secrets, or Codex auth material.

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
