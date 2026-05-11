---
name: soulforge-workflow-generator
description: Use when Codex must generate, evolve, or validate format-agnostic workflows through evidence-driven evaluation. Supports workflow creation from fresh objectives, multi-skill workflow design, fixture-driven workflow evolution, single-skill build/modify when needed, goal reconstruction, and skill extraction after success while preserving fresh executor/verifier separation, baseline artifact immutability, source-packet provenance, and strict oracle boundaries.
---

# Soulforge Workflow Generator

## Purpose

Generate or improve a target workflow through an evaluation-driven loop: select the correct mode, define the target behavior, identify artifact roles, test the current workflow or selected skill in fresh executor contexts, verify outputs with separate verifier contexts when needed, modify only evidence-backed files, run regressions, and stop at the configured boundary.

Use this skill as workflow-generator/controller A. A may create or modify multi-skill workflows, create or modify a target skill B when the workflow requires it, run goal reconstruction, or extract a reusable skill after a successful one-off solution. Existing B skill creation/optimization behavior remains valid and must keep the fresh B executor and separate V verifier rules below.

A is format-agnostic. Treat XML, Markdown, JSON, YAML, PDFs, slide decks, spreadsheets, images, CAD exports, drawings, and tool-native files as possible artifact formats. Route by artifact role, not file extension:

- `baseline_artifact`: original input or starting state supplied to construction.
- `reference_artifact`: oracle, accepted answer, or target artifact reserved for verifier-only use in benchmark mode.
- `candidate_artifact`: output produced by B or the workflow.
- `source_packet`: approved non-oracle domain evidence used for construction.

## Concrete Artifact Discovery Loop

When the user gives a baseline artifact and a hidden reference/oracle artifact and wants A to discover a repeatable way to transform the baseline into a reference-level candidate, the core job is not to write a draft. The core job is to run controlled attempts, learn from redacted verification, and distill the successful or blocked procedure into a workflow.

Use this operating spine before all detailed mode rules:

1. Create a fresh run root and record the user's latest request without strengthening or narrowing it.
2. Treat the baseline as B-visible construction input and the reference as V-only comparison input.
3. Execute each material stage through a fresh subagent context. A may prepare packets and inspect outputs, but stage packets alone are not evidence that the stage works.
4. Give each construction attempt to a fresh B executor subagent with only the allowed current input artifact, approved non-oracle sources, current workflow or skill instructions, and safe tool constraints. In warm iterative authoring, the allowed current input may be the previous same-run candidate such as `EXP_v1.xml` when the manifest records the candidate chain. A must not construct the candidate in its own context when the purpose is to test repeatability.
5. After B produces a candidate, give only the candidate, reference, acceptance contract, and verifier-only instructions to a separate fresh V verifier subagent when reference comparison is active.
6. V returns a redacted verdict. It must not return exact reference content, coordinates, object ids, payloads, or patch instructions that B could copy.
7. A logs every executed stage and attempt: subagent role, prompt, allowed inputs, outputs, candidate path when present, tool commands, stage log, verdict, failure class, strategy decision, and any workflow/skill edit made from non-oracle evidence plus redacted capability gaps.
8. A inspects stage outputs before advancing. R must produce usable source packets or a source blocker; B must produce a candidate or construction blocker; S must check source/boundary support without REF; V must compare only after a candidate exists and return a redacted verdict.
9. A changes strategy instead of blindly retrying: add source packets, improve stage handoff, adjust tool roundtrip, split responsibilities, or tighten verification as evidence requires.
10. After warm learning appears successful, run a cold replay from the original baseline in fresh subagent contexts. The replay may create its own `EXP_v1`, `EXP_v2`, and later intermediate candidates as prescribed by the learned workflow, but it must not receive warm-run candidate files, V reports, A diagnosis, or repair packets as inputs.
11. Only after cold replay passes, or after a concrete blocker is recorded, distill the run logs into a workflow draft/candidate for promotion.
12. If a redacted V verdict says the candidate is source-supported and boundary-safe but fails the reference match because of target-scope selection, minimization, population choice, no-connect discrimination, or accepted-intent ambiguity, do not treat that as a normal `continue_round`. Stop as `blocked_pending_target_scope_constraint` unless a new approved non-oracle source packet can be obtained before the next B round.
13. Authorization to compare with REF authorizes V only. Do not run an oracle-contract or acceptance-contract abstraction role that inspects REF unless the user's latest request explicitly authorizes that oracle-contract role or asks for a generalized acceptance contract derived from the oracle.

For this discovery loop, `workflow_draft` and stage prompts are checkpoints only. They are not the requested outcome unless the user's latest request explicitly says to stop before any B attempt, candidate construction, or V comparison. If subagents are required but unavailable or unauthorized, report `blocked_pending_subagent_execution`; do not convert the run to `design_only`.

Stage-preparation artifacts are not a substitute for stage execution. A workflow package that contains only R/B/S/V packets but no fresh subagent stage logs remains `blocked` when execution is required, or a draft checkpoint when the user explicitly asked for design-only; it is not `pilot-executed`.

## Log-To-Workflow Replay Gate

Warm authoring may proceed through several same-run candidate versions, but those versions are not the final reusable workflow. Once a stage or candidate chain works well enough to learn from, A must extract the actual workflow from the run logs: stage prompts, allowed inputs, source packets, candidate-chain records, tool commands, validators, redacted verifier verdicts, blockers, and strategy decisions.

Before claiming the workflow works, run a replay from only the original baseline artifact and approved non-oracle sources. The replay executor must not receive warm-run candidate files, prior stage logs as instructions, V reports, A diagnosis, or old repair packets. It may create fresh intermediate files such as `EXP_v1`, `EXP_v2`, and `EXP_v3` as outputs of the replayed workflow. If replay fails, keep the workflow as learned-but-unproven and return to warm learning or report the concrete blocker.

For reference-backed artifact workflows, acceptance is always measured against the original reference/oracle artifact through a separate V verifier. Do not use an earlier warm candidate, first successful candidate, or replay intermediate as the reference. Warm candidates may guide A-side workflow extraction only through logs and redacted verdicts; the pass/fail comparison remains `current_candidate` versus the original V-only reference.

## Fresh Run Contamination Guard

Fresh means no construction or verification input may come from sibling runs, older run roots, older-run candidates, older-run verdicts, older-run stage packets, older-run source packets, prior repair packets, or files found only because their names look similar, such as old `round*`, `candidate*`, `verdict*`, `SOURCE_PACKETS`, or workflow draft files.

This guard does not prohibit an explicit same-run warm candidate chain. A fresh run may create and use its own recorded sequence, for example `EXP_v0_baseline.xml -> EXP_v1.xml -> EXP_v2.xml -> EXP_v3.xml`, when the current manifest records each link as same-run evidence and B receives only the immediately allowed predecessor plus approved non-oracle sources.

For a fresh run:

- A may inspect only the current user request, approved baseline artifacts, approved non-oracle public/local sources, tool help, schemas, library metadata, and files created under the current run root after `GOAL_DECLARATION.yaml`.
- Do not search old run roots for construction shortcuts. If a broad file search accidentally finds similar prior-run files, record them as `ignored_prior_run_artifacts` and do not pass them to R, B, S, or V.
- B and R inputs must be copied or generated into the current run root or an isolated workspace for this run. They must not reference sibling run paths.
- Same-run candidate chaining must be explicit: record `candidate_chain_used: true`, `candidate_chain_decision_reason`, `candidate_chain`, predecessor path, successor path, responsible subagent, allowed sources, and why the next round starts from that predecessor.
- If a warm run does not use same-run candidate chaining, record `candidate_chain_used: false` and `candidate_chain_decision_reason` before the next B round. The reason must explain why restarting each candidate from the baseline is cleaner, safer, or more probative than continuing from the previous candidate.
- V may receive only the current candidate, the verifier-only reference/oracle artifact, and the current acceptance contract.
- Reusing prior run evidence is allowed only when the user's latest request explicitly asks to continue or reuse that specific run. In that case, this is not a fresh run; record the inherited run id and visible artifacts before any stage executes.

## Minimal Natural-Language Workflow Requests

The user does not need to provide controller terminology. Treat a request like "the workflow I want to make is..." followed by a baseline-to-candidate procedure as a concrete workflow discovery request, not a design-only request. For example, a request that says to inspect an EXP/XML/baseline artifact, identify contained parts or objects, find official documentation, construct a new artifact, add evidence notes, embed approved source images, and record source links is enough to start the discovery loop.

For this minimal request shape:

- Infer `controller_mode: multi_skill_workflow` unless several fixtures are provided, in which case use `workflow_evolution`.
- Infer `completion_target: pilot_execute` when no reference/oracle artifact is provided or available from the current explicit context.
- Infer `completion_target: prove_to_canon` when a reference/oracle artifact path is provided, or when the current explicit context already identifies one for this same baseline.
- Infer `source_bootstrap_required: true` when the task asks to find official docs, datasheets, standards, examples, source images, or source links.
- If the baseline path is omitted but an artifact name like `EXP.xml` is unambiguous from the latest explicit context, record the inferred path and the inference basis. If it is ambiguous, ask for the baseline path rather than drafting a generic workflow.
- If the latest request or current explicit thread context already authorizes fresh subagents, delegation, forward testing, or direct execution, record that authorization in the goal evidence and proceed. Natural-language phrases meaning "run it", "execute it", or "continue with execution", including equivalent Korean phrasing, count as authorization for the active request unless the user also sets a limiting boundary. Do not ask for the same authorization again.
- If subagent authorization is absent, check it immediately after the goal declaration and before treating any draft package or stage-prompt bundle as useful progress. It is valid to stop as `blocked_pending_subagent_execution` with the exact one-line authorization needed. Do not lower the target to `design_only`, and do not present blocker-prep artifacts as if the workflow goal was achieved.
- When subagent authorization exists and the runtime supports subagents, A is responsible for spawning the required R/B/S/V subagents. Do not put "authorize subagents" or "run subagents" back on the user as the next action. Stop only if the subagent runtime is unavailable, a required path/tool is missing, or the next action would cross an explicit safety boundary.
- Do not require the user to say "not draft-only", "continue", "prove_to_canon", "fresh B", "fresh V", or "redacted verdict" when the requested workflow clearly requires controlled artifact construction and comparison.

## Codex Goal And Run Evidence Declaration Gate

For a non-trivial `$soulforge-workflow-generator` run, Codex goal tracking is the live execution goal and `run_evidence/GOAL_DECLARATION.yaml` is the persistent evidence lock. Use both when the runtime exposes Codex goal tools.

At run start, A must check the active Codex goal state. If no active goal exists, create a Codex goal whose objective matches the user's latest workflow objective before material stages. If an active goal already exists and matches the workflow objective, continue and record the existing goal status. If an active goal exists but conflicts with the workflow objective, stop before material stages and ask the user whether to finish, replace, or keep the existing goal. Do not silently run a new workflow under an unrelated active goal.

For concrete artifact discovery, the Codex goal objective must include the full discovery lifecycle at a compact level: create same-run candidate versions as needed, log each fresh subagent stage, extract reusable workflow steps from those logs, then replay the extracted workflow from the original baseline. Do not reduce the goal to only "make a candidate" or only "compare with REF".

The Codex goal must also say how the run ends. Write it as an objective with an explicit success condition and stop condition, not as an open-ended instruction to keep trying. For reference-backed artifact discovery, use this shape unless the user gives a stricter one:

```text
Discover a source-bound workflow from <baseline_artifact> that produces a <candidate_artifact> using approved non-oracle evidence. Execute material stages in fresh subagent contexts and compare the current or final candidate with <reference_artifact> through V-only verification. Success means V passes, then A extracts the reusable workflow from logs and runs a cold replay from the original baseline. Stop with blocker and log paths if V does not pass and no new approved non-oracle source evidence or public-safe constraint remains, or if a boundary, budget, or human-decision condition is reached.
```

Do not put "all candidates", "always compare", "run until pass", or "continue rounds until solved" in the Codex goal unless the user's latest request explicitly uses that scope. Prefer "current or final candidate" for REF comparison scope. The goal should make a blocked result legitimate when the safe evidence path is exhausted.

Every non-trivial workflow run must also start by creating a unique run root and writing `run_evidence/GOAL_DECLARATION.yaml`. The user does not need to explicitly ask for this file; it is a mandatory first artifact for Workflow Generator.

`GOAL_DECLARATION.yaml` must be written before:

- run manifest finalization
- seed workflow or workflow draft materialization
- source-bootstrap or preflight execution
- B/S/V/tool subagent prompts
- candidate construction
- reference/oracle verification
- registration or promotion decisions

The declaration must capture:

```yaml
goal_lock_status: declared
codex_goal_status: created|existing_matching|unavailable|blocked_conflicting_goal
codex_goal_objective:
codex_goal_success_condition:
codex_goal_stop_conditions:
codex_goal_lifecycle:
  candidate_chain_required: true|false
  log_to_workflow_extraction_required: true|false
  baseline_replay_required: true|false
declared_before_material_stages: true
objective:
user_task_prompt:
user_task_prompt_policy: verbatim_or_explicitly_labeled_summary
completion_target: design_only|pilot_execute|prove_to_canon|auto_register
completion_target_basis:
  latest_user_request_id_or_timestamp:
  verbatim_user_stop_words:
  concrete_execution_target_present: true|false
  explicitly_forbids_pilot_execution: true|false
  explicitly_forbids_candidate_construction: true|false
  explicitly_forbids_verification: true|false
  reference_or_validation_requested: true|false
  ambiguity_status: clear|ambiguous
  ambiguity_notes:
controller_mode:
artifact_roles:
  baseline_artifact_path:
  reference_artifact_path:
  reference_access_policy:
  candidate_artifact_policy:
  candidate_comparison_scope: current_candidate|final_candidate|all_candidates_explicit
fresh_run_root:
no_prior_run_evidence_for_construction: true
source_policy:
subagent_authorization_status:
stage_log_root:
stop_or_block_conditions:
```

If Codex goal tools are unavailable in the current runtime, record `codex_goal_status: unavailable` and continue with the file-based evidence gate. If they are available, `GOAL_DECLARATION.yaml` does not replace the Codex goal; it records the exact run objective, boundaries, and evidence-lock details needed for replay and audit.

Goal text integrity is part of the gate. `user_task_prompt` must preserve the latest user request verbatim when feasible. If the prompt is summarized because it is long or spread across messages, label it as a summary and keep `completion_target_basis` tied to exact quoted stop words or an explicit message reference. A must not add stronger limiting words such as "only", "do not execute", "do not build candidate", or "do not verify" unless those limits appear in the user's latest request. A must also not add stronger quantifiers such as "all", "every", "always", "never", or "only" to the Codex goal objective or run objective unless the user's latest request uses that scope.

For reference comparison language, preserve the user's scope. If the user says to compare "the result" or "the candidate" with REF, record `current_candidate` or `final_candidate` as appropriate. Do not rewrite it as "all candidates" unless the user explicitly asks every candidate or every intermediate output to be compared.

If the completion target is ambiguous, do not silently choose the lower target. For a concrete task with baseline/source artifacts, choose `pilot_execute` unless the user explicitly forbids pilot execution, candidate construction, and verification for the current run. For a task with a reference/oracle or validation expectation, choose `prove_to_canon` unless the user explicitly limits the run to design-only. If ambiguity changes the target, set `ambiguity_status: ambiguous`, record the exact ambiguity, and either choose the higher safe target with a clear blocker or ask for clarification when proceeding would cross a protected boundary.

If A discovers that a material stage already ran before `GOAL_DECLARATION.yaml` existed, the run is not valid workflow-generation evidence. Stop, record `stop_reason: missing_pre_stage_goal_declaration`, and either restart in a new fresh run root or report `blocked` if restart is not safe.

## Research Gate Policy

Every non-trivial workflow generation run must include a research gate after the run goal evidence is written and before seed workflow construction. This gate is part of Workflow Generator's controller work; it does not require a separate research skill by default.

At the research gate, A must decide and record two different things:

- `generator_research`: the non-oracle source survey needed to design the workflow safely.
- `internal_workflow_research`: whether the generated workflow itself needs a recurring or conditional R/researcher stage when it runs.

If the generated workflow needs internal research, A must define that R stage in the workflow: trigger, subagent role, stage packet inputs, allowed sources, forbidden oracle/reference material, expected source discovery packet or source packet, gap register, stage log, and handoff to construction or verification. If internal research is not needed, A must record why the workflow can run from fixed inputs, cached source packets, or owner-approved samples.

Create a separate research skill only after the R stage repeats across workflows and its packet shape, provenance rules, sufficiency scoring, and verification checks are stable enough to extract.

## Source-Bootstrap Construction Policy

When the user task itself says how to obtain construction evidence from non-oracle sources, missing prebuilt source packets are not an immediate blocker. Treat the source packet as an output of the workflow's R stage, not as a required precondition. Examples include tasks that say to inspect a baseline artifact, identify entities or objects, find official documentation or approved local metadata, use reference examples from those sources, add cited notes, embed approved assets, or preserve source links.

For source-bootstrap tasks:

- Select `multi_skill_workflow` or `workflow_evolution` with an internal R stage before declaring `blocked_pending_non_oracle_source_packet`.
- R reads only the user goal, baseline artifact, approved public or local non-oracle sources, tool help, schemas, and library metadata. R must not read the reference/oracle artifact or V-only reports.
- R writes `source_discovery_packet` and one or more executor-approved `source_packet` files with citations, sufficiency scoring, missing-source gaps, asset availability, and tool/format constraints.
- B receives only the allowed current input artifact, current workflow or skill instructions, approved source packets, safe task prompt, and tool constraints. For round 1 this is usually the baseline artifact; for an explicit same-run warm candidate chain it may be the immediately previous same-run candidate. B must not receive REF, V reports, older-run candidates, A diagnosis, or oracle-derived repair details.
- S or source verification checks that B's output is supported by source packets and does not need REF.
- V may compare the candidate with REF only after a candidate exists and only in a separate verifier context. V returns redacted verdicts: pass/fail, score, failure class, abstract delta, missing capability, source gap, boundary issue, and confidence.
- A may use redacted V gaps to improve the workflow, R search criteria, source-packet schema, B instructions, or verifier contract. A must not convert V output into exact REF-derived construction targets.
- After warm learning changes the workflow, run `cold_replay` from the original baseline with only approved source packets. Cold replay may reproduce the learned multi-step candidate chain from scratch, but it must not use warm-run intermediate files as inputs. Before readiness, registration, or verified-against-reference claims, run `final_cold_gate`.

Stop for an owner sample or human decision only after source-bootstrap R fails or cannot safely continue: sources cannot be located or conflict, source approval is ambiguous, a required representation/tool/export pattern is unavailable, an asset cannot be legally or safely embedded, external side effects are needed, or the next step would expose oracle/secret/private material to construction.

## Reusable Stage Governance

When multiple generated workflows contain similar steps, A must not immediately merge them into one shared skill. First record a `reusable_stage_candidate` in the run evidence or workflow extraction packet, including the duplicated behavior, input/output shape, allowed sources, forbidden context, dependent workflows, observed variations, and regression fixtures.

Use this promotion order:

1. Keep the behavior as workflow-local stages while evidence is thin or variations are still changing.
2. Promote repeated behavior to a stage template or workflow fragment when it appears in several workflows but the contract is not stable.
3. Extract a shared skill only after the input/output contract, boundary rules, validation checks, and compatibility expectations are stable enough to version.

Shared skills must be treated like versioned contracts. Workflows should depend on a skill id and expected contract/version, not on undocumented behavior. Before changing a shared skill, A must list dependent workflows, decide whether the change is compatible, run or schedule regression checks, and use a new major version or new skill id for breaking changes. Token, model, species, class, party, and other execution tuning belongs in project-local binding or mission assignment, not in the shared skill contract.

## Quick Routing

Declare one mode in the run manifest before changing files or running evaluators:

| Mode | Use When | Evidence Meaning |
| --- | --- | --- |
| `single_skill_build` | A narrow, repeatable capability needs a new B skill. | Skill-build evidence after required validation. |
| `single_skill_modify` | An existing skill needs focused improvement. | Skill-modification evidence after required validation. |
| `multi_skill_workflow` | The request has multiple responsibilities, such as source review, construction, tool operation, verification, and evidence packaging. | Workflow design/evaluation evidence. |
| `goal_reconstruction` | The goal is to solve one concrete case by any safe means. | Case solution evidence, not skill-validation evidence when reference/oracle material is used for construction. |
| `workflow_evolution` | Multiple fixtures/examples are provided, or the user asks to evolve a workflow across a fixture queue. | Hybrid evolution evidence: warm learning packets plus cold replay/final gate validation and regression matrix. |
| `skill_extraction_after_success` | A one-off or workflow solution succeeds and a reusable skill should be extracted from proven steps. | Extraction candidate evidence; requires separate skill validation before readiness claims. |

Default to `workflow_evolution` when the user provides multiple fixtures, asks for repeated rounds, or expects the workflow to learn from candidate/verifier loops before a cold final gate. Default to `multi_skill_workflow` when the task naturally requires several roles or skills. If a hidden reference exists but the user goal defines a source-bound construction path from approved non-oracle sources, do not treat the unknown reference as a reason to block before round 1; create an R/source-bootstrap stage, then B/S/V stages. Use `single_skill_build` or `single_skill_modify` only when the request is narrow and repeatable. Use `goal_reconstruction` when the priority is solving one concrete case safely rather than proving a reusable skill, especially when reference/oracle material must enter construction.

Read `references/mode-boundaries.md` after mode selection. Read `references/run-storage-policy.md` before writing run evidence. Read `references/oracle-boundary.md` whenever a reference/oracle artifact exists. Read `references/goal-seeking-exploration.md` whenever a method fails, stalls, or repeats a residual mismatch. For workflow evolution, read `references/workflow-evolution.md`, `references/hybrid-evolution-loop.md`, `references/fixture-queue.md`, and `references/regression-matrix.md`. For one-off reconstruction, read `references/goal-reconstruction.md`. Before creating a seed workflow or skill from incomplete evidence, read `references/preflight-source-survey.md`. For any construction that depends on domain facts, standards, examples, library metadata, or assets, read `references/source-packets.md`. For extraction after a successful run, read `references/workflow-extraction.md`.

## Workflow Terminology And Completion Target

Use precise workflow terms. Do not use "workflow created" or "workflow generation complete" as a standalone completion claim.

- `workflow_draft`: a materialized procedure design under the run root. It may include stage packets and templates, but it has not proven that the procedure works.
- `pilot_ready_workflow`: a draft plus enough bindings or stage packets to run one controlled attempt. It is ready to execute, not proven.
- `pilot_executed_workflow`: at least one material R/B/S/V/tool stage ran from the workflow and produced a candidate, verifier verdict, or concrete blocker with logs.
- `canon_ready_workflow`: the workflow passed the required cold/final gate, or an explicitly owner-approved equivalent, and can be promoted safely.
- `registered_workflow`: the canon-ready package was promoted into `.workflow/<workflow_id>/` and indexed under an explicit registration policy.

Record `completion_target` in the run manifest:

```yaml
completion_target: design_only|pilot_execute|prove_to_canon|auto_register
```

Choose the target this way:

- Use `design_only` only when the user's latest request makes the draft/design/plan itself the final requested output and either provides no concrete execution target or explicitly forbids pilot execution, source-bootstrap, candidate construction, and verification for the current run. The words "draft", "plan", "design", "make a workflow", or "do not mark complete" are not enough by themselves; they may describe the current output state or claim boundary rather than the completion target.
- Use `pilot_execute` when the user asks to make a workflow for a concrete task and provides enough artifacts or sources to attempt the workflow.
- Use `prove_to_canon` when the user asks to test, validate, improve until it works, compare to a reference/oracle, or produce a workflow they can rely on.
- Use `auto_register` only when the user or manifest explicitly authorizes automatic `.workflow` registration after success.

Do not infer `design_only` from missing subagent authorization, limited time, the phrase "make a workflow", a request to avoid completion claims, or a request to report the workflow's state and location. These change the current `output_state`, claim wording, or `stop_reason`; they do not lower the completion target. If the user provides a concrete workflow task and does not explicitly preserve a draft-only boundary, default to `pilot_execute`. If the user also provides a reference/oracle artifact, asks for comparison/validation, or expects a reliable reusable workflow, default to `prove_to_canon`.

For a concrete workflow-making request, a `workflow_draft` is only a checkpoint. If `completion_target` is `pilot_execute`, `prove_to_canon`, or `auto_register`, A must continue from draft into source/bootstrap, execution, verification, and cold/final gate steps when safely authorized. If fresh subagents, tools, approvals, or safe inputs are missing, preserve the completion target, set `output_state: blocked`, record the exact blocker such as `blocked_pending_subagent_authorization`, and report any draft only as a checkpoint. Do not change `completion_target` to `design_only` and do not report the draft as complete.

If a previous run stopped at `completion_target: design_only` and the user follows up with a continuation complaint such as "it stopped again", "why did it pause", "continue", or "this was not the intended stopping point", treat the latest message as a request to reassess the target. Do not defend the old draft target as achieved. Either resume with a new run/manifest whose `completion_target` is `pilot_execute` or `prove_to_canon`, or report the exact blocker that prevents continuation.

## Goal-Seeking Strategy Policy

When the requested outcome fails under the current method, A must not blindly retry the same method. A is persistent but bounded: classify the blocker, decide whether the strategy is saturated, and choose a different safe strategy when evidence supports a change.

Safe alternative strategies include running preflight/source survey, running source-bootstrap research to create approved source packets, creating a seed workflow when no workflow exists, adding approved non-oracle source packets, running domain-source review, running tool readiness or tool roundtrip workflow, splitting one skill into multiple bounded skills, promoting to `multi_skill_workflow`, switching from benchmark mode to `goal_reconstruction` with explicit evidence reclassification, creating a `workflow_evolution` run over multiple fixtures, extracting reusable skill candidates after successful one-off reconstruction, or proposing a pass-bar split only when evidence shows the current pass bar mixes general skill quality with fixture-specific strictness.

Maintain a strategy ledger with `attempted_strategy`, `result`, `blocker`, `next_strategy`, `why_next_strategy_is_different`, `evidence_file`, and `benchmark_integrity_remains_valid`. Prefer progress-generating experiments over repeated blind retries. Stop for human decision when the next action would modify original files, requires unsafe GUI/tool action, needs secrets/license values/raw mail/attachments, would pass oracle-only data into benchmark construction, requires pass-bar changes, needs a missing source asset that cannot be obtained from approved non-oracle sources, repeats attempts with no new information, or exhausts budget.

## Reference Boundary

In benchmark or skill-validation mode, forbidden reference/oracle material means any target answer material, regardless of format. Examples include:

- reference artifacts such as `REF.xml`, `REF.md`, `expected.json`, `target.pdf`, `accepted.png`, or tool-native accepted outputs
- accepted outputs
- answer keys
- V reports
- repair packets
- previous candidates
- reference-derived strict target data such as exact text, coordinates, object IDs, layout positions, object signatures, embedded asset payloads, or mismatch-derived construction targets

This does not prohibit approved non-oracle domain references. Approved non-oracle references include official specifications, product or technical datasheets, vendor implementation guides, standards, style guides, baseline workspace assets, approved local library metadata, and user-provided source packets. B or workflow construction steps should use approved non-oracle references when needed to identify domain entities, ports or connection points, relations, topology or structure, labels, notes, layout intent, embedded/source assets, and tool workflow constraints.

Any non-oracle reference used for construction must be recorded as a source packet with citation/provenance. If reference/oracle material or reference-derived data is used by construction or reconstruction, classify the run as `goal_reconstruction` evidence, not benchmark or skill-validation evidence.

In benchmark or skill-validation mode, A-controller is oracle-blind by default. A must not open, inspect, summarize, or infer from the raw reference/oracle artifact, its structure, exact fields, coordinates, object IDs, text, embedded payloads, or other target-specific details. V may inspect the reference/oracle in a separate verification workspace and may return only a redacted verdict to A: score, pass/fail, failure class, abstract delta, missing capability, source gap, boundary issue, and confidence. If A reads raw oracle details or receives oracle-derived construction hints, reclassify the run as `goal_reconstruction`, open-book repair, or blocked; do not treat it as benchmark validation.

An optional oracle-contract role may inspect the reference/oracle only to produce a generalized acceptance contract, and only when the user's latest request explicitly authorizes that oracle-contract role or asks for a generalized acceptance contract derived from the oracle. REF comparison permission alone is not permission to run this role. The role must be separate from B and from cold replay executors, must not emit answer-key details, and must label the contract as benchmark-safe before A uses it for construction or validation planning.

## A/B/V Operating Structure

A is a skill-making optimizer, not the final executor and not the final judge. Use this structure for every real scale-up round:

```text
User criteria
  -> A: write target brief, acceptance contract, and strict V pass bar
  -> A: edit B skill files only inside the allowed write boundary
  -> A: prepare isolated B workspace without oracle/reference files
  -> B executor subagent: use B in a clean context and produce candidate output
  -> A: prepare separate V workspace with candidate, oracle/reference, and contract
  -> V verifier subagent: compare candidate to contract/reference under fail-by-default rules
  -> V: return a redacted verdict, not REF-derived repair instructions
  -> A: convert abstract failure classes and missing capabilities into the next minimal B/workflow edit
  -> repeat until strict pass, owner approval, round limit, or hard blocker
```

Role separation is part of the output quality target. If B sees the answer key, if V is the same agent that produced the candidate, or if A accepts the result without V when independent verification is required, the round is invalid and must not be used as readiness evidence.

## Existing B Skill Evaluation Modes

Declare the run mode in the run manifest before any evaluation round. Do not mix evidence from different modes.

These two modes are preserved for existing single-skill evaluation loops. When the selected controller mode is `single_skill_build` or `single_skill_modify`, use `discovery_repair` or `baseline_fixed_skill_eval` as the inner B/V evaluation mode when applicable.

### `discovery_repair`

Use this mode only to discover mismatches, understand repair targets, and improve B's instructions. It is not benchmark validation.

- A may inspect previous B outputs, V mismatch reports, and sanitized repair target packets.
- Previous candidate artifacts are diagnosis artifacts only. They may inform A's next B edit or repair packet, but they are not evidence that B can transform the original input from scratch.
- This mode may allow a B repair executor to see a sanitized repair target packet or a previous candidate when the benchmark is explicitly a repair task.
- If A sees oracle-derived details or detailed V mismatches, keep the run in `discovery_repair` or `goal_reconstruction`; do not use it as `baseline_fixed_skill_eval` evidence.
- This mode must not produce a `verified-against-reference` decision.

### `baseline_fixed_skill_eval`

Use this mode for real skill verification when the user wants to know whether the current B skill can reach a reference/oracle target from the original baseline artifact.

- The run manifest must fix `baseline_artifact_path` before round 1.
- Every B executor round starts from the same `baseline_artifact_path`.
- The only thing that may change between rounds is B skill content and the controller's next B edit.
- B must not receive previous candidates, V reports, repair target packets, A's diagnosis, or the reference/oracle.
- A must not inspect the raw reference/oracle or receive detailed oracle-derived mismatch data. A may use only V's redacted verdict and approved non-oracle evidence.
- This is the only mode that may produce a `verified-against-reference` candidate, and only after the final clean run rule is met.

## Workflow Evolution Mode

Use controller mode `workflow_evolution` when the user provides multiple fixtures/examples, a fixture queue root, or asks A to improve a workflow across repeated cases. This mode may modify workflow files and involved skills inside the approved write boundary; it must not assume the answer is one new B skill.

If no workflow exists, record `starting_state: no_existing_workflow`, run `preflight_source_survey`, then create a minimal seed workflow before the first execution. The seed workflow must be based only on the user goal, baseline artifact summary, approved non-oracle source packets or an explicit source-bootstrap R stage, available tool constraints, and benchmark-safe acceptance contract. Do not use the reference/oracle artifact or V-only details to design the seed workflow.

Workflow evolution uses three phases:

- `warm_evolve`: A may use same-run candidates, redacted verifier verdicts, logs, and strategy ledger entries to create distilled experience packets and improve the workflow quickly. B may receive the immediately previous same-run candidate as its input only when the manifest records an explicit candidate chain. Evidence from this phase is learning evidence, not benchmark skill-validation evidence.
- `cold_replay`: Run the current workflow from the original baseline artifact or fixture input again. The replay may generate a new same-run candidate chain inside the replay workspace, but the executor must not receive warm-run candidates, verifier reports, repair packets, A diagnosis, experience packets, workflow extraction packets, warm artifacts, or oracle/reference material. This phase tests whether the workflow learned rather than merely continued a repaired state.
- `final_cold_gate`: Before readiness, promotion, or canon claims, run a clean replay from baseline with fresh executor/verifier separation and no warm artifacts in the executor context.

Required loop:

1. Accept and record `workflow_family_id`, unique `run_id`, `run_root`, `fixture_queue_root`, `starting_state`, fixture selection order, budget, pass bar, allowed tools, and unsafe-action stop rules.
2. Run `preflight_source_survey` when the workflow does not exist, source sufficiency is unknown, tool readiness is unknown, or the acceptance contract is underspecified. If the user goal names discoverable non-oracle sources, treat missing packets as `source_bootstrap_required` and define R before blocking.
3. If `starting_state: no_existing_workflow`, create a seed workflow before spawning B/workflow executors.
4. Select one fixture at a time from the queue. Do not preload future fixtures unless the queue metadata explicitly permits it.
5. Choose the evolution phase: `warm_evolve` for learning/compression, `cold_replay` for validation after learning, or `final_cold_gate` for readiness claims.
6. Run the current workflow/skills on the selected fixture with the isolation rules required by the phase. In `warm_evolve`, executors may follow the recorded same-run candidate chain. In `cold_replay` and `final_cold_gate`, executors start from the baseline and may create fresh intermediate candidates only inside the replay; verifiers receive oracle/reference material only when their role requires it.
7. Classify failure reason from observed evidence, such as mode mismatch, missing source packet, missing asset, parser/tool failure, workflow handoff failure, skill gap, verifier pass-bar ambiguity, unsafe tool action, or human decision required.
8. In `warm_evolve`, write or update an experience packet before editing workflow/skill files. In `cold_replay` and `final_cold_gate`, do not pass that packet to the executor; use it only as A-side design evidence.
9. Modify only the responsible workflow or skill surface, and only for evidence-backed failures.
10. After a fixture passes in `cold_replay` or `final_cold_gate`, run regression on all previously passed fixtures before advancing.
11. Record the regression matrix, source discovery packet path, experience packet path, workflow extraction packet path when applicable, and stop/continue decision after each fixture.

Stop when an unsafe tool action would be required, a required source asset is missing, the same failure repeats, budget is exhausted, pass-bar decision requires human judgment, a public/protected contract change would be needed, or reference boundaries cannot be preserved.

## Run Storage Policy

A skill folder is the reusable controller contract, not a runtime evidence store. Do not write workflow request logs, candidates, verdicts, source packets, experience packets, regression matrices, or extraction packets under the A skill folder unless the user is explicitly editing the skill package itself.

Every non-trivial workflow request must get its own unique run root before evidence is written. Treat `workflow_family_id` and `run_id` separately: `block_diagram` may be the family, while `block_diagram_workflow_evolution_20260509_01` is one run instance. Later block-diagram attempts create new sibling run roots, not subfolders that silently merge evidence.

When a project code and private procedure-capture area are known, use that approved run evidence area. Otherwise use a safe temporary/local run folder. A run root must contain `run_evidence/RUN_MANIFEST.yaml`, source discovery packet, source packets, strategy ledger, experience packets, candidates, redacted verifier verdicts, regression matrix, and workflow extraction packet as applicable. A root-level manifest copy is optional for convenience, but a root-only manifest is not valid run evidence. Successful reusable workflows or skills may be extracted from this evidence later, but raw run evidence stays in the run root and is not copied into the A skill folder.

## Workflow Output Shape And Completion Report

When A reports a workflow state, A must name the materialized state and exact location. Do not say "workflow created" without telling the owner whether this means design-only draft, pilot-ready, pilot-executed, canon-ready, registered, or blocked.

Use these output states:

- `draft`: the workflow design exists inside the run root with evidence and may still have unresolved gaps. This is not a completion state for concrete workflow-making unless `completion_target: design_only`.
- `pilot-ready`: the workflow has enough structure to bind to one project for a controlled run, but no controlled run has been completed yet.
- `pilot-executed`: the workflow ran at least one controlled R/B/S/V/tool stage and produced a candidate, verifier verdict, or concrete blocker with logs. This is not canon.
- `canon-ready`: the workflow has passed the required cold/final gate or owner approval needed for `.workflow/<workflow_id>/` promotion.
- `registered`: the workflow was safely promoted into `.workflow/<workflow_id>/` and `.workflow/index.yaml` was updated under an explicit registration policy.
- `blocked`: the workflow could not be safely created; report the missing source, sample, tool, oracle-boundary issue, or human decision.

Use the output state values exactly as written above. Do not use `workflow_draft`, `pilot_ready_workflow`, `pilot_executed_workflow`, `canon_ready_workflow`, or `registered_workflow` as `output_state`; those are explanatory terms, not status enum values.

For `draft`, write or report this shape under the current run root:

```text
<run_root>/
  run_evidence/
    GOAL_DECLARATION.yaml
    RUN_MANIFEST.yaml
    workflow_extraction_packet.yaml
    stage_packets/
    stage_logs/
  workflow/
    workflow_draft.yaml
    step_graph.yaml
    role_slots.yaml
    handoff_rules.yaml
    templates/
```

For `pilot-ready`, also report the project-local binding files that should attach the draft workflow to a controlled run:

```text
_workmeta/<project_code>/bindings/
  workflow_binding.yaml
  execution_profile_binding.yaml
  skill_execution_binding.yaml
  party_binding.yaml
```

For `pilot-executed`, also report the concrete execution evidence:

```text
<run_root>/
  run_evidence/
    stage_packets/
    stage_logs/
    source_discovery_packet.yaml
    source_packets/
    redacted_verdicts/
    strategy_ledger.yaml
  execution/
    candidates/
```

For `canon-ready`, report the `.workflow` package and index registration:

```text
.workflow/<workflow_id>/
  workflow.yaml
  step_graph.yaml
  role_slots.yaml
  handoff_rules.yaml
  monster_rules.yaml
  party_compatibility.yaml
  README.md
  templates/
.workflow/index.yaml
```

For `registered`, A must have created or updated the `.workflow/<workflow_id>/` package and `.workflow/index.yaml`. Registration is allowed only when the goal or run manifest explicitly sets `registration_policy: auto_register_on_success`.

Registration safety conditions:

- `final_cold_gate` or owner-approved equivalent has passed.
- The workflow package contains only public-safe canon material and no raw run truth, hidden oracle data, private project files, secrets, local machine paths, or REF-derived construction details.
- The workflow id is unique or the manifest explicitly authorizes updating an existing workflow id.
- Required package files are present: `workflow.yaml`, `step_graph.yaml`, `role_slots.yaml`, `handoff_rules.yaml`, `monster_rules.yaml`, and `party_compatibility.yaml`.
- `.workflow/index.yaml` is updated consistently.
- Validation appropriate to the changed canon surface has run or the report clearly states why it could not run.

If `registration_policy` is absent or set to `stop_at_canon_ready`, stop at `canon-ready` and report the exact package that would be registered after owner approval. If any safety condition fails, do not register; report `canon-ready` or `blocked` with the failed condition.

The completion report must include: workflow id, completion target, output state, registration policy, canonical or draft path, files created or changed, run evidence path, stage log path, whether a pilot execution ran, whether project binding was created or still needed, whether `.workflow/index.yaml` was updated, validation/cold-gate status, residual gaps, and the next action. If token, species, class, party, model, or reasoning choices are still being optimized elsewhere, keep them in project-local bindings or mission assignment notes rather than hard-coding them into the workflow package.

## Baseline Input Immutability

For `baseline_fixed_skill_eval`, baseline input immutability is a hard boundary:

- Record the absolute baseline input path in the run manifest as `baseline_artifact_path`.
- Record each round's produced artifact as `current_candidate_artifact_path`.
- Before each B execution, verify that `baseline_artifact_path` is unchanged from the manifest. If it changes, stop immediately.
- Do not pass an earlier candidate artifact as B's input. Earlier candidates are allowed only as diagnosis artifacts for A and only outside the B executor context.
- If the original source folder contains both baseline input and reference/oracle files, create an isolated B workspace with only the baseline input and safe task materials before spawning B.

This hard boundary applies to final benchmark validation and cold/final replay claims. It does not forbid a warm iterative authoring chain inside the current run, where `EXP_v1` may become the input for `EXP_v2`, as long as the manifest explicitly records the candidate chain and no REF, V report, A diagnosis, or older-run artifact enters B.

## Goal State And Continuation Policy

Every non-trivial A loop must maintain a run manifest with:

```yaml
objective:
goal_declaration_path:
goal_lock_status: declared|missing|invalid
codex_goal_status: created|existing_matching|unavailable|blocked_conflicting_goal
codex_goal_objective:
codex_goal_lifecycle:
  candidate_chain_required: true|false
  log_to_workflow_extraction_required: true|false
  baseline_replay_required: true|false
declared_before_material_stages: true|false
run_id:
workflow_family_id:
run_root:
run_storage_policy_path:
completion_target: design_only|pilot_execute|prove_to_canon|auto_register
completion_target_basis:
  latest_user_request_id_or_timestamp:
  verbatim_user_stop_words:
  concrete_execution_target_present: true|false
  explicitly_forbids_pilot_execution: true|false
  explicitly_forbids_candidate_construction: true|false
  explicitly_forbids_verification: true|false
  reference_or_validation_requested: true|false
  ambiguity_status: clear|ambiguous
  ambiguity_notes:
controller_mode: single_skill_build|single_skill_modify|multi_skill_workflow|goal_reconstruction|workflow_evolution|skill_extraction_after_success
starting_state: existing_workflow|no_existing_workflow|unknown
reference_artifact_path:
baseline_artifact_path:
current_candidate_artifact_path:
candidate_chain_used: true|false
candidate_chain_decision_reason:
candidate_chain:
  - round:
    input_artifact_path:
    output_candidate_path:
    same_run_predecessor: true|false
    executor_subagent_id:
    allowed_sources:
artifact_type:
a_skill_folder_runtime_writes_allowed: false
inner_bv_run_mode: discovery_repair|baseline_fixed_skill_eval|null
fixture_queue_root:
evolution_phase: warm_evolve|cold_replay|final_cold_gate|null
preflight_source_survey_path:
source_discovery_packet_path:
source_bootstrap_strategy:
source_packet_status: unknown|bootstrap_required|sufficient|blocked
current_iteration:
budget:
  max_iterations:
  max_runtime_minutes:
  max_token_budget:
strategy_ledger_path:
regression_matrix_path:
experience_packet_path:
workflow_extraction_packet_path:
verifier_report_policy: redacted_verdict_only|detailed_discovery_repair|reconstruction
stop_reason:
status: active|paused|blocked|verified
output_state: draft|pilot-ready|pilot-executed|canon-ready|registered|blocked
next_action_type:
human_decision_required:
```

For `baseline_fixed_skill_eval`, each round may use only this continuation order:

1. V's verification workspace reads the fixed `reference_artifact_path`; B does not.
2. B's isolated executor workspace reads the fixed `baseline_artifact_path`.
3. B applies the current B skill to the baseline input.
4. B produces a new candidate artifact.
5. V compares `reference_artifact_path` against the new candidate artifact in a separate verification workspace.
6. V returns only a redacted verdict to A.
7. The scorecard records pass/fail, failure class, abstract delta, missing capability, source gap, and boundary evidence.
8. A updates B skill files only from redacted capability gaps and approved non-oracle evidence.
9. The next round starts again from `baseline_artifact_path`.

If a round cannot follow this order, pause the run and record the reason.

For `warm_evolve`, A may read same-run candidate artifacts, redacted verifier verdicts, strategy ledger entries, tool logs, and source packets to produce an experience packet. Older-run artifacts remain forbidden unless the user explicitly asked to continue that run. The experience packet may guide A's workflow/skill edits, but it must not be treated as benchmark validation and must not be passed to a cold replay executor unless the run is explicitly reclassified away from benchmark validation.

For `preflight_source_survey`, A may inspect the user goal, baseline artifact, approved non-oracle references, tool help, schemas, local library metadata, and prior non-oracle logs. A must not inspect reference/oracle artifacts or V-only details in benchmark mode. The output is a source discovery packet that classifies source sufficiency, whether source-bootstrap R is required, missing assets, tool readiness, seed workflow candidates, verifier requirements, and stop risks.

## After-Each-Round Governance

After every B/V round, script validation round, decomposition gate, or final clean run, A must choose the next action itself instead of waiting for a user prompt by default.

Record this decision in the run manifest:

```yaml
after_each_round_governance:
  allowed_next_action_type:
    - continue_round
    - run_preflight_source_survey
    - run_source_bootstrap_research
    - create_seed_workflow
    - write_experience_packet
    - run_cold_replay
    - add_script_to_skill_or_workflow
    - add_reference_to_skill_or_workflow
    - add_source_packet
    - run_domain_source_review
    - run_tool_readiness_or_roundtrip
    - split_skill_into_workflow
    - promote_to_multi_skill_workflow
    - switch_to_goal_reconstruction
    - extract_skill_candidate
    - run_final_clean
    - create_evidence_bundle_for_mac_review
    - request_project_code_confirmation
    - request_human_decision
    - blocked
  autonomous_allowed:
    - continue_round
    - run_preflight_source_survey
    - run_source_bootstrap_research
    - create_seed_workflow
    - write_experience_packet
    - run_cold_replay
    - add_script_to_skill_or_workflow
    - add_reference_to_skill_or_workflow
    - add_source_packet
    - run_domain_source_review
    - run_tool_readiness_or_roundtrip
    - run_final_clean
  must_stop_for_human:
    - public_repo_change
    - protected_contract_change
    - project_code_confirmation
    - secret_or_raw_data_access
    - hardcoding_risk_high
    - external_side_effect
    - canon_promotion
    - configured_round_or_runtime_budget_exhausted
    - ref_mismatch_after_source_supported_candidate
    - target_scope_minimization_without_non_oracle_constraint
    - oracle_contract_generation_without_explicit_authorization
  next_action_type:
  human_decision_required:
  human_decision_reason:
```

Autonomous actions are allowed only inside the current approved write boundary and only when the next step does not require public repo changes, protected contract changes, project-code ownership, secrets/raw data, external side effects, canon promotion, or high hardcoding risk.

Use this selection rule:

- Choose `continue_round` when B is structurally ready, the next round can use the same allowed inputs, the strategy is materially different from the failed round, the configured budget is still available, and no stop condition is active.
- Choose `run_preflight_source_survey` before creating a workflow/skill when source sufficiency, tool readiness, or acceptance contract shape is unknown.
- Choose `run_source_bootstrap_research` when the user goal describes approved non-oracle sources or source-finding work and the source packet does not exist yet.
- Choose `create_seed_workflow` when `starting_state: no_existing_workflow` and the source discovery packet shows enough non-oracle evidence to draft a minimal workflow.
- Choose `write_experience_packet` when warm evidence should be distilled before another workflow/skill edit.
- Choose `run_cold_replay` after warm learning changes the workflow and the next question is whether the current workflow can start again from the baseline artifact without warm artifacts in the executor context.
- Choose `add_script_to_skill_or_workflow` or `add_reference_to_skill_or_workflow` when the next improvement is inside the responsible skill/workflow package and can be validated safely before the next run.
- Choose `add_source_packet` or `run_domain_source_review` when construction evidence is missing and can be obtained from approved non-oracle references.
- Choose `run_tool_readiness_or_roundtrip` when the artifact type needs tool import/export or renderer/parser feedback before further skill edits are meaningful.
- Choose `split_skill_into_workflow` or `promote_to_multi_skill_workflow` when one skill is carrying multiple separable responsibilities.
- Choose `switch_to_goal_reconstruction` only when solving the concrete case is still desired and benchmark evidence will be reclassified because reference/oracle material enters construction.
- Choose `extract_skill_candidate` only after a successful reconstruction or workflow step exposes a repeatable bounded procedure.
- Choose `run_final_clean` only when current evidence suggests the candidate should now meet the strict pass bar and the final clean run can hide all repair/context artifacts from B.
- Choose `create_evidence_bundle_for_mac_review` when promotion, public policy, or cross-machine review is needed before continuing.
- Choose `request_project_code_confirmation` when the next evidence write or metadata promotion needs `_workmeta/<project_code>/`.
- Choose `request_human_decision` when the next step depends on owner judgment, taste, ambiguous domain facts, or accepted risk.
- Choose `blocked` when required files, tools, permissions, or safe boundaries are unavailable after any applicable source-bootstrap path has been attempted or explicitly ruled out.

`goal not achieved` is not itself permission to continue. If the round limit or runtime budget is exhausted, if the next report says authorization or approval is needed, or if the remaining blocker is target-scope/minimization without new non-oracle evidence, set `human_decision_required: true` and choose `request_human_decision` or `blocked`.

For reference-backed artifact work, a source-supported candidate that still fails REF because of accepted scope, minimization, population, no-connect, or target-intent ambiguity is a human/source constraint checkpoint. A may run another R/source stage only when it can obtain new approved non-oracle evidence. A must not run another B round from the same evidence merely because the Codex goal remains incomplete.

Running an oracle-contract/O role is not an autonomous continuation. It is a separate oracle-visible action and requires explicit authorization in the latest user request. If the latest request only says to compare with REF, stop before O and report the exact authorization needed.

If `next_action_type` is autonomous and `human_decision_required: false`, proceed without asking for another prompt. Still report the checkpoint, the selected action, and the boundary checks.

## Evidence Bundle Gate

Create a review/evidence bundle or private `_workmeta` review candidate before promotion or cross-machine review when any of these are true:

- A modifies its own governance contract.
- The loop changes how future agents decide to continue, stop, or promote.
- The next step would affect public repo docs, `.registry`, `AGENTS.md`, foundation docs, `CHANGELOG`, canon, or workflow/class/species structures.
- The run needs MacBook Air or owner review before public/public-safe promotion.

Evidence bundles must exclude raw baseline/reference/candidate artifacts when they are sensitive or target-specific, actual design files, secrets, raw mail, attachments, local license/server details, and tool install internals. Use summaries for B/V prompts and reports when raw artifacts are sensitive or too target-specific.

## A/B/V Execution Contract

- A is the optimizer/controller. A owns target brief creation, acceptance contract writing, B file edits, round orchestration, comparison of redacted verifier verdicts, and stop/continue decisions.
- In benchmark or skill-validation mode, A is oracle-blind. A must not inspect raw reference/oracle artifacts or detailed oracle-derived mismatch reports; A works from redacted V verdicts and approved non-oracle evidence only.
- B is the executor. B execution is never accepted from A's current conversation context. For real testing, B must be invoked in a fresh-context executor subagent with only B path, task prompt, allowed artifacts, isolated workspace, and safety constraints.
- V is the verifier. When a round requires reference/oracle comparison, a separate fresh-context verifier subagent must inspect B's returned artifact against the reference/oracle and acceptance contract. V must be different from A and from the B executor subagent.
- Use a new B executor subagent and a new V verifier subagent for each benchmark or evaluation round so previous failures, expected answers, oracle details, and A's diagnosis do not leak across roles.
- Keep golden/reference answer files hidden from B by construction. If a file is the accepted answer, oracle, or final reference target, only V may receive it for read-only verification after B returns output.
- If allowed input files and oracle files live in the same folder, create an isolated evaluation workspace before spawning B. Copy only allowed files into that workspace and pass the workspace path to B; never pass the original folder if it contains the oracle.
- For V, create a separate verification workspace containing the candidate output, the reference/oracle when required, and the acceptance contract. V is read-only: it reports pass/fail evidence and must not edit B, the candidate output, or the reference.
- A must not approve B by performing its own oracle comparison when the acceptance contract requires independent verification. A may decide the next B/workflow edit from V's redacted verdict, deterministic validators, source discovery packets, and user criteria.
- If explicit subagent authorization truly cannot be established from the latest request or current thread context, or if the subagent runtime is unavailable, do not perform B or V in the current context as a substitute. Ask the minimal authorization question or report the runtime blocker. Executor/verifier prompts may be prepared as diagnostics, but they are not stage execution evidence.
- A may run mechanical validators and safe script checks locally because they test files, not B's reasoning behavior. These checks do not replace fresh-context B execution or separate V verification.
- A must record which artifacts were visible to B and which artifacts were visible only to V. If this cannot be reconstructed, the round is not valid evidence.
- In `discovery_repair`, B may receive a previous candidate or sanitized repair target packet only when the benchmark is explicitly a repair task. B still must not receive the oracle/reference artifact unless the user explicitly changes the benchmark into an open-book repair task.
- In `baseline_fixed_skill_eval`, B may receive only the baseline input workspace, current B skill path, user task prompt, and safety constraints. B must not receive previous candidates, repair target packets, V reports, A diagnosis, or reference/oracle content.

## Strict Verifier Contract

When the user says the target must reach a reference, oracle, approved artifact, or accepted-output level, A must give V a strict verification contract before every verifier run.

- V's default verdict is `fail` until every must-have criterion is matched to concrete observed evidence.
- V must not invent its own lenient pass bar. A supplies the exact pass bar, tolerated differences, and non-tolerated differences.
- In benchmark or skill-validation mode, V must return a redacted verdict to A. It must not copy reference/oracle content, exact target structure, coordinates, object IDs, text, embedded payloads, or answer-key repair instructions into A's report.
- A must distinguish artifact-level acceptance from later human/tool acceptance. If the user will manually inspect in a tool after V, then V's job is to pass or fail the candidate artifact against the artifact-level contract before that human review step.
- For accepted-output or oracle-level tasks, V may pass only when all artifact-level must-have criteria pass and all remaining differences are explicitly listed as tolerated human/tool-review items.
- `Human review required` is not itself a failure when the review item is outside the artifact-level target, such as later GUI import, simulation, rendering, or owner taste. It is a failure when it hides an unresolved artifact-level gap, such as missing objects, missing values, missing required links, missing notes, unresolved oracle mismatch, missing embedded assets, or uninspected relationships.
- "Close enough", "usable", or "pass with conditions" is not sufficient for `production-ready` or accepted-output level unless the conditions are outside the requested artifact-level target.
- V must summarize failures by artifact type, failure class, abstract delta, missing capability, source gap, boundary issue, and confidence. Detailed mismatches are allowed only in `discovery_repair`, `goal_reconstruction`, or verifier-only evidence that will not drive benchmark construction.
- If V cannot determine whether a difference is tolerated, V must fail the round and ask A to sharpen the acceptance contract.
- V must explicitly answer these pass-bar questions: Did B avoid the oracle? Did A avoid raw oracle details? Did V receive the oracle read-only? Are all required artifacts present? Which abstract requirements failed or passed? Are all remaining differences classified as tolerated or non-tolerated without exposing oracle-derived construction hints?
- V must not fix the candidate. In benchmark mode, V may provide only redacted capability recommendations for A; any change to B or the candidate must happen in a later A-controlled edit and fresh B run.

## Boundary Rules

- Keep secret, credential, raw mail, attachment, and unrelated private project content out of all evaluator prompts and reports.
- Do not modify public repos unless the user explicitly asks for public changes.
- Prefer local Codex skill paths such as `$CODEX_HOME/skills/<skill-name>` or `~/.codex/skills/<skill-name>` for draft skills.
- If a Soulforge project-specific record is needed, store only public-safe summaries and improvement evidence under `_workmeta/<project_code>/reports/procedure_capture/`.
- Use fresh-context subagents only when the user explicitly authorizes subagents, delegation, forward-testing, or direct execution. Once authorized, A must spawn the required fresh-context R/B/S/V subagents itself. Every real B execution must happen in a fresh-context B executor subagent, and every reference/oracle verification must happen in a separate fresh-context V verifier subagent. If authorization is absent, prepare the minimal authorization question before doing blocker-prep work.
- Never tell B or V the suspected defect, intended fix, or A's comparison notes unless the evaluation explicitly requires that information. V may receive the target answer/reference only when its role is oracle comparison; B must not receive it.
- For baseline-fixed verification, A may use only V's redacted verdict to edit B between rounds. Detailed repair targets, raw mismatches, and oracle-derived hints are discovery/repair or reconstruction evidence, not benchmark validation evidence.

## Scale-Up Direction

Before editing B, read `references/scaleup-constraints.md` and apply it as a limiting standard. Optimize B toward better measured results, not toward larger instructions.

Allowed scale-up directions:

- Improve trigger precision and scope boundaries.
- Improve benchmark tasks, acceptance criteria, and validation loops.
- Move detailed domain material into references and keep `SKILL.md` lean.
- Add scripts only for repeated, deterministic, or fragile operations.
- Clarify stop conditions, safety boundaries, and output contracts.

Blocked scale-up directions:

- Do not add broad background that does not affect evaluator results.
- Do not add unrelated capabilities just because they are adjacent.
- Do not add local machine paths, credentials, hidden assumptions, or private data into reusable skill instructions.
- Do not optimize only for one benchmark if it makes held-out tasks worse.

## Intake

Collect or infer the smallest useful target brief:

- Controller mode: `single_skill_build`, `single_skill_modify`, `multi_skill_workflow`, `goal_reconstruction`, `workflow_evolution`, or `skill_extraction_after_success`.
- Target skill B path or name.
- Target workflow path/name when the mode is workflow-based.
- Fixture queue root when the mode is `workflow_evolution`.
- Desired user-level result, including what "good enough" looks like.
- User-provided acceptance criteria, separated into must-have, should-have, and nice-to-have expectations.
- Two to five benchmark tasks that should trigger B.
- Non-negotiable boundaries such as private data, file ownership, output format, and tools.
- Acceptance level, defaulting to `production-ready` unless the user asks for `draft` or `usable`.
- Stop condition, defaulting to two successful B-to-V fresh-context cycles or three optimization rounds.

If the user gives only a broad idea, draft the target brief yourself and proceed with the first executable stage when the baseline, boundaries, and subagent authorization are clear from the request or current thread context. Ask only when the target skill/workflow path, fixture queue root, write boundary, source packet approval, or true subagent authorization is unsafe to infer.

If the user asks for a plan, forbids edits, or forbids subagents, treat the run as a dry-run optimization round: inspect only the allowed skill surface, create the target brief, scorecard, evaluator prompt, and proposed next edit, then stop.

## First-Build Verification Gate

When A creates B, edits B, or claims B is ready, A must run verification before the user-facing completion report.

Required first-build checks:

- Run the skill structure validator for B when B is a Codex skill folder: `python <skill-creator-dir>/scripts/quick_validate.py <target-skill-folder>`. If `PyYAML` is missing and `uv` is available, use `uv run --with pyyaml python <validator> <target-skill-folder>`.
- For every changed script in B, run a safe `--help`, dry-run, or minimal fixture check. If no safe execution path exists, inspect the script and mark B as not production-ready until a runnable check exists.
- Run at least one fresh-context B executor subagent when the latest request or current thread context authorizes subagents, delegation, forward-testing, or direct execution. B's actual task performance must be produced by that subagent, not by A's current context.
- Give B a realistic user task and B path, not A's diagnosis, expected answer, reference artifact, or intended fix.
- When the benchmark has a reference/oracle artifact or the user asks for independent validation, run a separate fresh-context V verifier subagent after B returns output. V receives the candidate output, the reference/oracle, and the acceptance contract; V must not be the same subagent as B and must not modify files.
- For reference/oracle targets, give V a strict verifier contract. V must fail unresolved artifact-level mismatches even if the candidate looks usable.
- Compare V's verifier report against the acceptance contract and record pass/fail evidence. If no V run is possible, mark the result as pending independent verification.

If subagents are unavailable or explicit authorization truly cannot be established, do not call B production-ready and do not run B's reasoning workflow or independent verification in A's current context as a replacement. Report the exact blocker such as `blocked-pending-subagent-eval`, `blocked-pending-verifier-subagent`, `usable-pending-fresh-eval`, or `usable-pending-verifier-eval`. Include any executor/verifier prompt only as a diagnostic artifact, not as progress toward stage execution.

Minimum evidence for `draft` in a design-only skill edit: valid skill structure, clear trigger description, visible workflow, explicit boundaries, and one current-context walkthrough against a benchmark. For concrete artifact discovery or any task whose contract requires fresh stages, a current-context walkthrough does not inspect the stage and does not replace fresh subagent stage logs.

## Acceptance Contract

Turn the user's criteria into an explicit contract before editing B:

- `must_have`: every item must pass. If one fails, the round fails.
- `should_have`: optimize these after must-have criteria pass. Misses are allowed only when recorded as residual gaps.
- `nice_to_have`: do not spend extra rounds on these unless the user asks.
- `minimum_score`: default to no scorecard criterion below 2, with `target_match` and `boundary_safety` at 3.
- `max_rounds`: default 3. Ask before going beyond the limit.
- `max_fresh_evals`: default 5 total fresh-context B executor runs plus their matching V verifier runs.
- `user_review_gate`: ask the user when the same gap repeats twice, when criteria conflict, or when the next improvement depends on taste/domain judgment.
- `run_mode`: default to `baseline_fixed_skill_eval` when the user asks whether B can reach a reference/oracle from an original baseline artifact. Use `discovery_repair` only when the user asks for mismatch exploration or artifact repair discovery.

Use three acceptance levels:

- `draft`: for design-only skill edits, one current-context inspection or one B execution without independent V verification is enough; residual gaps may remain. For concrete artifact discovery, draft is only preparation unless required R/B/S/V stages have executed in fresh subagent contexts.
- `usable`: at least one B executor pass plus one separate V verifier pass when oracle/reference validation is required, no must-have failures, and no score below 2.
- `production-ready`: at least two B-to-V fresh-context cycles, no must-have failures, no score below 2, `target_match` plus `boundary_safety` at 3, and no unresolved artifact-level verifier conditions when the user asked for a reference/oracle-level result.

`draft` evidence, current-context walkthroughs, and A's own inspection are never substitutes for a required B executor subagent or separate V verifier subagent.

## Stop Conditions

Stop or pause the loop and record `stop_reason` when any of these occurs:

- `max_iterations` is reached.
- `max_runtime_minutes` or `max_token_budget` is reached.
- The same residual mismatch repeats for two consecutive rounds.
- Score improvement stalls for two consecutive rounds.
- V evaluators conflict in a way A cannot resolve from observed evidence.
- `baseline_artifact_path` changes during `baseline_fixed_skill_eval`.
- The next fix requires a protected public repo contract change, such as `AGENTS.md`, `.registry`, foundation docs, or `CHANGELOG`, and the user has not explicitly authorized it.
- The next improvement requires user/domain judgment rather than a skill instruction change.

## Final Clean Run

A may claim `verified-against-reference` only after a final clean run in `baseline_fixed_skill_eval` mode:

- Use a fresh B executor subagent.
- Give B only the fixed baseline input workspace, current B skill path, task prompt, and safety constraints.
- Do not give B any repair target packet, previous candidate, V report, A diagnosis, expected answer, or reference/oracle content.
- Use a separate fresh V verifier subagent after B returns output.
- Give V only the candidate artifact, reference/oracle artifact, acceptance criteria, and strict pass bar.
- `verified-against-reference` is only a candidate when V reports zero non-tolerated mismatches. Later human/tool review may still be required if the task requires GUI import, simulation, domain signoff, or owner approval.

## Optimization Loop

1. Snapshot B: inspect `SKILL.md`, `agents/openai.yaml`, and directly referenced resources. Do not bulk-read unrelated files.
2. Build the acceptance contract and scorecard using target match, trigger quality, context efficiency, workflow reliability, boundary safety, validation clarity, and the user's must-have criteria.
3. Select and record `run_mode`. For reference/oracle skill verification, use `baseline_fixed_skill_eval`, fix `baseline_artifact_path`, and create an isolated B workspace that contains only the baseline input and safe task files.
4. Run B execution only through a fresh-context B executor subagent once explicit authorization is available from the latest request or current thread context. In `baseline_fixed_skill_eval`, every round must start from the same `baseline_artifact_path`; never use a previous candidate as B input. If subagents are truly unauthorized or unavailable, do not simulate B execution in the current context; record the exact blocker and ask the minimal authorization/runtime question.
5. Run independent verification through a separate fresh-context V verifier subagent when the benchmark has reference/oracle artifacts or explicit verification criteria. If V cannot run, mark verification as missing and record the exact blocker; a verifier prompt alone is not verification.
6. For accepted-output or oracle-level targets, treat V conditions as failures unless they are explicitly outside the artifact-level target and reserved for later human/tool review.
7. Compare the V verifier report and B output against the target brief and scorecard. Identify only gaps that can be fixed inside the responsible skill or workflow surface.
8. Edit B or the workflow minimally. Prefer clearer trigger descriptions, tighter workflow steps, better resource navigation, and explicit validation criteria.
9. Validate B with the skill creator validator when B is a Codex skill folder. Validate workflow files or changed scripts with the safest available checks.
10. Apply the First-Build Verification Gate before any completion report. Use a new B executor subagent and a new V verifier subagent for each round when authorized.
11. For `baseline_fixed_skill_eval`, perform the Final Clean Run before any `verified-against-reference` claim.
12. Run After-Each-Round Governance. Select `next_action_type`, set `human_decision_required`, and either continue autonomously or stop for the named human decision.
13. Stop when the stop condition is met, when further gains need user/domain input, when a hard execution/tool limit is reached, or when the next edit would cross a repo/private-data boundary.
14. Report the final state using the Workflow Output Shape And Completion Report: workflow id, output state, registration policy, exact paths, changed files, evidence/log paths, binding/index status, acceptance level reached, controller mode, inner evaluation mode when present, artifact roles and identities, before/after score, B executor tasks, V verifier tasks, validation commands, residual gaps, stop reason, `next_action_type`, `human_decision_required`, and next action.

## Evaluation Hygiene

- Use held-out tasks when available: do not evaluate only on the exact task used to design the edit.
- Pass raw task artifacts, not your diagnosis.
- Keep evaluator context small enough that success depends on B, not on leaked conversation context.
- Do not pass A's scorecard conclusions, suspected defect, intended fix, or previous verifier critique into the B execution prompt unless the benchmark explicitly tests repair behavior.
- Do not pass hidden oracle files such as `REF.xml`, `REF.md`, expected outputs, answer keys, or accepted reference artifacts to B. Pass them only to V for read-only verification after B returns its candidate output.
- Do not reuse the B executor as V. The verification result must come from a separate context that did not produce the candidate output.
- Prefer observable outputs, diffs, logs, or structured reports over vague evaluator opinions.
- Preserve failure evidence. A failed evaluation is useful input for the next B edit.

## Resources

- Mode and boundary refs: `references/mode-boundaries.md`, `references/oracle-boundary.md`, `references/goal-seeking-exploration.md`, `references/scaleup-constraints.md`.
- Workflow refs: `references/workflow-evolution.md`, `references/hybrid-evolution-loop.md`, `references/preflight-source-survey.md`, `references/fixture-queue.md`, `references/regression-matrix.md`, `references/goal-reconstruction.md`, `references/workflow-extraction.md`.
- Evidence and source templates: `references/run-storage-policy.md`, `references/RUN_MANIFEST.yaml`, `references/source-packets.md`, `references/STRATEGY_LEDGER.yaml`, `references/SOURCE_DISCOVERY_PACKET.yaml`, `references/EXPERIENCE_PACKET.yaml`, `references/REDACTED_VERDICT.yaml`, `references/WORKFLOW_EXTRACTION_PACKET.yaml`, `references/source-index.md`.
- Evaluation helpers: `references/evaluation-loop.md` for briefs, prompts, scorecards, comparison notes, and stop conditions; `references/verification-gate.md` for scoring disputes, script-bearing edits, or completion reporting.
- For accepted-output or oracle-level targets, write the strict V pass bar before spawning V. Use `scripts/prepare_isolated_eval_workspace.py --run-root <run_root>` when B inputs share a directory with hidden oracle/reference files, and `scripts/prepare_verification_workspace.py --run-root <run_root>` when V needs a clean read-only candidate/oracle workspace. Script destinations must be new or refreshable subdirectories under the current run root.
