# GitHub Up Mapping

## Soulforge Mapping

- Canon skill id: `github_up`
- Canon linkage: `.registry/skills/github_up/skill.yaml`
- Installed Codex skill: `soulforge-github-up`
- Workflow: `.workflow/github_upload_publish_v0/`

## Output Shape

- `Applied skill: soulforge-github-up`
- Requested direction: `github_up`
- Workflow used
- Repo change inventory for `.`, `_workmeta`, and `private-state`
- Validators run or skipped reason
- Commit plan
- Push result
- Public/private/secret boundary status
- Remaining blockers or required owner action

## Boundary Note

- The workflow owns policy and output templates.
- This skill only maps user wording to the correct workflow and runtime steps.
- Each repo commits and pushes from its own Git root.
- Credentials, account/session state, and owner approval remain runtime concerns.
