You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-luna; reasoning_effort=medium; species=dwarf; class=auditor.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: github_upload_publish_v0
kind: workflow
status: active
title: GitHub Upload Publish v0
summary: Repeatable workflow for validating, committing, and pushing Soulforge public repo changes together with companion `_workmeta` and `private-state` metadata repo changes.
entrypoint: run
execution_mode: local_tool_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
inputs:
  - upload_scope_binding
  - repo_boundary_policy
  - commit_message_policy
optional_inputs:
  - public_validation_policy
  - workmeta_validation_policy
  - private_state_validation_policy
  - push_policy
outputs:
  - upload_scope_packet
  - repo_change_inventory
  - validation_matrix
  - commit_plan
  - push_result_report
  - upload_receipt
  - boundary_review_note
validation_level: pilot_ready_private_evidence
registration_policy: owner_requested_registration
repo_surfaces:
  - repo_id: public
    root_ref: "."
    remote_policy: own_origin
    commit_when_dirty: true
  - repo_id: workmeta
    root_ref: "_workmeta"
    remote_policy: own_origin
    commit_when_dirty: true
  - repo_id: private_state
    root_ref: "private-state"
    remote_policy: own_origin
    commit_when_dirty: true
downstream_workflows:
  - workflow_id: post_development_review_gate_v0
    expected_input: upload_changes_public_or_private_state
    status: required_before_completion_claim
operating_contract:
  owns:
    - upload_scope_packet_shape
    - repo_change_inventory_shape
    - validation_matrix_shape
    - commit_plan_shape
    - push_result_report_shape
    - upload_receipt_shape
    - boundary_review_note_shape
  does_not_own:
    - secret_value_inspection
    - public_commit_of_private_payloads
    - destructive_git_rewrites
    - remote_branch_policy_changes
    - owner_approval_for_unrelated_scope
  boundaries:
    public_and_metadata_repos_checked_together: true
    each_repo_commits_from_own_git_root: true
    private_payloads_excluded_from_public_repo: true
    no_secret_values_in_logs_or_receipts: true
    private_state_only_when_dirty: true
  required_output_shapes:
    upload_scope_packet: templates/upload_scope_packet.template.yaml
    repo_change_inventory: templates/repo_change_inventory.template.yaml
    validation_matrix: templates/validation_matrix.template.yaml
    commit_plan: templates/commit_plan.template.yaml
    push_result_report: templates/push_result_report.template.yaml
    upload_receipt: templates/upload_receipt.template.yaml
    boundary_review_note: templates/boundary_review_note.template.yaml
notes:
  - This workflow exists because publishing public changes and metadata changes together was repeatedly requested.
  - It does not collapse public, `_workmeta`, and `private-state` into one Git repo; it coordinates their separate Git roots.
  - If a repo has unrelated dirty changes, record the scope explicitly before committing it.



--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: github_upload_publish_v0
kind: step_graph
status: active
steps:
  - step_id: bind_upload_scope
    title: Bind Upload Scope
    actor_slot: upload_scope_binder
    action: Bind requested upload scope, repo roots, remotes, validation policy, commit message policy, and whether metadata repos should be included.
    outputs:
      - upload_scope_packet
    next:
      - inventory_repo_changes
  - step_id: inventory_repo_changes
    title: Inventory Repo Changes
    actor_slot: repo_change_inventory_runner
    action: Run status for public `Soulforge`, `_workmeta`, and `private-state`; classify each as changed, clean, blocked, or out of scope.
    inputs:
      - upload_scope_packet
    outputs:
      - repo_change_inventory
    next:
      - run_upload_validations
  - step_id: run_upload_validations
    title: Run Upload Validations
    actor_slot: validation_runner
    action: Run required validators for changed public and private surfaces, record skipped validators with reason, and block publish on relevant failures.
    inputs:
      - repo_change_inventory
    outputs:
      - validation_matrix
    next:
      - prepare_commit_plan
  - step_id: prepare_commit_plan
    title: Prepare Commit Plan
    actor_slot: commit_planner
    action: Decide per repo whether to commit, what paths are included, what commit message to use, and which dirty changes are intentionally included or excluded.
    inputs:
      - validation_matrix
    outputs:
      - commit_plan
    next:
      - commit_changed_repos
  - step_id: commit_changed_repos
    title: Commit Changed Repos
    actor_slot: git_commit_runner
    action: Stage and commit each changed repo from its own Git root without rewriting history or crossing public/private boundaries.
    inputs:
      - commit_plan
    outputs:
      - commit_result_report
    next:
      - push_changed_repos
  - step_id: push_changed_repos
    title: Push Changed Repos
    actor_slot: git_push_runner
    action: Push each committed repo to its own configured origin and branch, then record push status or blockers.
    inputs:
      - commit_result_report
    outputs:
      - push_result_report
    next:
      - record_upload_receipt
  - step_id: record_upload_receipt
    title: Record Upload Receipt
    actor_slot: upload_receipt_recorder
    action: Write a private metadata receipt with repo ids, branches, commit refs when available, push results, validators, known gaps, and next actions.
    inputs:
      - push_result_report
    outputs:
      - upload_receipt
    next:
      - review_boundary_and_handoff
  - step_id: review_boundary_and_handoff
    title: Review Boundary And Handoff
    actor_slot: boundary_handoff_reviewer
    action: Run closeout review, name the strongest supported status, and confirm no public/private or secret boundary was crossed.
    inputs:
      - upload_receipt
    outputs:
      - boundary_review_note
    next: []



--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "schema_version": "soulforge.workflow_optimizer.input_fixture.v0",
  "fixture_id": "github_upload_publish_v0_public_synthetic_upload_001",
  "workflow_id": "github_upload_publish_v0",
  "fixture_kind": "public_safe_synthetic_workflow_contract_fixture",
  "public_safety": {
    "contains_real_project_payload": false,
    "contains_mail_body_or_attachment": false,
    "contains_secret_value": false,
    "contains_runtime_absolute_path": false,
    "contains_private_raw_source": false,
    "basis": "Synthetic repo-status and validation observations derived from the public workflow contract only."
  },
  "request": {
    "owner_intent": "publish bounded Soulforge workflow/documentation changes and companion metadata evidence",
    "push_requested": true,
    "destructive_git_allowed": false,
    "remote_policy_changes_allowed": false,
    "secret_inspection_allowed": false,
    "commit_message_policy": {
      "language": "ko",
      "public_repo_message": "workflow: GitHub 업로드 workflow 보정",
      "workmeta_repo_message": "workflow: GitHub 업로드 보정 근거 기록",
      "private_state_message": null
    }
  },
  "repo_status_observations": [
    {
      "repo_id": "public",
      "root_ref": ".",
      "branch": "main",
      "remote_state": "own_origin_available",
      "status_lines": [
        "M CHANGELOG.md",
        "M .workflow/github_upload_publish_v0/profile_policy.yaml",
        "?? .workflow/github_upload_publish_v0/calibrations/cal_20260611_github_upload_quality_equiv_001/",
        "?? .workflow/github_upload_publish_v0/history/2026-06-11_quality_equiv_calibration.md",
        "?? _workspaces/<project_code>/private-source/raw-mail-export.eml"
      ]
    },
    {
      "repo_id": "workmeta",
      "root_ref": "_workmeta",
      "branch": "main",
      "remote_state": "own_origin_available",
      "status_lines": [
        "M system/NIGHT_WORK_HANDOFF.md",
        "?? system/reports/procedure_capture/workflow_optimizer/github_upload_publish_v0_cal_20260611/",
        "?? system/reports/post_development_review/github_upload_publish_v0_cal_20260611/"
      ]
    },
    {
      "repo_id": "private_state",
      "root_ref": "private-state",
      "branch": "main",
      "remote_state": "own_origin_available",
      "status_lines": []
    }
  ],
  "validation_observations": [
    {
      "command": "npm.cmd run validate:canon",
      "scope": "public",
      "result": "pass"
    },
    {
      "command": "npm.cmd run validate:path-policy",
      "scope": "public",
      "result": "pass"
    },
    {
      "command": "npm.cmd run validate:workmeta-payload",
      "scope": "workmeta",
      "result": "pass"
    },
    {
      "command": "npm.cmd run done:check",
      "scope": "root",
      "result": "not_yet_run"
    }
  ],
  "expected_boundary_behavior": {
    "public_commit_must_exclude": [
      "_workmeta/**",
      "private-state/**",
      "_workspaces/**",
      "mail bodies",
      "raw attachments",
      "secret values"
    ],
    "workmeta_commit_may_include_metadata_only": true,
    "private_state_commit_when_dirty_only": true,
    "push_after_commit_requires_all_relevant_validators_pass": true,
    "unrelated_or_blocked_paths_must_be_named_not_staged": true,
    "actual_git_commands_must_not_be_claimed_in_fixture_output": true
  },
  "required_output_shapes": [
    "upload_scope_packet",
    "repo_change_inventory",
    "validation_matrix",
    "commit_plan",
    "push_result_report",
    "upload_receipt",
    "boundary_review_note"
  ],
  "acceptance_summary": [
    "Classify public, workmeta, and private-state independently.",
    "Block the synthetic _workspaces raw mail path from public commit.",
    "Keep private metadata commits separate from public repo commits.",
    "Require done:check before push because root validation is not complete.",
    "Do not claim any real git command was executed.",
    "Produce a receipt-ready report with blockers and next action."
  ]
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
