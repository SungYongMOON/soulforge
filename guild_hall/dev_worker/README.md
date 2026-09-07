# guild_hall/dev_worker

## Purpose

`dev_worker/` owns the bounded branch-producing automation lane for Soulforge development work.

The lane is intentionally narrower than a general autonomous developer. It selects one explicit task packet, prepares enough context for Codex automation, expects a task branch, and records the result for review.

## What Belongs Here

- automation specs and prompt templates
- preflight helpers for clean `main` / fast-forward sync
- task packet discovery and branch-name suggestion helpers
- candidate queue listing and approved-candidate promotion helpers
- low-risk candidate auto-approval policy checks
- tests for deterministic selection and sanitization behavior

## What Does Not Belong Here

- account tokens or credentials
- raw project files
- `_workspaces/**` material
- automatic merge-to-main logic
- broad self-directed backlog mining

## Continuous internal feedback candidate

The continuous feedback implementation uses the existing control database and
explicit current delegation. It does not run the legacy `_workmeta` discovery
commands below. Internal reversible development proceeds under the existing
delegation with results available for later review. External disclosure and
canonical acceptance retain their separate exact authority.

- `feedback_linear_source.mjs` selects only explicitly delegated issue UUIDs
  through the committed Linear metadata reader. Receipt-generation changes alone
  do not reopen work. The provider's whole issue hash includes status and update
  time; this adapter is not a semantic-intent classifier or an echo detector.
- `feedback_request_provider.mjs` reuses a currently issued bounded request and
  checks live authority against its exact source, scope and packet digest. A
  packet's own approval flag does not replace that live decision. Every stage
  after preparation compares the same packet digest again.
- `feedback_cycle.mjs` serializes claims in SQLite, deduplicates observed
  revisions, supersedes absent/changed sources, and enforces daily and per-revision
  budgets. Execution, validation, independent review and result reporting are
  separate trusted ports. An uncertain worker or notification outcome is held
  without automatic resend. An internal retry requires current authority and an
  independently verified stopped process with resolved side effects.
- `feedback_worktree_runner.mjs` creates a sparse branch candidate from exact
  public source bytes and a separately pinned validator dependency set. A trusted
  proposer and independent patch reviewer precede the fixed Git application;
  validators run against the patched code. Generated commands, additional files,
  renamed/binary/mode patches and edits to the validator or supervision policy
  are refused. Native executable pins allow stable installer hardlinks; source,
  candidate and validator files require one link. Handle and parent checks detect
  changes around reads. This is not OS or descendant-process isolation, and a
  restarted process must inspect preserved candidates before reusing them.
- `feedback_watchdog.mjs` can read worker health through a separate read-only DB
  connection even after the worker stops. Its own notice ledger informs the
  management route only on a meaningful problem or recovery. It never renews
  worker leases, runs a model or creates Owner approval requests. Confirmed
  non-delivery permits bounded retries; an unknown outcome remains unknown.
- `feedback_polling.mjs` provides serial fixed-delay scheduling for bound ports.
  The worker and watchdog must be installed in separate host processes. This
  module does not register tasks or activate an operating route.

The installer and dispatcher own current role/assignment, issue delegation,
issued packets, executable/validator pins and exact report/notification routes.
Do not substitute provider text, a matching label, creator identity, or a boolean
`is_bot_echo` for these sources. Only the exact successfully emitted output refs
and receipt can identify an application echo. Canonical workspace bytes and old
working metadata are not inputs or outputs of this control ledger.

These are implementation components of the current roadmap's internal task
absorption and continuous improvement work. Actual source-to-code execution,
independent review, reporting/echo collection and installed scheduling must all
be connected and exercised before calling the continuous workflow usable.

`npm run validate:dev-worker` includes `validate:dev-feedback`: all six feedback
modules and their six test files, including actual sparse Git execution and the
cycle/request-provider recovery composition. The existing packet tools remain
covered in the same canonical validation entry.

## Existing task-packet command surface

```bash
npm run guild-hall:dev-worker:preflight -- --local-root <Soulforge root>
npm run guild-hall:dev-worker:claim -- --local-root <Soulforge root> --json
npm run guild-hall:dev-worker:candidates -- --local-root <Soulforge root> --workmeta-root <_workmeta root> --json
npm run guild-hall:dev-worker:candidates -- --local-root <Soulforge root> --workmeta-root <_workmeta root> --details
npm run guild-hall:dev-worker:candidates -- --local-root <Soulforge root> --workmeta-root <_workmeta root> --auto-approve --json
npm run guild-hall:dev-worker:candidates -- --local-root <Soulforge root> --workmeta-root <_workmeta root> --auto-promote --json
npm run guild-hall:dev-worker:candidates -- --local-root <Soulforge root> --workmeta-root <_workmeta root> --promote-approved --json
npm run guild-hall:dev-worker:render -- --local-root <Soulforge root> --workmeta-root <_workmeta root> --private-state-root <private-state root>
npm run guild-hall:dev-worker:render -- --check --automation-file <automation.toml> --local-root <Soulforge root> --workmeta-root <_workmeta root> --private-state-root <private-state root> --json
```

## Task Sources

- public-safe: `.mission/<mission_id>/dev_worker_request.yaml`
- owner-only: `_workmeta/<project_code>/dev_worker_queue/*.yaml`
- owner-only candidate: `_workmeta/<project_code>/dev_worker_candidate_queue/*.yaml`

The helper only selects packets with `status: ready`, `status: queued`, or `status: open`.
Agent-generated ready packets also require `owner_approval.approved: true`.

Candidate packets are for agent-discovered work. Once `owner_approval.approved: true` is recorded on an active candidate, the next ACTIVE dev-worker automation trigger may promote it into `dev_worker_queue` and execute it. The owner controls that automatic execution by turning the local Codex automation on or off.
Low-risk candidates may request `auto_approval.requested: true`; the candidate helper approves only those that pass the tracked safe-path, safe-check, and risk-level policy before promotion.
The safe-path check rejects control characters and parent directory segments (`..`) before comparing normalized path boundaries for approval.
The shared deny check also covers root scopes, case aliases and wildcard scopes.
A wildcard is conservatively checked against its containing directory; when that
directory contains an authority guard, list the exact ordinary files instead.
For example, use `guild_hall/dev_worker/README.md`, not `guild_hall/dev_worker/**`.
Repository control metadata and both canonical/legacy workspace metadata planes
are excluded from automated source repair. This does not create an OS sandbox.
The safe-check gate rejects acceptance check strings that contain control characters before matching the command allowlist.
Use `--details` when auditing stalled development work; it prints status counts, active/closed candidate counts, each candidate's packet ref, project, promotion blocker, owner-approval state, and auto-approval blocker without reading raw project payloads. Listing candidates is still read-only; `--promote-approved` or `--auto-promote` is what writes ready packets into `dev_worker_queue`.

The render helper's `--check` mode is read-only. It compares a provided automation TOML against the tracked dev-worker spec and prompt render for `id`, `prompt`, `cwds`, and `execution_environment` only, then reports a short current/stale result. It does not install or update local Codex automation files, and it does not treat local `status`, `rrule`, `created_at`, or `updated_at` values as stale because those remain PC-local owner settings.
