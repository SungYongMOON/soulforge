# Soulforge Backup Controller

This module implements exactly one daily Codex automation named
`Soulforge Backup Controller`. The backup core does not install or retire
automations. Its optional HPP writer-quiesce wrapper may inspect, temporarily
disable, and restore only the exact Windows tasks pinned by a private
SHA-256-bound sidecar. The hourly tick API remains available for compatibility
and still dispatches at most one stage.

## Synthetic recovery canary v0

`synthetic_recovery_canary_{fixture,runner,acceptance}.mjs` is a public-safe,
temp-only pre-physical proof. It generates deterministic synthetic bytes below
the OS temporary root, creates one create-only backup generation, performs full
manifest/hash readback and an isolated restore, then reports item/byte parity,
gap and elapsed time without copying payload bytes into the receipt. A separate
out-of-band Human Owner acceptance pin must bind the exact technical receipt;
the backup operator cannot self-accept, and replay/conflict/expiry/revocation
fail closed. A green result means only `synthetic restore canary accepted`. It
does not prove NAS readiness, numeric RPO/RTO, real-project recovery or Internal
RC acceptance.

## Target topology v2 preflight (default OFF)

`binding_v2.schema.json` and `preflight_v2.mjs` describe the migration topology
without reusing the legacy v1 containment model. They keep the installed
controller/runtime, the external ERP database owner, the two C transition
metadata sources, the two empty D canonical targets, and the rollback target as
distinct owner/epoch/digest-bound resources. The ERP database file and its
owning directory are inspected separately, so a root/file type mix-up cannot
pass. Fallback, overlap, reparse/symlink state, stale evidence, wrong runtime
root, pack drift, raw data, secrets, and local paths all fail closed.

This surface is pure and `feature_state: off`. `PREFLIGHT_OFF_READY` means only
that an injected public-safe topology packet is internally coherent. It grants
no binding activation, NAS write, backup run, source promotion, canonical
target write, or retirement authority. The existing v1 runtime and actual
private binding remain unchanged.

### Topology v2 actual reader (read-only)

`topology_v2_actual_reader.mjs` is the other half of that pure judge: it turns
REAL local resources into exactly the packet `preflight_v2.mjs` accepts.
`topology_v2_actual_port.mjs` is the only `node:fs` surface it is given, and
every call on it is a read — there is no create, write, move, delete, mount or
spawn in the lane.

Absolute paths live in one place: a private binding on the protected control
root, shaped by `topology_v2_private_binding.schema.json`. Everything the
reader EMITS is a ref, a digest, a boolean, an epoch or an enum, so the packet
survives the shared local-path and secret guards; a test walks every emitted
string to keep that true.

The public-safe v2 binding is not regenerated per run. It is carried frozen
inside the private binding, and each run re-derives resource identity from
observed state and compares:

- `resource_digest` folds role, owner, kind and where the resource ACTUALLY
  resolves, so a resource that moved cannot present the frozen identity;
- `realpath_digest` binds location alone, and the judge requires all eight to
  be distinct;
- `is_symlink` and a resolution-drift `reparse_tag` cover links and junctions,
  including a reparse point anywhere in the ancestry;
- the two canonical targets and the rollback target are checked EMPTY here,
  because the pure judge cannot look;
- the installed pack is re-hashed file by file and its digest recomputed with
  the builder's own recipe, so one changed installed byte moves
  `pack_readback_digest` and the judge refuses.

The one declared containment pair is the ERP database inside its owning
directory. Every other containment between bound resources is an overlap.

```
node guild_hall/backup_controller/topology_v2_cli.mjs check --binding <absolute-path>
node guild_hall/backup_controller/topology_v2_cli.mjs generate --draft <absolute-path> --out <absolute-path>
```

`generate` is the author-time leg that derives the frozen binding from observed
state; freezing its output is what gives every later `check` something to fail
against. A first `check` immediately after a `generate` therefore proves
coherence, not drift. Neither mode prints an absolute path, and a green `check`
is still `feature_state: off`: it authorizes no activation and no backup.

## Authority boundary

- A daily automation invocation accepts exactly one argument:
  `--activation-sidecar <absolute-path>`. It has no environment, cwd, or default
  binding fallback.
- The exact activation sidecar pins the binding path and SHA-256, approval ref,
  writer node/hostname/platform, feature state, and validity window. Its v1
  `runtime_commit_sha` is retained only as legacy metadata and never gates a
  backup run.
- Approval refs use the same conservative alphanumeric/dot/underscore/hyphen
  identifier grammar accepted by the HPP recovery apply API.
- `feature_state: off` returns before filesystem preflight, ACL/git/NAS probes,
  executor creation, or controller-state writes.
- The HPP host is the sole writer. Mac metadata remains `monitor_only` or
  `fallback_hold` with `takeover_allowed: false`.
- Binding JSON is exact-validated against `binding.schema.json`; activation JSON
  is exact-validated against `activation.schema.json`. Binding files cannot
  provide executables, shell text, argv, or environment values.
- Apply requires the exact binding-byte SHA-256 and approval ref. No tracked
  binding, activation approval, live path, or secret is present in this module.

The external control plane is expected to keep binding, activation, pinned HPP
recovery policy, and controller state under a separate protected path such as
`<protected-control-root>/backup-controller/`. It must not be nested in the HPP data
root, runtime checkout, restore root, or a NAS lane.

## Exact resources and preflight

The binding owns these typed resources:

- plain local HPP source and distinct empty local HPP restore-test roots;
- a policy file pinned by SHA-256;
- a plain `runtime_checkout_root` that contains the executing controller;
- the ERP SQLite file, `_workmeta` source, and `private-state` source;
- an approved OneDrive cloud directory with exact reparse tag `0x9000601a`;
- five non-overlapping `raidrive_network_directory` lanes below an exact
  `\\RaiDrive-*\<share>` UNC prefix: HPP, workspace, ERP, restore, and report.

Live preflight checks observed hostname/platform, actual file type, lstat and
realpath identity, link/reparse drift, path separation, and policy digest. It
does not invoke Git or inspect runtime commit, branch, or working-tree state:
the bound NAS backup runs regardless of those states. Runtime data and secrets
are never opened. Local HPP, restore-test, and controller-state ACLs are read
with fixed `icacls.exe` only and fail closed on unparseable output or any
non-owner write grant. This intentionally blocks the currently known broad HPP
ACL until it is separately approved and repaired; the controller never changes
ACLs.

HPP/control/restore/NAS lanes must never overlap the runtime checkout. The only
allowed containments are exact, typed relationships: canonically nested
`_workmeta` and `private-state` source roots beneath that checkout, the bound ERP
DB as a strict descendant of the runtime checkout, and the SHA-256-pinned HPP
recovery policy as a strict descendant of the project metadata root. Equality,
reverse containment, transitive closure through a third resource, and every
other overlap remain rejected. Metadata `.git` and secret-like entries remain
excluded by the ERP-lane copy profile.

The automation composition also verifies that its own executing module root is
the bound runtime checkout; a launcher running controller code from another
checkout cannot merely point at a clean D checkout and proceed.

RaiDrive lanes are addressed by exact UNC rather than a drive-letter mapping.
Only an ON activation performs a bounded create/hash/delete probe in the report
lane. No SMB ACL assumption is made.

## One daily wakeup

Daily mode permits all stages to share one due time because one wakeup runs the
fixed sequence synchronously under one outer exclusive lease:

1. `hpp_snapshot`
2. `erp_backup` (ERP DB + `_workmeta` + `private-state`)
3. `health`
4. `weekly_restore` only on its configured weekday
5. `workspace_copy`

The failure-prone workspace copy is deliberately last. An unresolved running
checkpoint still stops the cycle because another side effect may remain in
flight. A completed stage-local failure does not block independent stages:
the controller records that stage as failed, continues ERP, health, restore,
and workspace work where possible, and returns `completed_with_warning` when
at least one independent stage succeeds. Activation, binding, writer, ACL,
runtime-root, and NAS-root preflight failures remain whole-cycle stop
conditions. Hourly mode retains distinct stage slots and selects at most one
stage per tick.

Production daily stages should keep a full-cadence retry window when their
operation is safe and idempotent. A failed 02:00 stage can then retry later in
the same day without increasing the once-daily schedule frequency.

The HPP runtime budget should be calibrated from observed custody size and
throughput. The current 10.6 GB class completes well inside one hour, so a
one-hour bound leaves a late retry window while still preventing overlap with
the next 02:00 occurrence.

## HPP writer quiescence

An HPP snapshot must not race the sole writers that mutate its source tree.
The quiesced automation wrapper therefore:

1. verifies each scheduled task by exact task name and action markers;
2. disables the pinned continuous ingress, local activity, and Slack batch
   tasks without touching unrelated tasks;
3. asks the continuous ingress supervisor to stop cooperatively through a
   protected-control pause marker, so its lease is released normally;
4. waits for finite local-activity and Slack jobs to finish rather than killing
   them;
5. runs the normal backup composition;
6. removes the pause marker, restores the prior enabled state, starts the
   continuous writer, and dispatches one local-activity and Slack catch-up;
7. rejects completion if the continuous writer restart cannot be observed.

The wrapper records a protected metadata-only recovery state before changing a
task. A later invocation first restores a valid interrupted state. Backup
success and writer restoration are separate claims: failure in either is
reported, and `finally` restoration runs even when a backup stage fails.

One metadata ledger, `backup-controller.state.json`, lives below the exact state
root. Each executing checkpoint records its stable operation key and lease fence.
Handlers atomically publish a metadata-only external receipt before returning;
after a crash, a persisted `running` checkpoint is reconciled only against that
operation key and prior fence. Retry reuses a verified receipt or an idempotent
operation destination. A stale lease can be replaced only when its exact token
and operation still match, it belongs to the same host, its deadline expired,
and its PID is confirmed dead. Foreign, live, or unreadable leases remain held.

## Fixed handler catalog

- HPP snapshot dynamically loads only the recovery API from the pinned runtime
  checkout and requires its policy-aware schema/API. It fails closed otherwise.
- ERP backup uses the existing `runtime_ops` WAL-safe `VACUUM INTO` backup in an
  abortable worker, then requires read-only `quick_check` and exact hash match.
  `_workmeta` and `private-state` are copied into the same ERP lane and the
  receipt reports all three sub-results.
- Workspace and metadata copying use fixed `robocopy.exe` arguments with `/XJ`,
  copy-only `/E`, OS-transient and secret exclusions, and no `/MIR`, `/PURGE`,
  deletion, or retention. Only exit codes 0 through 3 are accepted. Abort uses a
  fixed Windows process-tree termination path.
- Weekly recovery performs externally anchored full HPP object/hash verification
  and ERP read-only restore verification. It writes only its metadata receipt;
  it never applies an HPP restore or accumulates/deletes restore trees. The
  one-time empty-root HPP apply canary remains a separate activation proof.

## Commands

Inspection and bootstrap remain explicit:

```powershell
npm.cmd run guild-hall:backup-controller -- seed --binding <private-binding.json>
npm.cmd run guild-hall:backup-controller -- seed --binding <private-binding.json> --apply --expected-binding-sha256 <sha256> --approval-ref <approval-ref>
npm.cmd run guild-hall:backup-controller -- tick --binding <private-binding.json>
npm.cmd run guild-hall:backup-activation -- verify --activation-sidecar <activation.json>
```

The daily Codex automation invokes the quiesced CLI from the exact bound runtime
checkout. Its prompt/configuration supplies only the exact activation and
writer-quiesce sidecars plus the pinned quiesce SHA-256:

```powershell
node guild_hall\backup_controller\quiesced_automation_cli.mjs `
  --activation-sidecar <activation.json> `
  --quiesce-sidecar <writer-quiesce.json> `
  --expected-quiesce-sha256 <sha256>
```

The quiesce sidecar is private operational metadata. It never carries a secret,
arbitrary command, executable, or environment value.

## New HPP data surfaces

Every new top-level HPP data surface is classified in the same development
slice as one of:

- included in backup and restore;
- excluded because it is deterministically rebuildable;
- forbidden from capture because it contains secrets or runtime-only control
  state.

The recovery policy and synthetic restore fixture must change together. Until
classification is committed, an unknown surface is not opened or copied: it is
counted as `unclassified_entries`, while all already-declared HPP custody and
the independent ERP, metadata, restore, and workspace stages continue.

## Linear LB1 public-synthetic POC

linear_lb1.mjs is an in-memory, feature-OFF contract owned by this backup
surface. It has no Linear provider, filesystem, network, storage, scheduler,
or controller-stage binding. Its fixture labels are local synthetic dimensions,
not a claim about a live Linear API field mapping.

The POC builds immutable synthetic runs and revisions, including a deterministic
snapshot hash and coverage manifest with counts, timestamp min/max, missing
dimensions, and metadata-only error codes. A pure registry reports create,
duplicate, or conflict outcomes for the same run key without mutating a caller
array. The restore check reports reconstructable versus missing dimensions; a
Sheet or CSV artifact by itself is always incomplete.

Schema-valid snapshot record and reference collections are canonicalized by
their stable IDs before snapshot and manifest hashing. Reordering those
collections cannot create a distinct revision or manifest identity.

Actual LB1 remains HOLD pending explicit storage-write authority, a minimum
read-only Linear scope, retention/RPO and partial-failure policy, and human
restore acceptance. This POC does not imply Task execution, AgentRun, P5, or
automation readiness.

### Linear LB1 Owner Gate

`linear_lb1_owner_gate.mjs` is the pure policy-and-runtime binding Module for a
future one-shot collector; no collector or storage adapter is wired to it. Its one Interface is
`evaluateLinearLb1OwnerGate(packet, trustedExpectedPin)`. The request binds the
Owner decision, exact Linear workspace scope and read-only credential ref,
Google Drive folder and storage-write authority refs, retention/RPO,
partial-failure policy, human restore acceptance, and one-shot prohibitions.
The second argument is the independently trusted full-packet pin; changing any
request field under an unchanged pin returns `HOLD`.

`READY_FOR_ONE_SHOT` verifies a policy that permits at most one bounded Linear
read and one create-only backup revision write. The receipt carries the trusted
pin, expiry, run limit, and create-only/restore flags, but explicitly reports
`technical_single_use_enforced: false` and `consumption_state: not_consumed_by_gate`;
the future executor must own durable one-shot consumption. The Gate never authorizes Linear mutation,
webhooks, scheduling, Task/AgentRun execution, P5 acceptance, overwrite,
cleanup, or public sharing. Gate evaluation itself has zero provider, storage,
network, filesystem, and scheduler effects.

The proposed policy — entire workspace, Google Drive folder label
`Soulforge Linear Backup`, 30 daily generations, 12 monthly generations, and a
24-hour RPO — remains `HOLD` until the Owner decision, exact workspace and
credential refs, exact Drive target and write-authority refs, and human restore
reviewer ref are supplied and independently pinned. No live Linear or Drive
access is performed by this Module.

### Linear LB1 v2 feature-OFF Bound Runner

The v2 Modules preserve v1 as a historical synthetic contract and add the
restore shape needed for a future whole-workspace one-shot. The exact v2
snapshot carries bounded Description and Comment bodies, multi-team/project
catalogs, nullable associations, state/assignee/project/due history, structured
Waiting/Completion/Evidence records, and cutoff/pagination completeness. Its
canonical immutable generation and restore check cover 18 dimensions; private
payload content may contain paths or secret-shaped source text, while every
public result and receipt remains body-free and payload-free.

`createLinearLb1OneShotRunner(runtimeBinding).execute(request, trustedPin)` is
the feature-OFF Bound Runner Interface. The full pin binds the Owner policy,
writer/epoch, claim store, exact synthetic Adapter refs, artifact layout,
resource limits, and expiry. Execution is gate-before-effects, claim-before-
read, create-only synthetic storage, exact-byte readback, and independent
restore. Every failure after a successful claim is `HOLD_CONSUMED`; async
adapter errors, clock drift, result accessors, caller mutation, resource-limit
bypass, and substituted envelopes fail closed without raw error text.

`linear_lb1_runtime_adapters.mjs` now supplies a capability-allowlisted,
synthetic-only bound adapter factory for exact-scope read, create-only storage,
durable atomic claim, injected clock, immutable target/authority/scope bindings,
closed client-return validation, and adapter invocation evidence. The factory
remains `bound_not_activated`; no real Linear/Drive client or credential is
created or discovered. `linear_lb1_one_shot_runner.mjs` result v3 no longer
hard-codes zero external effects: missing evidence is `UNKNOWN`, malformed or
counter-mismatched evidence is `HOLD`, and zero is emitted only from exact
synthetic-only adapter attestation reconciled with runner invocation counters.

This runtime-adapter foundation still creates no authorized Linear/Drive
client, discovers no credential value, and performs no physical write by
itself. Separately, the physical gate below has now completed one bounded
entire-workspace run through the connected read-only Linear surface and wrote
one immutable generation plus an exact-byte isolated restore copy. Its status
is only `PARTIAL_TECHNICAL_RESTORE_CANDIDATE`: provider calls were observed,
independent network attestation remains `UNKNOWN`, and human restore acceptance
is false. A 24-hour scheduler, heartbeat, and topology projection remain in the
post-one-shot `LB2` activation lane.

Before a later recurring or full-acceptance LB1 snapshot, the Owner must either
establish a quiesced window for the hourly multi-app writer or explicitly
accept a non-quiesced snapshot. The first bounded physical one-shot does not
provide writer coordination and does not close recurring collection or human
restore acceptance.

### Linear whole-workspace actual-reader foundation

`linear_lb1_actual_reader.mjs` is the default-OFF, injected read-only boundary
for a connected Linear workspace. It discovers no credential, owns no HTTP
client, exposes no mutation method, and accepts only an exact
`entire_workspace` scope whose workspace and connector refs match the binding.
The injected `readPage` output is closed data: cursor loops, workspace drift,
catalog drift, unknown keys, resource overruns, and inconsistent cutoffs fail
closed without reflecting provider payload.

The actual-reader coverage matrix preserves the existing 18 restore dimensions.
Current issue labels are covered inside the `issue` dimension. Attachment
descriptors are accepted only through an Owner-bound attachment-policy ref and
exact ID allowlist whose canonical digest must equal the policy ref content ID
and the Owner-packet binding; the current contract always records `bytes_captured: false`
and never treats provider metadata as immutable attachment bytes. V2 snapshots
carry a label catalog, per-issue `label_ids`, and typed attachment metadata. Native
Linear current state can support issue/team/project/user/status/timestamp/due/
relation catalogs and supplied histories. Deletion completeness, historical
description/comment revisions, approved attachment bytes, structured
`waiting_info`, and Soulforge `completion_record` remain `PARTIAL` or `missing`.
Provider-reported coverage cannot self-promote those dimensions beyond the
independently declared adapter matrix; changing that ceiling requires a reviewed
contract revision. A missing dimension always produces a partial generation and
`HOLD`, never a complete restore claim.

Each accepted provider page is charged against the byte budget before mapping
and then discarded. The collection persists a digest of the cursor/page ledger,
the terminal-page observation, page and issue counts, and the bound adapter ref.
Because the current connector cannot independently reconcile a source-wide count
or deletion watermark, `cutoff_completeness` remains `PARTIAL` even after a
terminal page. Whole-workspace arrays are capped consistently at 100,000 issues;
the reader fails closed at its lower Owner-bound resource limit.

The ref-bound v2 Owner-packet profile is refs-only: its single-use claim is an
opaque `single_use_token_ref`, not token material. It also pins a
`capture_consistency` decision (`quiesced` or Owner-accepted non-quiesced),
cutoff/cursor requirements, attachment policy, and the rule that incompatible
source drift becomes `PARTIAL/HOLD`. Exact legacy v2 synthetic packets remain
accepted through their original private `single_use_token` shape so existing
callers do not break; that material stays inside claim consumption and is never
included in gate or runner receipts.

The actual reader feeds the existing immutable generation, serialization,
exact-byte readback, and isolated restore functions through a distinct
actual-provenance contract. Its manifest binds adapter/cursor-ledger evidence
and records injected reader invocations as `provider_calls`; an injected
`readPage` invocation is not network evidence, so `network_calls` is `null`
with state `UNKNOWN`. A non-null network count is valid only with an exact
independent binding ref, which this foundation does not create. It cannot be
sealed as feature-OFF synthetic data. Physical storage remains a separate
runtime gate, and injected-provider mutation evidence is explicitly `UNKNOWN`,
never inferred from the read-only interface. The existing one-shot runner still
treats synthetic adapter evidence as its only success authority until a
reviewed actual-effect binding is supplied. Legacy v2 synthetic snapshots and
manifests without the additive label/attachment fields remain accepted and
retain their original exact serialized shape.

### Linear physical one-shot gate

`linear_lb1_physical_one_shot.mjs` is the bounded physical bridge for the first
actual run. It does not discover a connector, credential, path, writer, or
reviewer. An exact private config must pass Owner Gate v2 and bind the current
workspace, a fixed ten-tool read-only Codex Linear capability set, an empty or
exact content-addressed attachment allowlist, writer-exclusive control/data/
recovery roots, one opaque durable claim ref, and a create-only generation
target. The target, claim store, storage authority, writer allowlist, recovery
binding, and finite reader limits are content-addressed back into the pinned
Owner packet. The capability set contains no create/update/delete/save/write/mutate
tool, and its call ledger carries only capability names and input/output hashes.
Read-only connector errors remain explicit `is_error` ledger rows and are
counted in the durable generation receipt; they cannot disappear during a retry.

`beginLinearLb1PhysicalSession()` validates ACL/path containment and an empty
isolated recovery binding before it creates an atomic single-use claim. Only
after `CLAIM_READY` may the caller collect provider pages. Completion binds the
page bundle to the body-free connector-effect receipt and records that receipt
as `CALLER_OBSERVED_SESSION_BOUND` without promoting it to
independent network or mutation attestation, and writes a new immutable
generation with no overwrite/delete/prune surface,
performs exact-byte readback, and copies the same bytes to an isolated recovery
generation for restore parity. Missing dimensions remain `PARTIAL`; physical
parity is not human restore acceptance or Official Task completion.

Each non-failed whole-workspace generation also carries one deterministic
`project-index.json`. The immutable `run.json` remains the only copy of issue,
description and comment bodies; the project index stores only project/team
identity, stable digest-derived storage keys, issue IDs, counts and digests.
Every project in the Linear catalog receives an index row even when it has zero
issues, and issues with no project go to a separate `unassigned` row. The index
binds the exact workspace generation and manifest, is written create-only,
byte-read back, copied to the isolated restore root and revalidated against the
restored snapshot. A project label or folder name is never used as identity.

The claim file and every generation/state receipt use exclusive create plus
file-handle sync. A crash immediately after the synced claim can resume the same
exact claim before capture; an append-only PID/host-bound session lease prevents
a second live begin, and Owner/pin/claim expiry is rechecked before capture,
generation, and restore effects. Any post-capture incomplete state returns a durable
reconciliation HOLD instead of deleting, overwriting, or silently retrying.
This is tested process-crash evidence, not an independent power-loss guarantee.
The body-free connector effect receipt and call-ledger digest are persisted in
both the control-state chain and generation receipt.

`linear_lb1_physical_cli.mjs --config <private-config>` emits the body-free claim
receipt, then accepts exactly one private capture envelope on stdin. Raw Linear
bodies remain in the private input stream and approved generation/recovery
roots; CLI output contains only refs, digests, counts, coverage, and effects.

The connected read-only surface was rechecked on 2026-08-31 and exposed one
workspace with 12 projects, one team and 72 issues (`includeArchived: true`, no
project filter). This confirms the collection scope is whole-workspace rather
than KVDS-only. It does not improve the earlier generation's partial history,
deletion, attachment-byte or human-acceptance ceiling, and it does not itself
write a new backup generation.

For the already-retained whole-workspace generation,
`linear_lb1_project_index_backfill.mjs` provides an explicit-path,
exact-generation-digest backfill. It verifies the source run, its existing
create-only generation receipt and the isolated restore copy before adding the
same `project-index.json` and a separate body-free receipt to both locations.
Existing exact files replay; divergent files HOLD; `run.json` and the original
generation receipt are never changed, deleted or reinterpreted. The CLI requires
an owner-prepared private JSON input and outputs only counts, digests and status.
Its result remains `PROJECT_INDEX_TECHNICAL_RESTORE_CANDIDATE` with
`human_acceptance=false`.

The first actual backfill was executed against the retained 2026-08-31
whole-workspace generation after fresh independent review. Source and isolated
restore produced the same project-index bytes and exact replay returned four
`replayed` states. The index covers 12 projects and 72 issues: 47 issues have a
current project binding, 25 remain `unassigned`, 11 projects are non-empty and
one catalog project has zero issues. This is an exact classification of that
retained generation, not a fresh source recapture or a human-accepted restore.

### Generic Source backup-generation contract

`source_backup_generation_contract.mjs` binds one refs-only source capture to
an exact byte-owner manifest, create-only backup readback and isolated restore
readback. It emits the compatible backup pointer immediately, but a pending
technical restore has `restore_test: null`. Only a separately supplied, exact
`human_acceptance_verified` envelope bound to the acceptance owner, source,
project, backup, restore digest and authority receipt can advance the immutable
receipt and emit an accepted Source Lane restore record. The module performs no
byte copy, filesystem/provider/network/clock operation or acceptance decision.

### Buzz backup-generation readiness contract

`buzz_backup_generation_manifest.mjs` keeps Postgres logical snapshot, media
inventory, Git data revision, Redis subset classification, backup capture,
isolated restore, audit integrity, protected identity recovery and human backup
acceptance as separate evidence. Redis canonical subsets require backup proof;
rebuildable/ephemeral subsets require their own deterministic-rebuild or
exclusion proof. The result never implies Task/result/artifact/knowledge
acceptance, and secret material is represented only by protected refs.

### Hermes Agent backup manifest contract

`hermes_agent_backup_manifest.mjs` binds exact Agent Mark/Deployment, Hermes
runtime/profile/bridge/gateway/plugin/config refs, SOUL/instructions,
skill/workflow/tool allowlists, session store plus verified canonical Bot
Chat↔Buzz crosswalk, memory generation, schedule definitions, backup membership,
isolated restore/rollback and human evidence refs. Success means only
`BACKUP_MANIFEST_READY` at a metadata-contract ceiling; Agent readiness, Task
Done and accepted Project Context remain unevaluated. Raw chat/prompt/memory/
tool output and private key/token/path values are forbidden.

## Validation

```powershell
npm.cmd run validate:backup-controller
npm.cmd run validate:backup-generation-contracts
npm.cmd run validate:linear-lb1-owner-gate
npm.cmd run validate:linear-lb1-v2
npm.cmd run validate:linear-lb1-runtime-adapters
node --test guild_hall/backup_controller/linear_lb1_actual_reader.test.mjs
node --test guild_hall/backup_controller/linear_lb1_physical_one_shot.test.mjs
```
