# Buzz collection lane (`buzz_history`) — the relay Tributary

Read-only Buzz relay collector for the Main Node (HPP), scheduled every 15
minutes like the mail, Slack and Linear lanes. It mirrors the operating
pattern of `guild_hall/linear_history/` (SHA-256-pinned private binding, exact
forbidden roots, writer authority/epoch fencing, fail-closed lease,
health-receipt-before-rejection, exact-runtime launcher, dry-run-first
Scheduled Task registrar, refs-only receipts, create-only content-addressed
custody) with the differences that follow from the relay being **local**
rather than a hosted API.

In the Soulforge naming, this lane is a **Tributary**: it carries relay **Ore**
into **Heartwood** as **Ingots**. It is not a **Reliquary** — collection is not
backup.

## Current posture

- Claim ceiling: **built and locally validated, observed**. Not
  production-ready, not activated.
- Nothing is registered on the Main Node by this change. There is no private
  binding, no runtime lane copy, and no Scheduled Task; those are Owner
  actions, in the activation order below.
- Human / Level-3 independent review has **not** been done.
- The lane issues no statement that can write. Every statement is a `SELECT`
  inside a session PostgreSQL itself holds read-only
  (`PGOPTIONS='-c default_transaction_read_only=on'`), and the lane test scans
  every `.mjs` and `.sh` source for write-statement shapes.
- Collection is not backup. Backup generations, isolated restore and human
  acceptance remain owned by `guild_hall/backup_controller/`.

## What is different from the Linear lane

1. **No credential exists.** PostgreSQL is reached over the container's local
   socket with trust authentication, so there is nothing to store, load, or
   leak. The binding has **no `credentials` key**, and the registrar refuses a
   binding that declares one, that contains a Nostr secret key (`nsec1…`), or
   that contains a JWT-shaped value.
2. **Two reads per run, not a page loop.** One loopback `_liveness` GET and
   one bounded export process. There is no third channel into the relay.
3. **The transport stages, and the runner re-hashes.** The exporter writes four
   files into `<state_root>/staging/<run_id>` and prints a `buzz_export.v1`
   meta; the runner re-computes every file's SHA-256 against that meta, checks
   the declared row counts, validates every row's exact key set, and only then
   takes anything into custody. A staging directory is released only by a
   fully published run — a failed run keeps it as the only evidence of what
   was actually read.
4. **Two watermarks and a per-community audit sequence** replace the single
   `updatedAt` window: `received_at` for live rows, `deleted_at` for
   tombstones, `audit_log.seq` per community.
5. **No object index in state.** Dedup is the overlap re-read plus
   content-addressed create-only custody, so the state file cannot grow with
   the relay.

## Files

| File | Role |
| --- | --- |
| `buzz_collect_runner.mjs` | Binding contract, lane context, health-first fail-closed flow, lease, staging, export verification, row shapes, normalization, create-only custody, cursor, receipts, lane record |
| `buzz_collect_receipt.mjs` | Refs-only run receipt + cursor contract and validator (also imported by the path_registry adapter) |
| `buzz_wsl_exporter.mjs` | Operational transport: loopback liveness probe, Windows→drvfs path translation, `wsl.exe` and exporter-script shape checks, the single export process, export-meta validation |
| `buzz_export.sh` | The read-only exporter that runs inside the WSL distribution; all SQL lives here |
| `buzz_custody.mjs` | Guarded private paths, atomic state writes, create-only content-digested objects, fail-closed lease |
| `buzz_collect_cli.mjs` | `--preflight` / `--apply` entrypoint, reachable only through the launcher attestation |
| `buzz_collect_launcher.mjs` | Exact-runtime launcher: Node sha pin, runtime manifest sha pin, full-tree inventory, `--verify-only` |
| `buzz_runtime_manifest_emitter.mjs` | Emits the source-lane copy (`install/source-lanes/buzz-collect-v1`) and its `runtime_manifest.json` |
| `buzz_synthetic_exporter.mjs`, `fixtures/synthetic_buzz_relay.json` | Recorded synthetic relay fixture and exporter for tests; no process, no network. **Not** runtime members |
| `ops/register-buzz-collect-hpp-task.ps1` | Scheduled Task registrar: dry-run plan digest, `-Register -ExpectedDryRunDigest`, `-ExpectedExistingTaskSha256`, launcher preflight, exported-XML attestation, rollback |
| `ops/run-buzz-collect-hidden.vbs` | Hidden window wrapper used by the registered action |
| `ops/test-register-buzz-collect-hpp-task.ps1` | Structural guard for the registrar |
| `../path_registry/src/buzz_source_lane_adapter.mjs` | Pure receipt -> `capture_generation` adapter for `source.buzz` |

## Binding contract (`soulforge.buzz_collect.binding.v1`)

Exact keys, all required. **There is no `credentials` key.**

| Key | Rule |
| --- | --- |
| `schema_version` | `soulforge.buzz_collect.binding.v1` |
| `feature_enabled` | must be `true`. `false` is a fail-closed rejection, not a pause: every scheduled run writes an `error` health receipt (`binding_feature_must_be_on`) and exits 1 until the binding is fixed or the task is disabled |
| `lane_id` | opaque safe ref, e.g. `hpp-buzz-collect` |
| `private_root` | absolute; must exist; disjoint from every forbidden root |
| `data_root` | absolute strict child of `private_root`; the Buzz custody root (`<data_root>/<relay_key>/…`); disjoint from `state_root` and every forbidden root |
| `state_root` | absolute strict child of `private_root` - or of `control_root` when that key is present; disjoint from `data_root` |
| `control_root` | **optional**; absolute; must exist; disjoint from `private_root` and from every forbidden root. Present only for the split-plane layout, where custody lives under the data root and lane state under the sibling control root. Absent, every path rule is exactly as before |
| `forbidden_roots` | >= 2 unique absolute roots; must contain the exact repository root and runtime root passed at run time |
| `writer.authority_id`, `writer.epoch` | safe ref + positive integer; persisted state is fenced to both |
| `relay.relay_key` | slug naming the custody subfolder, e.g. `relay-main`; one private root can hold several relays without mixing |
| `relay.liveness_url` | must match `^http://127\.0\.0\.1:\d+/_liveness$`. The probe is issued to the `127.0.0.1` literal, so no name lookup can move it off the host |
| `relay.wsl_executable` | absolute path whose basename is `wsl.exe`, outside every forbidden root; checked at run time to be an existing normal file that does not resolve through an alias |
| `relay.wsl_distro` | plain distribution name, e.g. `BuzzServer` |
| `relay.mount_prefix` | single-segment absolute drvfs prefix, `/mnt` |
| `relay.postgres_container` | plain container name, e.g. `buzz-prod-postgres-1` |
| `relay.db_name`, `relay.db_user` | unquoted PostgreSQL identifiers (`^[a-z_][a-z0-9_]{0,62}$`) |
| `cursor.overlap_seconds` | 0..86400 re-read overlap below each watermark (300 recommended) |
| `cursor.initial_received_at` | `null` (from the beginning of the relay) or the first `received_at` lower bound |
| `cursor.row_limit` | 1..50000 rows per stream per run |
| `cursor.timeout_ms` | 1000..300000 for the single export process; must not exceed `cursor.run_deadline_ms` |
| `cursor.run_deadline_ms` | optional; 1000..540000, default 480000 (8 minutes). It must stay below the registrar's `PT10M` `ExecutionTimeLimit` so the receipt/state/health/lease writes always finish inside the task limit |

The tracked public-safe sample is
`docs/architecture/workspace/examples/buzz_collect_lane/buzz_collect.binding.example.json`;
the lane test binds its placeholders and validates it.

## Private state and custody layout

```text
<state_root>/
  leases/buzz-collect.lock              # fail-closed writer lease (never auto-removed)
  staging/<run_id>/                     # one run's export; removed only by a fully published run
  state/buzz-collect.json               # cursor + generation_seq; fenced to lane identity + writer
  health/buzz_collect.json              # soulforge.buzz_collect.health.v1, written first on every run
  receipts/<run_id>.json                # soulforge.buzz_collect.run_receipt.v1 (refs-only, create-only)
  receipts/<run_id>.lane_record.json    # nine-key capture_generation for source.buzz
<private_root>/ingress/buzz/<relay_key>/
  events/<event_id_hex>/<sha256>.json       # one file per observed live event revision
  tombstones/<event_id_hex>/<sha256>.json   # soft-deleted rows, full projection (see below)
  audit/<run_id>/<sha256>.json              # that run's new audit_log rows, one immutable bundle
  snapshots/<relay_key>/<sha256>.json       # whole-table relay shape; identical bytes are a no-op
```

Every custody file is a canonical JSON object
`{schema_version, kind, object_id, content_sha256, object}` named by the
content digest. Identical bytes are a no-op; different bytes at the same path
fail closed as `custody_digest_conflict`; nothing is overwritten or deleted.

**Tombstones carry the same full row projection as live events on purpose.**
An event created and soft-deleted between two runs would otherwise never have
its bytes captured at all. The duplication is bounded (the relay's whole
`content` column was 3.2 MB at 2,282 rows) and losing the row is worse.

**The community `signing_key` is removed inside PostgreSQL** (`to_jsonb(t) -
'signing_key'`), so it never leaves the database, never reaches the staging
directory, and never reaches custody.

Encrypted and private wrapper kinds (1059, 30300, 30350, 30622, 44100, 44101,
44200) are opaque to the lane and are copied through as-is. The lane does not
attempt to decrypt anything and holds no key that could.

### Canonical-domain normalization

Custody digests admit only safe integers and NFC strings, so every exported
value is brought into that domain before it is hashed: strings are
NFC-normalized (canonically equivalent to the relay bytes), and any number a
JSON parser cannot round-trip exactly — a fraction, or an integer beyond
2^53 — becomes its decimal string. The exporter already casts the relay's
known `bigint` columns (`not_before`, `delivered_at`, `audit_log.seq`) to text
for the same reason. The residual limit is honest and worth stating: a
**whole-table snapshot** column whose schema the lane does not pin could in
principle carry an integer beyond 2^53, and that value would be normalized
from an already-imprecise parse. No such column exists in the observed relay
schema.

## Delta capture

- **Live events**: `received_at > (watermark - overlap_seconds)`, ordered
  `received_at, id`, bounded by `cursor.row_limit`.
- **Tombstones**: `deleted_at > (deleted_watermark - overlap_seconds)`,
  ordered `deleted_at, id`, same bound.
- **Audit**: the exporter takes one `seq >= N` lower bound for every community
  (the least-advanced community's sequence plus one), and the runner then
  filters per community against `cursor.audit_seq_max` before publishing that
  run's new rows as one immutable bundle.
- **Snapshot**: the seven relay tables are re-read in full each run and
  deduplicated by content digest, so an unchanged relay shape costs nothing.
- **A watermark only ever advances to an instant the run actually observed.**
  With no rows, the prior watermark is kept. That means a row arriving with an
  earlier `received_at` than the wall clock can never be skipped by the
  cursor.
- `row_limit_reached` is recorded when any stream filled its limit; the next
  run resumes from the watermark this one reached.
- `export_truncated` is recorded when the limit was filled **and** neither
  watermark moved — the next run would read exactly the same page again.
  Treat it as a stall to investigate, not as a completed capture.
- Polling cannot prove hard deletes; every receipt carries
  `polling_cannot_prove_hard_deletes`.

## Run modes

| Mode | Effect |
| --- | --- |
| launcher `--verify-only` | verifies Node sha, manifest sha, and the exact runtime tree; no binding read |
| `--preflight` | resolves the binding context, checks every boundary, the `wsl.exe` shape, and that the runtime `buzz_export.sh` exists with LF line endings; no process, no network, no private writes |
| `--apply` | full collection; writes custody, receipts, state, health |

Both CLI modes require the launcher attestation and the exact registered
arguments: `--repository-root`, `--runtime-root`, `--binding`,
`--expected-binding-sha256`, `--state-root`.

The exporter can also be inspected directly inside the distribution before the
lane is ever registered:

```bash
# read-only counts, writes nothing
MSYS_NO_PATHCONV=1 wsl -d <distro> --exec bash <drvfs_path_to>/buzz_export.sh \
  --run probe-1 --out-dir <existing_scratch_dir> --audit-seq-min 0 \
  --overlap-seconds 0 --limit 5 --container <container> \
  --db-name <db> --db-user <user> --dry-run
```

`MSYS_NO_PATHCONV=1` is required when calling `wsl` from Git Bash, otherwise
MSYS rewrites the drvfs arguments into Windows paths before the distribution
ever sees them.

Health codes worth watching: `private_json_digest_mismatch` (binding drifted),
`binding_feature_must_be_on`, `required_forbidden_root_missing`,
`lease_unavailable` (abandoned lock; manual recovery only),
`relay_liveness_unavailable`, `exporter_script_crlf`, `wsl_path_unsupported`,
`export_process_timeout`, `export_digest_mismatch`, `export_row_count_mismatch`,
`custody_digest_conflict`.

## Activation order (Main Node; Owner actions, not yet executed)

1. Emit the runtime lane: `node guild_hall/buzz_history/buzz_runtime_manifest_emitter.mjs --source-root <repo> --target-root <TARGET_SOULFORGE_ROOT>\install\source-lanes\buzz-collect-v1 --write`.
2. Owner writes the private binding at `<private_root>\config\buzz_history\buzz_collect.binding.json`. No credential file is needed or permitted.
3. Compute the binding, manifest, and Node SHA-256 values; run the registrar without `-Register` (dry-run, plan digest).
4. `--preflight` through the launcher with the exact registered arguments (the registrar does this itself before planning).
5. Run the registrar with `-Register -ExpectedDryRunDigest <digest>` (and `-ExpectedExistingTaskSha256` when replacing) — **after Owner approval**.
6. First `--apply` happens on the next 15-minute trigger; check `health/buzz_collect.json` and the first receipt.
7. Record the activation under `local-recovery\buzz-collect-activation-<date>\RECEIPT.md`; public documents cite digests and refs only.

## Rollback

- Scheduled Task: the registrar restores the exact prior exported XML or
  removes the new task when attestation fails; a failed rollback leaves the
  task disabled. Manual rollback is `Disable-ScheduledTask` /
  `Unregister-ScheduledTask` on `Soulforge-HPP-Buzz-Collect`.
- Code: `git revert` of this module only; the runtime lane copy is versioned
  (`buzz-collect-v1`) and the manifest sha pins it.
- Data: custody and receipts are create-only; nothing needs to be undone.
  Deleting them is an Owner decision, not a lane action.

## Boundary

- Read-only: no mutation, no relay writer, no event publication, no
  channel/member change, no key of any kind.
- Never touches the Buzz controller (`<buzz_root>\server`), its backup
  directories, or its Scheduled Tasks.
- Collection is not backup: no backup generation, restore, or acceptance
  record is produced.
- Not project truth: custody is source observation. It does not create,
  complete, or promote ERP tasks or knowledge.

## Validation

```powershell
npm.cmd run validate:buzz-collect            # pure Node on every platform: syntax checks + lane and adapter tests
npm.cmd run validate:buzz-collect:windows    # win32 only: PowerShell structural guard for the registrar
```
