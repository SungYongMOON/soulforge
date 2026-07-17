# guild_hall/ingress

## Purpose

`ingress/` provides a bounded file-backed staging command and a default-OFF
continuous HPP supervisor. The staging command copies one explicitly named
regular file. The supervisor drains only private, explicitly bound outbox
directories and can reuse the existing voice copy-only mirror. Both surfaces
remain source-preserving and unclassified; neither is a project router,
accepted-ingress promoter, ERP writer, MCP service, or TaskEngine writer.

## Fixed lanes

| CLI lane | Manifest lane | Immutable payload root |
| --- | --- | --- |
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
The local receipt is not a verified server acknowledgement; automatic client
compaction therefore remains disabled.

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
file. The source is never deleted or overwritten.

## Continuous supervisor

The public binding schema is `continuous_binding.schema.json`. A live binding
is private and contains exact physical paths but no credentials. It explicitly
binds one HPP node, the D data root, a voice source, and zero or more local
outbox queues. Queue lanes are limited to `team_files`,
`structured_pc_work`, and `run_logs`.

Validate a binding without acquiring a lease or writing data:

```bash
npm run guild-hall:ingress:continuous -- \
  --config <absolute-private-binding-path>
```

Run exactly one enabled cycle:

```bash
npm run guild-hall:ingress:continuous -- \
  --config <absolute-private-binding-path> \
  --apply
```

The command is intentionally one-shot. An OS scheduler may invoke it only
after the private binding has `enabled: true` and the scheduler's actual state
matches `scheduler_enabled`. The runner acquires a D-local exclusive lease,
increments a monotonic epoch, and rechecks its fence token before and after
every queue payload. A live unexpired lease blocks a second writer; an expired
lease is archived before a higher epoch takes over.

Every applied cycle writes a metadata-only run receipt and health record under
the D data root. Queue coverage becomes `degraded` when file/byte limits are
reached or source links are withheld. Queue files are never deleted or moved.
Client compaction remains blocked until a future authenticated server ack
contract is accepted.

The voice binding reuses the source-preserving copy-only mirror and its existing
checkpoint. It copies only new or changed custody generations and does not
claim authenticated cross-PC delivery, project acceptance, or history
projection. Mail is not a continuous-supervisor lane; its status remains
`credential_pending_off` until an independently approved mail binding exists.

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
```
