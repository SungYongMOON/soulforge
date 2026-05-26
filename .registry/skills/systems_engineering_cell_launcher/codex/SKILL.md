---
name: soulforge-systems-engineering-cell-launcher
description: "Use when Codex should route Soulforge systems-engineering assistant requests through the existing Systems Engineering Cell party, especially project start, stage gap scan, source or evidence gap, readiness digest, owner decision, review evidence, closeout, or Korean requests like SE 셀로 봐줘 and 이 과제 어디서 막혔는지 SE 관점으로 정리해줘."
---

# Soulforge Systems Engineering Cell Launcher

Use this skill to launch the existing `.party/systems_engineering_cell` route.

The most natural use is: find where an SE project or artifact flow is blocked, then recommend the safest next workflow route.

The skill is a thin bridge. It does not own the party, workflow chain, profile policy, project payloads, source truth, design authority, review approval, verification acceptance, owner decisions, or local runtime bindings.

## Operating Steps

1. Read `docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md`.
2. Read `.party/systems_engineering_cell/party.yaml` and `.party/systems_engineering_cell/allowed_workflows.yaml`.
3. If the party declares `reference_lookup_route_candidates`, treat them as route hints only; use them to decide whether to check official source packs and registered private lookup evidence before answering source-sensitive SE questions.
4. Confirm the selected workflow ids exist in `.workflow/index.yaml`.
5. Read `.workflow/se_assistant_operating_loop_v0/workflow.yaml` and `profile_policy.yaml` first, then read downstream workflow `workflow.yaml` and `profile_policy.yaml` files as needed for the request.
6. Reconstruct the user's request as a bounded SE assistant request: project start, stage gap scan, source gap, readiness digest, owner decision, review evidence, closeout, or blocked boundary case.
7. Report missing project binding, target stage, source scope, review scope, or owner authority as a blocker instead of filling the gap by inference.
8. Treat workflow-owned profile policy as execution hints for model, reasoning effort, species, and class. Do not copy those values into a new runtime binding.
9. Close bounded Soulforge changes through `post_development_review_gate_v0` when files, workflow state, skill state, or claim ceilings change.

## Route Guide

- Use `se_foldertree_generate` only when the request is scaffold generation and required runtime inputs are known.
- Use `se_stage_artifact_gap_scan_v0` when the user asks what a stage or artifact set is missing.
- Use party-declared reference lookup route candidates first when source/evidence support is unclear; they can point Codex toward official source packs and registered private lookup evidence, but they do not become source truth.
- Use `knowledge_wiki_pipeline_v0`, `source_gap_followup_packet_v0`, or `source_packet_sufficiency_review_v0` when source/evidence support remains unclear.
- Use `page_module_trace_matrix_v0` when a requirements/verification question needs trace-governance rows, missing evidence rows, or review/verification seed rows; do not treat it as final requirements truth.
- Use `se_cross_stage_mapping_governance_v0` when the request needs cross-stage artifact-family coverage, claim ceilings, source gaps, owner-decision needs, or downstream rerun route aggregation; do not treat it as source truth or readiness approval.
- Use source acquisition and sufficiency review before answering that a source, form, field set, or revision is official or current.
- Use `review_gate_evidence_pack_v0`, `review_action_item_closure_loop_v0`, or `accepted_verification_result_packet_v0` before answering that a review passed, an action item closed, or a verification result was accepted.
- Use `project_readiness_digest_v0` when the owner needs a status, blocker, backlog, or next-action rollup.
- Use `owner_decision_packet_v0` when a scoped owner judgment, approval boundary, or downstream effect must be recorded.
- Use `review_gate_evidence_pack_v0` or `review_action_item_closure_loop_v0` for review readiness or action-item handling without approving the review.

## Boundary Rules

- Do not create final requirements, design values, interface decisions, test results, review approvals, stage clearance, or verification acceptance from this launcher.
- Do not treat folder scaffolds, readiness digests, source-gap rows, advisory model output, Drive placement, NotebookLM answers, or Obsidian views as source truth.
- Do not copy raw source text, private packets, project-local payloads, secrets, credentials, runtime absolute paths, or private run truth into public tracked files.
- Do not copy private candidate paths, private evidence payloads, source excerpts, or reference-example raw content into this launcher.
- Keep missing truth visible as owner question, source gap, blocker, or downstream workflow route.

## Load On Demand

Read [`references/mapping.md`](references/mapping.md) when you need the launcher mapping, route guide, allowed workflow set, profile resolve rule, output shape, or validation checklist.
