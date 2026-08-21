# codex_thread_manager_v0

`codex_thread_manager_v0` is a public-safe pilot-ready workflow package for
making the declared Codex thread the main team lead that manages context
lifecycle and coordinates subagent-first Codex role worker, worktree worker, and
rollover manager threads while keeping verifier and judge lanes fresh-context.

It formalizes the `$soulforge-codex-thread-manager` launcher behavior as a
registered workflow bridge without claiming production readiness, default-route
safety, or party binding.

## Current State

- `output_state: registered`
- `validation_level: private_one_worker_pilot_observed`
- registered in `.workflow/index.yaml`
- registry skill bridge: `.registry/skills/codex_thread_manager/`
- no party package or default route has been created
- no full manager rollover or worktree worker pilot has run
- private live pilot evidence:
  `_workmeta/system/reports/post_development_review/20260608_thread_orchestrator_live_pilot_one_worker.yaml`

## Applicability Gate

Apply this gate before loading the workflow package or refreshing
`NIGHT_WORK_HANDOFF`.

- `applicable`: create, fork, continue, rollover, hand off, or archive a durable
  Codex task; create or change manager/worker/worktree topology; or coordinate
  and integrate multiple durable task lanes.
- `not_applicable`: list, find, read, or check one existing task; resolve its
  exact ID for one send; ask one question or send one message to it; or check
  organization routing, responsibility, or authority without a task lifecycle
  action.
- The `not_applicable` path uses the direct task tool and applicable route canon.
  It does not load this workflow, refresh a handoff, create a worker, or run the
  Workspace Board enrollment gate. Task-tool availability or use alone is not a
  trigger.
- Explicit `$soulforge-codex-thread-manager` invocation requires an actionable
  lifecycle or orchestration goal. A skill-name-only request with no clear
  action receives one concise clarification question.

## What It Owns

- Applicability classification before any workflow or handoff cost is incurred.
- Goal and boundary declaration after durable Codex task orchestration is found
  applicable.
- `NIGHT_WORK_HANDOFF` refresh before worker creation, compact, clear, rollover,
  cross-PC/overnight continuation, or substantial closeout.
- Explicit `$soulforge-codex-thread-manager` invocation with an actionable
  lifecycle or orchestration goal as authorization for the declared thread to
  act as main team lead and create role worker threads when runtime thread tools
  are available.
- Selection among current-thread manager plus worker, same thread, fresh manager
  thread, worktree worker thread, and subagent.
- Manager lifecycle and rollover policy.
- Exact local Workspace Board enrollment gates for Development1 and AI-organization
  TASK create, fork, continue, rollover, and handoff after an actual Codex thread
  ID is returned.
- Role worker topology, worker prompt packet shape, worker subagent bounds
  policy, no-subagent exception policy, thread id/title recording, and compact
  delegation packet minimum fields.
- Fresh-context verifier/judge/reviewer routing for independent acceptance,
  workflow-check, and readiness claims.
- Cross-worker result routing, integration, and validation closeout.
- Project-manager-first work classification, one-primary-owner assignment,
  out-of-scope reclassification, TASK logical roles and start/change/complete
  gates, and new-versus-existing TASK decisions.
- Upward result attribution for the AI platform company so a manager's
  integrated conclusion preserves the actual primary owner, performer,
  collaborators, observed independent review, manager/CEO contribution,
  evidence state, and Owner or cross-company gate.

## AI Platform Company Upward Result Attribution

Every upward result report from AX, ERP, SYSTEM, or a future persistent AI
platform company responsibility route preserves these fields:
`report_item_or_result`, exactly one `primary_owner`, `executor_or_agent`,
`collaborators`, observed-only `independent_reviewers`,
`manager_or_ceo_contribution`, `source_result_validation_evidence`, and
`owner_decision_or_cross_company_interface`.

Managers and CEOs may claim only the classification, assignment, integration,
or escalation they actually performed; they do not self-credit subordinate
execution. Requested and observed models remain separate, and an unobserved
provider or model is `UNKNOWN`. `PARTIAL`, `HOLD`, failure, and unknown results
keep the same attribution shape and blocker. Automatic attribution inference,
hidden reasoning, credentials, raw logs, and raw payloads are forbidden.

Development Team 1 is a separate company and is not in the direct notice scope.
Customer-supplier result packets use the same shape only at the cross-company
interface, without transferring AX, ERP, SYSTEM, project, acceptance, or Owner
authority.

Development Team 1 applies the same canonical eight-field shape to upward
reports from its COMMON operations manager and project managers through a
separate internal company campaign. On that Development Team 1 surface,
`manager_contribution` is only a display label for the canonical
`manager_or_ceo_contribution` field, not a second field or schema. This internal
campaign does not make the AI platform company a direct notifier to Development
Team 1 and does not change the customer-supplier interface.

Internal campaign recipients are restricted to the Development Team 1
operations manager plus active, exact project managers, including the
unassigned-project manager only when active and exact. Every recipient requires
stable-catalog `EXACT`, live-binding `EXACT`, and `execution_ready=true`;
otherwise notice is `HOLD`. The AI platform company CEO and AX, ERP, and SYSTEM
product organizations are excluded as direct recipients.

## Context Lifecycle

- Keep `NIGHT_WORK_HANDOFF` as the structured continuity object for the manager
  and worker team.
- Refresh handoff before creating workers, compacting, clearing, rolling over a
  manager, cross-PC/overnight continuation, or substantial closeout.
- Compact when continuing the same large goal and context pressure, drift, or a
  meaningful unit boundary justifies preserving only durable state.
- Clear or start fresh at phase boundaries when old context is more likely to
  distract than help. Resume from the checkpoint.
- Re-anchor long phases with active goal, completed work, constraints,
  blockers, worker state, and next action.

## Workspace Board Exact Enrollment Gate

For a Development1 or AI-organization TASK create, fork, continue, manager
rollover, or handoff, the manager makes an explicit applicability decision. After the actual
Codex operation returns its exact thread ID, it runs the local Board CLI with
owner-provided `organization_group_id`, a safe owner-provided `display_label`,
and the applicable `thread_kind`, `relationship`, and `lifecycle`:

```powershell
npm.cmd --prefix ui-workspace --workspace @soulforge/team-ops-board run threads:enrollment -- register-existing `
  --thread-id <exact-returned-thread-id> `
  --organization-group-id <owner-provided-organization-group-id> `
  --thread-kind <manager|task|verifier|continuation> `
  --display-label <safe-display-label> `
  --relationship <primary|child|review|handoff|continuation|independent> `
  --lifecycle <pending|accepted|current>
```

Include `--route-id` or `--work-id` only when the value is actually known. The
exact returned ID is the only allowed join key: title, cwd, prefix, similarity,
age, idle state, and parent-only relationships are never enrollment evidence.
Actual IDs and enrollment values stay in ignored local state, never in tracked
workflow data or this documentation.

This is a mandatory post-operation completion gate, not a claim that Codex task
tools expose a central interception hook. The task operation cannot be reported
complete until idempotent registration, validation, and available live
reconciliation return a safe receipt. A projectless or external-project TASK may
use an explicit delegation packet's owner-provided organization group, exact
nullable parent, and safe label; missing classification metadata leaves the exact ID on
`HOLD` and never triggers a guessed organization or route.

`register-existing` must be idempotent, followed by:

```powershell
npm.cmd --prefix ui-workspace --workspace @soulforge/team-ops-board run threads:enrollment -- validate
npm.cmd --prefix ui-workspace --workspace @soulforge/team-ops-board run threads:enrollment -- reconcile --live # when the live adapter is available
```

The Board is not visible and the enrollment gate is not closed until registration
and validation pass, plus live reconciliation when the adapter is available. If
the CLI, local registry, or adapter is disabled or fails, record the exact
blocker and keep the Board state `HOLD`; the separate TASK operational work may
continue, but no guessed enrollment or automatic route is allowed. Respect
`TEAM_OPS_BOARD_LIVE_THREADS_DISABLED=1` and registry `disabled: true`; neither
may be bypassed.

For manager rollover, retain the stable role, register the new exact ID with
`pending` lifecycle, and only after the compact handoff is accepted run the CLI
`rollover` command to promote the new enrollment to `accepted` or `current`.
The prior enrollment becomes `history`. Do not delete or archive a Codex task
automatically; archive requires separate authorization.

`idle` and `notLoaded` never mean completed or replace the explicit result gate.
An Owner browser acknowledgement can hide only the Board's Active card in
localStorage and never changes a Codex task. Enrollment may contain no raw
preview, messages, prompts, reasoning, tool I/O, content, or secrets. This is a
manager-workflow gate; it does not claim to automatically intercept
`create_thread`.

## Routing Rules

### Company/team common work assignment

The reusable human-facing contract is
`docs/architecture/guild_hall/COMMON_TEAM_OPERATIONS_AND_ROUTING_V0.md`.
The approved two-company governance projection and CEO authority boundary is
`docs/architecture/guild_hall/DEVELOPMENT1_TEAM_AND_AI_PLATFORM_ORGANIZATION_V0.md`.
The approved Codex-native role model/reasoning defaults, Ultra gate, CEO
delta-reporting boundary, and current activation state are defined by
`docs/architecture/guild_hall/AI_ORGANIZATION_MODEL_OPERATING_POLICY_V0.md`.
That policy does not overwrite workflow-specific calibrated profiles; role
turns and bounded workflow execution turns remain distinct.

### Governed role profile preflight

Development1 and AI-organization TASK creation must resolve an exact role
profile from that policy and run `role_profile_guard.mjs` before the thread
operation. The approved role policy is standing explicit authorization to send
that TASK's exact profile; it does not alter the user's global default.

For governed `create_thread`, both `model` and `thinking` are mandatory and must
equal the guard result. Missing, ambiguous, unsupported, or unresolved range
values are `HOLD`; configured-default, manager, parent, workflow-planner, and
Ultra fallback are forbidden. Ultra requires an explicit major-Gate authority
reference. Fork is valid only for observed same-role same-profile continuity;
a role or profile change uses fresh creation. Profiles marked fresh, including
independent review and major-Gate review, never use fork. Requested and observed
profiles remain separate, unobserved actual values stay `UNKNOWN`, and any
observed mismatch becomes `profile_mismatch` and `HOLD`.
`profile_mismatch_state` uses only `UNKNOWN`, `MATCH`, or `profile_mismatch`.
CEO coordination stays explicit-address and `HOLD/non-routable` until a
separately approved governance overlay or directory v2 is validated.
For COMMON work, the team operations manager classifies common or unclassified
work first, selects exactly one primary responsibility, and routes confirmed
project or development work to the matching sibling branch.

Cross-branch communication between COMMON, PROJECTS, AX, ERP, and SYSTEM is
recorded as a collaboration request, review request, or reclassification
request, not as a hierarchical command. A human owner directive remains
distinct and keeps its authority reference. Receiving managers accept in-scope
work or return it without execution with the reason and a suggested primary
owner. Request acceptance never transfers domain authority or authorizes an
external side effect.

A request first received from a team member or common inbox is recorded as a
`request_origin_relationship: common_intake_request`. Preserve that origin when
the manager later records the current `request_relationship` as an
`internal_assignment` or a peer request. If common-versus-project-versus-
development classification remains unclear, escalate the classification proposal
to the human owner.

A project candidate whose exact project identity is still unresolved routes to
the sibling `[미할당 프로젝트] 업무운영/팀장`. That route owns temporary intake
custody only: it does not create the project's 15 responsibility lanes, and it
hands evidence, open work, TASK refs, decisions, and blockers to the exact
project manager when identity is confirmed.

### Project work assignment and TASK routing

The reusable human-facing contract is
`docs/architecture/guild_hall/PROJECT_WORK_ORGANIZATION_AND_TASK_ROUTING_V0.md`.
Task Engine authority remains owned by
`docs/architecture/workspace/PROJECT_TASK_ENGINE_LIFECYCLE_V0.md`; this workflow
references that boundary and does not redefine it.

This project assignment extension applies only when project scope is confirmed.
COMMON work follows the company/team common-work contract above. `[SYSTEM]`,
AX, ERP, and other non-project work keep their existing owner routing. Shared
packets record inapplicable project-extension fields as `not_applicable`
instead of inventing a project or project responsibility lane.

- The project CEO or operations manager classifies incoming project work first.
- Record exactly one primary responsibility owner. Other responsibilities are
  collaborators or independent reviewers, never co-primary owners.
- A responsibility owner accepts only in-scope work. Return out-of-scope work
  without performing it, with the reason and a suggested primary owner.
- Escalate unclear or conflicting classification to the project CEO or
  operations manager.
- Record the responsibility owner, executor or agent, independent reviewer, and
  acceptance or approval authority as distinct logical roles. They are not
  necessarily four people; separation is risk-tailored, and an implementer
  self-check is not independent review.
- Start a new TASK for a new deliverable, multi-step execution, separate
  Verification, Validation, independent review, or acceptance. Continue an
  existing TASK only for a small refinement with the same objective, primary
  owner, scope, baseline, interface, approval scope, and acceptance criteria.
- Pass the start gate before creating or executing a TASK. Re-enter
  classification at the change gate when objective, requirements, baseline,
  interface, owner, or acceptance changes. Claim completion only after
  objective evidence and the defined acceptance are present.
- Scope acceptance never finalizes a human assignment or authorizes sending,
  purchasing, payment, contracting, baseline approval, public release, or
  final acceptance, completion approval, or another external side effect.

### Stable manager directory maintenance

- Stable manager route create, rollover, retire maintenance applies only to
  routes already registered in the private stable catalog under the
  `CODEX_WORK_DIRECTORY_V1` contract. Runtime discovery may verify or maintain
  those routes but must not invent a route from a task/thread listing.
- Ephemeral role or worktree workers remain children of the current bounded
  work and do not become permanent manager routes automatically.
- Directory maintenance produces no message-send, execution, party, or
  default-route authority. Ambiguous, stale, retired, unknown, or
  `do_not_route` results fail closed.
- Use subagents for non-durable side work that can be integrated immediately:
  focused investigation, noisy search, small non-acceptance verification, or
  parallel analysis.
- Use Codex worker threads for durable lanes that need a title/id, follow-up,
  overnight or cross-PC continuity, a separate phase, long-running execution, or
  manager integration after independent work.
- Split substantial work into role worker threads such as research, synthesis,
  verification, coding, and documentation.
- Use worktree worker threads for file mutation when checkout isolation or
  disjoint write scope is needed.
- Use fresh-context verifier or judge threads, or fresh bounded subagents when a
  durable thread is unnecessary, for independent review, acceptance judgment,
  workflow-check, readiness claims, or adversarial review. Do not fork or
  continue the implementer for that judgment.
- Treat fork, rollover, and continuation as same-role continuity surfaces, not
  independence evidence. An implementer self-check can find bugs, but it does
  not satisfy independent verification.
- Worker threads are subagent-first lane controllers. For substantive research,
  implementation, analysis, debugging, or review work, workers create fresh
  bounded subagents by default and integrate result packets rather than doing
  the whole lane in their own accumulating context.
- Worker direct execution is allowed only for named no-subagent exceptions:
  lane planning and packet authoring, small deterministic local checks, result
  integration, validator/status commands, manager-authorized narrow mechanical
  edits, unavailable or blocked subagent tools, or cases where a safe minimal
  packet cannot be created without boundary risk. Workers record the exception.
- The worker subagent count is scope-driven, not fixed. Worker prompts state
  objective, context refs, current state, acceptance criteria, allowed
  read/write scope, side-effect limits, subagent-first posture, reporting shape,
  any count limit or denial, execution-contract claim ceiling, stop conditions,
  and no-subagent exceptions.
- Manager may route bounded result packets between worker threads or ask one
  fresh, non-implementer worker to review another worker's result.
- Fresh manager threads are for rollover, continuity transfer, mission boundary
  changes, context drift, 24-hour span, or explicit user request.

## What It Does Not Own

- Existing-task lookup, list, read, status, exact-ID resolution for one send, or
  a one-off question/message to an existing task.
- Standalone organization route, responsibility, or authority checking without
  a durable task lifecycle action.
- Stable route source truth or local live binding source truth.
- Source truth, owner approval, or canon promotion outside this package.
- Raw transcripts, private payloads, NotebookLM answer bodies, or secrets.
- Codex product capability guarantees across accounts or future releases.
- `.workflow/index.yaml` registration.
- `.party` binding or default route switching.
- Production readiness without fresh B/V and workflow-check evidence.

## Operating Summary

0. Apply the applicability gate. Exit to direct task tools and route canon on
   `not_applicable` without loading the workflow or refreshing a handoff.
1. Bind the goal, workspace scope, boundary, success criteria, and stop
   conditions.
2. Refresh `NIGHT_WORK_HANDOFF`.
3. Treat the declared thread as main team lead by default for actionable skill
   invocations.
4. Classify project work, record one primary owner plus collaboration,
   independent review, and acceptance authority, then return or escalate
   out-of-scope or unclear work.
5. Decide whether the work starts a new TASK or continues an existing TASK, and
   check the start gate.
6. Resolve the governed role profile, run `role_profile_guard.mjs`, and stop on
   any non-PASS result before creating or forking a TASK.
7. Plan the thread team topology and context lifecycle.
8. Choose the continuation surface using the subagent-vs-thread routing rules.
9. Prepare role worker, worktree worker, or fresh manager packets with bounded
   scope, handoff context, compact report shape, subagent-first bounded
   subagent authority, any count limit or denial, no-subagent exceptions,
   side-effect limits, execution-contract claim ceiling, stop conditions, and
   conflict protocol.
10. Prepare verifier or judge packets from minimal evidence: objective, changed
    refs, acceptance criteria, validators, claims, and risk areas; exclude raw
    transcript and avoid leaking the intended fix except where necessary.
11. Observe thread ids/titles and acceptance results.
12. Apply the change gate when scope or decision inputs change.
13. Route bounded result packets between workers when useful.
14. Integrate worker summaries after checking actual state while preserving the
    eight-field upward result attribution shape and forbidding manager
    self-credit.
15. Check the complete gate, then run validators and
    `$soulforge-workflow-check`.
16. Close out with the attribution shape, claim ceiling, blockers, next action,
    Owner or cross-company gate, and knowledge trigger result.

## Party Policy

Do not create a `.party` package just because this workflow exists. Create or
bind a party only when several workflows must be chained under a reusable service
surface and an owner explicitly requests that chain.

## Claim Ceiling

This package is a registered public-safe orchestration structure with one
private one-worker pilot observation. It is not a production-ready route, not a
default route, and not evidence that full manager rollover, unbounded worker
subagent fan-out, multi-worker team execution, or worktree worker execution has
been proven. The project responsibility-assignment and TASK-gate addition is a
source-supported operating synthesis and has not executed a live assignment or
TASK pilot. It is not an ISO or other standards-conformity claim.

## Lifecycle Retention (Phase 1 Report-Only)

- **Module**: `lifecycle_retention.mjs` implements the core `LifecycleRetention` module interface, hiding lifecycle classification, exact task-worktree binding validation, opaque candidate construction, canonical SHA-256 report digest generation, and fail-closed `HOLD` reason codes.
- **Compatibility Wrapper**: `lifecycle_retention_report.mjs` serves as a backward-compatible wrapper preserving legacy imports, legacy report structures (`threads` array), and existing CLI behavior. Field and report shape compatibility with legacy reports is maintained. When no active binding is present, preflight uses legacy positional worktree IDs (`worktree-1`, `worktree-2`).
- **Explicit CLI**: `lifecycle_retention_cli.mjs` provides the Phase 1 `report --json` command surface. Exit code 3 is returned when `--expected-digest` (or `--prior-digest` alias) is provided and does not match the computed report digest. Destructive options (`--apply`, `--delete`, `--archive`, `--remove`, `--prune`, `--branch-delete`) and non-Phase-1 mutation subcommands (`approve`, `apply`, `verify`) are strictly rejected.
- **Ignored-Local Task-Worktree Binding**: The default task-worktree binding registry (`guild_hall/state/operations/team_ops_board/task_worktree_binding.v1.json`) resides under tracked `.gitignore` rule `guild_hall/state/**` and must remain ignored-local. Its root schema exact keys are `{schema_version, registry_revision, updated_at, disabled, worktree_nonce, bindings}`. Stale (age > 24h) or disabled bindings create zero candidates, set source health (`stale` or `disabled`), and keep report action `HOLD`.
- **Salted Pseudonymous Worktree IDs & Nonce**: Local binding entries use exact keys `{task_id, worktree_path, candidate_nonce}` with a 32-hex `candidate_nonce`. When an active valid binding is present, `worktree_nonce` (32-hex local secret salt) derives salted stable worktree IDs `worktree-${sha256("soulforge:lifecycle_retention:worktree_nonce:" + nonce + ":" + canonicalPath).slice(0, 32)}`. Raw paths and raw nonces remain strictly omitted in public output. When the binding registry is absent, disabled, stale, or invalid, preflight falls back to legacy positional IDs (`worktree-1`, etc.).
- **Entrypoint-Scoped Report Digests**: Report digests are computed over canonicalized output. Digests are entrypoint-scoped: the legacy report digest includes the `threads` array, whereas the explicit CLI report digest omits `threads`. They are not cross-comparable between entrypoints.
- **No Mutation Authority / Plan-Only Integration**: Phase 1 is strictly report-only core. Automatic reporting integration, Night Watch, AX Board, Watchtower, Backup Controller, Activity, Task Engine integration, scheduling, polling, and mutation operations (archive/remove/apply/approve/verify) remain plan-only/backlog and are not implemented.

## Lifecycle Retention Phase 2 (Feature Manual Inventory)

- **Module**: `feature_manual_inventory.mjs` implements the deep `FeatureManualInventory` module, exposing one small scan interface (`scanFeatureManualInventory`) that produces a deterministic, metadata-only feature/manual coverage report.
- **Coverage Comparison Surface**: Explicit feature rows are scanned and compared against repository metadata surfaces: `DOCUMENT_OWNERSHIP`, root `README.md` (top-level owner root map matching), owner-local `README.md`, `.workflow/index.yaml` or `.registry/index.yaml` (when applicable), package validator scripts/refs in `package.json`, `CHANGELOG.md`, and roadmap/mission refs (`DEVELOPMENT_ROADMAP_V0.md` or `.mission/...` metadata-only evidence). Evaluated sources are reported in `source_refs`.
- **Portable Output Pointers & Metadata**: Output rows contain portable repository-relative pointers (`feature_id`, `owner_root`, `owner_readme`, `operating_manual_ref`, `validator_ref`, `changelog_ref`, `changelog_status`, `roadmap_ref`, `roadmap_status`, `last_validation_state`, `last_validation_state_source`, `stable_gap_codes`, `next_action`).
- **Validation State Provenance & Truthfulness**: `last_validation_state` reflects caller-supplied metadata when declared (`last_validation_state_source: "declared"`). Validator declaration or script availability is NOT execution proof. Missing/unresolvable validator refs produce state `"unvalidated"`, malformed or unsafe rows produce state `"unknown"`, and report `status: PASS` signifies metadata coverage completeness rather than proof that validators executed.
- **Enumerated Status Values**: `changelog_status` enum values are `"recorded"`, `"pending"`, `"missing"`. `roadmap_status` enum values are `"active"`, `"proposed"`, `"mission_bound"`, `"missing"`. `last_validation_state_source` enum values are `"declared"`, `"absent"`.
- **Fail-Closed Sanitization & Safety**: Multi-`#` manual refs, tokenized unsafe/absolute/tilde/drive paths, credentials (with `=` or flag-value pairs), traversal, backslashes, or malformed feature IDs fail closed with `malformed_feature_row` or `unsafe_path_detected` gap codes and action `HOLD`. Raw credential/path strings are sanitized and never echoed in serialized report JSON. Invalid feature IDs are sanitized to opaque placeholder `"invalid_feature_row"`.
- **Report-Only Baseline**: Zero document mutation at runtime, zero scheduling, zero Night Watch/AX Board/Watchtower/Backup Controller/Activity/Task Engine integration, and zero destructive command surfaces. Missing coverage is reported only and never repaired automatically.
