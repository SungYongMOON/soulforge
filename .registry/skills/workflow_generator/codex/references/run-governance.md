# Run Governance

Use this reference for workflow-generator goal declaration, run manifest state, output states, registration gates, and after-round next-action selection.

## Contents

- [Path Portability](#path-portability)
- [Goal Declaration](#goal-declaration)
- [Goal Declaration File](#goal-declaration-file)
- [Run Manifest Fields](#run-manifest-fields)
- [Continuation Policy](#continuation-policy)
- [Output States](#output-states)
- [Registration Safety](#registration-safety)
- [Completion Report](#completion-report)
- [After-Each-Round Governance](#after-each-round-governance)

## Path Portability

Generated reusable workflow material must be portable across PCs. Use Soulforge-root-relative POSIX paths in:

- `.workflow/**`
- `.registry/**`
- `docs/architecture/**`
- workflow drafts intended for promotion
- source packets or extraction packets that may become canon
- public-safe examples

Do not store host-specific absolute paths, drive letters, usernames, home directories, or installed local skill paths in reusable workflow packages. Examples that must not appear in reusable material include `C:\Soulforge\...`, `C:\Users\...`, `/Users/name/...`, and `~/.codex/...`.

Runtime tools may still need absolute paths. Keep those only in local/private run evidence or subagent prompts and label them as `*_runtime_path`. Pair them with a portable identity:

```yaml
baseline_artifact_repo_path: _workspaces/<project_code>/input/EXP.xml
baseline_artifact_runtime_path: <runtime-only absolute path, not for workflow package>
target_skill_id: soulforge-allegro-capture-xml
target_skill_runtime_path: <runtime-only installed skill path, not for workflow package>
```

If a path is inside the Soulforge project, derive the portable form by making it relative to the Soulforge root and using `/` separators. If a runtime path is outside the Soulforge project, do not promote it into canon; store only an approved portable identity, source id, fixture id, or owner-provided relative location.

## Goal Declaration

For a non-trivial `$soulforge-workflow-generator` run, Codex goal tracking is the live execution goal and `run_evidence/GOAL_DECLARATION.yaml` is the persistent evidence lock.

At run start:

1. Check the active Codex goal state when tools are available.
2. If no active goal exists, create a goal matching the latest workflow objective.
3. If an active goal matches, continue and record it.
4. If an active goal conflicts, stop before material stages and ask whether to finish, replace, or keep the existing goal.

For concrete artifact discovery, the Codex goal must include the full lifecycle: same-run candidate versions as needed, fresh subagent stage logs, workflow extraction from logs, and cold replay from the original baseline. Do not reduce the goal to only "make a candidate" or only "compare with REF".

The goal must also say how the run ends. For reference-backed artifact discovery, use this shape unless the user gives a stricter one:

```text
Discover a source-bound workflow from <baseline_artifact> that produces a <candidate_artifact> using approved non-oracle evidence. Execute material stages in fresh subagent contexts and compare the current or final candidate with <reference_artifact> through V-only verification. Success means V passes, then A extracts the reusable workflow from logs and runs a cold replay from the original baseline. Stop with blocker and log paths if V does not pass and no new approved non-oracle source evidence or public-safe constraint remains, or if a boundary, budget, or human-decision condition is reached.
```

Preserve the user's comparison scope. Do not rewrite "the result" or "the candidate" into "all candidates" unless the latest request explicitly asks for every candidate or intermediate output to be compared.

## Goal Declaration File

Write `run_evidence/GOAL_DECLARATION.yaml` before:

- run manifest finalization
- seed workflow or workflow draft materialization
- source-bootstrap or preflight execution
- B/S/V/tool subagent prompts
- candidate construction
- reference/oracle verification
- registration or promotion decisions

Minimum shape:

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
  baseline_artifact_repo_path:
  baseline_artifact_runtime_path:
  reference_artifact_repo_path:
  reference_artifact_runtime_path:
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

If Codex goal tools are unavailable, record `codex_goal_status: unavailable` and continue with file-based evidence. If a material stage already ran before this file existed, the run is not valid workflow-generation evidence; stop as `missing_pre_stage_goal_declaration` and restart only when safe.

## Run Manifest Fields

Maintain a run manifest with enough state to replay the controller decision:

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
run_root_repo_path:
run_root_runtime_path:
run_storage_policy_path:
completion_target: design_only|pilot_execute|prove_to_canon|auto_register
controller_mode: single_skill_build|single_skill_modify|multi_skill_workflow|goal_reconstruction|workflow_evolution|skill_extraction_after_success
starting_state: existing_workflow|no_existing_workflow|unknown
reference_artifact_repo_path:
reference_artifact_runtime_path:
baseline_artifact_repo_path:
baseline_artifact_runtime_path:
current_candidate_repo_path:
current_candidate_runtime_path:
candidate_chain_used: true|false
candidate_chain_decision_reason:
candidate_chain:
  - round:
    input_artifact_repo_path:
    input_artifact_runtime_path:
    output_candidate_repo_path:
    output_candidate_runtime_path:
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

## Continuation Policy

For `baseline_fixed_skill_eval`, every round must follow this order:

1. V's verification workspace reads the fixed `reference_artifact_runtime_path`; B does not. The reusable identity is `reference_artifact_repo_path`.
2. B's isolated executor workspace reads the fixed `baseline_artifact_runtime_path`. The reusable identity is `baseline_artifact_repo_path`.
3. B applies the current B skill to the baseline input.
4. B produces a new candidate artifact.
5. V compares the reference against the new candidate in a separate verification workspace.
6. V returns only a redacted verdict to A.
7. A records pass/fail, failure class, abstract delta, missing capability, source gap, and boundary evidence.
8. A updates B only from redacted capability gaps and approved non-oracle evidence.
9. The next round starts again from `baseline_artifact_runtime_path`; workflow/canon output may mention only `baseline_artifact_repo_path`.

If a round cannot follow this order, pause and record the reason.

For `warm_evolve`, A may read same-run candidate artifacts, redacted verifier verdicts, strategy ledger entries, tool logs, and source packets to produce an experience packet. Older-run artifacts remain forbidden unless the latest user request explicitly asks to continue that run.

For `preflight_source_survey`, A may inspect the user goal, baseline artifact, approved non-oracle references, tool help, schemas, local library metadata, and prior non-oracle logs. A must not inspect reference/oracle artifacts or V-only details in benchmark mode.

## Output States

Use these output states exactly:

- `draft`: workflow design exists in the run root with evidence and may have unresolved gaps. Not complete for concrete workflow-making unless `completion_target: design_only`.
- `pilot-ready`: enough structure exists to bind to one project for a controlled run, but no controlled run has completed.
- `pilot-executed`: at least one controlled R/B/S/V/tool stage ran and produced a candidate, verifier verdict, or concrete blocker with logs. Not canon.
- `canon-ready`: the workflow passed the required cold/final gate or owner approval needed for `.workflow/<workflow_id>/` promotion.
- `registered`: `.workflow/<workflow_id>/` and `.workflow/index.yaml` were safely updated under explicit registration policy.
- `blocked`: the workflow could not be safely created; report the missing source, sample, tool, oracle-boundary issue, or human decision.

Do not use `workflow_draft`, `pilot_ready_workflow`, `pilot_executed_workflow`, `canon_ready_workflow`, or `registered_workflow` as `output_state`.

## Registration Safety

Registration is allowed only when `registration_policy: auto_register_on_success` is explicit.

Before registration:

- `final_cold_gate` or owner-approved equivalent has passed.
- The workflow package contains only public-safe canon material and no raw run truth, hidden oracle data, private project files, secrets, local machine paths, or REF-derived construction details.
- All paths in the workflow package are Soulforge-root-relative POSIX paths or stable ids. Runtime-only absolute paths remain only in run evidence.
- The workflow id is unique, or the manifest explicitly authorizes updating an existing workflow.
- Required package files are present: `workflow.yaml`, `step_graph.yaml`, `role_slots.yaml`, `handoff_rules.yaml`, `monster_rules.yaml`, and `party_compatibility.yaml`.
- `.workflow/index.yaml` is updated consistently.
- Validation appropriate to the changed canon surface has run, or the report states why it could not run.

If `registration_policy` is absent or `stop_at_canon_ready`, stop at `canon-ready` and report the exact package that would be registered after owner approval.

## Completion Report

The completion report must include:

- workflow id
- completion target
- output state
- registration policy
- canonical or draft path
- files created or changed
- run evidence path
- stage log path
- whether pilot execution ran
- whether project binding was created or is still needed
- whether `.workflow/index.yaml` was updated
- validation and cold-gate status
- residual gaps
- next action

Keep token, species, class, party, model, and reasoning choices in project-local bindings or mission assignment notes rather than hard-coding them into the workflow package.

## After-Each-Round Governance

After every B/V round, script validation round, decomposition gate, or final clean run, A must choose a next action instead of waiting by default.

Allowed `next_action_type` values:

- `continue_round`
- `run_preflight_source_survey`
- `run_source_bootstrap_research`
- `create_seed_workflow`
- `write_experience_packet`
- `run_cold_replay`
- `add_script_to_skill_or_workflow`
- `add_reference_to_skill_or_workflow`
- `add_source_packet`
- `run_domain_source_review`
- `run_tool_readiness_or_roundtrip`
- `split_skill_into_workflow`
- `promote_to_multi_skill_workflow`
- `switch_to_goal_reconstruction`
- `extract_skill_candidate`
- `run_final_clean`
- `create_evidence_bundle_for_mac_review`
- `request_project_code_confirmation`
- `request_human_decision`
- `blocked`

Autonomous next actions are allowed only inside the approved write boundary and only when the next step does not require public repo changes, protected contract changes, project-code ownership, secrets/raw data, external side effects, canon promotion, or high hardcoding risk.

Selection rules:

- Choose `continue_round` when the next round can use the same allowed inputs, the strategy materially changes, budget remains, and no stop condition is active.
- Choose `run_preflight_source_survey` before creating a workflow/skill when source sufficiency, tool readiness, or acceptance contract shape is unknown.
- Choose `run_source_bootstrap_research` when approved non-oracle source finding is part of the user goal.
- Choose `create_seed_workflow` when no workflow exists and enough non-oracle evidence exists to draft a minimal workflow.
- Choose `write_experience_packet` when warm evidence should be distilled before another edit.
- Choose `run_cold_replay` after warm learning changes the workflow and baseline replay is the next question.
- Choose `add_script_to_skill_or_workflow` or `add_reference_to_skill_or_workflow` when the next improvement is in the responsible package and can be validated safely.
- Choose `add_source_packet` or `run_domain_source_review` when construction evidence can be obtained from approved non-oracle references.
- Choose `run_tool_readiness_or_roundtrip` when the artifact needs tool import/export or parser feedback.
- Choose `split_skill_into_workflow` or `promote_to_multi_skill_workflow` when one skill is carrying separable responsibilities.
- Choose `switch_to_goal_reconstruction` only when solving the case is still desired and benchmark evidence must be reclassified because oracle material enters construction.
- Choose `extract_skill_candidate` only after a successful reconstruction or workflow step exposes a repeatable bounded procedure.
- Choose `run_final_clean` only when evidence suggests the strict pass bar should pass and all repair/context artifacts can be hidden from B.
- Choose `request_human_decision` when the next step depends on owner judgment, taste, ambiguous domain facts, or accepted risk.
- Choose `blocked` when required files, tools, permissions, or safe boundaries are unavailable after applicable source-bootstrap paths have been attempted or ruled out.

`goal not achieved` is not itself permission to continue. If budget is exhausted, authorization is needed, or the remaining blocker is target-scope/minimization without new non-oracle evidence, set `human_decision_required: true` and choose `request_human_decision` or `blocked`.

Running an oracle-contract/O role is not autonomous. It requires explicit authorization in the latest user request.
