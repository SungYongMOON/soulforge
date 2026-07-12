# File Activity Observation MVP

`guild_hall/file_activity` is a public-safe, metadata-only scanner and compact
single-reconciler prototype for project file history across several PCs. It is
an **activation candidate only**: this directory does not install or enable a
watcher, scheduler, transport, ERP upload adapter, or `.workflow`.

The helper keeps five identities separate:

1. `workspace_binding_id` identifies one approved shared-worksite binding and
   never contains a physical path.
2. `logical_file_id` is a reconciler assignment that may persist across a
   uniquely inferred rename. A path, filename, inode, birth time, or mtime is
   never the identity.
3. `content_id` is only an exact streamed `sha256:<digest>`. Weak or sampled
   hashes never identify content or revisions.
4. `revision_id` binds a logical file, exact content, size, and parent revision
   set. Therefore A -> B -> A produces three revision occurrences.
5. `observation_id` is a canonical digest of one node's allowlisted observation
   fields. `fs_modified_at` remains an untrusted hint, not a creation-time or
   ordering claim.

## Node roles and cadence candidates

| Role | Candidate cadence | Extra triggers |
| --- | --- | --- |
| `work_pc` | every 5 minutes while active | startup, resume, daily full scan |
| `tool_pc` | every 10 minutes while active | immediate post-export, daily full scan |
| `portable_dev_pc` | every 15 minutes while active and battery-aware | startup, resume, mount, daily full scan |
| `always_on_node` | inbox reconcile every 1 minute; scan every 5 minutes only with a valid binding and operational-primary identity | daily full scan |

These values are returned by `cadenceForRole`; they are not scheduled by this
MVP. Freshness is `fresh` through two cadence intervals, `late` through six,
and `stale` afterward.

Only `work_pc` complete scans have deletion/absence authority in the safe MVP
default. `tool_pc`, `portable_dev_pc`, and `always_on_node` may contribute
positive observations but never advance absence or deletion. Deletion requires
two authoritative complete absences and a 24-hour grace period by default.
`first_absent_received_at`, `last_absent_received_at`, grace evaluation, and
`deleted_at` all use the operational-primary receipt clock. Producer node
observed/ingested clocks are evidence only and cannot accelerate deletion.

An ERP `input_upload` remains a separate authoritative occurrence and should
later trigger a targeted reconcile. It is never rewritten as a filesystem
observation. `project_folder_indexing_v0` remains a downstream search-readiness
consumer, not the collector or source truth.

## Storage and write gates

Every node may write only its own immutable durable outbox partition:

```text
_workmeta/<project>/reports/file_activity/observations/<node>/<YYYY>/<MM>/<packet>.json
```

The operational-primary `always_on_node` is the sole reducer for:

```text
_workmeta/<project>/reports/file_activity/revision_state.json
```

Node-local locks and hash/sequence cache stay outside durable project reports:

```text
guild_hall/state/local/file_activity/<project>/<binding>/<node>/
```

Both CLI commands are dry-run by default. `scan` writes only with
`--write-outbox`; `reconcile` writes only with `--apply`. Both still require an
explicit valid binding, and reconciliation additionally requires the current
operational-primary `always_on_node` identity. Packet/cache and state writes use
exclusive node locks plus immutable or atomic publication.

The CLI checks file size before JSON parsing and checks serialized size again
before publication: scan caches and immutable packets are limited to 64 MiB
each, while derived revision state is limited to 256 MiB. These are defensive
candidate ceilings, not archival or graph-compaction substitutes.

## Identity, ordering, and conflict rules

- Same logical path with changed exact content becomes a revision. Same exact
  content with changed stat hints becomes `touch`.
- A unique same-node, same-content disappearance/new-path pair in a complete
  listing is an inferred `rename`. A new same-content path while exactly
  matching source content is present in the current packet is an inferred
  `copy`.
- Multiple rename/copy/path candidates produce
  `ambiguous_same_content_identity`, an uncertain logical assignment, candidate
  refs, and a conflict. The reducer never chooses the first candidate.
- Concurrent children of the same parent remain multiple heads and conflict;
  there is no last-write-wins path.
- For nonsecret files, immutable packets retain a bounded relative raw-spelling
  evidence field alongside the NFC canonical relative path. Exact, NFC,
  casefold, cross-platform trailing-dot/space keys, path fingerprint, and
  observation ID are all recomputed from those allowlisted fields on intake;
  arbitrary producer-asserted exact keys fail closed. Derived node bindings keep
  the bounded relative raw spelling beside the canonical NFC path so a later
  state load can recompute the exact key; neither field may be absolute,
  traversal, or secret-like. Collisions are detected across all active node
  bindings and mark every involved logical file as conflict.
- Every producer packet carries monotonic `node_sequence`, `prior_scan_id`, and
  `prior_packet_digest`. The primary records a UTC `received_at` receipt and a
  canonical allowlisted packet digest. Same scan/digest is idempotent; same
  scan/different digest fails closed. Late packets and sequence gaps remain
  bounded evidence/coverage but cannot mutate bindings or revision heads. A
  regressing operational-primary receipt clock also fails closed.
- All packet and receipt clocks require exact UTC millisecond ISO strings. More
  than five minutes of observed/ingested skew switches to receipt ordering;
  more than fifteen minutes blocks exact temporal-order claims.

## Secret, content, and coverage boundaries

- Any secret-like path segment (`.env*`, credentials, tokens, secrets, key
  files, cookies, sessions, `.ssh`, and similar defaults) is aggregate-only.
  The scanner does not hash it and emits no observation row, filename,
  fingerprint, raw spelling, or collision key. This includes a secret-like
  approved root basename or ancestor. Stat failures on such entries also omit
  paths.
- An over-broad repo-root binding still skips `.git`, `_workmeta`,
  `private-state`, and `guild_hall/state/local/file_activity` as policy-excluded
  directories. If a protected metadata/cache subtree itself is supplied as the
  root, the scan emits a `collector_owned_root_withheld` gap packet instead of
  observing its own packet, state, or cache files.
- Packet validation allowlists metadata and drops injected payload fields.
  Absolute/traversal paths, inconsistent path keys/fingerprints/observation IDs,
  withheld rows, weak hashes, exact hashes without size, and contradictory
  coverage fail closed.
- A loaded `revision_state.json` is not trusted merely because its schema and
  project IDs match. The reducer reconstructs the top level, receipts, cursors,
  observations, reconciliation events, logical files, revisions, node
  bindings, collisions, gaps, compaction counters, and boundary from explicit
  allowlists; validates IDs, references, paths, clocks, types, and ceilings;
  and never copies unknown or payload-bearing fields forward. Sensitive,
  absolute, traversal, or inconsistent known path fields fail closed.
- Temporary/partial files are excluded. Symlinks and junction-like symbolic
  links are not followed. Hashing uses a no-follow file handle and discards a
  digest if size/mtime/ctime changes during hashing.
- New or changed files up to 64 MiB are streamed through SHA-256 under a default
  512 MiB scan budget. Larger, unstable, or budget-exhausted files are queued
  and make coverage incomplete. Offline roots produce immutable gap packets and
  preserve the prior cache.
- Unchanged stat tuples may reuse a prior exact hash only after strict cache
  reconstruction verifies the exact schema and field set, relative raw
  spelling, collision keys and path fingerprint, stat tuple, exact digest
  format, verification clock, producer chain, and entry ceiling. Unknown fields
  or an inconsistent entry reject the whole cache; they are never partially
  reused. This proves cache shape, not file-byte truth: a node-local actor able
  to forge a format-valid digest and matching stat tuple cannot be detected
  without reading the file again. Daily full scans therefore must use `--full`,
  which bypasses the cache. No verified-hash TTL exists yet, so live scheduling
  and any claim that treats cached hashes as freshly byte-verified remain
  blocked until a TTL/rehash policy and cache-provenance control are validated.

## Compact-state ceiling

Immutable per-scan packets are the observation-history source. The derived
`revision_state.json` intentionally retains at most:

- 1,000 recent event summaries;
- 1,000 reconciliation events (`missing_candidate`, `delete`, `restore`) with
  immutable event IDs, packet/node/receipt clocks, and bounded change intervals;
- 1,000 scan/digest receipts;
- 1,000 coverage gaps and 1,000 collision rows;
- 100 observation and source-scan refs per revision.

`missing_candidate` keeps the node-observation evidence interval, while delete
and restore state transitions use primary-receipt intervals. Dropped counts are
explicit under `compaction`, and restore clears stale
deletion metadata. This prevents five-minute scans from growing and rewriting
an unbounded observation ledger. The logical/revision graph itself is not yet
partitioned, and receipts or full reconciliation-event history beyond the
bounded window are not archived by this MVP. Before live scheduling, add
monthly immutable receipt/event partitions and graph compaction/checkpoint
validation, plus the cache TTL noted above.

As a defensive load boundary—not graph compaction—the reducer rejects state
above 10,000 node cursors, 100,000 logical files, 500,000 revisions, or 500,000
node bindings, and the scanner rejects a cache above 100,000 entries. The graph
ceilings are checked again after each reduction, so one current packet cannot
cross them. Nothing is silently dropped from the lineage graph; reaching a
ceiling is an activation/partition blocker that requires archival and a
validated checkpoint design.

## Commands

The project `_workmeta/<project>` owner directory must already exist; the CLI
does not create a private project owner surface implicitly.

```bash
# dry-run: scans and prints a metadata-only result, writes nothing
npm run guild-hall:file-activity -- scan \
  --project P00-000 \
  --binding approved_shared_worksite \
  --node work-pc-01 \
  --node-role work_pc \
  --root /owner-approved/worksite \
  --binding-valid

# explicit immutable outbox write; --full is required for the daily full pass
npm run guild-hall:file-activity -- scan \
  --project P00-000 \
  --binding approved_shared_worksite \
  --node work-pc-01 \
  --node-role work_pc \
  --root /owner-approved/worksite \
  --binding-valid --full --write-outbox

# dry-run reconcile by default; add --apply for the sole state write
npm run guild-hall:file-activity -- reconcile \
  --project P00-000 \
  --binding approved_shared_worksite \
  --node mac-mini-primary \
  --node-role always_on_node \
  --binding-valid --operational-primary \
  --packet _workmeta/P00-000/reports/file_activity/observations/work-pc-01/2026/07/<packet>.json \
  --apply
```

The root path is an input-only local binding and is never copied into output.
All deterministic fixtures use temporary directories:

```bash
npm run validate:file-activity
```
