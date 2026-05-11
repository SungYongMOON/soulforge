# Evaluation Loop Templates

Use these templates only as needed. Keep completed records concise.

## Target Brief

```yaml
target_skill:
  name:
  path:
target_outcome:
  user_goal:
  good_enough:
  unacceptable_results:
run_manifest:
  objective:
  run_id:
  workflow_family_id:
  run_root:
  run_mode: baseline_fixed_skill_eval
  starting_state: existing_workflow|no_existing_workflow|unknown
  a_skill_folder_runtime_writes_allowed: false
  reference_artifact_path:
  baseline_artifact_path:
  current_candidate_artifact_path:
  artifact_type:
  evolution_phase: warm_evolve|cold_replay|final_cold_gate|null
  experience_packet_path:
  workflow_extraction_packet_path:
  source_discovery_packet_path:
  verifier_report_policy: redacted_verdict_only|detailed_discovery_repair|reconstruction
  current_iteration:
  budget:
    max_iterations: 3
    max_runtime_minutes:
    max_token_budget:
  stop_reason:
  status: active|paused|blocked|verified
  next_action_type:
  human_decision_required:
  human_decision_reason:
after_each_round_governance:
  allowed_next_action_type:
    - continue_round
    - run_preflight_source_survey
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
  evidence_bundle_gate:
    required_when:
      - A_self_governance_changed
      - public_or_canon_promotion_needed
      - cross_machine_review_needed
      - protected_contract_change_needed
    excludes:
      - raw_baseline_reference_or_candidate_artifacts
      - actual_design_files
      - secrets
      - raw_mail
      - attachments
      - license_or_tool_server_info
acceptance_contract:
  level: production-ready
  target_bar: accepted-output-level
  must_have:
    - criterion:
      pass_evidence:
  should_have:
    - criterion:
      pass_evidence:
  nice_to_have:
    - criterion:
      pass_evidence:
  minimum_score:
    target_match: 3
    trigger_quality: 2
    context_efficiency: 2
    workflow_reliability: 2
    boundary_safety: 3
    validation_clarity: 2
  max_rounds: 3
  max_fresh_evals: 5
  strict_verifier_contract:
    required_when:
      - reference_oracle_target
      - accepted_output_level_requested
      - user_human_review_happens_after_v
    default_verdict: fail_until_all_must_have_evidence_is_observed
    artifact_level_pass_rule: no_unresolved_artifact_level_mismatch
    verifier_report_policy: redacted_verdict_only
    evidence_rule: every_must_have_item_requires_concrete_observed_evidence
    tolerated_post_v_items:
      - tool_import_human_review
      - external_validation_not_performed
      - owner_visual_taste_review
    non_tolerated_items:
      - missing_required_objects
      - missing_or_wrong_relations_or_links
      - missing_or_wrong_values
      - missing_reference_notes_or_required_annotations
      - uninspected_relationships
      - oracle_mismatch_without_explicit_tolerance
      - pass_with_conditions_that_include_artifact_level_gaps
      - verifier_inference_without_observed_artifact_evidence
    v_required_checks:
      - oracle_visibility_boundary
      - artifact_presence_and_file_identity
      - object_inventory_counts
      - topology_or_behavior_match
      - visible_fields_values_references_notes_metadata
      - deterministic_script_results_when_available
      - tolerated_vs_non_tolerated_residuals
  user_review_gate:
    - same_gap_repeats_twice
    - criteria_conflict
    - domain_or_taste_judgment_needed
baseline_input_immutability:
  required_when_run_mode: baseline_fixed_skill_eval
  baseline_artifact_path_fixed_before_round_1: true
  b_executor_uses_same_baseline_each_round: true
  previous_candidates_allowed_as_b_input: false
  previous_candidates_use: diagnosis_artifact_for_A_only
  immediate_stop_if_baseline_path_changes: true
first_build_verification:
  required: true
  b_execution_context:
    rule: fresh_context_subagent_only
    current_context_execution_allowed: false
    if_subagent_unavailable: blocked-pending-subagent-eval
    subagent_id:
  v_verification_context:
    rule: separate_fresh_context_verifier_subagent
    same_agent_as_b_allowed: false
    same_agent_as_a_allowed: false
    current_context_or_self_verification_allowed: false
    strict_pass_bar_required: true
    returns_to_A: redacted_verdict_only
    if_verifier_unavailable: blocked-pending-verifier-subagent
    subagent_id:
  oracle_isolation:
    required: true
    method: copy_allowed_files_to_clean_workspace_before_spawning_b
    helper_script: scripts/prepare_isolated_eval_workspace.py
  oracle_verification_workspace:
    required_when_reference_oracle_exists: true
    method: copy_candidate_and_oracle_to_clean_read_only_workspace_before_spawning_v
    helper_script: scripts/prepare_verification_workspace.py
  structure_validator:
    command:
    result:
  script_checks:
    - path:
      result:
  fresh_context_evals:
    required_for_production_ready: true
    minimum_b_to_v_cycles_for_usable: 1
    minimum_b_to_v_cycles_for_production_ready: 2
    b_executor_prompts:
      - benchmark_id:
        prompt:
    v_verifier_prompts:
      - benchmark_id:
        prompt:
    results:
      - benchmark_id:
        b_executor:
          subagent_id:
          candidate_output:
          commands:
          blockers:
        v_verifier:
          subagent_id:
          pass:
          evidence:
          commands:
          residual_gaps:
  completion_report_allowed:
    value:
    reason:
A_B_V_structure:
  A_optimizer:
    owns:
      - target_brief
      - acceptance_contract
      - strict_v_pass_bar
      - B_skill_edits
      - workspace_isolation
      - stop_or_continue_decision
    must_not:
      - accept_B_without_required_V
      - run_B_reasoning_workflow_in_current_context_as_evidence
      - expose_hidden_oracle_to_B
  B_executor:
    context: fresh_subagent_per_round
    sees:
      - target_skill_B_path
      - user_task
      - allowed_input_workspace
      - fixed_baseline_input_only_when_run_mode_is_baseline_fixed_skill_eval
      - safety_constraints
    must_not_see:
      - reference_oracle
      - expected_answer
      - A_diagnosis
      - V_report_unless_this_is_an_explicit_repair_round
      - previous_candidate_when_run_mode_is_baseline_fixed_skill_eval
      - repair_target_packet_when_run_mode_is_baseline_fixed_skill_eval
  V_verifier:
    context: separate_fresh_subagent_per_round
    sees:
      - candidate_output_from_B
      - reference_oracle_when_required
      - acceptance_contract
      - strict_pass_bar
    default_verdict: fail
    must_not:
      - edit_candidate
      - edit_B
      - rerun_B
      - relax_the_contract
benchmarks:
  - id:
    prompt:
    input_artifacts:
    expected_properties:
boundaries:
  allowed_paths:
  isolated_workspace:
  verification_workspace:
  forbidden_paths:
  hidden_oracle_paths:
    - reference answer files such as REF.xml, REF.md, accepted PDFs, expected images, or answer keys
    - accepted outputs
    - answer keys
  oracle_visible_only_to:
    - v_verifier_subagent
  secret_policy: do_not_read_or_emit_secret_values
  public_repo_policy: no_public_commit_without_explicit_request
stop_condition:
  max_rounds: 3
  max_runtime_minutes:
  max_token_budget:
  same_residual_repeats_twice: stop
  score_stalls_twice: stop
  evaluator_conflict: human_review
  baseline_artifact_path_changed: immediate_stop
  protected_public_contract_change_needed: stop
  pass_rule: acceptance_contract_met_by_b_executor_and_separate_v_verifier_or_user_acceptance
```

## Run Modes And Baseline Identity

| Mode | Purpose | B Inputs | Can Produce Reference-Validated Evidence |
| --- | --- | --- | --- |
| `discovery_repair` | Discover mismatches and repair targets | B skill, task prompt, explicitly allowed repair packet or previous candidate for repair tasks | No |
| `baseline_fixed_skill_eval` | Verify whether the current B skill can transform the original baseline artifact into an accepted-output or oracle-level candidate | B skill, task prompt, fixed baseline input workspace only | Yes, after final clean run |

For `baseline_fixed_skill_eval`, record the absolute `baseline_artifact_path` once and reuse it for every round. Previous candidate artifacts may appear in A's diagnosis notes, but they must not be copied into B's executor workspace or used as the next round's input.

Final clean run requirements:

- Run only in `baseline_fixed_skill_eval`.
- Use a fresh B executor with baseline input plus current B skill only.
- Give B no repair target packet, previous candidate, V report, A notes, expected answer, or reference/oracle.
- Use a separate fresh V verifier with candidate artifact, reference/oracle artifact, acceptance criteria, and strict pass bar.
- Treat the result as a `verified-against-reference` candidate only when V reports zero non-tolerated mismatches.

## Acceptance Levels

| Level | Pass Rule | Use When |
| --- | --- | --- |
| `draft` | One current-context inspection or one B execution without independent V verification, with known gaps listed | Exploring a new skill idea |
| `usable` | One B executor pass plus one separate V verifier pass when reference/oracle validation is required, no must-have failures, no score below 2 | The skill can be used on real but bounded tasks |
| `production-ready` | Two B-to-V fresh-context cycles, no must-have failures, no score below 2, `target_match` and `boundary_safety` at 3 | The skill should reliably reduce user bottlenecks |
| `owner-approved` | User explicitly accepts the current result even if scorecard gaps remain | The user's taste or domain judgment overrides the default scorecard |

If the user provides a different bar, treat the user's bar as the contract and record how it maps to this table.

## Scorecard

Score each item from 0 to 3.

| Criterion | 0 | 1 | 2 | 3 |
| --- | --- | --- | --- | --- |
| target_match | Misses the user goal | Partially addresses it | Meets the main goal with gaps | Meets the goal cleanly |
| trigger_quality | Does not trigger reliably | Trigger is vague | Trigger is usable | Trigger is precise and complete |
| context_efficiency | Too much irrelevant context | Some bloat | Mostly lean | Lean and progressively disclosed |
| workflow_reliability | Steps are missing or unsafe | Steps need interpretation | Steps are mostly repeatable | Steps are clear and robust |
| boundary_safety | Crosses private/public or secret boundary | Boundary is vague | Boundary is stated | Boundary is operationally enforceable |
| validation_clarity | No validation | Weak validation | Relevant validation | Strong validation plus stop criteria |

Suggested pass rule: no criterion below 2, and target_match plus boundary_safety at 3 for production-facing use.

Operational score meaning:

- `0`: fails the criterion or violates a boundary.
- `1`: partially addresses the criterion but misses important required behavior.
- `2`: satisfies the criterion for bounded real use with minor residual gaps recorded.
- `3`: satisfies the criterion cleanly, with evidence from validation, evaluator output, or concrete artifact.

## B Executor Prompt

Use this shape for a fresh-context B executor. Do not include the intended fix, reference answer, oracle, or verifier findings.

For `baseline_fixed_skill_eval`, this prompt must identify the isolated workspace that contains the fixed baseline input. It must not include previous candidates, repair target packets, or V reports.

```text
Use $<skill-name> at <absolute-skill-path> to complete this task:

<realistic user request>

Inputs:
- Run mode: baseline_fixed_skill_eval
- Fixed baseline input workspace: <isolated workspace path>
- Fixed baseline input file: <baseline artifact path inside isolated workspace>
- Output path for this round: <candidate output path>

Constraints:
- Do not read secrets, raw mail bodies, attachments, or unrelated private project content.
- Do not commit or push.
- Do not open or infer from hidden reference/oracle files such as REF.xml, REF.md, accepted outputs, target drawings, expected images, or answer keys.
- Use only the isolated input workspace provided here. Do not inspect the original source folder if it may contain hidden reference/oracle files.
- Do not read or reuse any previous candidate artifact.
- Do not read repair target packets, V reports, A notes, or expected-answer material.
- Work from this prompt and the provided skill path only; do not rely on A's conversation context.
- Return the artifact or result, the commands you ran, and any blockers.
```

For `discovery_repair`, A may provide a sanitized repair target packet or previous candidate only when the benchmark is explicitly a repair task. Label that prompt as `discovery_repair` and mark its output as ineligible for `verified-against-reference`.

## V Verifier Prompt

Use this shape for a separate fresh-context V verifier. V is not the executor and must not edit B or the candidate artifact.

```text
You are verifier V for a Soulforge skill optimization round.

Inputs:
- Candidate output from B: <candidate path>
- Reference/oracle artifact: <reference path>
- Acceptance contract: <contract or checklist>
- Run mode: <discovery_repair|baseline_fixed_skill_eval>

Task:
Compare the candidate output against the reference/oracle and acceptance contract.

Strict pass bar:
- Your default verdict is fail. Change it to pass only after every must-have criterion has concrete observed evidence.
- Pass only if the candidate satisfies the artifact-level target described by the acceptance contract.
- Do not pass a candidate merely because it is usable or improved.
- Return only a redacted verdict to A in benchmark mode. Do not copy oracle payloads, exact target values, coordinates, object IDs, embedded assets, answer-key steps, or target-specific patch instructions.
- Treat all unresolved artifact-level differences as failures unless the acceptance contract explicitly marks them as tolerated.
- Human/tool review items are allowed only when they are outside the artifact-level target, such as later GUI import, simulation, rendering, or owner visual judgment.
- If a human review item hides a missing object, section, value, relation, note, metadata, embedded asset, or required relationship check, fail the round.
- When uncertain whether a difference is tolerated, fail and ask A to sharpen the contract.
- If you are tempted to write "pass with conditions", set `pass: false` unless every condition is explicitly a tolerated post-V item outside the artifact-level target.
- Do not infer success from intent, naming similarity, or partial resemblance. Use observed artifact evidence and exact accepted tolerances, but report failures to A as abstract deltas and missing capabilities.

Required checks:
- Confirm the candidate and reference/oracle are different files and that the reference/oracle was visible to V only.
- For `baseline_fixed_skill_eval`, confirm B's reported input was the fixed baseline input and not a previous candidate.
- Confirm required candidate artifacts exist and are the files under review.
- Check object or section inventory/counts for required classes or output components.
- Check topology, behavior, or transformation result required by the contract.
- Check visible values, references, labels, notes, metadata, and source/reference annotations when relevant.
- Run or inspect deterministic validators when the contract provides them.
- Classify every remaining difference as either explicitly tolerated or non-tolerated.

Constraints:
- Do not modify files.
- Do not edit the target skill.
- Do not run a new B execution.
- Do not read secrets, raw mail bodies, attachments, or unrelated private project content.
- Work only inside the verification workspace and any explicitly allowed read-only reference paths.
- Return a structured redacted verdict with pass/fail, failure classes, abstract deltas, missing capabilities, source gaps, boundary issues, commands run, and residual human-review items.

Required verdict shape:
redacted_verdict:
  pass:
  acceptance_level_supported:
  oracle_visible_to_B: false
  oracle_visible_to_A: false
  verifier_separate_from_B:
  must_have_summary:
    passed_count:
    failed_count:
    unknown_count:
  failure_classes:
  abstract_deltas:
  missing_capabilities:
  source_gaps:
  boundary_issues:
  tolerated_residual_count:
  non_tolerated_residual_count:
  confidence:
  commands_run:
  evidence:
  next_capability_recommendations_for_A:
  forbidden_content_absent:
    no_copied_oracle_payload:
    no_exact_target_values:
    no_coordinates_or_object_ids:
    no_answer_key_steps:
    no_target_specific_patch:
```

## Comparison Note

```yaml
round:
run_mode:
objective:
reference_artifact_path:
baseline_artifact_path:
current_candidate_artifact_path:
baseline_artifact_path_changed:
target_skill_version:
benchmark_id:
b_executor_result:
  subagent_id:
  candidate_output:
  commands_run:
  blockers:
v_verifier_result:
  subagent_id:
  pass:
  acceptance_level_reached:
  strict_pass_bar_used:
  redacted_verdict_used:
  failure_classes:
  abstract_deltas:
  missing_capabilities:
  source_gaps:
  boundary_issues:
  tolerated_residual_count:
  non_tolerated_residual_count:
  score:
    target_match:
    trigger_quality:
    context_efficiency:
    workflow_reliability:
    boundary_safety:
    validation_clarity:
observed_gaps:
  - gap:
    evidence:
    failed_contract_item:
    likely_capability_fix:
next_edit:
  files:
  intent:
stop_decision:
  stop:
  reason:
  user_review_needed:
  status: active|paused|blocked|verified
  stop_reason:
  next_action_type:
  human_decision_required:
  human_decision_reason:
  autonomous_allowed:
verification_gate:
  structure_validator:
  b_execution:
    b_execution_context:
      subagent_id:
      clean_context:
      current_context_execution_used:
  v_verification:
    verifier_context:
      subagent_id:
      clean_context:
      same_as_b:
      current_context_verification_used:
  completion_report_status:
```

## Stop Conditions

Stop the loop when one of these is true:

- The pass rule is met by B executor output and a separate V verifier report when independent verification is required.
- For reference/oracle-level targets, V reports `pass: true` under the strict pass bar with no unresolved artifact-level mismatches.
- For `baseline_fixed_skill_eval`, pass is not allowed until the final clean run starts from the fixed baseline input and provides no repair packet or previous candidate to B.
- The user accepts the result as `owner-approved`.
- The same failure repeats after two focused edits.
- Score improvement stalls after two focused edits.
- The configured max runtime or token budget is reached.
- `baseline_artifact_path` changes during a `baseline_fixed_skill_eval` run.
- V evaluator reports conflict in a way A cannot resolve from observed evidence.
- The next improvement requires domain facts, target examples, private data, or user preference.
- The next edit would move data across public/private boundaries.
- The next edit requires protected public contract changes without explicit user authorization.
- The configured round limit is reached.
- A redacted V verdict says the candidate is source-supported and boundary-safe, but still fails the reference because of accepted scope, minimization, population choice, no-connect discrimination, or target-intent ambiguity, and no new approved non-oracle source evidence is available.
- The next action would run an oracle-contract or acceptance-contract abstraction role that inspects the oracle/reference without explicit authorization in the latest user request.

## After-Each-Round Governance

Use this checkpoint after every round or gate:

```yaml
after_each_round_governance_decision:
  next_action_type: continue_round|run_preflight_source_survey|create_seed_workflow|write_experience_packet|run_cold_replay|add_script_to_skill_or_workflow|add_reference_to_skill_or_workflow|add_source_packet|run_domain_source_review|run_tool_readiness_or_roundtrip|split_skill_into_workflow|promote_to_multi_skill_workflow|switch_to_goal_reconstruction|extract_skill_candidate|run_final_clean|create_evidence_bundle_for_mac_review|request_project_code_confirmation|request_human_decision|blocked
  human_decision_required:
  autonomous_allowed:
  stop_triggered_by:
  evidence:
    validator_status:
    b_executor_status:
    v_evaluator_status:
    hardcoding_risk:
    public_repo_change_needed:
    protected_contract_change_needed:
    project_code_needed_for_next_write:
    secret_or_raw_data_needed:
    external_side_effect_needed:
```

Autonomous continuation is allowed for `continue_round`, `run_preflight_source_survey`, `create_seed_workflow`, `write_experience_packet`, `run_cold_replay`, source/reference/script additions inside the approved skill/workflow boundary, safe domain-source review, safe tool-readiness checks, and `run_final_clean` only when all must-stop conditions are false.

Must-stop conditions are:

- public repo change
- protected contract change
- project code confirmation needed for the next evidence write
- secret or raw data access
- high hardcoding risk
- external side effect
- canon promotion
- configured round or runtime budget exhausted
- reference mismatch after a source-supported, boundary-safe candidate when the remaining gap is target-scope/minimization and no new non-oracle constraint exists
- oracle-contract generation without explicit authorization

If a must-stop condition is true, set `human_decision_required: true` and choose the matching request/block action.

Do not let `goal not achieved` override a must-stop condition. If a checkpoint report says the next round needs authorization, approval, or a public-safe target-scope constraint, that statement is binding for the controller: stop and request the decision instead of converting the checkpoint into `continue_round`.
