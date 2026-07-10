```yaml
upload_scope_packet:
  workflow_id: github_upload_publish_v0
  fixture_id: github_upload_publish_v0_public_synthetic_upload_001
  scope:
    owner_intent: "publish bounded Soulforge workflow/documentation changes and companion metadata evidence"
    push_requested: true
    include_metadata_repos: true
    public_repo_root: "."
    workmeta_repo_root: "_workmeta"
    private_state_repo_root: "private-state"
  branch_policy:
    public: main
    workmeta: main
    private_state: main
  remote_policy:
    public: own_origin
    workmeta: own_origin
    private_state: own_origin
  commit_message_policy:
    language: ko
    public: "workflow: GitHub 업로드 workflow 보정"
    workmeta: "workflow: GitHub 업로드 보정 근거 기록"
    private_state: null
  prohibitions:
    destructive_git_rewrites: false
    remote_branch_policy_changes: false
    secret_inspection: false
    public_private_boundary_crossing: true
  stop_conditions:
    - "Do not stage _workspaces/**, mail bodies, raw attachments, or secret values."
    - "Do not push until all relevant validators, including root done:check, pass."
    - "Do not claim execution of Git or validation commands from this fixture."

repo_change_inventory:
  workflow_id: github_upload_publish_v0
  fixture_id: github_upload_publish_v0_public_synthetic_upload_001
  repositories:
    - repo_id: public
      root_ref: "."
      branch: main
      remote_state: own_origin_available
      classification: changed
      in_scope_paths:
        - CHANGELOG.md
        - .workflow/github_upload_publish_v0/profile_policy.yaml
        - .workflow/github_upload_publish_v0/calibrations/cal_20260611_github_upload_quality_equiv_001/
        - .workflow/github_upload_publish_v0/history/2026-06-11_quality_equiv_calibration.md
      excluded_paths:
        - "_workspaces/<project_code>/private-source/raw-mail-export.eml"
      exclusion_reason: "Private raw mail payload; blocked from public commit."
    - repo_id: workmeta
      root_ref: "_workmeta"
      branch: main
      remote_state: own_origin_available
      classification: changed
      in_scope_paths:
        - system/NIGHT_WORK_HANDOFF.md
        - system/reports/procedure_capture/workflow_optimizer/github_upload_publish_v0_cal_20260611/
        - system/reports/post_development_review/github_upload_publish_v0_cal_20260611/
      excluded_paths: []
    - repo_id: private_state
      root_ref: private-state
      branch: main
      remote_state: own_origin_available
      classification: clean
      in_scope_paths: []
      excluded_paths: []
      action: "No commit or push planned."

validation_matrix:
  workflow_id: github_upload_publish_v0
  fixture_id: github_upload_publish_v0_public_synthetic_upload_001
  validations:
    - validator: npm.cmd run validate:canon
      scope: public
      result: pass
      evidence_kind: synthetic_observation
    - validator: npm.cmd run validate:path-policy
      scope: public
      result: pass
      evidence_kind: synthetic_observation
    - validator: npm.cmd run validate:workmeta-payload
      scope: workmeta
      result: pass
      evidence_kind: synthetic_observation
    - validator: npm.cmd run done:check
      scope: root
      result: not_yet_run
      required_before_push: true
      blocker: "Root completion validation is incomplete."
  overall_status: blocked_pending_validation
  push_gate: blocked
  required_next_validation:
    - npm.cmd run done:check

commit_plan:
  workflow_id: github_upload_publish_v0
  fixture_id: github_upload_publish_v0_public_synthetic_upload_001
  plans:
    - repo_id: public
      root_ref: "."
      branch: main
      action: commit_after_gate
      message: "workflow: GitHub 업로드 workflow 보정"
      include_paths:
        - CHANGELOG.md
        - .workflow/github_upload_publish_v0/profile_policy.yaml
        - .workflow/github_upload_publish_v0/calibrations/cal_20260611_github_upload_quality_equiv_001/
        - .workflow/github_upload_publish_v0/history/2026-06-11_quality_equiv_calibration.md
      exclude_paths:
        - "_workspaces/<project_code>/private-source/raw-mail-export.eml"
        - "_workmeta/**"
        - "private-state/**"
      staging_boundary: "Public repository only; metadata and private payloads remain separate."
    - repo_id: workmeta
      root_ref: "_workmeta"
      branch: main
      action: commit_after_gate
      message: "workflow: GitHub 업로드 보정 근거 기록"
      include_paths:
        - system/NIGHT_WORK_HANDOFF.md
        - system/reports/procedure_capture/workflow_optimizer/github_upload_publish_v0_cal_20260611/
        - system/reports/post_development_review/github_upload_publish_v0_cal_20260611/
      exclude_paths: []
      staging_boundary: "Metadata-only workmeta repository commit."
    - repo_id: private_state
      root_ref: private-state
      branch: main
      action: no_action
      reason: "Repository is clean; private-state commits occur only when dirty."
  commit_gate:
    status: blocked
    reason: "done:check has not yet been run."
  prohibited_actions:
    - destructive_git_rewrite
    - cross_repository_staging
    - public_commit_of_private_payload
    - staging_unrelated_or_blocked_paths

push_result_report:
  workflow_id: github_upload_publish_v0
  fixture_id: github_upload_publish_v0_public_synthetic_upload_001
  status: not_executed
  reason: "Push is blocked until npm.cmd run done:check is completed and passes."
  repositories:
    - repo_id: public
      branch: main
      commit_ref: unavailable
      push_status: blocked_pending_validation
    - repo_id: workmeta
      branch: main
      commit_ref: unavailable
      push_status: blocked_pending_validation
    - repo_id: private_state
      branch: main
      commit_ref: unavailable
      push_status: not_applicable_clean_repository
  non_claims:
    - "No actual commit command is claimed."
    - "No actual push command is claimed."
    - "No remote state beyond the supplied synthetic observation is claimed."

upload_receipt:
  workflow_id: github_upload_publish_v0
  fixture_id: github_upload_publish_v0_public_synthetic_upload_001
  receipt_status: ready_with_blocker
  repo_refs:
    public:
      branch: main
      commit_ref: unavailable
      push_result: blocked_pending_validation
    workmeta:
      branch: main
      commit_ref: unavailable
      push_result: blocked_pending_validation
    private_state:
      branch: main
      commit_ref: unavailable
      push_result: not_applicable_clean_repository
  validators:
    passed:
      - npm.cmd run validate:canon
      - npm.cmd run validate:path-policy
      - npm.cmd run validate:workmeta-payload
    incomplete:
      - npm.cmd run done:check
  known_gaps:
    - "Root done:check result is unavailable."
    - "Commit and push results are unavailable."
  next_actions:
    - "Run root done:check."
    - "If it passes, stage only the approved paths from each repository's own root."
    - "Commit public and workmeta repositories separately."
    - "Push each committed repository to its own origin and main branch."
    - "Record resulting commit references and push outcomes."

boundary_review_note:
  workflow_id: github_upload_publish_v0
  fixture_id: github_upload_publish_v0_public_synthetic_upload_001
  strongest_supported_status: blocked_pending_root_validation
  boundary_review:
    public_private_separation: preserved_in_plan
    public_raw_mail_exclusion: required_and_named
    metadata_repo_separation: preserved
    private_state_dirty_only_rule: preserved
    secret_values: none_present_in_fixture
    secret_inspection: not_permitted
    destructive_git_operations: prohibited
    remote_policy_changes: prohibited
  completion_claim: not_supported
  review_reason: "Required root validation has not yet been completed, and no commit or push execution may be claimed."
  handoff:
    next_required_step: "Complete npm.cmd run done:check."
    stop_if: "done:check fails or any unrelated, private, raw-mail, attachment, or secret-bearing path cannot be excluded."
```
