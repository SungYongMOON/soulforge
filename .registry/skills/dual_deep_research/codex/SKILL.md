---
name: soulforge-dual-deep-research
description: "Use when Codex should run the Soulforge dual deep research workflow: NotebookLM CLI Deep Research via the repo-defined nlm/notebooklm-mcp contract, Codex direct source research as an independent path, comparison, common-claim dedupe, and delta handoff. Also use for Korean requests mentioning 노트북LM CLI, 딥 리서치, 심층 조사, 직접 조사 비교, 공통 결과 제거, or NotebookLM과 Codex 조사 비교."
---

# Soulforge Dual Deep Research

Use this skill as a thin launcher for `.workflow/dual_deep_research_v0`.

The workflow owns the actual procedure, including the fixed NotebookLM CLI-first command contract, calibrated profile policy, Codex independent research path, comparison buckets, common-claim dedupe rule, output templates, and downstream handoff. Do not re-invent the NotebookLM CLI sequence inside this skill.

## Operating Steps

1. Read `docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md`.
2. Read `.workflow/dual_deep_research_v0/workflow.yaml`, `step_graph.yaml`, and `profile_policy.yaml`.
3. Use the workflow-owned `profile_policy.yaml` before choosing a model profile. Do not copy optimizer outputs into this launcher; resolve the current primary and shadow profile from the workflow at execution time.
4. Start with the workflow `declare_goal` step before NotebookLM, Codex, comparison, sourcebound, or registration work.
5. Prepare the workflow's fresh subagent stages and keep their visible inputs bounded.
6. Use the workflow's `operating_contract.notebooklm_cli_contract.default_commands` as the NotebookLM CLI surface. Do not rediscover the basic `nlm` command shape unless the workflow contract itself is stale or the command fails.
7. Keep NotebookLM and Codex direct research independent until the workflow comparison step.
8. Keep common findings as trace metadata but exclude them from owner-facing delta recommendations.
9. Emit `research_delta_handoff` for `knowledge_wiki_cell` / `knowledge_wiki_pipeline_v0`; the downstream party/workflow judges registration, Drive placement, sourcebound review, wiki curation, owner decision, or no action.
10. If the research lane exposes a need to create or evolve a downstream or adjacent workflow, route that separate work through `$soulforge-workflow-generator`.
11. Before claiming completion, readiness, registration, or promotion for any created or evolved workflow, route it through `$soulforge-workflow-check`.

## Boundary Rules

- Do not read NotebookLM auth/session files, cookies, tokens, `.env`, or credential JSON.
- Do not copy raw NotebookLM answers, source payloads, Drive payloads, private run truth, or runtime absolute paths into public files.
- Do not treat NotebookLM output, Codex output, or their agreement as source truth, owner approval, ontology acceptance, or canon promotion.
- Do not create, evolve, register, promote, or claim completion for downstream or adjacent workflows from this launcher; use the workflow-generator and workflow-check routes above.
- Do not present the synthetic profile calibration as proof that real NotebookLM, web, Drive, wiki, source truth, account state, or owner-decision behavior has been pilot-executed.
- Do not hard-code optimizer profile values in this launcher; `profile_policy.yaml` remains the profile owner.

## Load On Demand

Read [`references/mapping.md`](references/mapping.md) when you need the workflow linkage, fixed CLI command summary, output shape, or validation checklist.
