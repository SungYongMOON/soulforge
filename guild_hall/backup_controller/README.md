# Soulforge Backup Controller

This module implements exactly one daily Codex automation named
`Soulforge Backup Controller`. The backup core does not install or retire
automations. Its optional HPP writer-quiesce wrapper may inspect, temporarily
disable, and restore only the exact Windows tasks pinned by a private
SHA-256-bound sidecar. The hourly tick API remains available for compatibility
and still dispatches at most one stage.

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

## Validation

```powershell
npm.cmd run validate:backup-controller
```
