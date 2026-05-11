---
name: soulforge-workflow-generator
description: Use when Codex must generate, evolve, or validate format-agnostic workflows through evidence-driven evaluation. Supports workflow creation from fresh objectives, multi-skill workflow design, fixture-driven workflow evolution, single-skill build/modify when needed, goal reconstruction, and skill extraction after success while preserving fresh executor/verifier separation, cumulative same-run artifact chaining for warm transformation rounds, source-packet provenance, baseline replay gates, and strict oracle boundaries.
---

# Soulforge Workflow Generator

## Purpose

Generate, evolve, or validate reusable workflows through evidence-backed stages. Act as controller A: define the objective, isolate inputs, route work to fresh executor and verifier contexts when authorized, log evidence, improve only from allowed evidence, and stop with a clear state.

This skill is format-agnostic. Treat XML, Markdown, JSON, YAML, PDFs, slide decks, spreadsheets, images, CAD exports, drawings, and tool-native files as possible artifacts. Route by artifact role:

- `baseline_artifact`: original input or starting state.
- `reference_artifact`: oracle, accepted answer, or target artifact visible only to V in benchmark mode.
- `candidate_artifact`: output produced by B or the workflow.
- `source_packet`: approved non-oracle evidence used for construction.

## Load References

Keep this `SKILL.md` as the operating router. Load only the reference needed for the current decision:

- `references/run-governance.md`: goal declaration, run manifest, output states, continuation policy, and after-round governance.
- `references/mode-boundaries.md`: controller mode selection and boundary differences.
- `references/run-storage-policy.md`: where to write run roots, evidence, and public-safe workflow packages.
- `references/oracle-boundary.md`: REF/oracle handling and redaction rules.
- `references/preflight-source-survey.md`: source sufficiency and seed workflow readiness.
- `references/source-packets.md`: source packet shape and source-bootstrap handoff.
- `references/workflow-evolution.md`, `references/hybrid-evolution-loop.md`, `references/fixture-queue.md`, `references/regression-matrix.md`: workflow evolution and fixture-driven runs.
- `references/goal-reconstruction.md`: one-off reconstruction when reusable benchmark evidence is no longer valid.
- `references/workflow-extraction.md`: extracting a reusable workflow from successful run logs.
- `references/evaluation-loop.md`: target brief, scorecard, B/V prompt templates, comparison notes, and stop condition templates.
- `references/verification-gate.md`: structure validator, fresh B execution, separate V verification, strict reference-level verification, and completion status labels.
- `references/scaleup-constraints.md`: limits before editing a target skill or growing this workflow.

Use bundled scripts without loading their source unless debugging them:

- `scripts/prepare_isolated_eval_workspace.py`: create a B-visible workspace that excludes hidden oracle/reference files.
- `scripts/prepare_verification_workspace.py`: create a V-only workspace with candidate, oracle/reference, and contract files.

## Start Gate

For any non-trivial workflow run, declare the goal before material stages. If Codex goal tools are available, check the active goal, create or reuse a matching goal, and stop on a conflicting active goal. Also write `run_evidence/GOAL_DECLARATION.yaml` before run manifests, source stages, B/S/V prompts, candidate construction, reference comparison, or registration decisions. See `references/run-governance.md`.

The goal must include the lifecycle, not only the next artifact: same-run candidate versions when needed, fresh subagent stage logs, workflow extraction from logs, and baseline replay. Success and stop conditions must both be explicit.

If subagent authorization is absent and a real B/V run is required, stop with the exact authorization needed. Do not convert the task to `design_only` merely because fresh execution is blocked.

## Quick Routing

Select the narrowest controller mode that fits:

| Mode | Use when | Output evidence |
| --- | --- | --- |
| `single_skill_build` | Create a bounded target skill B. | B package plus validation evidence. |
| `single_skill_modify` | Improve an existing target skill B. | Minimal B edits plus validation evidence. |
| `multi_skill_workflow` | The task needs separate R/B/S/V/tool roles or handoffs. | Workflow draft or executed workflow evidence. |
| `workflow_evolution` | Multiple fixtures, repeated rounds, or warm learning before cold replay is expected. | Evolution logs, strategy ledger, replay evidence. |
| `goal_reconstruction` | Solve one concrete case safely when reusable benchmark evidence is not the priority. | Case solution evidence, reclassified from skill validation if oracle details enter construction. |
| `skill_extraction_after_success` | A successful one-off solution exposes a repeatable bounded procedure. | Candidate skill/workflow extraction packet. |

Default to `workflow_evolution` when several fixtures or repeated learning rounds are present. Default to `multi_skill_workflow` when several roles or skills are naturally required. Use `single_skill_build` or `single_skill_modify` only when the target is narrow and repeatable.

## Completion Target

Choose a completion target from the user's latest request and visible artifacts:

- `design_only`: only when the user explicitly asks for a plan/draft or forbids execution.
- `pilot_execute`: when the user gives a concrete workflow task and does not forbid construction or verification.
- `prove_to_canon`: when a reference/oracle, validation expectation, or reliable reusable workflow is requested.
- `auto_register`: only when the user or manifest explicitly authorizes registration after success.

A workflow draft is only a checkpoint for `pilot_execute`, `prove_to_canon`, or `auto_register`. Continue into source/bootstrap, execution, verification, and cold/final gates when safely authorized. If blocked, preserve the higher target and report `output_state: blocked` with the blocker.

## Core Artifact Discovery Loop

When the user provides a baseline artifact and a hidden reference/oracle artifact, the job is to discover a repeatable source-bound transformation, not to handcraft a draft.

Use this loop:

1. Create a fresh run root and goal declaration.
2. Treat the baseline as construction input and the reference as V-only comparison input.
3. Run material R/B/S/V stages through fresh contexts when authorized.
4. Give B only the allowed current input artifact, approved non-oracle sources, workflow or skill instructions, and safe tool constraints.
5. After B produces a candidate, give V only the candidate, reference/oracle, acceptance contract, and verifier-only instructions.
6. Require V to return a redacted verdict, never exact reference content, coordinates, object IDs, payloads, or patch instructions.
7. Log every stage: role, prompt, visible inputs, outputs, commands, candidate path, verdict, failure class, strategy decision, and edits.
8. Change strategy from evidence: add source packets, improve handoffs, adjust tool roundtrip, split roles, or tighten verification.
9. After warm learning, extract the workflow from logs and run a cold replay from the original baseline with no warm artifacts or V reports.
10. Stop with a concrete blocker when the next improvement requires target-scope/source/owner judgment or would cross a boundary.

Stage-preparation artifacts are not stage execution evidence. A package containing only R/B/S/V prompts remains a draft checkpoint unless fresh stages actually ran.

## Candidate Chain Gate

For warm artifact-transformation discovery, use a cumulative same-run artifact chain:

```text
EXP0_baseline -> B1 -> EXP1
EXP1 -> B2 -> EXP2
EXP2 -> B3 -> EXP3
```

Only B1, cold replay, and final clean replay start from the original baseline. After B1, B receives the immediately previous same-run candidate and writes the next candidate. Do not restart B2/B3 from the baseline unless the run is `baseline_fixed_skill_eval`, `cold_replay`, `final_cold_gate`, or another explicitly baseline-fixed mode.

Every chained B prompt must include the predecessor candidate path, successor candidate path, operation ledger or cumulative edit summary, approved source/schema/scope packets, a ban on resetting to the original baseline, and a self-check that prior accepted components persist unless removed with source-backed rationale.

If a warm artifact-transformation run cannot use same-run chaining, stop as `blocked_invalid_artifact_chain_policy`.

## Fresh Run Guard

A fresh run may inspect only the current user request, approved baseline artifacts, approved non-oracle public/local sources, tool help, schemas, library metadata, and files created under the current run root after `GOAL_DECLARATION.yaml`.

Do not use sibling runs, older run roots, old candidates, old verdicts, old source packets, repair packets, or similarly named files as construction evidence unless the user explicitly asks to continue that specific run. If a search finds prior-run material, record it as ignored and do not pass it to R, B, S, or V.

Inputs for R and B must be copied or generated into the current run root or an isolated workspace. V receives only the current candidate, verifier-only reference/oracle, and current acceptance contract.

## Source-Bootstrap Policy

When the task says to find official docs, datasheets, standards, examples, source images, or source links, missing prebuilt source packets are not an immediate blocker. Define an R/source-bootstrap stage that reads only approved non-oracle inputs and produces source discovery packets or source packets.

B must not receive REF, V reports, older-run candidates, A diagnosis, or oracle-derived repair details. S checks source support without REF. V compares to REF only after a candidate exists and only in a separate verifier context.

Use redacted V gaps to improve workflow capability, source search, packet schemas, B instructions, or verifier contracts. Do not convert V output into exact REF-derived construction targets.

## A/B/V Roles

Keep these roles separate:

- A is the controller. A may inspect allowed sources, prepare packets, edit the skill/workflow, run deterministic validators, and decide next actions.
- B is the executor. B execution evidence must come from a fresh-context executor subagent when real testing is required and authorized.
- S is source/boundary support checking without REF.
- V is the verifier. V is a separate fresh-context verifier subagent that can read the reference/oracle only after B has produced a candidate.

In benchmark or skill-validation mode, A is oracle-blind. A must not inspect raw oracle/reference artifacts or detailed oracle-derived mismatch reports. B must never receive the oracle/reference, V reports, A's diagnosis, expected answers, previous candidates, or repair packets unless the mode is explicitly `discovery_repair` and the packet is sanitized.

## Existing B Skill Evaluation Modes

Use `baseline_fixed_skill_eval` when proving that a target B skill can transform the original baseline into a reference-level result. Every round starts from the fixed baseline input workspace, not a previous candidate. This is the only mode that can support `verified-against-reference`, and only after a final clean run.

Use `discovery_repair` only when the benchmark is explicitly about mismatch discovery or repair. It may improve a skill, but it cannot produce `verified-against-reference` evidence.

Read `references/verification-gate.md` before reporting `usable`, `production-ready`, or `verified-against-reference`.

## Workflow Evolution

For workflow evolution, record `starting_state`, `evolution_phase`, fixture identities, and allowed inputs.

- `warm_evolve`: learn from same-run candidate chains, redacted V verdicts, source packets, and tool logs.
- `cold_replay`: replay the extracted workflow from the original baseline or fixture input without warm candidates, verifier reports, repair packets, A diagnosis, or oracle/reference material.
- `final_cold_gate`: final fresh replay before readiness or registration claims.

If no workflow exists, run preflight/source survey and create a minimal seed workflow from the user goal, baseline summary, approved non-oracle source packets or source-bootstrap R stage, tool constraints, and benchmark-safe acceptance criteria.

## Output States

When reporting a workflow state, use exactly one of these `output_state` values and name the exact location:

- `draft`
- `pilot-ready`
- `pilot-executed`
- `canon-ready`
- `registered`
- `blocked`

Do not say "workflow created" without naming whether this means draft, pilot-ready, pilot-executed, canon-ready, registered, or blocked. See `references/run-governance.md` for package shapes and registration safety conditions.

## Intake

Infer the smallest useful brief:

- controller mode and completion target
- target skill B path or target workflow path
- fixture queue root when evolving over fixtures
- user-level result and "good enough" bar
- must-have, should-have, and nice-to-have criteria
- artifact roles and fixed baseline/reference identities
- non-negotiable private/public/secret/tool boundaries
- source packet status and source-bootstrap need
- max rounds, budget, stop conditions, and human-decision gates

Ask only when the target path, fixture queue, write boundary, source approval, reference access policy, or subagent authorization would be unsafe to infer.

## Verification And Acceptance

Before any completion report after creating or editing a skill/workflow:

1. Run the Codex skill structure validator for any changed Codex skill folder.
2. Run safe `--help`, dry-run, or minimal fixture checks for changed scripts.
3. Use fresh B executor subagents for real B execution when authorized.
4. Use separate V verifier subagents for reference/oracle or independent validation.
5. Compare V's redacted report against the acceptance contract.
6. Report missing fresh B/V verification as a blocker or pending status, not as production-ready.

Acceptance levels:

- `draft`: valid structure and clear workflow, but fresh execution or independent verification may be absent.
- `usable`: at least one B executor pass plus one separate V verifier pass when required, no must-have failures, no score below 2.
- `production-ready`: at least two B-to-V fresh-context cycles when required, no must-have failures, no score below 2, `target_match` and `boundary_safety` at 3, and no unresolved artifact-level V conditions.
- `owner-approved`: the user explicitly accepts remaining gaps.

## Stop Conditions

Stop or pause when:

- the pass rule is met
- max iterations, runtime, or token budget is reached
- the same residual mismatch repeats twice
- score improvement stalls twice
- V evaluators conflict
- a `baseline_fixed_skill_eval` baseline changes
- protected public contract changes are needed without authorization
- source-supported output still fails REF due to target-scope/minimization/population/no-connect/intent ambiguity and no new non-oracle evidence is available
- an oracle-contract/O role would inspect REF without explicit latest-request authorization
- the next step requires user/domain judgment, private data, secrets, external side effects, or canon promotion approval

After every round, choose and record the next action yourself when safe. Use `references/run-governance.md` for `next_action_type` values and human-decision gates.

## Resources

- Governance and reporting: `references/run-governance.md`.
- Evaluation templates: `references/evaluation-loop.md`.
- Verification gates: `references/verification-gate.md`.
- Mode and boundary refs: `references/mode-boundaries.md`, `references/oracle-boundary.md`, `references/goal-seeking-exploration.md`, `references/scaleup-constraints.md`.
- Workflow refs: `references/workflow-evolution.md`, `references/hybrid-evolution-loop.md`, `references/preflight-source-survey.md`, `references/fixture-queue.md`, `references/regression-matrix.md`, `references/goal-reconstruction.md`, `references/workflow-extraction.md`.
- Evidence and source templates: `references/run-storage-policy.md`, `references/RUN_MANIFEST.yaml`, `references/source-packets.md`, `references/STRATEGY_LEDGER.yaml`, `references/SOURCE_DISCOVERY_PACKET.yaml`, `references/EXPERIENCE_PACKET.yaml`, `references/REDACTED_VERDICT.yaml`, `references/WORKFLOW_EXTRACTION_PACKET.yaml`, `references/source-index.md`.
- Isolation scripts: `scripts/prepare_isolated_eval_workspace.py --run-root <run_root> --dest <dest> --allow <file>` and `scripts/prepare_verification_workspace.py --run-root <run_root> --dest <dest> --candidate <candidate> --oracle <oracle>`.
