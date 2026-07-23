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

## Feature-OFF project-history ref adapter

`project_history_adapter.mjs` is a separate pure H04 candidate surface. It does
not call `scanWorkspace`, the CLI, a filesystem API, a database, or a network
source. Its request must set `feature_enabled: false` and supplies only:

- an exact typed source-owner and project ref;
- exact immutable observation, reconciliation-event, or ERP-upload-event refs;
- paired source-revision/content refs;
- an immutable checkpoint ref plus digest and contiguous producer sequence;
- a caller-supplied H00 six-state coverage input.

The pre-ratification native binding candidates are exact and deliberately
narrow: `file_observation` and `file_reconciliation_event` belong to the
`file_activity` owner candidate, while `erp_upload_event` belongs to the
`dev_erp` owner candidate. `logical_file_id`, path, filename, mtime, and a hash
alone never become native occurrences. These bindings remain candidates until
D26 owner ratification and source existence validation.

The reducer is in-memory and accepts its prior validated state explicitly.
Canonical same-ref/same-digest replay is a no-op. Reusing an event or checkpoint
ref with different immutable metadata fails closed. A producer sequence gap
does not advance state and emits a deterministic gap receipt; the caller must
use `partial` coverage and provide the applicable D25-owned gap code. The
adapter does not invent a live gap vocabulary.

Coverage reuses the H00 matrix unchanged:
`complete_with_events`, `complete_no_events`, `partial`, `failed`,
`not_collected`, and `not_applicable`. Count-bearing states require a checkpoint;
null-count states forbid one. A bounded/truncated projection must therefore
remain `partial` with an explicit caller-supplied gap rather than being treated
as a complete ledger. Exact-key validation and recursive string guards reject
raw body/payload/log, transcript, file-byte, secret, absolute/UNC, URI, encoded,
and path-like locator sentinels even when hidden in an otherwise allowed string
field.

This adapter creates no watcher, scheduler, transport, writer, owner
ratification, live completeness claim, or project-history activation.

## Query-only source inventory

`source_inventory.mjs` is a separate stdin-only availability probe for one
owner-authorized exact `_workmeta/<project>/reports/file_activity` root. It
does not call the scanner or adapter and never opens or hashes a business file.
It only stats the fixed metadata layouts documented below:

- `observations/<node>/<YYYY>/<MM>/*.json`
- `receipts|events|checkpoints/<YYYY-MM>/*.json`
- `revision_state.json`
- `projections/life_tree_events.json`

Unknown layouts, symlinks/junctions, non-JSON leaves, arguments, default paths,
and path guessing fail closed. Output contains only availability, aggregate
file count/bytes, newest metadata mtime, and a metadata-tree digest; it returns
no path, filename, native ID, event value, or payload. An absent exact owner
root is reported as `not_materialized` and is not created.

```powershell
'{"authorized_metadata_root":"<exact file_activity owner root>"}' |
  node guild_hall/file_activity/source_inventory.mjs
```

This proves at most `source_availability_metadata_only`. It does not start file
observation, materialize the owner root, ratify D19/D25/D26, accept H04, or
activate a collector, reducer, projector, writer, scheduler, classification,
semantic label, or TaskDriver.

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

An ERP `input_upload` remains a separate authoritative occurrence and is never
rewritten as a filesystem observation. The precomputed projection consumer can
validate an exact ERP event ref plus hash and size, but the scanner producer
always emits a null ERP ref until an authoritative correlation emitter/binding
exists; it never infers one from filename or time. `project_folder_indexing_v0`
remains a downstream search-readiness consumer, not the collector or source
truth.

## Storage and write gates

Every node may write only its own immutable durable outbox partition:

```text
_workmeta/<project>/reports/file_activity/observations/<node>/<YYYY>/<MM>/<packet>.json
```

The operational-primary `always_on_node` is the sole reducer for:

```text
_workmeta/<project>/reports/file_activity/revision_state.json
_workmeta/<project>/reports/file_activity/receipts/<YYYY-MM>/<receipt_id>.json
_workmeta/<project>/reports/file_activity/events/<YYYY-MM>/<reconcile_id>.json
_workmeta/<project>/reports/file_activity/checkpoints/<YYYY-MM>/<reconcile_id>.json
_workmeta/<project>/reports/file_activity/projections/life_tree_events.json
```

Node-local locks and hash/sequence cache stay outside durable project reports:

```text
guild_hall/state/local/file_activity/<project>/<binding>/<node>/
```

All CLI commands are dry-run by default. `scan` writes only with
`--write-outbox`; `reconcile` and checkpoint-only `rebuild` write only with
`--apply`. They still require an
explicit valid binding, and reconciliation additionally requires the current
operational-primary `always_on_node` identity. Packet/cache and state writes use
exclusive node locks plus immutable or atomic publication.

Each terminally received scan gets one immutable receipt ID derived from project, binding,
and scan ID; the packet digest is deliberately excluded from the ID. The
`YYYY-MM` receipt directory uses immutable packet `ingested_at` only as a stable
partition key, never as receipt/deletion clock authority. Before reducing, the
CLI searches the bounded monthly layout by that stable ID. Same scan/digest is
a no-write duplicate even after hot receipt eviction, while same
scan/different digest fails closed. `first_received_at` remains the
operational-primary clock.
Retryable sequence/producer-chain holds stay in the monthly event batch and do
not get a terminal receipt until they apply or otherwise become nonretryable.
One reconcile accepts at most 4,998 packets so receipt refs plus the event and
checkpoint refs stay within the 5,000-ref projection envelope.

One reconcile run also produces an immutable monthly event batch and full-state
checkpoint, then atomically replaces `revision_state.json` and the bounded
life-tree projection. It preflights every immutable ref before the first write
and publishes terminal receipts last as commit markers. Exact retries may reuse
byte-identical immutable artifacts; a different payload at the same immutable ref is an error. Existing
symlink path components from the repository root through every leaf parent,
traversal, unknown checkpoint/receipt fields, and
noncanonical or tampered checkpoint state are rejected.

The CLI checks file size before JSON parsing and checks serialized size again
before publication: scan caches, observation packets, receipt/event partitions,
and the life-tree projection are limited to 64 MiB each; derived revision state
and immutable checkpoints are limited to 256 MiB. These are defensive candidate
ceilings, not graph-compaction substitutes.

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
  regressing operational-primary receipt clock also fails closed. Once a node
  cursor has producer-clock anchors, a chained packet whose `observed_at` or
  `ingested_at` regresses also fails the whole reconcile before projection.
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
- Unchanged stat tuples may reuse a prior exact hash only after strict v1 cache
  reconstruction verifies the exact schema and field set, relative raw
  spelling, collision keys and path fingerprint, stat tuple, exact digest
  format, original `verified_at`, producer node/source scan/source observation/
  canonical packet-digest provenance, producer chain, and entry ceiling.
  Provenance relationships are recomputed where the cache has enough evidence.
  Unknown/missing fields, a future verification clock, or a scan clock
  regressing behind cache `updated_at` reject the whole cache. Reuse is at most
  24 hours; `--cache-ttl-ms` may only reduce that ceiling. Cached reuse preserves
  the original verification time and provenance instead of refreshing their
  age. Daily full scans must use `--full`, which bypasses every cache entry; a
  successful full pass has zero `cached_exact_count` and complete hash coverage.
  A valid v1 cache keeps only its producer-chain envelope during a full pass;
  entry rows are not parsed or reused. An unreadable, legacy, or invalid cache
  does not block the byte pass, but resets the producer chain and reports
  `cache_chain_state=reset_requires_rebinding`; that packet must not silently
  join an existing cursor and requires owner-approved node rebinding.
  A node-local actor able to forge all format-valid cache anchors still cannot
  be detected without re-reading bytes, so authenticated producer/transport
  provenance remains a live-activation blocker. Legacy v0 caches fail the
  strict schema transition and must be rebuilt by a full pass.

## Compact-state ceiling

Immutable per-scan packets plus monthly scan receipts and reconcile event
batches are the durable observation/receipt surfaces. The derived
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
an unbounded hot observation ledger.

The private derived projection schema is
`soulforge.file_activity_life_tree_projection.v1`. It contains stable event and
lineage IDs, controlled clocks/intervals, and exact content ID/size only for
private ERP correlation validation. Events are admin-only by default and omit
relative paths and names. Scanner-produced `erp_upload_event_ref` is always
`null`; no filename/hash/time inference substitutes for a later authoritative
ERP adapter. API consumers must continue withholding private node/content
fields from responses.
An explicit scanner path/display permission and account ACL policy is still
required before widening access or activating collection.

As a defensive load boundary—not graph compaction—the reducer rejects state
above 10,000 node cursors, 100,000 logical files, 500,000 revisions, or 500,000
node bindings, and the scanner rejects a cache above 100,000 entries. The graph
ceilings are checked again after each reduction, so one current packet cannot
cross them. Nothing is silently dropped from the lineage graph.
`storage_bounds` publishes hard limits, current counts, remaining capacity, and
the exact blocker code for each graph surface. Each reconcile can create a
size-bounded immutable full-state checkpoint, and `rebuild` can restore only
that canonical checkpoint. This is not graph compaction: tail replay is
explicitly unsupported, replay parity has not been proven, and no cursor,
current head, active binding, unresolved conflict, or revision is evicted. Use
only the latest reviewed checkpoint. Reaching a graph ceiling remains an exact
live-activation blocker until archive-before-eviction and
checkpoint-plus-tail/full-replay parity are implemented and validated.

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

# dry-run reconcile by default; --apply writes immutable partitions/checkpoint
# and atomically replaces revision state plus the bounded private projection
npm run guild-hall:file-activity -- reconcile \
  --project P00-000 \
  --binding approved_shared_worksite \
  --node mac-mini-primary \
  --node-role always_on_node \
  --binding-valid --operational-primary \
  --packet _workmeta/P00-000/reports/file_activity/observations/work-pc-01/2026/07/<packet>.json \
  --apply

# checkpoint-only validation is dry-run; add --apply to replace revision_state
npm run guild-hall:file-activity -- rebuild \
  --project P00-000 \
  --binding approved_shared_worksite \
  --node mac-mini-primary \
  --node-role always_on_node \
  --binding-valid --operational-primary \
  --checkpoint _workmeta/P00-000/reports/file_activity/checkpoints/2026-07/<checkpoint>.json
```

The root path is an input-only local binding and is never copied into output.
All deterministic fixtures use temporary directories:

```bash
npm run validate:file-activity
node --test guild_hall/file_activity/project_history_adapter.test.mjs
```
