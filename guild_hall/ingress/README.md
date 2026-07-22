# guild_hall/ingress

## Purpose

`ingress/` provides a bounded file-backed staging command and a fenced
continuous HPP supervisor. The staging command copies one explicitly named
regular file and now covers all five logical history lanes. Mail and voice use
dedicated `canary/incoming` subtrees so a bounded receipt cannot be confused
with the existing mail export or voice migration mirror. The supervisor drains
only private, explicitly bound outbox directories and can reuse the existing
voice copy-only mirror. Both surfaces remain source-preserving and unclassified;
neither is a project router, accepted-ingress promoter, ERP writer, MCP service,
knowledge promoter, or TaskEngine writer.

Before any legacy mail custody unification, the dry-run-only merge manifest CLI
accepts one explicitly named sanitized JSON descriptor. Records contain only
digest identities and a fixed source kind; mail bodies, previews, subjects,
addresses, attachment names, raw payloads, and source paths are not accepted.
It prefers `hpp_eml_current`, then `gateway_normalized_attachments`, then
`erp_legacy_body_preview`, then `metadata_only`. Exact event ID digests form a
future dedupe group. Exact provider ID digests do so only when each source kind
has no differing-event content conflict: distinct content digests or missing
content proof keep the entire provider group distinct and review-only.
Same-content duplicates and one-record-per-source-kind provider matches remain
eligible. A conservative fingerprint match is reported as ambiguous and is
never merged automatically.

```bash
npm run guild-hall:ingress:legacy-mail-merge-manifest -- \
  --input <one-explicit-sanitized-json-descriptor>
```

The command has no apply mode, does not search roots or read source payloads,
and writes only sanitized counts, digests, an action plan, and a no-copy/no-write
proof to stdout. It does not invoke a collector or change writer, scheduler,
MCP, promotion, or activation state.

For an actual private dry run, `legacy_mail_source_binding.schema.json` binds
only explicit absolute JSONL files: HPP normalized events plus one custody
index, gateway `EmailEvent` files, and ERP normalized mail files. The public
adapter reads only those files, verifies each file's before/after identity,
size, mtime, and SHA-256, converts identifiers and conservative matching values
to digests in memory, and calls the same merge-manifest builder.

```bash
npm run guild-hall:ingress:legacy-mail-bound-manifest -- \
  --binding <one-explicit-private-binding>
```

HPP event/custody links must be one-to-one. Gateway body and attachment-set
digests and ERP body/preview digests never expose source values. The command
has no directory, root discovery, glob, traversal, apply, copy, writer,
collector, scheduler, MCP, or activation path; failures emit only fixed codes.

## Fixed lanes

| CLI lane | Manifest lane | Immutable payload root |
| --- | --- | --- |
| `mail` | `mail` | `ingress/mailbox/canary/incoming/<shard>/<sha256>` |
| `voice` | `voice` | `ingress/voice/canary/incoming/<shard>/<sha256>` |
| `team_files` | `team_files` | `ingress/team_files/incoming/<shard>/<sha256>` |
| `structured_pc_work` | `pc_activity` | `ingress/pc_activity/work_events/incoming/<shard>/<sha256>` |
| `run_logs` | `run_logs` | `ingress/run_logs/incoming/<shard>/<sha256>` |

The payload remains content-addressed and deduplicable. The collector writes
receipts and checkpoints at
`<lane-metadata-root>/<source_identity_digest>/<content-sha256>.json`, so two
source occurrences with identical bytes share one payload but retain distinct
provenance metadata. Changed bytes for one source occurrence remain grouped
under the same source identity without replacing prior metadata.

`--source-owner-ref` and `--source-key` are required opaque ASCII identifiers:
1-128 characters, beginning with an alphanumeric character and continuing with
only alphanumeric, `_`, `.`, or `-`. They must not be names, paths, traversal,
or absolute locators. The identity digest is SHA-256 over the UTF-8 sequence
`soulforge.ingress.source_identity.v1 NUL lane NUL owner NUL key`. Private
receipts/checkpoints bind the two identifiers, lane, identity/content digests,
byte size, relative refs, and `project_state: unclassified`. Operator output
contains the identity digest but never prints either identifier.

## Local durable outbox

`local_outbox_binding.schema.json` binds one registered node to three exact,
physical queue roots. The enqueue command copies only one explicitly named
regular file into an immutable `<occurrence-id>.payload` and publishes a
metadata-only local receipt with `server_ack_state: pending`. The original is
never moved, deleted, or overwritten. Same occurrence/same bytes is a no-write
replay; same occurrence/different bytes fails closed.

```bash
npm run guild-hall:ingress:enqueue -- \
  --config <absolute-private-outbox-binding> \
  --lane team_files \
  --source <one-explicit-file> \
  --occurrence-id <opaque-safe-id>
```

Add `--apply` to enqueue after the dry-run. `structured_pc_work` is restricted
by policy to a user/agent-emitted bounded event; this command never watches the
screen, keyboard, whole OS, or whole conversation. `run_logs` is raw private
custody only and does not make an arbitrary log an accepted H05 occurrence.
All three lanes remain unclassified candidates and never mark a task complete.

The HPP supervisor recognizes the direct `<occurrence-id>.payload` form and
preserves that opaque occurrence identity in its D-local receipt/checkpoint.
After verified D-local staging, the HPP writes a separate immutable server
acknowledgement under the exact private `ack_root`. A matching acknowledgement
lets later cycles skip that immutable occurrence; changed size or stat identity
fails closed. The original local receipt remains immutable/pending, so
automatic client compaction is still disabled.

## Command

Dry-run is the default and performs zero writes:

```bash
npm run guild-hall:ingress:stage -- \
  --lane team_files \
  --source <one-explicit-file> \
  --source-owner-ref <opaque-safe-owner-id> \
  --source-key <opaque-safe-occurrence-id> \
  --data-root <absolute-data-root>
```

Add `--apply` only after reviewing the safe metadata plan. Apply streams
SHA-256, copies to a temporary file, verifies the copy and unchanged source,
then installs the digest-addressed payload without overwriting an existing
file. The source is never deleted or overwritten. `mail` accepts one explicitly
exported source occurrence; it does not fetch or mutate a mailbox. `voice`
accepts one explicitly selected recording and remains custody/audit-only. A
receipt from either lane does not accept project classification, knowledge, or
Task completion.

## Continuous supervisor

The public binding schema is `continuous_binding.schema.json`. A live binding
is private and contains exact physical paths but no credential values. Version
1 binds one HPP node, the D data root, a voice source, and zero or more local
outbox queues. Version 2 adds an exact writer-authority record plus an optional
team-mail bridge. Version 3 adds a digest-pinned PLAUD profile with either
`observe_only` or explicit `primary_writer` mode. Queue lanes remain limited to `team_files`,
`structured_pc_work`, and `run_logs`.

Validate a binding without acquiring a lease or writing data:

```bash
npm run guild-hall:ingress:continuous -- \
  --config <absolute-private-binding-path>
```

The dry-run response includes `config_digest: sha256:<hex>` for the exact raw
binding bytes read through a stable file handle. Pin that value outside the
binding in the OS scheduler action. Applied runs require the external pin and
fail closed if the file changes before, during, or after the stable read.

Run exactly one enabled cycle:

```bash
npm run guild-hall:ingress:continuous -- \
  --config <absolute-private-binding-path> \
  --config-digest sha256:<externally-pinned-binding-bytes-digest> \
  --apply
```

The command is intentionally one-shot and is the reusable fenced cycle, not the
production scheduler. Production uses `continuous_supervisor_cli.mjs` as one
long-lived process. The supervisor reloads the exact digest-pinned binding,
runs one cycle, waits `poll_interval_seconds`, and repeats until it receives a
stop signal. It exits on a fatal cycle error so the OS can perform a bounded
restart, while degraded lane results remain recorded cycles.

A temporarily missing enabled voice or queue source is isolated to that lane:
the cycle records a sanitized degraded error and continues the other available
lanes. An existing source that resolves through a link or other unsafe path is
still rejected while loading the pinned binding.

On Windows, `ops/register-continuous-ingress-supervisor-task.ps1` replaces the
old repeating trigger with one current-user `AtLogOn` trigger. Its action starts
PowerShell with `WindowStyle Hidden`, and
`ops/run-continuous-ingress-supervisor.ps1` holds one process-lifetime named
mutex plus an exclusive file handle below the private control root, pins the
binding SHA-256 again, launches the Node supervisor without a visible console,
and redirects sanitized JSONL stdout/stderr below the private control root. The
file handle closes automatically after a crash and prevents duplicates across
Windows sessions. Task Scheduler `IgnoreNew`, the process lock, and the
existing per-cycle lease prevent duplicate supervisors and writers. The task has no
15-minute repetition; Windows restarts only a terminated supervisor, up to the
bounded task setting.

PLAUD does not create a second scheduled task. In `observe_only` mode the same
long-lived supervisor checks provider metadata once per fenced cycle with
`apply: false`. In `primary_writer` mode it passes the HPP node identity into
the existing PLAUD importer, downloads only the bounded candidate set, writes
the unclassified shared session/library/producer receipt, then lets the same
cycle's copy-only mirror place the new generation in D-local custody. Both
modes publish only counts and fixed health states: recording IDs, titles,
provider URLs, transcript bodies, and absolute paths are omitted. A disabled
PLAUD block does not open the profile, invoke the CLI, or touch the network.
Enabling either mode requires a stable SHA-256-pinned profile under the declared
workspace root, the exact supported CLI version set, and the existing `voice`
writer-authority snapshot. Writer mode additionally requires library
registration, requires actual source-audio collection, disables `_workmeta`
draft writes and intake-time independent ASR, and fails closed when its mode
and writer flag disagree. The binding caps candidates per cycle and applies a
timeout to executable discovery, CLI commands, audio download, and audio probe;
its lease window must cover the bounded mail and PLAUD worst case. Writer mode
also rejects a voice mirror whose per-run cap cannot advance one maximum-size
RAW session: 2.25 GiB and eight files. It rechecks the voice lease and
authority before and after every selected provider recording and immediately
before every shared-workspace publication. A session is assembled below a
hidden partial sibling and becomes discoverable only through its final atomic
rename; failed pre-publication attempts remove that owned partial.

Writer activation also requires `cutover_receipt_path` and
`cutover_receipt_sha256` in the private PLAUD binding. The stable-read,
digest-pinned receipt must use
`soulforge.voice.plaud_writer_cutover_receipt.v1`, identify the stopped
`ai.soulforge.plaud-ingest` source collector with process count zero, prove its
service is disabled and unloaded with restart disabled, bind the HPP target node
and exact PLAUD profile digest, carry a validity window of at most 30 days, and
cite the operator approval reference. Historical observe-only v3 bindings
remain valid without these optional fields; when present outside writer mode
both fields must be `null`. Writer mode also requires the copy-only mirror's
source to resolve to the exact PLAUD output root and its lanes to include
`sessions`, `library`, and `delivery`. The atomic session already includes a
pending post-import repair sidecar, so interrupted library or delivery work is
retried on the next cycle. Audio is capped at 2 GiB, the returned download size
must match the actual file, and both download and `ffprobe` are bounded by the
configured timeout. The complete atomic session is capped at 2.25 GiB and eight
files; 4 KiB of that byte budget is reserved before publication for the bounded
post-import state and warning updates. Required HPP RAW sessions are mirrored
before unrelated voice backlog.
Newly published RAW enters D-local custody in the same cycle only when the
mirror's required-session coverage check passes. An import that misses
same-cycle custody remains degraded with `cutover_ready: false` and is retried
by the continuing mirror. The atomic session manifest carries this HPP-custody
obligation, so it survives a process restart and remains required on every
later cycle until the D-local copy verifies. Any remaining mirror limit also
keeps the whole run degraded and cutover readiness false, even when the
prioritized RAW session itself reached custody. It does not classify a project,
accept ERP history, or promote knowledge or tasks.

The private binding must have `enabled: true`, and the scheduler's actual state
must match `scheduler_enabled`. Each cycle acquires a D-local exclusive lease,
increments a monotonic epoch, and rechecks its fence token before and at every
final payload, receipt, checkpoint, and health-record publication boundary. A
second writer is blocked while the recorded local owner process is alive, even
after the lease timestamp expires. Automatic stale-lease recovery requires an
expired lease whose exact host is the current host and whose recorded PID is
verified dead. A remote-host lease, an unverifiable owner, or PID reuse fails
closed and requires controlled operator recovery.

Versions 2 and 3 explicitly declare `writer_mode: primary|fallback` and additionally
acquires the same durable writer-authority snapshot for
every enabled lane in the fixed order `mail`, `voice`, `structured_pc_work`,
`team_files`, `run_logs`. Each lane revalidates that authority before and after
its payload work. Authority transitions use `writer_authority_cli.mjs` with an
exact current epoch, digest, node identity, time window, and approval ref. An
active writer cannot be switched directly to another active writer: freeze or
revoke must put the record in `off` mode first, and failback requires the
recorded fallback epoch to have been revoked. A transition is also blocked
while the continuous runner's recorded local process is alive, and a runner is
blocked while an authority CAS transition is in progress. Authority CAS locks
use the same expired-plus-same-host-plus-dead-PID recovery rule; cross-host
recovery is never inferred from a timestamp alone. This authority covers only
RAW ingress custody. It does not grant project classification, history
projection, ERP acceptance, TaskDriver, or knowledge-promotion authority.
The record is local to one data root and is not a cross-host authority
transport. Mac source-local emergency spool remains a manually opened HOLD
window unless a separate authenticated epoch/revoke transport is implemented.

Every applied cycle writes a metadata-only run receipt and health record under
the D data root. Queue coverage becomes `degraded` when file/byte limits are
reached or source links are withheld. Queue files are never deleted or moved.
An exact queue acknowledgement is published only after the D payload, receipt,
and checkpoint succeed under the current fence epoch. A crash before that ack
retries idempotently. The ack avoids rescanning an ever-growing completed
outbox, but authenticated cross-PC ack delivery and client compaction remain
future transport work.

The voice binding reuses the source-preserving copy-only mirror and its existing
checkpoint. It copies only new or changed custody generations and does not
claim authenticated cross-PC delivery, project acceptance, or history
projection. In a version-2 binding, mail runs through the existing bounded team
mail CLI. The binding pins the CLI, complete sorted collector-tree release, and
mailbox-register hashes. The Node bridge captures only six-field metadata
identity for each credential source; it never reads credential bytes or emits a
credential content digest. On Windows, an OS-protected inline
bootstrap opens and holds the hard-linked Python runtime, capsule
code/register/manifest, and credential sources with read-only sharing, verifies
all non-secret release digests, and only then starts isolated Python. Unsupported launch
platforms fail closed. Python runs with isolated, no-bytecode, and no-site
flags; `PYTHONPATH`, `PYTHONHOME`, and ambient `TEMP`/`TMP` are not inherited.
Only the capsule modules plus the installed standard library/runtime DLLs are
loadable; the standard `<drive>:\Windows` PowerShell topology, scheduled-task OS
environment, operation owner ACL, and installed runtime/DLL ACL remain explicit
trust ceilings. The
child verifies six-field file identities including
birth/change time and preloads every enabled mailbox's directly held credential
values before the first mailbox effect. For `GMAIL_ACCESS_TOKEN_FILE` and
`HIWORKS_POP3_PASSWORD_FILE`, the bootstrap first runs the pinned capsule in a
discovery-only mode. That pass emits path and six-field identity metadata only;
it never emits credential contents. The bootstrap accepts only a normalized
relative reference resolved from the primary env file whose lexical and
physical target stays inside the exact `private_config_root`. Absolute paths,
tilde expansion, traversal segments, escape, non-regular or
multi-link files, and
symlink/junction/reparse traversal fail closed. It opens every accepted nested
file with read-only sharing, retains that lock through the actual child, and the
actual child preloads the file only when its identity still matches. Nested
credential metadata is ephemeral bootstrap state and is not added to the
capsule manifest or operator output. Arbitrary external credential-file paths
are intentionally unsupported. Standalone collector runs retain their existing
file-indirection compatibility. The capsule child also ignores ambient
overrides and disables token-file persistence. Child output is reduced to
counts, status, and
allowlisted error codes. A missing credential or partial mail run degrades only
mail; the enabled non-mail lanes still run.
Mail-enabled bindings must keep the payload lease and authority validity window
longer than the bounded ten-minute child timeout plus a safety margin.
If a spawned child times out or returns an invalid summary, the receipt marks
the run partial with `write_count_known: false`; aggregate writes become an
explicit lower bound and are never reported as an exact zero.

## Legacy mail custody materialization

`legacy_mail_custody_materializer.mjs` moves an explicitly frozen legacy mail
tree into HPP custody without discovering, deleting, moving, or modifying the
source. The private binding lists every relative file reference, byte size, and
SHA-256 and pins the canonical list digest. Dry-run is the default and emits
only counts, digests, and fixed status fields; it never emits source paths or
file names:

```bash
npm run guild-hall:ingress:legacy-mail-custody -- \
  --binding <absolute-private-binding-json>
```

Apply additionally requires the exact approval reference stored in that
binding. Each unique payload is published once as
`objects/sha256/<prefix>/<sha256>.bin`. An immutable snapshot binds the
original relative references to those objects and becomes visible only with a
matching `COMMITTED.json`. Identical replay verifies and reuses both objects
and snapshot; a changed source, destination conflict, path escape, link,
reparse point, hard link, or unstable file fails closed.

```bash
npm run guild-hall:ingress:legacy-mail-custody -- \
  --binding <absolute-private-binding-json> \
  --apply \
  --approval-ref <exact-binding-approval-ref>
```

The tool has no collector, scheduler, writer-authority, ERP, MCP, project
classification, or live-activation surface. It is a one-way, copy-only custody
bridge for a fixed legacy snapshot.

## Recovery snapshot and isolated restore test

`recovery_cli.mjs` creates an additive, immutable backup generation for one
explicit ingress control/data root. Dry-run is the default. It inventories and
hashes every included regular file but performs no writes and emits only
sanitized JSON (counts, digests, custody watermark, and exclusion counts; no
physical locators or excluded names):

Before inventory, recovery requires an explicit absolute `--recovery-policy`
path outside the source, backup, and restore roots. The exact
`soulforge.hpp_ingress_recovery_policy.v1` sidecar fixes the five payload roots,
five quarantine roots, five stable state roots, optional/required writer
authority record, exact legacy-empty references, exclusions, and the byte SHA-256 of
`storage_manifest.json`. Recovery then validates the full 13-key
`soulforge.hpp_private_custody.v1` storage manifest and binds its size and hash
into the source digest. The voice lane's `acceptance_state` remains a validated
manifest field, not an additional recovery selector.

Recovery enumerates all source-root names, then all direct `ingress`,
`quarantine`, and `state` children before it opens an included payload. It
recurses only through the ten exact lane/quarantine references and the five
stable state references; it never performs a broad `state/**` walk. Unknown
root or direct-child names fail closed. Secret-like entries found inside an
included reference fail the operation instead of being silently omitted.
The sole v1 legacy-empty reference is `quarantine/files`: it must exist as a
plain, empty directory and is checked before any included file is opened. It is
never descended for capture, recorded in the file inventory, or recreated by
restore. A missing, nonempty, symlinked, junction, or reparse replacement fails
closed.

```bash
npm run guild-hall:ingress:recovery -- snapshot \
  --source-root <absolute-live-ingress-root> \
  --backup-root <absolute-existing-backup-root> \
  --recovery-policy <absolute-external-policy-json> \
  [--sqlite-db <absolute-live-sqlite-db>]
```

Snapshot apply requires the exact source identity digest and content digest
returned by that dry-run plus an opaque approval reference. It never deletes,
moves, or overwrites a source file, and it publishes only a new exclusive
generation:

```bash
npm run guild-hall:ingress:recovery -- snapshot \
  --source-root <absolute-live-ingress-root> \
  --backup-root <absolute-existing-backup-root> \
  --recovery-policy <absolute-external-policy-json> \
  [--sqlite-db <absolute-live-sqlite-db>] \
  --apply \
  --expected-source-identity <sha256> \
  --expected-source-digest <sha256> \
  --approval-ref <opaque-safe-id>
```

A declared live SQLite database is never copied as a normal tree file. The
module creates a transaction-consistent `VACUUM INTO` snapshot in a separate
content-addressed object and records only its immutable relative reference,
size, hash, and quick-check result in the recovery manifest. Undeclared
`.db`/`.sqlite`/`.sqlite3` files fail closed, and SQLite WAL/SHM/journal runtime
files are not copied.

The sidecar's exact excluded references are metadata-checked but never
descended: `README.private.md`, `backups`, `config`, `ingress-mcp`, `manifests`,
`runtime`, `state/health`, and `state/backup_controller`. The backup-controller
ledger and lease are deliberately not restored; after recovery the controller
must be reseeded from externally retained backup receipts and anchor inputs.
Ordinary business directories named `session` or `sessions` remain valid inside
an included lane.

Every `active.lock.json` is excluded even when its timestamp is stale. CAS lock
and recovery markers, candidate files, `*.recovery`, generated partials, and
plain `state/**/*.lock` / `state/**/*.partial` runtime markers are also
excluded. Stable epoch records, archived stale leases, receipts, and checkpoint
JSON remain in the file inventory. A separately hashed custody checkpoint
carries the maximum observed stable custody epoch plus the checkpoint inventory
digest, preventing an ephemeral lock from becoming recovery authority.

Restore testing accepts only a caller-supplied, existing, empty directory that
does not overlap the backup root. A v2 generation also requires the exact
external recovery policy whose hash and storage-manifest pin are bound into the
generation. An unanchored default dry-run observes and
reports the generation's sanitized manifest SHA-256 but does not claim verified
trust. Supplying `--expected-manifest-sha256` makes dry-run compare an external
anchor while checking the commit, manifest, exact generation tree, every object
size/hash, SQLite quick-check, checkpoint inventory, and custody watermark.
`--apply` requires that external manifest anchor plus the exact source identity,
source digest, and approval reference bound into the manifest:

```bash
npm run guild-hall:ingress:recovery -- restore-test \
  --backup-root <absolute-existing-backup-root> \
  --generation-id <generation-id> \
  --restore-root <absolute-existing-empty-directory> \
  --recovery-policy <absolute-external-policy-json> \
  --apply \
  --expected-manifest-sha256 <externally-recorded-sha256> \
  --expected-source-identity <sha256> \
  --expected-source-digest <sha256> \
  --approval-ref <opaque-safe-id>
```

Apply restores into an invocation-owned temporary child and atomically publishes
it as `<restore-root>/restored/`. Failure cleanup verifies that temporary
directory's original identity and removes only that directory; a concurrently
created external file is never swept or deleted. Immediately before each
snapshot or restore rename, recovery reopens and hashes every expected file and
rejects any extra file or directory. Snapshot rename publishes an uncommitted
generation first, reopens that final tree, and writes `COMMITTED.json` as the
last publication step only after it still matches. Restore reopens the renamed
isolated tree and moves a failed publication to an invocation-owned
`.rejected-ingress-restore-*` quarantine name instead of reporting success.
These checks bind cooperative publication; they do not claim atomic protection
against a writer that ignores the protocol and can mutate the same ACL surface.

New generations use `soulforge.ingress.recovery_manifest.v2`, persist a
path-free source-digest basis plus policy, storage-manifest, and writer-authority
descriptors, and recompute that digest during restore verification. Existing v1
generations remain inspectable and restorable without a sidecar only when the
caller supplies their exact external manifest SHA-256. Because v1 did not retain
the SQLite source-digest basis, its result is explicitly labeled
`legacy_external_anchor_required`; a v1 manifest containing a now-forbidden
coordination artifact is diagnostic-only and apply fails closed.

Immutable backup reads use the internal `hash_pinned_network_read` verification
profile. It tolerates pseudo-inode drift and first-read ctime hydration observed
on some NAS/RaiDrive mounts only when the expected content hash matches.
Path/realpath, file type, link count, device, size, and mtime must remain stable.
Live source copy, restore staging, publication, and cleanup identity remain
ctime- and inode-strict.

Source/backup/restore/policy overlap, a non-empty restore root, destination
collision, path escape, symlink, junction/reparse traversal, hard-linked source,
unstable file, manifest tamper, or object tamper stops the operation. Active
locks, generated partials, CAS/recovery/candidate markers, state coordination
files, and declared SQLite runtime files retain their fixed exclusions. This
surface verifies a recovery generation in isolation; it never overwrites or
promotes a live root.

## Fail-closed boundary

- `--data-root` must be absolute, physical, and contain a regular
  `storage_manifest.json` with the expected custody flags and exact lane paths.
- Only the three fixed lane enum values and one regular source file are
  accepted. There is no recursive scan or generic crawler.
- Source/data-root overlap, lexical or physical escape, symlinked source,
  symlinked staging directories, unstable source, and mismatched existing
  payload/receipt/checkpoint all stop the run.
- Staging parents are physically revalidated immediately before temporary-file
  writes and again before immutable final publication.
- A matching digest is idempotent. Changed content gets a new immutable digest
  path; prior payload and metadata remain untouched.
- The collector does not write accepted or quarantine state, project bindings,
  `_workmeta`, ERP/DB, network/MCP, service, task, or scheduler surfaces.
- The continuous runner does not discover arbitrary workspaces or root-wide
  sources. It drains only exact private bindings, does not install a scheduler,
  and cannot promote staging records into project history.
- Operator JSON and fatal output never echo source/data-root locators or source
  content.

## Validation

Tests use synthetic files under the operating system temporary directory only:

```bash
npm run validate:ingress-staging
npm run validate:ingress-continuous
npm run validate:ingress-authority
npm run validate:ingress-recovery
```
