# External GPT Launcher Mapping

## Canon Linkage

- Canon skill id: `external_gpt`
- Codex installed skill: `soulforge-external-gpt`
- Source workflow: `.workflow/external_reasoning_workspace_v0/`
- Canon skill package: `.registry/skills/external_gpt/`

## Workflow Contract

Read these files at execution time:

1. `.workflow/external_reasoning_workspace_v0/workflow.yaml`
2. `.workflow/external_reasoning_workspace_v0/step_graph.yaml`
3. `.workflow/external_reasoning_workspace_v0/profile_policy.yaml`

The workflow is registered, but it is not production-ready, not default-route-safe, and not source truth or validation authority. Browser account state, raw transcripts, and private session pointers remain runtime/private metadata.

## Output Shape

Report:

- `Applied skill: soulforge-external-gpt`
- Workflow used: `.workflow/external_reasoning_workspace_v0/`
- Bounded advisory question and goal
- Side-effect authorization status
- Session decision: reused same-goal pointer, created fresh bounded conversation, or blocked
- Visible mode label status
- Prompt packet sanitized: yes/no
- DOM message-role readback: pass/fail/blocked
- Marker or nonce result
- Advisory findings and gaps
- Claim ceiling
- Public/private boundary status
- Required downstream route, if source truth, validation, owner approval, registration, or default-route action is needed

## Boundary Checklist

- Raw transcript not copied to public canon.
- Raw conversation or project URL not copied to public canon.
- Account-bound ids not copied to public canon.
- Cookies, local storage, tokens, credentials, session files, password stores, and `.env` values not inspected.
- Prompt packet contains only approved refs or sanitized summaries.
- ChatGPT output is labeled advisory only.
- DOM message-role readback is used for primary response evidence.
- Share links, uploads, project creation, permission changes, payment/account/security settings, deletion, archive, and destructive cleanup have explicit action-time approval or are not performed.
- No party binding, default-route switch, production-ready claim, or default-route-safe claim is made by this skill.

## Adjacent Routes

- Use `$soulforge-long-thread-handoff` when the external reasoning workspace is only one tool inside a long-running manager/checkpoint task.
- Use `$soulforge-dual-deep-research` when NotebookLM CLI-first Deep Research and Codex direct source research should run as independent source-backed lanes.
- Use `$soulforge-workflow-check` before claiming readiness, registration changes, or default-route posture for any workflow touched during the task.
