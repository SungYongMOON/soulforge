# Project Bootstrap Launcher Mapping

## Canon Linkage

- Canon skill id: `project_bootstrap`
- Installed Codex skill: `soulforge-project-bootstrap`
- Source workflow: `.workflow/development_team1_project_bootstrap_v0/`
- Canon skill package: `.registry/skills/project_bootstrap/`
- Party binding: none; the workflow declares `party_required: false`

## Runtime Resolution

Read in this order:

1. `.workflow/development_team1_project_bootstrap_v0/workflow.yaml`
2. `.workflow/development_team1_project_bootstrap_v0/step_graph.yaml`
3. `.workflow/development_team1_project_bootstrap_v0/profile_policy.yaml`
4. workflow-owned role, handoff, monster, party, template, and tool files only as required
5. current private/local project request and runtime bindings

The workflow owns the procedure and packet shapes. This launcher does not copy step graphs, profile choices, runtime paths, people, project codes, source bodies, or integration state.

## Required Intake

- project candidate classification and objective
- internal versus formal project kind
- Owner project-creation and number authority
- title, alias, and exact formal code when applicable
- development responsible, practical owner, and team membership
- project payload, private metadata, and Bot workspace owners
- approved source owner and raw-payload exclusion state
- optional runtime profile request
- optional Slack, Linear, Drive, Calendar, mail, route, or automation request with exact authority
- compatibility evidence for daily ledger, mail, RAG, history, and collaboration consumers

Missing authority or ambiguous identity/storage/source boundaries must return HOLD or owner-decision-required before mutation.

## Output Shape

1. bootstrap preview
2. identity reservation or exact-code admission
3. project contract candidate
4. project context candidate
5. source register candidate
6. responsibility matrix candidate
7. onboarding worklog
8. first bounded work packet
9. minimum runtime plan
10. compatibility and optional integration handoff
11. first-work receipt
12. bootstrap receipt and boundary review

## Adjacent Routes

- Use `owner_decision_packet_v0` when project, people, number, priority, storage, or external authority is missing.
- Use `codex_thread_manager_v0` only after an explicit Codex task creation decision; never infer returned thread ids.
- Use `project_folder_indexing_v0` after a project worksite is bound and indexing is requested.
- Use `daily_work_ledger_capture_v0` only after the project-code family is supported by evidence.
- Use `se_foldertree_generate` only when an approved SE tree is separately requested; it is not the project bootstrap owner.

## Validation Checklist

- The workflow exists in `.workflow/index.yaml` and all required package refs resolve.
- Workflow preflight ran before any mutation.
- Project class and Owner authority are explicit.
- Internal D1 code is next-in-sequence and collision-free, or formal code has an exact authority ref.
- People, storage, and source boundaries are complete.
- Public files contain no actual project people, codes, runtime paths, raw payload, or private evidence.
- `_workmeta` writes passed the exact write-target guard and remain metadata-only.
- Optional integrations remain HOLD unless exact authority and scope are present.
- Automatic ledger or other consumer support is not inferred from a project code.
- Minimum runtime only was planned; no responsibility catalog was converted into persistent Bots by default.
- Onboarding worklog and one first-work packet exist.
- Readiness requires deterministic validation, fresh execution evidence when required, and post-development review.
