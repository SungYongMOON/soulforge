# guild_hall/ingress

## Purpose

`ingress/` provides one bounded, file-backed staging command for an operator to
copy one explicitly named regular file into the common HPP data plane. It is a
source-preserving unclassified staging surface, not a directory watcher,
project router, accepted-ingress service, or scheduler.

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
- Operator JSON and fatal output never echo source/data-root locators or source
  content.

## Validation

Tests use synthetic files under the operating system temporary directory only:

```bash
npm run validate:ingress-staging
```
