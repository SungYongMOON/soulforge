# GitHub Down Mapping

## Soulforge Mapping

- Canon skill id: `github_down`
- Canon linkage: `.registry/skills/github_down/skill.yaml`
- Installed Codex skill: `soulforge-github-down`
- Workflow: `.workflow/latest_update_sync_and_followup_v0/`

## Output Shape

- `Applied skill: soulforge-github-down`
- Requested direction: `github_down`
- Workflow used
- Repo results for `.`, `_workmeta`, and `private-state`
- Skill sync result
- Workspace junction status, including strict target-suffix audit result
- Readiness check result
- Public/private/secret boundary status
- Remaining blockers or required owner action

## Boundary Note

- The workflow owns policy and output templates.
- This skill only maps user wording to the correct workflow and runtime steps.
- Installed skill mirrors come only from tracked `.registry/skills/**/codex` bridges.
- Local root resolution, cloud sync roots, credentials, and account/session state remain runtime concerns.
- Junction readiness requires the report-only strict audit: each `_workspaces/<alias>` link must exist, be a symlink/junction, have a live target, and point to a target whose suffix matches the binding `cloud_relative_path`. Reports must not print host-local cloud roots.
