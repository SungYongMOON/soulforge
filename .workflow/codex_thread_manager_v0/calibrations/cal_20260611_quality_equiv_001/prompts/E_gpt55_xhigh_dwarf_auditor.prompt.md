You are running a public-safe optimizer candidate for Soulforge workflow `codex_thread_manager_v0`.

Profile:
- candidate_id: E_gpt55_xhigh_dwarf_auditor
- model: gpt-5.5
- reasoning_effort: xhigh
- species: dwarf
- class: auditor

Task:
Use only the synthetic fixture below. Do not inspect files, run commands, create or fork Codex threads, create worktrees, mutate files, edit NIGHT_WORK_HANDOFF, use private/raw payloads, read secrets, contact external services, or claim any real thread id/validator/action occurred. Produce one compact JSON object and no Markdown.

Required top-level keys:
`profile_metadata`, `goal_scope_binding`, `checkpoint_refresh_plan`, `continuation_surface_decision`, `worker_packet_set`, `manager_rollover_packet`, `worker_execution_or_acceptance_gate`, `integration_validation_plan`, `workflow_check_closeout`, `boundary_review_note`, `completion_state`.

Quality bar:
- Declare the current thread as the manager for the actionable invocation.
- Plan a checkpoint refresh before any worker creation, compact/clear, or manager rollover, while noting the fixture does not authorize editing NIGHT_WORK_HANDOFF.
- Choose manager plus role worker topology for the actionable request; same-thread-only is allowed only for trivial preflight or blocked tools.
- Use bounded subagents for substantive non-durable side work.
- For durable file mutation with overlapping write scope, choose a worktree-worker packet or stop before overlapping mutation.
- For validator/status-only checks, direct same-thread execution may be listed as a named no-subagent exception, but do not claim it was actually run.
- For acceptance, workflow-check, or readiness claims, require a fresh verifier/judge that is not a fork/continuation of the implementer.
- Prepare a fresh manager rollover packet because the fixture says 25 hours, cross-PC/overnight continuation, and high context pressure.
- Do not claim actual thread creation, actual thread ids, real worktree creation, real file edits, real validators, production readiness, default-route safety, party binding, or public canon promotion.
- Boundary review must state no private/raw/secret material, no external action, no real thread operation, no NIGHT_WORK_HANDOFF edit, no default-route switch, and claim ceiling `observed_synthetic_quality_equivalence`.

Synthetic fixture:
```json
{
  "fixture_id": "codex_thread_manager_v0_public_synthetic_thread_orchestration_001",
  "fixture_kind": "public_safe_synthetic_workflow_contract_fixture",
  "workflow_id": "codex_thread_manager_v0",
  "request": {
    "request_mode": "explicit_skill_invocation_manager_worker",
    "soulforge_task_goal": "Run a synthetic workflow-profile calibration and close it with workflow-check evidence.",
    "active_workspace_scope": "soulforge_repo_public_safe_synthetic_scope",
    "boundary_policy_ref": "docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md",
    "thread_orchestration_request": "Treat the current Codex thread as the manager, plan bounded worker lanes, preserve context lifecycle, and prepare closeout evidence."
  },
  "runtime_boundary": {
    "synthetic_only": true,
    "actual_thread_creation_authorized": false,
    "actual_worktree_creation_authorized": false,
    "actual_file_mutation_authorized": false,
    "actual_external_action_authorized": false,
    "private_payloads_available": false,
    "secret_inspection_allowed": false,
    "candidate_must_not_claim_commands_or_validators_ran": true
  },
  "context_lifecycle": {
    "prior_night_work_handoff_ref": "_workmeta/system/NIGHT_WORK_HANDOFF.md",
    "night_work_handoff_edit_authorized": false,
    "hours_since_manager_start": 25,
    "cross_pc_or_overnight_continuation_requested": true,
    "context_pressure_signal": "high",
    "manager_rollover_policy_expected": "prepare_fresh_manager_rollover_packet_but_do_not_create_thread"
  },
  "target_refs": {
    "workflow_refs": [
      ".workflow/synthetic_thread_demo_v0/workflow.yaml",
      ".workflow/synthetic_thread_demo_v0/profile_policy.yaml"
    ],
    "workmeta_refs": [
      "_workmeta/system/reports/procedure_capture/workflow_optimizer/synthetic_thread_demo_cal/OPTIMIZER_RUN_REPORT.yaml",
      "_workmeta/system/reports/post_development_review/synthetic_thread_demo_cal/WORKFLOW_CHECK_VERDICT.yaml"
    ],
    "validation_command_refs": [
      "JSON and JSONL parse for synthetic calibration archive",
      "targeted public/private path scan for synthetic calibration archive",
      "npm.cmd run validate:canon",
      "npm.cmd run validate:path-policy",
      "npm.cmd run done:check"
    ]
  },
  "lane_requests": [
    {
      "lane_id": "research_lane",
      "lane_kind": "focused_investigation",
      "durability_needed": false,
      "substantive_work": true,
      "expected_surface": "bounded_subagent",
      "allowed_refs": [
        ".workflow/synthetic_thread_demo_v0/workflow.yaml"
      ]
    },
    {
      "lane_id": "implementation_lane",
      "lane_kind": "file_mutation_planning",
      "durability_needed": true,
      "substantive_work": true,
      "expected_surface": "worktree_worker_packet_or_stop",
      "allowed_refs": [
        ".workflow/synthetic_thread_demo_v0/profile_policy.yaml"
      ],
      "overlap_risk": "verification_lane_wants_same_policy_file"
    },
    {
      "lane_id": "verification_lane",
      "lane_kind": "independent_acceptance_review",
      "durability_needed": true,
      "substantive_work": true,
      "expected_surface": "fresh_verifier_or_judge_packet",
      "allowed_refs": [
        ".workflow/synthetic_thread_demo_v0/profile_policy.yaml",
        "_workmeta/system/reports/post_development_review/synthetic_thread_demo_cal/WORKFLOW_CHECK_VERDICT.yaml"
      ],
      "must_not_be": [
        "implementer_fork",
        "manager_rollover_from_implementation_context"
      ]
    },
    {
      "lane_id": "validator_status_lane",
      "lane_kind": "small_deterministic_local_check",
      "durability_needed": false,
      "substantive_work": false,
      "expected_surface": "same_thread_direct_check_allowed_with_no_subagent_exception",
      "allowed_refs": [
        "git status --short",
        "JSON and JSONL parse"
      ]
    }
  ],
  "expected_output_requirements": {
    "top_level_keys": [
      "profile_metadata",
      "goal_scope_binding",
      "checkpoint_refresh_plan",
      "continuation_surface_decision",
      "worker_packet_set",
      "manager_rollover_packet",
      "worker_execution_or_acceptance_gate",
      "integration_validation_plan",
      "workflow_check_closeout",
      "boundary_review_note",
      "completion_state"
    ],
    "must_declare_current_thread_manager": true,
    "must_refresh_handoff_before_workers_or_rollover": true,
    "must_not_edit_night_work_handoff": true,
    "must_select_manager_plus_role_workers_for_actionable_invocation": true,
    "must_use_subagent_first_for_substantive_worker_lanes": true,
    "must_route_overlapping_mutation_to_worktree_worker_or_stop": true,
    "must_require_fresh_verifier_for_acceptance_claim": true,
    "must_prepare_rollover_packet_due_to_25h_cross_pc_signal": true,
    "must_not_claim_actual_thread_ids_or_thread_creation": true,
    "must_report_default_route_safe_no": true,
    "must_keep_production_ready_claim_false": true,
    "must_keep_claim_ceiling_observed_synthetic": true
  }
}
```
