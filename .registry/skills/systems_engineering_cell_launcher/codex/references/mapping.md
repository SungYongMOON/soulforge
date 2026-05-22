# Systems Engineering Cell Launcher Mapping

## Soulforge Mapping

- Canon skill id: `systems_engineering_cell_launcher`
- Installed Codex skill name after sync: `soulforge-systems-engineering-cell-launcher`
- Target party id: `systems_engineering_cell`
- Target party canon: `.party/systems_engineering_cell/`
- Default party workflow: `se_assistant_operating_loop_v0`
- Source owner for party chain: `.party/systems_engineering_cell/party.yaml`
- Source owner for allowed workflow set: `.party/systems_engineering_cell/allowed_workflows.yaml`
- Source owner for workflow procedures and optimized execution profiles: `.workflow/<workflow_id>/`
- Source owner for local runtime bindings, project evidence, and private run truth: `_workmeta/<project_code>/`
- Source owner for reference lookup route hints: `.party/systems_engineering_cell/party.yaml`

## Intended User Shape

The most useful invocation is:

```text
/systems_engineering_cell 이 과제 지금 어디서 막혔는지 SE 관점으로 정리해줘.
```

Equivalent Codex skill invocation:

```text
Use $soulforge-systems-engineering-cell-launcher to find where this SE project is blocked and route the next workflow.
```

The expected answer should prefer:

- current SE request or stage interpretation
- visible blockers and missing bindings
- source gaps or owner questions
- AI-draftable items versus owner-held decisions
- recommended next workflow route
- claim ceiling and boundary notes

It should not pretend to complete design work.

## Workflow Set

Required workflow ids from the party:

- `se_assistant_operating_loop_v0`
- `se_stage_artifact_gap_scan_v0`
- `se_knowledge_wiki_pipeline_v0`
- `project_readiness_digest_v0`
- `owner_decision_packet_v0`
- `review_gate_evidence_pack_v0`
- `post_development_review_gate_v0`

Optional workflow ids:

- `source_gap_followup_packet_v0`
- `source_packet_sufficiency_review_v0`
- `page_module_trace_matrix_v0`
- `se_cross_stage_mapping_governance_v0`
- `technical_risk_open_question_burndown_v0`
- `configuration_baseline_and_change_control_v0`
- `verification_plan_from_page_contracts_v0`
- `test_harness_asset_planning_v0`
- `accepted_verification_result_packet_v0`
- `functional_configuration_audit_page_library_v0`
- `physical_configuration_audit_asset_package_v0`
- `review_action_item_closure_loop_v0`

Resolve these ids against `.workflow/index.yaml`, then read each selected workflow's `workflow.yaml` and `profile_policy.yaml` at execution time.

## Registered Private Route Candidate Awareness

The party may declare `reference_lookup_route_candidates`. The launcher should
read those hints and use them to decide whether a source-sensitive SE question
should first check official source packs and registered private lookup evidence.

Current public-safe route candidate:

- `se_authority_example_bridge_agentic_lookup_v0`

Current posture:

- status: `pilot_executed_private_candidate`
- role: route hint for official-source and reference-example lookup
- private pilot completed for primary artifact-family governance routes, including requirements traceability, Q-Gate forms, BOM/configuration, interface control, review/action disposition, sparse-lane disposition, current-source acquisition posture, and claim-specific review/verification evidence routing
- next useful refresh: current source packets or claim-specific evidence workflows for the exact artifact family being asked about

This is deliberately not a launcher-owned rule. Do not embed private evidence
paths, raw project content, source excerpts, or reference-example payloads in
the skill. The candidate does not make any reference example authoritative and
does not claim public canon, production readiness, official artifact authority,
review approval, or verification acceptance.

## Route Guide

- `project_start_scaffold`: use `se_assistant_operating_loop_v0`; call `se_foldertree_generate` only when scaffold generation is requested and runtime inputs are known.
- `single_stage_gap_scan`: use `se_stage_artifact_gap_scan_v0` when the target stage or stage scan binding is available.
- `source_gap_or_wiki_support`: first check party-declared reference lookup route candidates as route hints; then use `se_knowledge_wiki_pipeline_v0`, `source_gap_followup_packet_v0`, or `source_packet_sufficiency_review_v0`.
- `requirements_traceability_governance`: use `page_module_trace_matrix_v0` for missing evidence rows, review-only field-shape rows, and review/verification seed rows after source-intake state is known; do not use it as final RTM authority.
- `cross_stage_governance_aggregation`: use `se_cross_stage_mapping_governance_v0` to aggregate artifact-family coverage, source gaps, owner-decision needs, claim ceilings, and downstream rerun routes; do not use it as source truth, readiness approval, or artifact authority.
- `official_or_current_authority`: use source acquisition plus sufficiency review before answering that a form, source, revision, field set, or artifact is official/current.
- `accepted_review_or_verification_claim`: use review-gate evidence, action-closure, or accepted-result workflows before answering that a review passed, an action item closed, or verification was accepted.
- `review_readiness_preparation`: use `review_gate_evidence_pack_v0`, then `project_readiness_digest_v0` when an owner-readable summary is needed.
- `owner_decision_preparation`: use `owner_decision_packet_v0` when a scoped owner judgment or approval boundary is needed.
- `cross_stage_status_digest`: use `project_readiness_digest_v0` from bounded refs; do not infer whole-project readiness.
- `verification_or_audit_planning`: use the optional verification, harness, accepted result, FCA, PCA, or action-item workflows only when upstream evidence refs exist.
- `blocked_boundary_case`: report the missing binding, source scope, target stage, review scope, or owner authority as the next action.

## Profile Resolve Rule

Use workflow-owned `profile_policy.yaml` files as hints at execution time. Do not treat the launcher as the owner of model, reasoning effort, species, class, unit, tool, connector, or local runtime binding decisions.

Observed current primary profile labels at creation time were:

- `se_assistant_operating_loop_v0`: runtime binding, no calibration claim
- `se_stage_artifact_gap_scan_v0`: `gpt-5.5|medium|dwarf|administrator`
- `se_knowledge_wiki_pipeline_v0`: `gpt-5.5|medium|dwarf|pathfinder`
- `project_readiness_digest_v0`: `gpt-5.5|medium|dwarf|administrator`
- `owner_decision_packet_v0`: `gpt-5.5|low|dwarf|auditor`
- `review_gate_evidence_pack_v0`: `gpt-5.5|medium|darkelf|auditor`
- `post_development_review_gate_v0`: `gpt-5.5|xhigh|dwarf|auditor`
- `source_gap_followup_packet_v0`: `gpt-5.5|low|dwarf|auditor`
- `source_packet_sufficiency_review_v0`: `gpt-5.5|medium|dwarf|auditor`
- `page_module_trace_matrix_v0`: read workflow-owned `profile_policy.yaml`
- `se_cross_stage_mapping_governance_v0`: read workflow-owned `profile_policy.yaml`
- `technical_risk_open_question_burndown_v0`: `gpt-5.5|low|dwarf|auditor`
- `configuration_baseline_and_change_control_v0`: `gpt-5.5|low|dwarf|auditor`
- `verification_plan_from_page_contracts_v0`: `gpt-5.5|medium|human|auditor`
- `test_harness_asset_planning_v0`: `gpt-5.5|medium|human|auditor`
- `accepted_verification_result_packet_v0`: `gpt-5.5|low|dwarf|auditor`
- `functional_configuration_audit_page_library_v0`: `gpt-5.5|medium|dwarf|auditor`
- `physical_configuration_audit_asset_package_v0`: `gpt-5.5|medium|dwarf|auditor`
- `review_action_item_closure_loop_v0`: `gpt-5.5|low|dwarf|auditor`

These labels are informational snapshots only. Re-read the workflow-owned policies before each real run.

## Non-Claims

The launcher does not claim:

- The party is newly authorized, renamed, or default-routed.
- The SE assistant is a production-ready unattended SE agent.
- A folder scaffold means project truth or design readiness.
- A stage gap scan completes artifacts or approves a stage.
- A readiness digest approves review readiness or verification completion.
- Source gap, source intake, Drive placement, NotebookLM answers, Obsidian views, or advisory model output are source truth.
- Registered private route candidates are public canon, production-ready rules, official artifact authority, or permission to quote private evidence.
- Owner decisions, review approvals, stage clearance, configuration baselines, or verification acceptance are created by this launcher.
- Project-local payloads, private evidence, raw source files, credentials, or runtime absolute paths are safe to store in public tracked skill files.

## Output Shape

Report:

- `Target party: systems_engineering_cell`
- `Launcher skill: systems_engineering_cell_launcher`
- `Request interpretation: ...`
- `Likely block point: ...`
- `Recommended next workflow: ...`
- `Profile resolve rule: workflow-owned profile_policy.yaml at execution time`
- `Installed mirror: soulforge-systems-engineering-cell-launcher` when sync ran
- `Validators: ...`
- `Remaining blockers: ...`

## Validation Checklist

- `SKILL.md` frontmatter has only `name` and `description`.
- `agents/openai.yaml` keeps UI metadata only and the default prompt mentions `$soulforge-systems-engineering-cell-launcher`.
- Public tracked files contain no raw project payloads, source text, secrets, private evidence, host-local absolute paths, or NotebookLM answers.
- The launcher keeps party, workflow, profile policy, runtime binding, owner decision, design authority, review approval, and verification acceptance boundaries separate.
- `npm.cmd run skills:sync -- systems_engineering_cell_launcher` materializes the installed mirror before claiming it can be invoked by Codex.
