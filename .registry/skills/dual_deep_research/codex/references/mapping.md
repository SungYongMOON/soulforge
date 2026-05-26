# Dual Deep Research Launcher Mapping

## Canon Linkage

- Canon skill id: `dual_deep_research`
- Codex installed skill: `soulforge-dual-deep-research`
- Source workflow: `.workflow/dual_deep_research_v0/`
- Canon skill package: `.registry/skills/dual_deep_research/`
- Public NotebookLM setup runbook: `docs/architecture/workspace/NOTEBOOKLM_MCP_SETUP_V0.md`

## Workflow-Owned CLI Contract

Do not rediscover the basic NotebookLM CLI surface every run. The workflow owns this default command contract:

```bash
nlm login --check
nlm notebook list --json
nlm notebook get <notebook_id> --json
nlm source list <notebook_id> --json
nlm research start "<topic>" --mode deep --title "<notebook title>"
nlm research status <notebook_id> --max-wait 300
nlm research import <notebook_id> <task_id>
nlm notebook query <notebook_id> "<question>" --source-ids "<source_id_1>,<source_id_2>" --json --timeout 240
```

`nlm note create/update` and `nlm source add/sync` are allowed only when source upload or notebook mutation is owner-approved.

If `nlm` or `notebooklm-mcp` is missing, logged out, or blocked, record the runtime blocker and use `docs/architecture/workspace/NOTEBOOKLM_MCP_SETUP_V0.md`. Browser/UI operation is an exception, not the default.

## Calibrated Execution Profile

Read `.workflow/dual_deep_research_v0/profile_policy.yaml` before choosing the execution profile.

The workflow owns the current calibration archive, primary profile, shadow profiles, telemetry limits, and rerun triggers. This launcher must resolve those values at execution time instead of copying optimizer outputs into the skill.

The calibration optimizes workflow execution behavior only. It is not evidence of real NotebookLM research, web research, Drive/wiki registration, source truth, account state, or owner approval.

## Output Shape

The workflow output sequence is:

1. `goal_declaration`
2. `frozen_research_brief`
3. `subagent_stage_manifest`
4. `notebooklm_cli_research_packet`
5. `codex_direct_research_packet`
6. `dual_research_comparison_packet`
7. `research_delta_handoff`
8. `boundary_review_note`

Use the templates under `.workflow/dual_deep_research_v0/templates/`.

## Downstream Handoff

The research workflow does not decide registration. After `research_delta_handoff` and `boundary_review_note` are written, the default handoff target is:

- Party: `knowledge_wiki_cell`
- Workflow: `knowledge_wiki_pipeline_v0`
- Handoff mode: automatic after boundary pass
- Registration judgment owner: downstream workflow

Any per-item route such as sourcebound review, wiki curation, owner decision, Drive placement, NotebookLM packet-map update, or no action is a downstream judgment.

## Adjacent Workflow Authoring

If the research lane reveals that a downstream or adjacent workflow is missing, stale, or needs evolution, the dual deep research launcher records that need in the handoff/boundary artifacts and routes the separate workflow work through `$soulforge-workflow-generator`.

Any workflow created or evolved from that route must be reviewed through `$soulforge-workflow-check` before the agent claims completion, readiness, registration, canon promotion, or a default-route change. The dual deep research workflow remains investigation-only and does not own workflow registration judgment.

## Validation Checklist

- `.workflow/dual_deep_research_v0/workflow.yaml` was read before execution.
- `.workflow/dual_deep_research_v0/profile_policy.yaml` was read before selecting or overriding the execution profile.
- Optimizer profile values were resolved from workflow policy at execution time rather than copied from this skill.
- Goal declaration was written before material NotebookLM, Codex, comparison, sourcebound, or registration work.
- Fresh subagent stages were used for NotebookLM, Codex direct research, and comparison, or a blocker was recorded and the claim was lowered.
- NotebookLM CLI-first command contract was followed or a blocker was recorded.
- Codex direct research did not read NotebookLM findings before its packet was complete.
- Common claims remain trace metadata and are not repeated as delta recommendations.
- `research_delta_handoff` was prepared for `knowledge_wiki_cell` / `knowledge_wiki_pipeline_v0`.
- Downstream registration or promotion was left to the downstream workflow instead of performed by this skill.
- Downstream or adjacent workflow creation/evolution needs were routed through `$soulforge-workflow-generator`, not handled inside this launcher.
- If any workflow was created/evolved, it was reviewed through `$soulforge-workflow-check` before completion or readiness claims.
- Public files contain no raw NotebookLM answer text, source payload, secret, credential, session, Drive payload, or runtime absolute path.
- Synthetic profile calibration was not overclaimed as a real pilot.
