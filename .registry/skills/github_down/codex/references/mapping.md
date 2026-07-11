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
- Read-only device capability probe result
- Observed node role and bootstrap profile posture
- Work available now, blocked work, and smallest owner-only action
- Readiness check result
- Public/private/secret boundary status
- Remaining blockers or required owner action

## Boundary Note

- The update workflow owns Git/skill/junction policy, procedure, and packet shapes. The canonical `github_down/skill.yaml` owns natural-language routing and the post-sync capability-to-work requirement. `MULTI_PC_DEVELOPMENT_V0.md` owns node-role meaning.
- Installed skill mirrors come only from tracked `.registry/skills/**/codex` bridges.
- Local root resolution, cloud sync roots, credentials, and account/session state remain runtime concerns.
- Junction readiness requires the report-only strict audit: each `_workspaces/<alias>` link must exist, be a symlink/junction, have a live target, and point to a target whose suffix matches the binding `cloud_relative_path`. Reports must not print host-local cloud roots.
- A capability observation is advisory. It does not grant install, writer, junction repair, NAS/Drive mutation, source approval, ingest, or canon-promotion authority.
- Explicit role setup routes to the tracked work/tool/always-on/dev-worker bootstrap prompt; `portable_dev_pc` stays on the public development lane unless the owner assigns a stronger local role.
- Companion-folder presence is not a profile signal. Without an explicit profile or valid local identity, only the public repo is in sync scope.
- `public-only` and `operator` capability probes skip private workspace and local capability bindings even if those files exist.
- `always_on_node` bootstrap requires exact `owner-with-state` plus explicit current operational-primary designation; `dev_worker_pc` also requires exact `owner-with-state` plus worker authority. Role labels or weaker profiles remain report-only.
