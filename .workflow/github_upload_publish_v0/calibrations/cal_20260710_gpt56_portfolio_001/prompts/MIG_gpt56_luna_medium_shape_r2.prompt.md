Calibration replay metadata: candidate_id=MIG_gpt56_luna_medium_shape_r2; model=gpt-5.6-luna; reasoning_effort=medium.
Only candidate/profile metadata was transformed in the frozen public-safe candidate prompt below; task content and fixture remain unchanged.
--- TRANSFORMED FROZEN PUBLIC-SAFE CANDIDATE PROMPT ---
You are running a public-safe optimizer candidate for Soulforge workflow `github_upload_publish_v0`.

Profile:
- candidate_id: MIG_gpt56_luna_medium_shape_r2
- model: gpt-5.6-luna
- reasoning_effort: medium
- species: dwarf
- class: auditor

Task:
Use only the synthetic fixture below. Do not run commands, inspect files, invent private facts, or claim any real git action occurred. Produce one compact JSON object with these top-level keys: `profile_metadata`, `upload_scope_packet`, `repo_change_inventory`, `validation_matrix`, `commit_plan`, `push_result_report`, `upload_receipt`, `boundary_review_note`, `completion_state`.

Quality bar:
- Keep public, `_workmeta`, and `private-state` repo decisions separate.
- Block `_workspaces/<project_code>/private-source/raw-mail-export.eml` from public commit.
- Require `npm.cmd run done:check` before any push because the fixture says it has not yet run.
- Include Korean commit messages from the fixture.
- State that no commands were executed and no push occurred in this synthetic output.
- Preserve the public/private/secret boundary and owner-decision limits.

Synthetic fixture:
```json
{
  "fixture_id": "github_upload_publish_v0_public_synthetic_upload_001",
  "owner_intent": "publish bounded Soulforge workflow/documentation changes and companion metadata evidence",
  "push_requested": true,
  "destructive_git_allowed": false,
  "remote_policy_changes_allowed": false,
  "secret_inspection_allowed": false,
  "commit_messages": {
    "public": "workflow: GitHub 업로드 workflow 보정",
    "workmeta": "workflow: GitHub 업로드 보정 근거 기록"
  },
  "repos": [
    {
      "repo_id": "public",
      "root_ref": ".",
      "branch": "main",
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
      "status_lines": []
    }
  ],
  "validators": [
    {"command": "npm.cmd run validate:canon", "scope": "public", "result": "pass"},
    {"command": "npm.cmd run validate:path-policy", "scope": "public", "result": "pass"},
    {"command": "npm.cmd run validate:workmeta-payload", "scope": "workmeta", "result": "pass"},
    {"command": "npm.cmd run done:check", "scope": "root", "result": "not_yet_run"}
  ]
}
```
