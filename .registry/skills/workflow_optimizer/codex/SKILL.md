---
name: workflow-optimizer
description: Validate or optimize Soulforge workflow execution profiles across model, reasoning effort, species, and class. Use for incumbent-controlled model-family migration, runner/catalog compatibility checks, pricing or availability changes, staged profile comparison, smoke tests, benchmarks, or selecting the lowest-cost passing profile among tested candidates while preserving golden-gate and billing-evidence boundaries.
---

# Workflow Optimizer

Use this skill to validate a model-family migration against the incumbent or to run a broader staged profile search. Treat quality as a hard gate before cost or speed and never infer runner compatibility from cache or catalog visibility.

## First Steps

1. If working inside the Soulforge repo on code, docs, structure, or skill work, read `docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md` first.
2. Decide whether dedicated LLM optimization is applicable. Use `optimization_not_applicable` for deterministic/script-backed workflows whose authoritative outcome is owned by validators and model choice only formats a non-authoritative report. Use `deferred_inactive` for inactive or unused workflows without a concrete risk, quality, or usage trigger.
3. Otherwise classify the intent as `migration_validation`, `profile_search`, a smoke/comparison, or skill/design discussion. Default model availability or pricing changes to `migration_validation`.
4. For actual optimizer runs, use the Codex App goal feature when available. See [run-flow.md](references/run-flow.md).
5. Resolve the target workflow, incumbent policy, and creator handoff files.
6. Preflight the exact executable runner and resolve supported efforts per model before building candidates. A cache entry or visible catalog row is not proof of execution support.
7. Keep candidate prompts free of golden output and golden-derived criteria.

Do not create a goal for skill design discussion, explanation, or planning-only questions.

## Safety Rules

- Do not use raw, private, secret, credential, mail, run-truth, or `_workspaces` material unless the user explicitly changes the boundary.
- Do not read `.env`, tokens, cookies, sessions, credential JSON, or secret values.
- Write calibration archives under `.workflow` only when fixtures, golden output, criteria, candidates, and telemetry are public-safe synthetic or redacted artifacts.
- Stop before writing any archive that contains actual project raw input, private transcripts, credentials, `_workspaces` material, or secret-derived content.
- Do not modify public repo files during optimizer runs unless the user explicitly asks for, or confirms, calibration archive/profile policy writes.
- Do not claim exact candidate-level tokens from subagent runs. Exact token telemetry requires an actual runner usage report or a CLI telemetry probe.
- Do not claim a migrated model won when the runner cannot launch, parse its catalog/capabilities, resolve its effort, or produce candidate output. Record `blocked_runner_catalog_incompatible` and retain the incumbent.
- Do not call a profile globally cheapest. Use `lowest_cost_passing_among_tested` and identify untested dimensions.
- Without workflow usage-frequency evidence, report per-run proxies or estimates only. Do not claim aggregate savings, payback, or ROI.

## Execution Mode

Choose one optimization intent before candidate execution:

- `migration_validation`: compare the incumbent with a bounded runner-supported migration shortlist while keeping incumbent species and class fixed. Use this by default for model availability, family, or pricing changes.
- `profile_search`: search model, effort, species, and class in stages. Use it for a first calibration, material workflow contract change, no passing migration candidate, unstable close results, or an explicit broader-search request.

Exhaustive Cartesian search always requires an explicit request or authorization. See [candidate-matrix.md](references/candidate-matrix.md) for shortlist and expansion rules.

## Workflow Handoff

Before calibration, confirm:

- `.workflow/<workflow_id>/workflow.yaml` exists.
- `.workflow/<workflow_id>/step_graph.yaml` exists when the workflow has steps.
- `.workflow/index.yaml` registers the workflow.
- `.workflow/<workflow_id>/profile_policy.yaml` exists as draft, or the optimizer is allowed to create it.
- `.workflow/<workflow_id>/calibrations/` exists, or the optimizer is allowed to create it.

If the target workflow does not exist yet, stop and ask the user to run the workflow creator first. This skill optimizes workflow-level policy, not a project-local run under `_workmeta/<project_code>/`.

## Run Flow

Use [run-flow.md](references/run-flow.md) for goal handling, quality baseline, and end-to-end run order.

Short form:

1. Preflight boundaries, executable runner, per-model efforts, telemetry, and pricing/billing sources.
2. Resolve workflow, incumbent, handoff files, and optimization intent.
3. Freeze public-safe candidate input and an applicable evaluator-only quality gate without golden leakage.
4. Run the migration shortlist or authorized staged search.
5. Evaluate quality first, then probe telemetry for passing candidates.
6. Archive capability, tested/untested scope, comparator, evidence sources, and selection claim.
7. Retain or replace the incumbent and update policy only when evidence supports it.
8. Complete the goal if one was started.

## Detailed References

- Use [candidate-matrix.md](references/candidate-matrix.md) for applicability, migration shortlist, staged expansion, and authorized Cartesian-search rules.
- Use [telemetry-and-evaluation.md](references/telemetry-and-evaluation.md) for CLI telemetry parsing, hard gates, quality schema, and scoring weights.
- Use [archive-and-policy.md](references/archive-and-policy.md) for calibration archive layout, profile policy fields, and final recommendation rules.

Load only the reference needed for the current step.
