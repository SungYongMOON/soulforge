---
name: workflow-optimizer
description: Optimize Soulforge workflow execution profiles across model, reasoning effort, species, and class. Use when the user asks to compare, optimize, smoke test, benchmark, or choose a lowest-cost passing profile for Soulforge workflows, including concerns about golden output quality, token usage, wall-clock time, reasoning tokens, or model/species/class selection.
---

# Workflow Optimizer

Use this skill to find the cheapest fast-enough profile that still produces usable Soulforge workflow output. Treat quality as a hard gate before optimizing cost or speed.

## First Steps

1. If working inside the Soulforge repo on code, docs, structure, or skill work, read `docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md` first.
2. Confirm the request is an actual optimizer run, a cheaper smoke, a comparison, or only skill/design discussion.
3. For actual optimizer runs, use the Codex App goal feature when available. See [run-flow.md](references/run-flow.md).
4. Resolve the target workflow and confirm creator handoff files before running candidates.
5. Keep candidate prompts free of golden output and golden-derived criteria.

Do not create a goal for skill design discussion, explanation, or planning-only questions.

## Safety Rules

- Do not use raw, private, secret, credential, mail, run-truth, or `_workspaces` material unless the user explicitly changes the boundary.
- Do not read `.env`, tokens, cookies, sessions, credential JSON, or secret values.
- Write calibration archives under `.workflow` only when fixtures, golden output, criteria, candidates, and telemetry are public-safe synthetic or redacted artifacts.
- Stop before writing any archive that contains actual project raw input, private transcripts, credentials, `_workspaces` material, or secret-derived content.
- Do not modify public repo files during optimizer runs unless the user explicitly asks for, or confirms, calibration archive/profile policy writes.
- Do not claim exact candidate-level tokens from subagent runs. Exact token telemetry requires an actual runner usage report or a CLI telemetry probe.

## Execution Mode

Default full calibration mode is `subagent_quality_first`:

1. Treat an actual full optimizer run request as approval to use this skill's default execution surfaces: isolated subagent/candidate runners for quality and CLI telemetry probes for quality-passing candidates.
2. Evaluate those isolated outputs and keep only candidates that pass the frozen quality gate.
3. Run CLI telemetry by default for quality-passing candidates.

Do not stop merely because the user did not separately mention subagents or CLI. Stop only when the runtime lacks the required subagent/candidate-runner surface or a higher-priority instruction explicitly blocks it. In that case, report `blocked_runtime_subagent_unavailable` and ask whether the user wants an explicitly labeled `cli_only_calibration` fallback. Do not silently replace the quality matrix with CLI runs.

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

1. Preflight boundaries, available models, and telemetry path.
2. Resolve workflow and handoff files.
3. Freeze public-safe candidate input without golden output.
4. Build an evaluator-only quality baseline and frozen quality gate.
5. Run the default candidate quality matrix.
6. Evaluate quality first.
7. Probe CLI telemetry only for quality-passing candidates.
8. Archive public-safe evidence under the target workflow.
9. Update `profile_policy.yaml` and a public-safe history note when policy changes.
10. Recommend `model`, `reasoning_effort`, `species`, and `class`.
11. Complete the goal if one was started.

## Detailed References

- Use [candidate-matrix.md](references/candidate-matrix.md) for default full and staged candidate sets.
- Use [telemetry-and-evaluation.md](references/telemetry-and-evaluation.md) for CLI telemetry parsing, hard gates, quality schema, and scoring weights.
- Use [archive-and-policy.md](references/archive-and-policy.md) for calibration archive layout, profile policy fields, and final recommendation rules.

Load only the reference needed for the current step.
