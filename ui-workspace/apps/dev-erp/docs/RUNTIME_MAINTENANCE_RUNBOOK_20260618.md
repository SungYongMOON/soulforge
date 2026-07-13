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
- Sole logical project body: `<soulforge-root>\_workspaces\<project>`
- Durable Codex payloads: `<soulforge-root>\_workspaces\system\dev-erp\codex-{task-attachments,message-payloads}`
- Disposable worker data: `<worker-root>\{workspace-projections,turn-projections}`
- Runtime supplemental data only: `<runtime-root>\DATA` (never project truth or Codex payloads)
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
dedicated `DEV_ERP_CODEX_HOME`, a sanitized static workspace projection, and the
single-active turn projection. It receives no ERP DB/mail/private-state or
canonical Soulforge payload-root ACL. The ERP service verifies selected attachments
and copies only those files into the turn projection. Do not point either service at an owner's personal
Codex home. Production worker skills are always disabled. Its home and workspace
root must not contain `.codex`, `AGENTS.md`, `AGENTS.override.md`, hooks, plugins,
marketplaces, rules, or `config.toml`. Direct in-process app-server mode is
development-only.

Start and supervise the worker before starting ERP. The following shows service
environment names; inject the token from an ACL-restricted Windows service
secret store and never place its value in a command line, repo file, DB, or log.
The legacy ERP launchers do not yet enforce this worker-first dependency by
themselves. Until an attached readiness-gated launcher is implemented and
reviewed, keep ERP stopped whenever the worker probe or attestation is not ready.
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
$env:DEV_ERP_CODEX_TURN_PROJECTION_ROOT="<worker-root>\turn-projections"
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
the value, rerun the turn-projection permission probe, approve the new value, and only
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
$env:DEV_ERP_CODEX_TURN_PROJECTION_ROOT="<worker-root>\turn-projections"
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
projection-root boundary, denied-root revision, and key. Any mismatch makes the turn fail before its result
is persisted. The signed, pathless `payload_deny_binding_revision` must also equal
the revision that ERP independently computes from the exact effective canonical
attachment and message lexical roots. Neither calculation stats or reads those roots;
a valid signature over a different binding still fails closed.

The worker also forces the `dev_erp_bounded` named Codex permission profile:
deny the disk by default, explicitly deny canonical payload roots and the worker
parent, reopen only the static sanitized cwd and current projected files, and
disable network. The first production slice rejects every write grant. Startup
runs turn-projection probe v4 and verifies workspace read, bounded write carveout,
source attachment and other-projection read denial, projection mutation denial,
junction/hardlink denial, and network denial. It refuses app-server
mode with `worker_permission_boundary_unproven` unless every check passes. The
live release audit requires the signed profile and runtime revisions and
probe result. Codex 0.144.1 on the current development PC does not block the
source read from a shell subprocess, so probe v4 fails and the runtime must stay
off. Do not deploy until the real worker identity's NTFS/SMB ACL and the same probe
both pass.
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
The turn-projection root must be a plain local directory, globally single-active,
empty before and after each turn, and excluded from backup as rebuildable data.

Ed25519/HMAC/ref keys and the two service identities remain owner provisioning
inputs. This repository intentionally does not print or persist generated secrets.
Do not mark deployment ready until the owner-selected secret store paths and ACLs
are verified and the fingerprint-only commands above pass.
If any enabled workspace is UNC, pass a fresh metadata-only receipt through
`--codex-share-boundary-receipt`. The release audit rejects a missing, stale, raw-field,
wrong-registry, wrong-worker, non-v4, non-overlap, ADS-uncleared, or mutation-uncontrolled receipt.

Use `127.0.0.1` plus HTTPS/Tailscale for the default tunnel-only posture.
Use `0.0.0.0` only for owner-approved trusted LAN exposure, with direct TLS
preferred. For an approved HTTP-only pilot, pass `-CookieSecure 0` on the
NSSM/watchdog surfaces; with the background launcher below, pass `-ListenOnLan`
and omit `-SecureCookie` so login cookies work.

## Launcher safe default

`ops/run-dev-erp-background.ps1` is a bounded launcher, not a full team-release
approval. It returns after attested spawn by default; `-Foreground` keeps the
wrapper alive until Node exits and returns Node's exit status. With no switches
it binds `127.0.0.1`, uses stub chat,
disables scheduled mail collection, auto-intake, autosync, morning brief,
fixture loading, real-metadata ingest, file I/O, and self-registration, and
keeps Codex in unconfigured worker mode so it cannot fall back to in-process
execution. Before launch it removes inherited dev-ERP/integration/Codex values,
Node injection and proxy/CA overrides, and generic credential-like environment
names. Only the selected integration's bounded settings are restored;
`-EnableCodexWorker` restores the documented dedicated-worker variables but not
mock variables or generic `CODEX_HOME`. Run a side-effect-free preflight first:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File <runtime-root>\ui-workspace\apps\dev-erp\ops\run-dev-erp-background.ps1 -DryRun
powershell.exe -NoProfile -ExecutionPolicy Bypass -File <runtime-root>\ui-workspace\apps\dev-erp\ops\run-dev-erp-background.ps1
```

For a Tailscale Serve HTTPS front end, include `-SecureCookie` in both commands:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File <runtime-root>\ui-workspace\apps\dev-erp\ops\run-dev-erp-background.ps1 -SecureCookie -DryRun
powershell.exe -NoProfile -ExecutionPolicy Bypass -File <runtime-root>\ui-workspace\apps\dev-erp\ops\run-dev-erp-background.ps1 -SecureCookie
```

For owner-approved direct LAN HTTPS with the certificate and private key in
separate runtime locations, pass the paths explicitly. Run the dry-run first;
it reports `tls=explicit` without reporting any path. Direct in-app TLS enables
secure cookies automatically, so do not add `-SecureCookie` merely for this mode:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File <runtime-root>\ui-workspace\apps\dev-erp\ops\run-dev-erp-background.ps1 -ListenOnLan -TlsCertPath "<certificate-root>\server.crt" -TlsKeyPath "<protected-key-root>\server.key" -TlsCaPath "<certificate-root>\ca.crt" -DryRun
powershell.exe -NoProfile -ExecutionPolicy Bypass -File <runtime-root>\ui-workspace\apps\dev-erp\ops\run-dev-erp-background.ps1 -ListenOnLan -TlsCertPath "<certificate-root>\server.crt" -TlsKeyPath "<protected-key-root>\server.key" -TlsCaPath "<certificate-root>\ca.crt"
```

Preflight never stops a process based on a port or PID alone. It replaces a
listener only when `node.exe`, the absolute runtime `server.mjs` path, and the
entire expected command line match. An old relative-path launcher process, a
different checkout, or any process whose executable/command line cannot be
read remains alive and blocks startup. Use `-Port <alternate-port> -DryRun` for
diagnostics without touching the runtime listener. After spawn, success is
reported only when that retained process is the sole listener on the requested
port and its executable plus full argv still match. If attestation fails, the
launcher terminates only its retained spawned-process handle; an unexpected
listener remains alive.

Every integration is explicit opt-in:

- `-ListenOnLan`: bind `0.0.0.0`; requires the existing owner exposure gate.
- `-SecureCookie`: force the session cookie's `Secure` attribute when the
  loopback listener is behind Tailscale Serve or another approved HTTPS
  termination proxy. Direct in-app TLS enables it automatically. Do not use
  this switch for direct plain-HTTP LAN access.
- `-TlsCertPath <file> -TlsKeyPath <file> [-TlsCaPath <file>]`: resolve existing
  files and append exact `--tls-cert`, `--tls-key`, and optional `--tls-ca`
  server argv. Certificate and key are a required pair, and CA is accepted only
  with that pair. `tls=explicit` means the cert/key pair was supplied. The
  launcher neither reads the key content nor reports these paths.
- `-EnableLocalLlm`: enable the local Ollama chat provider.
- `-EnableMailCollect [-MailCollectSeconds 900]`: enable scheduled mail collection.
- `-EnableAutoIntake`: enable the post-collection intake hook; requires `-EnableMailCollect`.
- `-EnableAutosync`: enable ledger/ERP bidirectional autosync.
- `-EnableMorningBrief -MorningBriefPublicUrl <url> -MorningBriefDomainAllow <domain>`:
  enable outbound morning brief scheduling with explicit public URL and domain.
- `-EnableCodexWorker`: pass the already provisioned worker environment through.
  Missing or invalid worker configuration remains fail-closed; this switch does
  not authorize in-process Codex or satisfy the dedicated-worker release gate.

Do not combine these switches merely to reproduce the former broad launcher.
Enable only the reviewed integration set. Task Scheduler registration uses the
guarded current-user path below; service registration, firewall changes, and
worker-first supervision remain separate owner-approved operations. For
persistent direct LAN HTTPS, keep the same absolute TLS path
arguments in the Task Scheduler action, grant its execution identity read access
to the certificate/CA and narrowly scoped read access to the private key, and run
the same action with `-DryRun` before registration and after path or ACL changes.
Do not copy the key into the tracked checkout. Inherited `DEV_ERP_TLS_*` values
are scrubbed, so they are not a persistence substitute for these explicit args.

## Current-user Task Scheduler foreground registration

`ops/register-dev-erp-scheduled-task.ps1` is audit-only by default. It inventories
enabled actions before `-Register`, resolves canonical launcher and direct Node
actions to their DB, and refuses a same-DB match or any enabled dev-ERP backend
action whose DB cannot be resolved. It never infers an unresolved action is safe.

```powershell
$registrar = "<runtime-root>\ui-workspace\apps\dev-erp\ops\register-dev-erp-scheduled-task.ps1"
& $registrar -SecureCookie
& $registrar -SecureCookie -Register -WhatIf
& $registrar -SecureCookie -Register
```

The registered task uses the current Windows identity with `AtLogOn`,
`Interactive`, and `Limited`; it stores no credential and is not a boot or
pre-login service. Its action pins the default runtime DB explicitly and invokes
the launcher with `-Foreground`. `IgnoreNew`, a zero execution limit, and three
one-minute restart attempts keep one supervised wrapper and make restart depend
on Node's propagated exit status. Registration does not start the task immediately.

For handoff, first enter the normal maintenance/backup boundary. Stop the old
controller and its Node process, then disable (do not delete) its task. Rerun the
audit and register with the exact disabled task identity, for example
`-HandoffFromTaskId "\Legacy dev-ERP"`. Enabled conflicts cannot be overridden;
an existing target task is overwritten only when that exact disabled,
single-action, same-DB handoff is supplied. The helper never stops, disables, or
deletes another task/process and never opens the DB.

For rollback, stop and disable the new task, confirm its Node process no longer
owns the DB, and only then re-enable/start the retained old task. Never enable
both controllers together. This audit covers Task Scheduler actions, not NSSM,
services, or manually started processes; the launcher's exact port/process gate
remains the final runtime guard.

If another controller continuously owns and restores an HTTP backend at
`127.0.0.1:4300`, do not fight it or start a second ERP application process on
the same database. Bind the zero-dependency `ops/dev-erp-lan-https-proxy.mjs`
to one exact LAN IPv4 address on port 4300 and forward only to
`127.0.0.1:4300`. Distinct local addresses can share the port on Windows. The
proxy rejects wildcard/non-loopback upstream exposure, overwrites forwarding
headers, strips hop-by-hop fields, forces `Secure` on response cookies, and
does not log payloads or TLS paths. Register its exact Node command as a
foreground Task Scheduler Action; keep backend ownership in the existing
controller.

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

### Legacy pre-migration v2 backup

When any legacy inline message remains, the standard v1 command fails closed.
Keep both services and every writer stopped, then create and verify an explicit
v2 generation:

```powershell
npm.cmd run dev-erp:backup-codex-payloads-pre-migration -- --db <runtime-root>\ui-workspace\apps\dev-erp\data\dev-erp.db --attachment-root <soulforge-root>\_workspaces\system\dev-erp\codex-task-attachments --message-root <soulforge-root>\_workspaces\system\dev-erp\codex-message-payloads --backup-root <nas-root>\03_codex_payload_backups
node ui-workspace/apps/dev-erp/tools/codex_payload_backup.mjs pre-migration-restore-verify --backup-root <nas-root>\03_codex_payload_backups --generation-id <pre-migration-generation-id> --restore-root <nas-root>\04_codex_payload_restore_tests
```

v2 accepts complete externalized messages and pure legacy inline messages but
rejects partial or hybrid pointer state. Legacy bodies remain only in the
WAL-safe SQLite snapshot; the v2 manifest contains bounded metadata. This
generation proves a rollback boundary only and is never release-audit evidence.

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

The `DATA` backup is additive, optional, and copy-only. An empty `DATA` directory
is valid. Project files, durable Codex payloads, workspace projections, and turn
projections must never be placed there. This backup does not replace the existing
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
2. Create the maintenance marker and stop both `dev-erp` and the dedicated Codex
   worker so no new write begins during the release boundary.
3. While both services remain stopped, create a WAL-safe DB backup. If legacy
   inline messages remain, create the v2 pre-migration generation above and run
   its dedicated restore verifier. Record the DB backup ref/hash plus only the
   v2 generation ID and manifest hash together as `<pre-update-backup>`.
4. Pull the approved commit into `<runtime-root>` and confirm the runtime
   checkout is clean.
5. If the owner is considering retiring every incomplete binding, create a
   metadata-only candidate and pin the reviewed hash. This does not approve or
   apply the candidate.

   ```powershell
   npm.cmd run dev-erp:migrate-legacy-codex -- --plan-retire-all --db <runtime-root>\ui-workspace\apps\dev-erp\data\dev-erp.db --expected-count <owner-confirmed-legacy-binding-count>
   npm.cmd run dev-erp:migrate-legacy-codex -- --plan-retire-all --db <runtime-root>\ui-workspace\apps\dev-erp\data\dev-erp.db --expected-count <owner-confirmed-legacy-binding-count> --expected-candidate-sha256 <reviewed-candidate-sha256>
   ```

   Review candidate v2 `binding_project_mismatch_count` and every
   `observed_binding_project_id` / `binding_project_status` before pinning the
   hash. A valid stale binding project is evidence in the candidate, not
   approval to mutate it. If every other runtime binding field is complete,
   project mismatch still fails instead of becoming a retirement candidate;
   invalid project values also fail.

6. Run the owner-approved exact mapping as a dry-run. Apply only after it covers
   every legacy row and the v2 generation passed restore verification.

   ```powershell
   npm.cmd run dev-erp:migrate-legacy-codex -- --db <runtime-root>\ui-workspace\apps\dev-erp\data\dev-erp.db --payload-root <soulforge-root>\_workspaces\system\dev-erp\codex-message-payloads --mapping <owner-approved-mapping.json>
   npm.cmd run dev-erp:migrate-legacy-codex -- --db <runtime-root>\ui-workspace\apps\dev-erp\data\dev-erp.db --payload-root <soulforge-root>\_workspaces\system\dev-erp\codex-message-payloads --mapping <owner-approved-mapping.json> --apply
   ```

   The first command is read-only. The second must perform exactly the reviewed
   bind/retire decisions; any unmapped legacy row remains a release blocker.
7. Keep both services stopped and create a standard v1 coherent generation with
   its matching `restore-verify` marker. Only this post-migration v1 evidence can
   satisfy the release audit.
8. Start the new ERP and worker code once; do not open the migrated DB with two
   code versions at once. Run health, the zero-blocker `--require-live` audit,
   and the Codex model/turn smoke above.
9. Run a post-update DB backup and restore-test after all release checks pass.
10. Remove the maintenance marker and reopen team traffic.

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

A caught same-process migration failure rolls back the DB transaction and then
removes only the exact payload refs created by that invocation. If cleanup is
incomplete, treat `payload_cleanup_failed` as a blocker, keep the maintenance
marker, and do not retry or delete payloads manually. This guarantee does not
claim OS-crash recovery.

The item tag in a `cmp_` ref is the fixed 12-character base64url field directly
after the prefix; `_` and `-` inside that field are not separators. Deploying a
parser correction does not give a new process ownership of payloads left by an
earlier `payload_cleanup_failed`. Recover the verified v2 DB and matching
payload boundary before retrying unless an owner-approved procedure separately
identifies and quarantines the exact orphan set.

`pre-migration-restore-verify` validates an isolated restore namespace and never
overwrites the live paths. A real rollback must restore the verified v2 DB and
corresponding payload boundary together through an owner-approved procedure;
the old code and restored data must come from the same pre-migration boundary.

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
