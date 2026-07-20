# Soulforge Backup Controller

This module is the feature-OFF implementation for exactly one daily Codex
automation named `Soulforge Backup Controller`. It does not install, enable,
disable, retire, or inspect Codex automations or Windows tasks. The hourly tick
API remains available for compatibility and still dispatches at most one stage.

## Authority boundary

- A daily automation invocation accepts exactly one argument:
  `--activation-sidecar <absolute-path>`. It has no environment, cwd, or default
  binding fallback.
- The exact activation sidecar pins the binding path and SHA-256, approval ref,
  writer node/hostname/platform, feature state, validity window, and the exact
  40-hex commit of the bound `runtime_checkout_root`.
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
recovery policy, and controller state under separate protected paths such as
`D:\Soulforge-control\backup-controller\`. It must not be nested in the HPP data
root, runtime checkout, restore root, or a NAS lane.

## Exact resources and preflight

The binding owns these typed resources:

- plain local HPP source and distinct empty local HPP restore-test roots;
- a policy file pinned by SHA-256;
- a plain `runtime_checkout_root` pinned by activation commit;
- the ERP SQLite file, `_workmeta` source, and `private-state` source;
- an approved OneDrive cloud directory with exact reparse tag `0x9000601a`;
- five non-overlapping `raidrive_network_directory` lanes below an exact
  `\\RaiDrive-*\<share>` UNC prefix: HPP, workspace, ERP, restore, and report.

Live preflight checks observed hostname/platform, actual file type, lstat and
realpath identity, link/reparse drift, path separation, policy digest, exact
runtime git HEAD, and tracked cleanliness for controller/recovery/runtime_ops
files. Untracked runtime data and secrets are ignored and never opened. Local
HPP, restore-test, and controller-state ACLs are read with fixed `icacls.exe`
only and fail closed on unparseable output or any non-owner write grant. This
intentionally blocks the currently known broad HPP ACL until it is separately
approved and repaired; the controller never changes ACLs.

HPP/control/restore/NAS lanes must never overlap the runtime checkout. The only
allowed containment is the canonically nested `_workmeta` and `private-state`
source roots beneath that checkout; their `.git` and secret-like entries remain
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

The failure-prone workspace copy is deliberately last. A critical-stage failure
or unresolved running checkpoint stops the cycle immediately. Workspace failure
returns `completed_with_warning` after all earlier receipts remain durable.
Hourly mode retains distinct stage slots and selects at most one stage per tick.

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

The future daily Codex automation action must invoke the automation CLI from the
exact bound runtime checkout and its prompt/configuration supplies only the
sidecar path:

```powershell
npm.cmd run guild-hall:backup-automation -- --activation-sidecar <activation.json>
```

Creating or changing that automation is outside this module and remains blocked
while the activation is OFF. Existing backup automations remain untouched until
a separately approved canary and observation window complete.

## Validation

```powershell
npm.cmd run validate:backup-controller
```
