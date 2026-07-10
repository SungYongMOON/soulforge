schema_version: soulforge.github_upload_publish_v0.deliverable.v0
fixture_id: github_upload_publish_v0_public_synthetic_upload_001
workflow_id: github_upload_publish_v0
evidence_basis: supplied_public_safe_synthetic_fixture_only
overall_status: blocked_before_commit_and_push
non_claims:
  - No Git command execution is claimed.
  - No file, repository, remote, service, or runtime state was independently inspected.
  - No commit, push, message, or state change is claimed.
  - No secret values or private payload contents were inspected.

upload_scope_packet:
  owner_intent: publish bounded Soulforge workflow/documentation changes and companion metadata evidence
  push_requested: true
  destructive_git_allowed: false
  remote_policy_changes_allowed: false
  secret_inspection_allowed: false
  repo_scope:
    public:
      root_ref: "."
      branch: main
      remote_policy: own_origin
      inclusion_policy: bounded_public_workflow_and_documentation_changes
    workmeta:
      root_ref: "_workmeta"
      branch: main
      remote_policy: own_origin
      inclusion_policy: metadata_only
    private_state:
      root_ref: "private-state"
      branch: main
      remote_policy: own_origin
      inclusion_policy: commit_only_when_dirty
  commit_message_policy:
    language: ko
    public: "workflow: GitHub 업로드 workflow 보정"
    workmeta: "workflow: GitHub 업로드 보정 근거 기록"
    private_state: null
  exclusions:
    - "_workmeta/** from the public commit"
    - "private-state/** from the public commit"
    - "_workspaces/** from the public commit"
    - mail bodies
    - raw attachments
    - secret values
    - unrelated or blocked paths
  stop_conditions:
    - Stop before commit or push if any relevant validator has failed or is incomplete.
    - Stop if public/private boundary compliance cannot be established.
    - Stop if an unrelated dirty path cannot be safely excluded.
    - Stop rather than rewrite history or modify remote branch policy.

repo_change_inventory:
  evidence_status: fixture_observation_only
  repositories:
    - repo_id: public
      root_ref: "."
      branch: main
      remote_state: own_origin_available
      classification: changed_with_blocked_path
      candidate_paths:
        - path: CHANGELOG.md
          disposition: eligible_for_bounded_public_commit
        - path: .workflow/github_upload_publish_v0/profile_policy.yaml
          disposition: eligible_for_bounded_public_commit
        - path: .workflow/github_upload_publish_v0/calibrations/cal_20260611_github_upload_quality_equiv_001/
          disposition: eligible_for_bounded_public_commit
        - path: .workflow/github_upload_publish_v0/history/2026-06-11_quality_equiv_calibration.md
          disposition: eligible_for_bounded_public_commit
        - path: "_workspaces/<project_code>/private-source/raw-mail-export.eml"
          disposition: blocked_exclude_and_do_not_stage
          reason: raw mail path under a public-repo-excluded private workspace surface
      uncertainty:
        - Eligibility describes boundary classification only; file contents and relationship to owner intent are not independently established.
    - repo_id: workmeta
      root_ref: "_workmeta"
      branch: main
      remote_state: own_origin_available
      classification: changed
      candidate_paths:
        - path: system/NIGHT_WORK_HANDOFF.md
          disposition: conditionally_eligible_metadata_only
        - path: system/reports/procedure_capture/workflow_optimizer/github_upload_publish_v0_cal_20260611/
          disposition: conditionally_eligible_metadata_only
        - path: system/reports/post_development_review/github_upload_publish_v0_cal_20260611/
          disposition: conditionally_eligible_metadata_only
      uncertainty:
        - Metadata-only compliance is asserted by the fixture context but not independently content-verified.
        - NIGHT_WORK_HANDOFF inclusion requires confirmation that it belongs to this bounded upload scope.
    - repo_id: private_state
      root_ref: private-state
      branch: main
      remote_state: own_origin_available
      classification: clean
      candidate_paths: []
      disposition: no_commit_no_push

validation_matrix:
  overall_status: incomplete_blocking
  entries:
    - validator: "npm.cmd run validate:canon"
      scope: public
      observed_result: pass
      evidence_status: supplied_fixture_observation
      publish_effect: satisfied
    - validator: "npm.cmd run validate:path-policy"
      scope: public
      observed_result: pass
      evidence_status: supplied_fixture_observation
      publish_effect: satisfied
    - validator: "npm.cmd run validate:workmeta-payload"
      scope: workmeta
      observed_result: pass
      evidence_status: supplied_fixture_observation
      publish_effect: satisfied
    - validator: "npm.cmd run done:check"
      scope: root
      observed_result: not_yet_run
      evidence_status: supplied_fixture_observation
      publish_effect: blocking
  required_before_push:
    - Obtain a passing result for "npm.cmd run done:check".
    - Preserve the exclusion of "_workspaces/<project_code>/private-source/raw-mail-export.eml".
    - Complete the required post_development_review_gate_v0 before any completion claim.
  decision: do_not_commit_or_push_under_current_fixture_state

commit_plan:
  status: prepared_but_blocked
  execution_authorized_now: false
  repositories:
    - repo_id: public
      action_after_blockers_clear: commit
      commit_message: "workflow: GitHub 업로드 workflow 보정"
      include_paths:
        - CHANGELOG.md
        - .workflow/github_upload_publish_v0/profile_policy.yaml
        - .workflow/github_upload_publish_v0/calibrations/cal_20260611_github_upload_quality_equiv_001/
        - .workflow/github_upload_publish_v0/history/2026-06-11_quality_equiv_calibration.md
      exclude_paths:
        - path: "_workspaces/<project_code>/private-source/raw-mail-export.eml"
          reason: prohibited private raw-mail payload on public surface
        - path: "_workmeta/**"
          reason: separate Git root and metadata boundary
        - path: "private-state/**"
          reason: separate Git root and private-state boundary
      staging_rule: stage_only_the_named_included_paths_from_the_public_git_root
    - repo_id: workmeta
      action_after_blockers_clear: commit_if_scope_and_metadata_only_status_are_confirmed
      commit_message: "workflow: GitHub 업로드 보정 근거 기록"
      include_paths:
        - system/NIGHT_WORK_HANDOFF.md
        - system/reports/procedure_capture/workflow_optimizer/github_upload_publish_v0_cal_20260611/
        - system/reports/post_development_review/github_upload_publish_v0_cal_20260611/
      staging_rule: stage_only_confirmed_metadata_paths_from_the_workmeta_git_root
      owner_boundary:
        - Exclude NIGHT_WORK_HANDOFF.md if it is unrelated or lacks a valid continuity need.
    - repo_id: private_state
      action_after_blockers_clear: no_commit
      reason: fixture reports no dirty paths
  global_constraints:
    - Each repository must be committed from its own Git root.
    - No destructive rewrite is permitted.
    - No remote or branch policy change is permitted.
    - Commit references remain unknown until actual commits exist.

push_result_report:
  status: not_attempted_blocked
  blocker: root validator "npm.cmd run done:check" is incomplete
  repositories:
    - repo_id: public
      branch: main
      result: not_pushed
      commit_ref: unknown
    - repo_id: workmeta
      branch: main
      result: not_pushed
      commit_ref: unknown
    - repo_id: private_state
      branch: main
      result: not_applicable_clean_repo
      commit_ref: null
  next_action:
    - Run or otherwise obtain authoritative evidence for the required root done:check.
    - If it passes, reconfirm bounded staging and metadata-only scope.
    - Commit eligible repositories separately.
    - Push each resulting commit to its own configured origin and branch.
    - Record actual commit references and push outcomes without secret values.
    - Run post_development_review_gate_v0 before claiming completion.

upload_receipt:
  receipt_status: provisional_blocked
  fixture_id: github_upload_publish_v0_public_synthetic_upload_001
  repositories:
    public:
      branch: main
      planned_commit: true
      commit_ref: unknown
      push_result: not_attempted
    workmeta:
      branch: main
      planned_commit: conditional
      commit_ref: unknown
      push_result: not_attempted
    private_state:
      branch: main
      planned_commit: false
      commit_ref: null
      push_result: not_applicable
  validator_summary:
    passed_from_fixture:
      - validate:canon
      - validate:path-policy
      - validate:workmeta-payload
    incomplete:
      - done:check
  known_gaps:
    - No authoritative done:check result is supplied.
    - No actual commit references or push results exist in the fixture.
    - Candidate file contents and current runtime state are not independently known.
    - Workmeta scope, including NIGHT_WORK_HANDOFF.md, still requires bounded relevance confirmation.
    - Required post-development review completion is not established.
  blocked_path:
    path: "_workspaces/<project_code>/private-source/raw-mail-export.eml"
    required_disposition: leave_unstaged_and_exclude_from_public_commit
  strongest_supported_status: validation_incomplete_publish_blocked

boundary_review_note:
  review_basis: supplied_fixture_and_public_workflow_contract_only
  boundary_assessment:
    public_private_separation: conditionally_preserved_by_plan
    raw_mail_publication: blocked_by_plan
    metadata_repo_separation: preserved_by_plan
    private_state_dirty_only_rule: preserved_by_plan
    secret_logging: no_secret_values_present_in_deliverable
    destructive_git_rewrite: prohibited
    remote_policy_change: prohibited
  completion_claim_allowed: false
  required_downstream_review:
    workflow_id: post_development_review_gate_v0
    status: required_not_established
  stop_reason: done:check is not yet complete, so commit and push remain blocked
  final_status: blocked_pending_required_validation_and_closeout_review
