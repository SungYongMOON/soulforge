# guild_hall/rag

## Purpose

`rag/` owns the first metadata-only RAG MVP for Soulforge.

It builds a derived `rag_manifest_v0` from safe graph/canon metadata, validates
the manifest boundary, and can generate a small metadata-backed answer with
citations to graph nodes and source handles.

The default manifest/index path is still metadata-only. A separate
`source-text-index` lane can read owner-approved starter sources under
`_workspaces/knowledge` and writes its payload artifacts back under that private
workspace alias.

Default metadata manifests, source-slice cards, and metadata indexes are written
under the path-identity controlled `_workspaces/system/rag/**` view. PC-local
RAG experiments must pass an explicit `--output-ref` under
`_workspaces/_local/<node_id>/system/rag/**`; do not create another direct child
under `_workspaces` for the same purpose.

During `_workspaces/system` migration, default system writes are blocked until
the `system` binding is active and the local path is a link view. Run
`npm.cmd run guild-hall:workspace-system:inventory -- --json` first if the
local PC may still have a normal `_workspaces/system` folder.

Source-family promotion rules are defined in
`docs/architecture/guild_hall/RAG_SOURCE_FAMILY_PROMOTION_POLICY_V0.md`. Use
that policy to separate source canon from derived knowledge canon and to decide
how far each family can auto-promote without a per-item owner prompt.

Progress must be reported using the three-stage operating model in
`docs/architecture/guild_hall/RAG_THREE_STAGE_OPERATING_MODEL_V0.md`:
searchable RAG, work-ready RAG, and canon knowledge. Stage 1 indexing, Stage 2
work answers, and Stage 3 canon promotion are separate claims.

## Commands

```bash
npm run guild-hall:rag -- manifest --write --export-id knowledge_graph_view_v0
npm run guild-hall:rag -- validate --manifest-ref _workspaces/system/rag/manifests/rag_manifest_knowledge_graph_view_v0/rag_manifest.json
npm run guild-hall:rag -- source-slice-cards --write --manifest-ref _workspaces/system/rag/manifests/rag_manifest_knowledge_graph_view_v0/rag_manifest.json
npm run guild-hall:rag -- validate-source-slice-cards --source-slice-ref _workspaces/system/rag/source_slice_cards/source_slices_rag_manifest_knowledge_graph_view_v0/source_slice_cards.json
npm run guild-hall:rag -- source-slice-triage-register --write --source-slice-ref _workspaces/system/rag/source_slice_cards/source_slices_rag_manifest_knowledge_graph_view_v0/source_slice_cards.json
npm run guild-hall:rag -- validate-source-slice-triage-register --triage-register-ref _workmeta/system/reports/rag/source_slice_triage_register/source_slice_triage_source_slices_rag_manifest_knowledge_graph_view_v0/source_slice_triage_register.json
npm run guild-hall:rag -- source-slice-review-queue --write --triage-register-ref _workmeta/system/reports/rag/source_slice_triage_register/source_slice_triage_source_slices_rag_manifest_knowledge_graph_view_v0/source_slice_triage_register.json
npm run guild-hall:rag -- validate-source-slice-review-queue --review-queue-ref _workmeta/system/reports/rag/source_slice_review_queue/source_slice_review_source_slices_rag_manifest_knowledge_graph_view_v0/source_slice_review_queue.json
npm run guild-hall:rag -- source-slice-decision-packet --write --triage-register-ref _workmeta/system/reports/rag/source_slice_triage_register/source_slice_triage_source_slices_rag_manifest_knowledge_graph_view_v0/source_slice_triage_register.json --review-queue-ref _workmeta/system/reports/rag/source_slice_review_queue/source_slice_review_source_slices_rag_manifest_knowledge_graph_view_v0/source_slice_review_queue.json
npm run guild-hall:rag -- validate-source-slice-decision-packet --decision-packet-ref _workmeta/system/reports/rag/source_slice_decision_packets/source_slice_decision_source_slice_triage_source_slices_rag_manifest_knowledge_graph_view_v0/source_slice_decision_packet.json
npm run guild-hall:rag -- source-slice-owner-decision-record --write --decision-packet-ref _workmeta/system/reports/rag/source_slice_decision_packets/source_slice_decision_source_slice_triage_source_slices_rag_manifest_knowledge_graph_view_v0/source_slice_decision_packet.json
npm run guild-hall:rag -- validate-source-slice-owner-decision-record --owner-decision-record-ref _workmeta/system/reports/rag/source_slice_owner_decisions/source_slice_owner_decision_source_slice_decision_source_slice_triage_source_slices_rag_manifest_knowledge_graph_view_v0/source_slice_owner_decision_record.json
npm run guild-hall:rag -- source-text-metadata-profile --write --source-slice-ref _workspaces/system/rag/source_slice_cards/source_slices_rag_manifest_knowledge_graph_view_v0/source_slice_cards.json --extraction-log-ref _workmeta/<project_code>/runs/<run_id>/extraction_status.csv --profile-id source_text_metadata_profile_v0
npm run guild-hall:rag -- validate-source-text-metadata-profile --profile-ref _workmeta/system/reports/rag/source_text_metadata_profiles/source_text_metadata_profile_v0/source_text_metadata_profile.json
npm run guild-hall:rag -- source-text-extraction-packet --write --profile-ref _workmeta/system/reports/rag/source_text_metadata_profiles/source_text_metadata_profile_v0/source_text_metadata_profile.json --packet-id source_text_extraction_packet_v0
npm run guild-hall:rag -- validate-source-text-extraction-packet --packet-ref _workmeta/system/reports/rag/source_text_extraction_packets/source_text_extraction_packet_v0/source_text_extraction_packet.json
npm run guild-hall:rag -- source-text-extraction-run-report --write --packet-ref _workmeta/system/reports/rag/source_text_extraction_packets/source_text_extraction_packet_v0/source_text_extraction_packet.json
npm run guild-hall:rag -- validate-source-text-extraction-run-report --run-report-ref _workmeta/system/reports/rag/source_text_extraction_runs/source_text_extraction_packet_v0/source_text_extraction_run_report.json
npm run guild-hall:rag -- validate-knowledge-source-card --source-card-ref _workspaces/knowledge/source_cards/soulforge_common_knowledge_starter.source_card.json
npm run guild-hall:rag -- validate-source-sync-ready --ready-ref _workspaces/knowledge/common/<source_id>/source_sync_ready_manifest.json --source-card-ref _workspaces/knowledge/source_cards/<source_id>.source_card.json --source-text-ref _workspaces/knowledge/common/<source_id>/derived_text/<source_id>.md --stable-ms 2000
npm run guild-hall:rag -- source-text-index --write --source-card-ref _workspaces/knowledge/source_cards/soulforge_common_knowledge_starter.source_card.json --index-id soulforge_common_knowledge_starter_20260525
npm run guild-hall:rag -- source-text-index --write --source-card-ref _workspaces/knowledge/source_cards/<source_id>.source_card.json --ready-ref _workspaces/knowledge/common/<source_id>/source_sync_ready_manifest.json --stable-ms 2000 --index-id <source_id>_source_text_index
npm run guild-hall:rag -- source-text-index --write --source-card-ref _workspaces/knowledge/source_cards/<source_id>.source_card.json --ready-ref _workspaces/knowledge/common/<source_id>/source_sync_ready_manifest.json --docling-json-ref _workspaces/knowledge/common/<source_id>/derived_text/<docling_json_export>.json --index-id <source_id>_docling_json_index
npm run guild-hall:rag -- validate-source-text-index --source-text-index-ref _workspaces/knowledge/rag/indexes_local/source_text_indexes/soulforge_common_knowledge_starter_20260525/source_text_index.json
npm run guild-hall:rag -- source-text-traceability-sidecar --write --source-text-index-ref _workspaces/knowledge/rag/indexes_local/source_text_indexes/<source_id>_source_text_index/source_text_index.json --docling-json-ref _workspaces/knowledge/common/<source_id>/derived_text/<docling_json_export>.json --traceability-id <source_id>_traceability
npm run guild-hall:rag -- validate-source-text-traceability-sidecar --traceability-sidecar-ref _workspaces/knowledge/rag/traceability_sidecars/<source_id>_traceability/source_text_traceability_sidecar.json
npm run guild-hall:rag -- source-text-answer-run --write --source-text-index-ref _workspaces/knowledge/rag/indexes_local/source_text_indexes/soulforge_common_knowledge_starter_20260525/source_text_index.json --traceability-sidecar-ref _workspaces/knowledge/rag/traceability_sidecars/<source_id>_traceability/source_text_traceability_sidecar.json --question "NotebookLM authority" --run-id soulforge_common_knowledge_answer_20260525 --text
npm run guild-hall:rag -- validate-source-text-answer-run --run-ref _workspaces/knowledge/rag/answer_runs/soulforge_common_knowledge_answer_20260525/source_text_answer_run.json
npm run guild-hall:rag -- source-text-quality-review --write --source-text-index-ref _workspaces/knowledge/rag/indexes_local/source_text_indexes/<source_id>_docling_json_index/source_text_index.json --traceability-sidecar-ref _workspaces/knowledge/rag/traceability_sidecars/<source_id>_traceability/source_text_traceability_sidecar.json --answer-run-ref _workspaces/knowledge/rag/answer_runs/<answer_run_id>/source_text_answer_run.json --page 18-19 --page 39 --page 120-121 --review-id <source_id>_quality_review
npm run guild-hall:rag -- validate-source-text-quality-review --review-ref _workspaces/knowledge/rag/source_text_quality_reviews/<source_id>_quality_review/source_text_quality_review.json
npm run guild-hall:rag -- work-card --write --answer-run-ref _workspaces/knowledge/rag/answer_runs/<answer_run_id>/source_text_answer_run.json --quality-review-ref _workspaces/knowledge/rag/source_text_quality_reviews/<source_id>_quality_review/source_text_quality_review.json --query-label "<public-safe query label>" --work-card-id <source_id>_work_card --text
npm run guild-hall:rag -- work-card --write --source-text-index-ref _workspaces/knowledge/rag/indexes_local/source_text_indexes/<source_id>_docling_json_index/source_text_index.json --traceability-sidecar-ref _workspaces/knowledge/rag/traceability_sidecars/<source_id>_traceability/source_text_traceability_sidecar.json --question "<transient raw question>" --query-label "<public-safe query label>" --page 18-19 --page 39 --page 120-121 --work-card-id <source_id>_single_command_work_card --text
npm run guild-hall:rag -- validate-work-card --work-card-ref _workspaces/knowledge/rag/source_text_work_cards/<source_id>_work_card/source_text_work_card.json
npm run guild-hall:rag -- validate-operational-route-registry --route-registry-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/route_registry.yaml
npm run guild-hall:rag -- operational-route-catalog --route-registry-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/route_registry.yaml --text
npm run guild-hall:rag -- operational-route-resolve --route-registry-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/route_registry.yaml --query-label "<public-safe query label>" --text
npm run guild-hall:rag -- operational-route-answer-shell --route-registry-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/route_registry.yaml --query-label "<public-safe query label>"
npm run guild-hall:rag -- operational-route-smoke-run --route-registry-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/route_registry.yaml --smoke-tests-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/smoke_tests.yaml
npm run guild-hall:rag -- validate-operational-route-answer-cards --route-registry-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/route_registry.yaml
npm run guild-hall:rag -- operational-route-preflight --route-registry-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/route_registry.yaml --smoke-tests-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/smoke_tests.yaml --text
npm run guild-hall:rag -- operational-route-preflight --write --route-registry-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/route_registry.yaml --smoke-tests-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/smoke_tests.yaml --preflight-id <preflight_id>
npm run guild-hall:rag -- validate-operational-route-preflight --operational-route-preflight-ref _workmeta/system/reports/rag/operational_route_preflight/<preflight_id>/preflight.json
npm run guild-hall:rag -- operational-route-preflight-view --operational-route-preflight-ref _workmeta/system/reports/rag/operational_route_preflight/<preflight_id>/preflight.json
npm run guild-hall:rag -- operational-route-dashboard --route-registry-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/route_registry.yaml --smoke-tests-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/smoke_tests.yaml --text
npm run guild-hall:rag -- operational-route-call-plan --route-registry-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/route_registry.yaml --smoke-tests-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/smoke_tests.yaml --query-label "<ephemeral query label>" --text
npm run guild-hall:rag -- operational-route-call-plan --write --route-registry-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/route_registry.yaml --smoke-tests-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/smoke_tests.yaml --query-label "<ephemeral query label>" --plan-id <safe_call_plan_id>
npm run guild-hall:rag -- validate-operational-route-call-plan --operational-route-call-plan-ref _workmeta/system/reports/rag/operational_route_call_plans/<safe_call_plan_id>/call_plan.json
npm run guild-hall:rag -- operational-route-call-plan-view --operational-route-call-plan-ref _workmeta/system/reports/rag/operational_route_call_plans/<safe_call_plan_id>/call_plan.json
npm run guild-hall:rag -- operational-route-operator-run --route-registry-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/route_registry.yaml --smoke-tests-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/smoke_tests.yaml --operational-route-operator-health-ref _workmeta/system/reports/rag/operational_route_operator_health/<safe_health_id>/operator_health.json --query-label "<ephemeral query label>"
npm run guild-hall:rag -- operational-route-operator-run --route-registry-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/route_registry.yaml --smoke-tests-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/smoke_tests.yaml --operational-route-operator-health-ref _workmeta/system/reports/rag/operational_route_operator_health/<safe_health_id>/operator_health.json --query-label "<ephemeral query label>" --skip-answer-shell
npm run guild-hall:rag -- operational-route-operator-run --route-registry-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/route_registry.yaml --smoke-tests-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/smoke_tests.yaml --operational-route-operator-health-ref _workmeta/system/reports/rag/operational_route_operator_health/<safe_health_id>/operator_health.json --query-label "<ephemeral query label>" --record-usage --usage-id <usage_id>
npm run guild-hall:rag -- operational-route-closeout --route-registry-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/route_registry.yaml --query-label "<ephemeral query label>" --text
npm run guild-hall:rag -- operational-route-review-gate --route-registry-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/route_registry.yaml --text
npm run guild-hall:rag -- operational-route-command-sheet --route-registry-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/route_registry.yaml --smoke-tests-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/smoke_tests.yaml --text
npm run guild-hall:rag -- operational-route-suggestion-safety --route-registry-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/route_registry.yaml --smoke-tests-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/smoke_tests.yaml --text
npm run guild-hall:rag -- operational-route-suggestion-safety --write --route-registry-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/route_registry.yaml --smoke-tests-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/smoke_tests.yaml --suggestion-safety-id <safe_safety_id>
npm run guild-hall:rag -- validate-operational-route-suggestion-safety --operational-route-suggestion-safety-ref _workmeta/system/reports/rag/operational_route_suggestion_safety/<safe_safety_id>/suggestion_safety.json
npm run guild-hall:rag -- operational-route-suggestion-safety-view --operational-route-suggestion-safety-ref _workmeta/system/reports/rag/operational_route_suggestion_safety/<safe_safety_id>/suggestion_safety.json
npm run guild-hall:rag -- operational-route-ops-check --route-registry-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/route_registry.yaml --smoke-tests-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/smoke_tests.yaml --text
npm run guild-hall:rag -- operational-route-ops-check --write --route-registry-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/route_registry.yaml --smoke-tests-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/smoke_tests.yaml --ops-check-id <safe_ops_check_id>
npm run guild-hall:rag -- validate-operational-route-ops-check --operational-route-ops-check-ref _workmeta/system/reports/rag/operational_route_ops_check/<safe_ops_check_id>/ops_check.json
npm run guild-hall:rag -- operational-route-ops-check-view --operational-route-ops-check-ref _workmeta/system/reports/rag/operational_route_ops_check/<safe_ops_check_id>/ops_check.json
npm run guild-hall:rag -- operational-route-readiness --route-registry-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/route_registry.yaml --smoke-tests-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/smoke_tests.yaml --text
npm run guild-hall:rag -- operational-route-readiness --write --route-registry-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/route_registry.yaml --smoke-tests-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/smoke_tests.yaml --readiness-id <safe_readiness_id>
npm run guild-hall:rag -- validate-operational-route-readiness --operational-route-readiness-ref _workmeta/system/reports/rag/operational_route_readiness/<safe_readiness_id>/readiness.json
npm run guild-hall:rag -- operational-route-readiness-view --operational-route-readiness-ref _workmeta/system/reports/rag/operational_route_readiness/<safe_readiness_id>/readiness.json
npm run guild-hall:rag -- operational-route-evidence-sweep --write --evidence-sweep-id <safe_sweep_id> --operational-route-preflight-ref _workmeta/system/reports/rag/operational_route_preflight/<safe_preflight_id>/preflight.json --operational-route-ops-check-ref _workmeta/system/reports/rag/operational_route_ops_check/<safe_ops_check_id>/ops_check.json --operational-route-session-sweep-ref _workmeta/system/reports/rag/operational_route_sweeps/<safe_sweep_id>/route_sweep.json --operational-route-readiness-ref _workmeta/system/reports/rag/operational_route_readiness/<safe_readiness_id>/readiness.json --operational-route-status-ref _workmeta/system/reports/rag/operational_route_status/<safe_status_id>/status.json --usage-summary-ref _workmeta/system/reports/rag/operational_route_usage_summary/<safe_summary_id>/usage_summary.json --usage-record-ref _workmeta/system/reports/rag/operational_route_usage/<safe_usage_id>/usage_record.json
npm run guild-hall:rag -- validate-operational-route-evidence-sweep --operational-route-evidence-sweep-ref _workmeta/system/reports/rag/operational_route_evidence_sweeps/<safe_sweep_id>/evidence_sweep.json
npm run guild-hall:rag -- operational-route-evidence-sweep-view --operational-route-evidence-sweep-ref _workmeta/system/reports/rag/operational_route_evidence_sweeps/<safe_sweep_id>/evidence_sweep.json
npm run guild-hall:rag -- operational-route-latest-evidence --route-registry-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/route_registry.yaml --text
npm run guild-hall:rag -- operational-route-latest-evidence --write --route-registry-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/route_registry.yaml --latest-evidence-id <safe_latest_evidence_id>
npm run guild-hall:rag -- validate-operational-route-latest-evidence --operational-route-latest-evidence-ref _workmeta/system/reports/rag/operational_route_latest_evidence/<safe_latest_evidence_id>/latest_evidence.json
npm run guild-hall:rag -- operational-route-latest-evidence-view --operational-route-latest-evidence-ref _workmeta/system/reports/rag/operational_route_latest_evidence/<safe_latest_evidence_id>/latest_evidence.json
npm run guild-hall:rag -- operational-route-operator-brief --route-registry-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/route_registry.yaml --operational-route-latest-evidence-ref _workmeta/system/reports/rag/operational_route_latest_evidence/<safe_latest_evidence_id>/latest_evidence.json --text
npm run guild-hall:rag -- operational-route-operator-brief --write --route-registry-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/route_registry.yaml --operational-route-latest-evidence-ref _workmeta/system/reports/rag/operational_route_latest_evidence/<safe_latest_evidence_id>/latest_evidence.json --operator-brief-id <safe_brief_id>
npm run guild-hall:rag -- validate-operational-route-operator-brief --operational-route-operator-brief-ref _workmeta/system/reports/rag/operational_route_operator_briefs/<safe_brief_id>/operator_brief.json
npm run guild-hall:rag -- operational-route-operator-brief-view --operational-route-operator-brief-ref _workmeta/system/reports/rag/operational_route_operator_briefs/<safe_brief_id>/operator_brief.json
npm run guild-hall:rag -- operational-route-doc-drift-check --route-registry-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/route_registry.yaml --operational-route-latest-evidence-ref _workmeta/system/reports/rag/operational_route_latest_evidence/<safe_latest_evidence_id>/latest_evidence.json --operational-route-operator-brief-ref _workmeta/system/reports/rag/operational_route_operator_briefs/<safe_brief_id>/operator_brief.json --text
npm run guild-hall:rag -- operational-route-doc-drift-check --write --route-registry-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/route_registry.yaml --operational-route-latest-evidence-ref _workmeta/system/reports/rag/operational_route_latest_evidence/<safe_latest_evidence_id>/latest_evidence.json --operational-route-operator-brief-ref _workmeta/system/reports/rag/operational_route_operator_briefs/<safe_brief_id>/operator_brief.json --drift-check-id <safe_drift_check_id>
npm run guild-hall:rag -- validate-operational-route-doc-drift-check --operational-route-doc-drift-ref _workmeta/system/reports/rag/operational_route_doc_drift/<safe_drift_check_id>/doc_drift.json
npm run guild-hall:rag -- operational-route-doc-drift-check-view --operational-route-doc-drift-ref _workmeta/system/reports/rag/operational_route_doc_drift/<safe_drift_check_id>/doc_drift.json
npm run guild-hall:rag -- operational-route-operator-health --route-registry-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/route_registry.yaml --operational-route-latest-evidence-ref _workmeta/system/reports/rag/operational_route_latest_evidence/<safe_latest_evidence_id>/latest_evidence.json --operational-route-operator-brief-ref _workmeta/system/reports/rag/operational_route_operator_briefs/<safe_brief_id>/operator_brief.json --operational-route-doc-drift-ref _workmeta/system/reports/rag/operational_route_doc_drift/<safe_drift_check_id>/doc_drift.json --text
npm run guild-hall:rag -- operational-route-operator-health --write --route-registry-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/route_registry.yaml --operational-route-latest-evidence-ref _workmeta/system/reports/rag/operational_route_latest_evidence/<safe_latest_evidence_id>/latest_evidence.json --operational-route-operator-brief-ref _workmeta/system/reports/rag/operational_route_operator_briefs/<safe_brief_id>/operator_brief.json --operational-route-doc-drift-ref _workmeta/system/reports/rag/operational_route_doc_drift/<safe_drift_check_id>/doc_drift.json --operator-health-id <safe_health_id>
npm run guild-hall:rag -- validate-operational-route-operator-health --operational-route-operator-health-ref _workmeta/system/reports/rag/operational_route_operator_health/<safe_health_id>/operator_health.json
npm run guild-hall:rag -- operational-route-operator-health-view --operational-route-operator-health-ref _workmeta/system/reports/rag/operational_route_operator_health/<safe_health_id>/operator_health.json
npm run guild-hall:rag -- operational-route-session --route-registry-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/route_registry.yaml --smoke-tests-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/smoke_tests.yaml --query-label "<ephemeral query label>" --text
npm run guild-hall:rag -- operational-route-session --write --route-registry-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/route_registry.yaml --smoke-tests-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/smoke_tests.yaml --query-label "<ephemeral query label>" --session-id <session_id>
npm run guild-hall:rag -- validate-operational-route-session --operational-route-session-ref _workmeta/system/reports/rag/operational_route_runs/<route_run_id>/route_run.json
npm run guild-hall:rag -- operational-route-session-sweep --route-registry-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/route_registry.yaml --smoke-tests-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/smoke_tests.yaml --text
npm run guild-hall:rag -- operational-route-session-sweep --write --route-registry-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/route_registry.yaml --smoke-tests-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/smoke_tests.yaml --sweep-id <safe_sweep_id>
npm run guild-hall:rag -- validate-operational-route-session-sweep --operational-route-session-sweep-ref _workmeta/system/reports/rag/operational_route_sweeps/<safe_sweep_id>/route_sweep.json
npm run guild-hall:rag -- operational-route-session-sweep-view --operational-route-session-sweep-ref _workmeta/system/reports/rag/operational_route_sweeps/<safe_sweep_id>/route_sweep.json
npm run guild-hall:rag -- operational-route-run-view --operational-route-run-ref _workmeta/system/reports/rag/operational_route_runs/<route_run_id>/route_run.json
npm run guild-hall:rag -- operational-route-usage-record --route-registry-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/route_registry.yaml --query-label "<ephemeral query label>" --text
npm run guild-hall:rag -- operational-route-usage-record --write --route-registry-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/route_registry.yaml --query-label "<ephemeral query label>" --usage-id <usage_id>
npm run guild-hall:rag -- validate-operational-route-usage-record --usage-record-ref _workmeta/system/reports/rag/operational_route_usage/<usage_id>/usage_record.json
npm run guild-hall:rag -- operational-route-usage-record-view --usage-record-ref _workmeta/system/reports/rag/operational_route_usage/<usage_id>/usage_record.json
npm run guild-hall:rag -- operational-route-usage-summary --route-registry-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/route_registry.yaml --text
npm run guild-hall:rag -- operational-route-usage-summary --write --route-registry-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/route_registry.yaml --summary-id <summary_id>
npm run guild-hall:rag -- validate-operational-route-usage-summary --usage-summary-ref _workmeta/system/reports/rag/operational_route_usage_summary/<summary_id>/usage_summary.json
npm run guild-hall:rag -- operational-route-usage-summary-view --usage-summary-ref _workmeta/system/reports/rag/operational_route_usage_summary/<summary_id>/usage_summary.json
npm run guild-hall:rag -- operational-route-candidate-record --route-registry-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/route_registry.yaml --query-label "<ephemeral unmatched query label>" --text
npm run guild-hall:rag -- operational-route-candidate-record --write --route-registry-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/route_registry.yaml --query-label "<ephemeral unmatched query label>" --candidate-id <candidate_id>
npm run guild-hall:rag -- validate-operational-route-candidate-record --candidate-record-ref _workmeta/system/reports/rag/operational_route_candidates/<candidate_id>/candidate_record.json
npm run guild-hall:rag -- operational-route-candidate-record-view --candidate-record-ref _workmeta/system/reports/rag/operational_route_candidates/<candidate_id>/candidate_record.json
npm run guild-hall:rag -- operational-route-status --write --route-registry-ref _workspaces/knowledge/rag/operational_routes/<route_set_id>/route_registry.yaml --status-id <status_id>
npm run guild-hall:rag -- validate-operational-route-status --operational-route-status-ref _workmeta/system/reports/rag/operational_route_status/<status_id>/status.json
npm run guild-hall:rag -- operational-route-status-view --operational-route-status-ref _workmeta/system/reports/rag/operational_route_status/<status_id>/status.json
npm run guild-hall:rag -- answer-engine-run --write --metadata-index-ref _workspaces/system/rag/metadata_retrieval_indexes/metadata_index_rag_manifest_knowledge_graph_view_v0/metadata_index.json --extraction-packet-ref _workmeta/system/reports/rag/source_text_extraction_packets/source_text_extraction_packet_v0/source_text_extraction_packet.json --extraction-run-report-ref _workmeta/system/reports/rag/source_text_extraction_runs/source_text_extraction_packet_v0/source_text_extraction_run_report.json --question "knowledge wiki"
npm run guild-hall:rag -- validate-answer-engine-run --run-ref _workmeta/system/reports/rag/answer_engine_runs/answer_engine_run_<id>/answer_engine_run.json
npm run guild-hall:rag -- metadata-index --write --manifest-ref _workspaces/system/rag/manifests/rag_manifest_knowledge_graph_view_v0/rag_manifest.json --decision-packet-ref _workmeta/system/reports/rag/source_slice_decision_packets/source_slice_decision_source_slice_triage_source_slices_rag_manifest_knowledge_graph_view_v0/source_slice_decision_packet.json --owner-decision-record-ref _workmeta/system/reports/rag/source_slice_owner_decisions/source_slice_owner_decision_source_slice_decision_source_slice_triage_source_slices_rag_manifest_knowledge_graph_view_v0/source_slice_owner_decision_record.json
npm run guild-hall:rag -- validate-metadata-index --metadata-index-ref _workspaces/system/rag/metadata_retrieval_indexes/metadata_index_rag_manifest_knowledge_graph_view_v0/metadata_index.json
npm run guild-hall:rag -- retrieval-trace --write --metadata-index-ref _workspaces/system/rag/metadata_retrieval_indexes/metadata_index_rag_manifest_knowledge_graph_view_v0/metadata_index.json --question "GraphRAG source support"
npm run guild-hall:rag -- retrieval-evaluation --write --metadata-index-ref _workspaces/system/rag/metadata_retrieval_indexes/metadata_index_rag_manifest_knowledge_graph_view_v0/metadata_index.json
npm run guild-hall:knowledge-graph -- export --rag-manifest-ref _workspaces/system/rag/manifests/rag_manifest_knowledge_graph_view_v0/rag_manifest.json --source-slice-triage-register-ref _workmeta/system/reports/rag/source_slice_triage_register/source_slice_triage_source_slices_rag_manifest_knowledge_graph_view_v0/source_slice_triage_register.json --source-slice-review-queue-ref _workmeta/system/reports/rag/source_slice_review_queue/source_slice_review_source_slices_rag_manifest_knowledge_graph_view_v0/source_slice_review_queue.json --export-id knowledge_graph_rag_triage_lens_v0
npm run guild-hall:rag -- answer --metadata-index-ref _workspaces/system/rag/metadata_retrieval_indexes/metadata_index_rag_manifest_knowledge_graph_view_v0/metadata_index.json --question "GraphRAG source support" --text
npm run validate:rag
```

## Raw Question Policy

- Raw questions are ephemeral command input only.
- Written JSON artifacts, `_workmeta` review artifacts, retrieval traces,
  evaluations, answer-engine runs, and source-text answer proof records must use
  labels, query fingerprints, and token fingerprints instead of storing raw
  questions.
- Public tracked files and `_workmeta/**` must not store NotebookLM answers, raw
  source text, chunks, excerpts, private payloads, account IDs, conversation
  IDs, secrets, or raw company material.
- Terminal-only `--text` output is operator feedback, not a persisted knowledge
  artifact or source authority.

## Company Intake Packet Validation

The public-safe template lives under
`docs/architecture/workspace/examples/company_knowledge_intake/`.

All machine-readable path refs in company intake packets must be relative to the
Soulforge project root, for example `_workspaces/knowledge/...`. Do not record
machine-local mount paths, home-directory paths, or `file://` URLs; different
computers may place the shared project at different absolute locations.

Validate a packet with:

```bash
npm run guild-hall:rag -- validate-company-knowledge-intake-packet --packet-ref docs/architecture/workspace/examples/company_knowledge_intake/company_knowledge_intake_packet.template.json
```

The validator accepts JSON packets only. It checks that the packet is
metadata-only, uses labels/fingerprints instead of raw questions or source
payloads, and keeps stronger permissions false until owner review.

## Source Extraction Tooling Standard

The source-text lane is parser-first, not LLM-first. The current
`source-text-index` command consumes approved derived `.txt` or `.md` files
under `_workspaces/knowledge/**`; it is not the raw PDF/Word/PPT/Excel/HWP
reader.

For company-PC intake, use this order before making or indexing a source card:

1. keep originals in `_workspaces/knowledge/**` or an owner-approved worksite;
2. extract locally to rebuildable Markdown/text plus structured metadata;
3. record only hashes, tool/version ids, counts, warnings, blocker codes, and
   Soulforge-root-relative output refs in `_workmeta/**`;
4. write a `source_sync_ready_manifest_v0` after the files are fully exported
   and visible to OneDrive, listing the source card and derived text with size
   and SHA-256;
5. validate the ready manifest from the indexing PC, optionally with
   `--stable-ms 2000`;
6. point the source card at the approved derived `.md` or `.txt`;
7. run `source-text-index` only after the card grants retrieval and index-build
   permission;
8. when a structured Docling JSON export is available, prefer
   `source-text-index --docling-json-ref ...` so chunks are built in Docling
   element/page order with native page spans, then run
   `source-text-traceability-sidecar` as a no-source-text audit sidecar.

Default tool order:

- Docling first for local PDF/Office/image conversion to RAG-friendly Markdown
  and JSON-style structure.
- Apache Tika for broad text and metadata fallback.
- PyMuPDF or `pypdf` for PDF-specific page/text checks.
- LibreOffice headless for Office conversion fallback.
- Tesseract OCR with Korean/English language data for scanned or image-only
  sources.
- HWP must be normalized to HWPX first, then parsed from HWPX or approved
  derived text.

Required local runtime before real source extraction:

- Create the extraction venv at `guild_hall/state/tools/source_extraction_venv`
  with Python 3.12.
- Install Docling, `pypdf`, PyMuPDF, `pytesseract`, Tika, `python-docx`,
  `python-pptx`, `openpyxl`, `lxml`, BeautifulSoup, and `olefile` into that
  venv.
- Install Java, LibreOffice, and Tesseract on the PC, or provide equivalent
  executables through local-only runtime binding.
- Ensure Tesseract can see `eng`, `kor`, `kor_vert`, and `osd` language data
  before processing Korean scanned documents.
- Ensure `.hwp` sources can be exported to HWPX through an owner-approved
  licensed tool before any body extraction route reads them.
- Record actual executable paths, versions, OCR data hashes, smoke checks, and
  blockers under
  `_workmeta/system/reports/procedure_capture/source_extraction_runtime/`.

Windows PowerShell bootstrap for an owner/tool PC:

```powershell
uv python install 3.12
uv venv "guild_hall/state/tools/source_extraction_venv" --python 3.12
uv pip install --python "guild_hall/state/tools/source_extraction_venv/Scripts/python.exe" docling pypdf pymupdf pytesseract tika python-docx python-pptx openpyxl lxml beautifulsoup4 olefile
winget install --source winget --accept-source-agreements --accept-package-agreements --disable-interactivity --silent --exact --id EclipseAdoptium.Temurin.21.JRE
winget install --source winget --accept-source-agreements --accept-package-agreements --disable-interactivity --silent --exact --id TheDocumentFoundation.LibreOffice
winget install --source winget --accept-source-agreements --accept-package-agreements --disable-interactivity --silent --exact --id tesseract-ocr.tesseract
npm.cmd run guild-hall:rag -- source-text-runtime-preflight
npm.cmd run validate:rag
```

`source-text-runtime-preflight` is the preferred portable check before a real
source extraction run. It resolves tools from the repo-local venv, current
process `PATH`, Windows user environment `PATH`, and tool home/file environment
variables, then reports only redacted resolution metadata. It must not persist
machine-local executable paths into public outputs. If a just-installed tool is
not visible to the current shell, rerun the preflight first; it can consume the
Windows user environment even when the running Codex shell has stale `PATH`.

Keep the runtime itself under `guild_hall/state/tools/**` or the OS package
manager. Keep source payloads and derived private text under
`_workspaces/knowledge/**`. Keep only metadata, hashes, versions, refs, and
review packets under `_workmeta/**`.

LLM, NotebookLM, LlamaParse, cloud OCR/parser output, and Unstructured-style
partitioning may be advisory or adapter routes only when owner-approved. They
do not replace source cards, parser evidence, hashes, relative paths, or
metadata-only `_workmeta` records.

For cross-PC OneDrive intake, the ready manifest is the gate between "the other
PC says export is done" and "this PC can safely index it." The validator reads
the local files, checks byte size and SHA-256, and can wait briefly to confirm
size, mtime, and hash stay unchanged. If the ready manifest fails,
`source-text-index --ready-ref ...` returns `blocked_sync_not_ready` and does
not read the source text.

## Boundary

- Reads metadata-only graph data or builds an in-memory graph from public canon.
- Does not load source text, private payloads, NotebookLM answers, vector stores,
  BM25 indexes, secrets, credentials, or runtime absolute paths.
- `answer` output is a navigation and source-ref answer, not source truth,
  owner approval, ontology acceptance, or canon promotion.
- Knowledge graph exports may consume an explicit manifest ref as a sanitized
  3D RAG lens overlay, but that overlay remains metadata-only and does not make
  the graph an answer engine.
- Knowledge graph exports may also consume explicit source-slice triage/register
  refs as redacted registration-state overlays. They show counts and states only,
  not source-handle arrays, source locator payloads, applied decisions, or
  stronger permissions.
- `source-slice-cards` creates metadata-only readiness cards for later
  owner-approved source preprocessing and indexing. These cards are not chunks,
  indexes, source truth, or answer evidence.
- `source-slice-triage-register` applies the existing wiki/source intake
  criteria to the cards. Public-safe metadata cards that pass are registered as
  `rag_metadata_knowledge_only`; only failed or private cards need owner review.
  The register treats owner-defined criteria as standing policy, but stronger
  permissions default to false.
- `source-slice-review-queue` creates metadata-only owner-review queue items
  from triage hold/blocked items. Queue items remain pending and cannot grant
  approval, load source text, or allow index building.
- `source-slice-decision-packet` creates the metadata-only owner-decision
  preparation packet before stronger RAG permissions. It can list registered
  metadata items that still default to `keep_metadata_only`, plus hold/blocked
  items from the review queue, but it cannot apply owner decisions or grant
  source-text retrieval, index build, NotebookLM packet membership, or public
  canon promotion.
- `source-slice-owner-decision-record` records the safe default
  `keep_metadata_only` state. It is not approval and grants no stronger
  permission.
- `source-text-metadata-profile` prepares a configurable metadata-field profile
  for a future body/source-text extractor. It can reuse source-slice metadata,
  scan public-safe repo contracts for field names, and import extraction-status
  CSV column/count metadata. It does not execute extraction, read source text,
  copy private extracted text, create chunks, or build indexes.
- `source-text-extraction-packet` turns a validated profile into a dry-run
  preflight execution packet. The packet lists target slices, metadata fields,
  extraction-log import tasks, adapter routes, and planned metadata outputs, but
  it still does not execute an extractor, read source text, write private
  payloads, build indexes, upload to NotebookLM, or grant owner approval.
- `source-text-extraction-run-report` consumes only a validated packet and
  writes a report-only dry run. It does not open source locators, import
  extractor libraries, read source files, write private payloads, build indexes,
  or treat the report as citation evidence.
- `validate-source-sync-ready` checks a metadata-only ready manifest before
  cross-PC source-text indexing. It validates Soulforge-root-relative refs,
  source card/source text ref matches, local file existence, byte size, SHA-256,
  and optional stability delay. It is not owner approval or source truth.
- `source-text-index` is the first owner-approved source-text lane. It reads
  only owner-approved source cards and derived source text under
  `_workspaces/knowledge/**`, supports text/markdown starter sources after
  parser-first extraction, can require a source sync ready manifest through
  `--ready-ref` or source-card `source_sync_ready_ref`, writes derived text and
  chunk indexes under `_workspaces/knowledge/rag/**` only when explicitly
  allowed by the command/source card, and is not public-repo safe. If
  `--docling-json-ref` is supplied, it builds chunks from the Docling JSON
  element/page order and stores native page spans on the private chunks; the
  default Markdown/text path is unchanged.
- `source-text-traceability-sidecar` reads a private source-text index plus a
  private Docling JSON export and writes a no-source-text sidecar under
  `_workspaces/knowledge/rag/traceability_sidecars/**`. It maps chunk ids to
  page spans, layout labels, and warning codes. The sidecar is a citation audit
  aid, not extraction approval, owner approval, or public canon promotion.
- Official public source cards may allow public summary, ontology seed,
  NotebookLM packet membership, and registry entry creation when the source
  card records official source authority. This permission applies to public-safe
  derived metadata, not to public copies of full source text or chunk payloads.
  The source-family promotion policy decides whether the target is only source
  canon, current-scope work-card use, private wiki candidate, or public canon
  candidate.
- `source-text-answer-run` answers from the private workspace source-text index.
  Written runs persist query fingerprints rather than raw questions, cite
  chunk ids and `_workspaces/knowledge` source refs, may include page spans from
  native Docling-index chunks or an optional traceability sidecar, and remain
  below public canon, NotebookLM authority, and owner approval.
- `source-text-quality-review` consumes a private source-text index,
  traceability sidecar, optional answer run, and explicit page list to produce a
  no-source-text page/citation quality review under
  `_workspaces/knowledge/rag/source_text_quality_reviews/**`. It can mark
  `source_supported`, `manual_review`, or `blocked`, but it does not grant
  owner approval, source truth beyond the cited scope, or public canon
  promotion.
- `work-card` consumes a source-text answer run plus a quality review and writes
  a source-text work card under
  `_workspaces/knowledge/rag/source_text_work_cards/**`. It stores a query
  label and fingerprints rather than the raw question, carries citation status
  and claim ceiling, and keeps source text/chunk text out of the card payload.
  When called with `--question`, it can write the intermediate source-text
  answer run and quality review first, but `--query-label` is required so the
  persisted card still avoids raw-question storage.
- `validate-operational-route-registry`, `operational-route-resolve`, and
  `operational-route-smoke-run` make a private/manual-review route registry
  callable without loading source text. They read only metadata route YAML,
  selected work-card JSON, operator answer card refs, wiki refs, and smoke-test
  expectations under approved Soulforge-relative surfaces. The resolver returns
  the selected work card, operator card, wiki page, evidence pages, claim
  ceiling, and manual-review boundary; it is not final-answer authority, source
  truth, public canon, ontology acceptance, graph truth mutation, or a default
  route switch.
- `operational-route-answer-shell` resolves the route and prints the selected
  private operator answer card for terminal use. It does not write the answer
  body to public files or `_workmeta/**`, and it still does not read source
  text or chunks.
- `validate-operational-route-answer-cards` checks every selected private
  operator answer card for route id, work-card id, evidence pages,
  manual-review notice, and stronger-authority denial markers. The validation
  result reports pass/blocker metadata only and never returns card bodies.
- `operational-route-preflight` combines registry validation, optional smoke
  tests, answer-card hygiene validation, and current operational status into
  one metadata-only readiness artifact under `_workmeta/**`. Passing preflight
  means private/manual-review operator use is allowed; it is still not source
  truth, final-answer authority, public canon, ontology acceptance, graph truth,
  or default-route mutation. With `--text` or
  `operational-route-preflight-view`, it renders the same evidence as a
  terminal digest without reading answer bodies, source text, chunks, or raw
  queries.
- `operational-route-session` combines preflight and route resolution for a
  single transient query label, then writes a session artifact with only the
  query fingerprint, selected refs, evidence pages, claim ceiling, and next
  operator steps. It does not persist the raw query, answer shell output,
  answer-card body, source text, or chunks. With `--text`, it prints an
  operator-readable metadata digest without showing the raw query or answer
  body.
- `operational-route-session-sweep` runs the smoke-test route labels through
  route-session logic and reports whether the full route set opens to the
  expected work cards and evidence pages. It does not persist raw query labels,
  execute answer shells, write usage/candidate records, or launch sourcebound
  review. With `--write`, it stores only route-set readiness metadata under
  `_workmeta/**/reports/rag/operational_route_sweeps/**`.
  `operational-route-session-sweep-view` reopens a stored sweep as the same
  terminal digest.
- `operational-route-catalog` renders the current route registry as a
  metadata-only operator catalog before any question is asked. It lists route
  ids, work-card refs, answer-card refs, wiki refs, evidence pages, review
  gaps, and claim ceilings without storing query fingerprints, source text,
  chunks, or answer-card bodies.
- `operational-route-dashboard` combines the route catalog, preflight, current
  usage counts, unmatched candidate counts, answer-card status, and smoke-test
  state into one terminal-readable operator dashboard. It does not create usage
  records or candidates and does not grant source truth, final-answer
  authority, public canon, ontology, graph truth, or default-route authority.
- `operational-route-call-plan` combines the dashboard and one transient
  route-session into a single operator call plan for a specific query label. It
  prints the matched route, evidence pages, claim ceiling, and next commands
  without persisting the raw query, answer body, answer shell output, source
  text, chunks, usage records, or candidate records. With `--write`, it stores
  the fingerprint-only call plan under `_workmeta` so an operator can reopen
  the same routing decision with `operational-route-call-plan-view`; the stored
  plan still excludes raw query text, answer bodies, source text, chunks, and
  stronger authority.
- `operational-route-operator-run` combines the call plan with the selected
  terminal-only operator answer shell. When
  `--operational-route-operator-health-ref` is supplied, the run first validates
  that stored health artifact and skips answer-shell output and usage recording
  unless health status is `pass_private_manual_review_operator_health` for the
  same route registry. It is the shortest private/manual-review path for an
  operator answer, but still does not persist the raw query, answer shell
  output, answer-card body, source text, chunks, usage records, candidate
  records, or stronger authority by default. With `--skip-answer-shell`, it
  verifies the health-gated call plan without printing the private answer card
  body or writing usage. With explicit `--record-usage --usage-id <id>`, it
  writes a metadata-only usage record after the terminal answer shell while
  still avoiding raw query, answer body, source text, chunk, candidate, and
  stronger-authority persistence. The explicit usage path also requires a
  passing operator health ref, validates the written record, and prints the
  post-write route usage count against the repeated-use review threshold. If a
  custom usage output ref is used, the post-write count is computed from that
  record's usage root.
- `operational-route-closeout` summarizes the post-answer operational state for
  a registry or one transient question: matched route, route usage count,
  repeated-use threshold, unmatched candidate count, and next gate. It writes
  nothing and does not include answer-card bodies, answer shell output, source
  text, chunks, raw queries, source truth, final answers, public canon,
  ontology, graph truth, or default-route authority.
- `operational-route-review-gate` summarizes whether repeated-use and unmatched
  candidate evidence is ready for a later sourcebound review queue. It does not
  launch sourcebound review, mutate routes, load source text/chunks, or grant
  source truth, final-answer, public canon, ontology, graph truth, default-route,
  or external-upload authority.
- `operational-route-command-sheet` prints the safe operator command sequence
  for dashboard, call-plan, operator-run, explicit usage recording, closeout,
  review-gate, and stored evidence views. It is metadata-only guidance: it does
  not execute commands, persist raw queries or answer bodies, write
  usage/candidate records, or grant stronger authority.
- `operational-route-suggestion-safety` inspects generated command suggestions
  from the command sheet plus optional smoke-test call-plan/session samples. It
  blocks direct `operational-route-usage-record --write` suggestions, direct
  `operational-route-answer-shell` suggestions, unsafe candidate/call-plan write
  suggestions, `--record-usage` outside operator-run, and `--record-usage`
  suggestions that lack an operator-health ref. Call-plan writes are only
  counted as safe when they carry the `real_operator_question_only` condition,
  and unmatched route suggestions default to candidate preview rather than
  candidate write. With `--write`, it stores only counts, surface ids, route ids,
  blockers, and boundary flags under
  `_workmeta/**/reports/rag/operational_route_suggestion_safety/**`; it does
  not execute commands, write usage/candidate/call-plan records, persist raw
  queries or answer bodies, load source text/chunks, or grant stronger
  authority.
- `operational-route-ops-check` is the one-command pre-use check. It combines
  preflight, dashboard, command-sheet, suggestion-safety, and review-gate
  validation into a metadata-only readiness verdict for private/manual-review
  operation. It does not execute command-sheet commands, write usage/candidate
  records, launch
  sourcebound review, load source text/chunks, or grant stronger authority. With
  `--write`, it stores the same metadata-only readiness evidence under
  `_workmeta/**/reports/rag/operational_route_ops_check/**`.
  `operational-route-ops-check-view` reopens a stored ops-check as the same
  terminal digest without rerunning command surfaces.
- `operational-route-readiness` combines ops-check and route-set session sweep
  into a single go/no-go operator surface. It proves both the pre-use gates and
  full smoke-test route coverage are ready for private/manual-review operation,
  while still avoiding raw query persistence, answer-shell execution,
  usage/candidate writes, sourcebound launch, source truth, final-answer
  authority, public canon, ontology, graph truth, default-route mutation, and
  external upload. With `--write`, it stores only readiness metadata under
  `_workmeta/**/reports/rag/operational_route_readiness/**`.
- `operational-route-readiness-view` opens a stored readiness artifact and
  renders the same operator-readable go/no-go digest without regenerating the
  route checks or reading raw queries, answer-card bodies, source text, or
  chunks.
- `operational-route-evidence-sweep` validates and summarizes a supplied set of
  stored operational evidence refs, such as preflight, ops-check, route sweep,
  readiness, status, usage summary, and usage records. It is the one-command
  closure check for stored evidence and writes only metadata under
  `_workmeta/**/reports/rag/operational_route_evidence_sweeps/**` when
  `--write` is explicit. It does not read source text/chunks, raw queries,
  answer bodies, launch sourcebound review, write usage/candidate records, or
  grant stronger authority. `operational-route-evidence-sweep-view` reopens a
  stored sweep as the same terminal digest.
- `operational-route-latest-evidence` scans stored `_workmeta` evidence for one
  route registry and prints the latest preflight, ops-check, route sweep,
  suggestion-safety, readiness, status, usage summary, and evidence sweep refs.
  It is the low-friction operator index when the latest refs are not known.
  With `--write`, it stores only the latest-ref metadata under
  `_workmeta/**/reports/rag/operational_route_latest_evidence/**`.
  `operational-route-latest-evidence-view` reopens that stored index. It does
  not read source text/chunks, raw queries, answer bodies, launch sourcebound
  review, write usage/candidate records, or grant stronger authority.
- `operational-route-operator-brief` turns the route registry plus latest
  evidence index into a one-page operator brief: route list, evidence refs, and
  exact safe commands for answer, usage recording, closeout, review gate, and
  candidate preview. With `--write`, it stores only metadata under
  `_workmeta/**/reports/rag/operational_route_operator_briefs/**`.
  `operational-route-operator-brief-view` reopens that stored brief. It does
  not execute commands, read source text/chunks, persist raw queries or answer
  bodies, write usage/candidate records, launch sourcebound review, or grant
  stronger authority.
- `operational-route-doc-drift-check` checks local operator docs against the
  latest stored evidence and operator brief refs. It reports missing latest
  refs, stale old refs, and command-count drift without reading source text,
  chunks, answer-card bodies, or raw queries. The optional `--write` stores
  only hashes, refs, counts, and drift findings under `_workmeta`.
- `operational-route-operator-health` combines latest evidence validation,
  operator brief validation, and operator doc-drift validation into one
  metadata-only go/no-go surface for private/manual-review operation. The
  optional `--write` stores only refs, statuses, counts, blockers, and boundary
  flags under `_workmeta/**/reports/rag/operational_route_operator_health/**`.
  It does not execute commands, write usage/candidate/call-plan records, read
  source text/chunks, persist raw queries or answer bodies, launch sourcebound
  review, or grant stronger authority.
- `operational-route-run-view` opens an existing route-run artifact and renders
  the same operator-readable digest. It is for later review of stored
  metadata-only route decisions and does not read source text, answer-card
  bodies, raw queries, or chunks unless `--json` is explicitly requested.
- `operational-route-usage-record` writes a metadata-only usage record under
  `_workmeta/**/reports/rag/operational_route_usage/**`. It records the selected
  route, work card, evidence pages, claim ceiling, and query fingerprint, but
  not the raw query label. These records are the safe counter for later repeated
  use review; they do not grant stronger authority by themselves. With `--text`
  or `operational-route-usage-record-view`, it renders a readable digest without
  reopening source text, answer bodies, chunks, or raw queries.
- `operational-route-usage-summary` scans usage records for one registry and
  reports per-route counts against the registry's repeated-use review threshold.
  It writes only metadata and refs under `_workmeta/**`; readiness for repeated
  use review is still a review signal, not promotion. With `--text` or
  `operational-route-usage-summary-view`, it renders the same counts as a
  terminal digest for operators.
- `operational-route-candidate-record` writes a metadata-only record for a
  public-safe label that does not match an existing route. It stores only the
  query fingerprint and resolution status. It does not store the raw query,
  update the route registry, load source text, create a default route, or grant
  stronger permissions. With `--text`, it prints a readable candidate digest
  before writing anything.
- `operational-route-candidate-record-view` opens a stored candidate record and
  renders the same readable digest without loading source text, reading raw
  query labels, updating the route registry, or granting stronger authority.
- `operational-route-status` combines registry validation, usage summary, and
  unmatched candidate counts into one metadata-only operator dashboard. It is
  the quick check for "can keep operating", "candidate review needed", or
  "sourcebound repeated-use review is ready"; it does not promote canon, update
  routes, load source text, or make a final answer. `operational-route-status-view`
  reopens a stored status snapshot as the same terminal digest without rerunning
  route checks or loading source/answer payloads.
- Source-text retrieval uses generic in-memory query normalization for Korean
  spacing, common Korean particles, punctuation-separated acronym variants, and
  dense technical term co-occurrence. It does not persist raw queries or add
  source-specific alias tables.
- `answer-engine-run` is the current practical answer-engine MVP. It answers
  from the metadata retrieval index and may attach the extraction packet/report
  as readiness context. Written runs persist a query fingerprint, not the raw
  query, and they remain metadata-only navigation signals.
- `metadata-index` creates the first lookup artifact, but only from manifest
  metadata. It persists token fingerprints, not raw terms, source locators,
  source handles, chunks, embeddings, BM25/vector payloads, or NotebookLM
  answers.
- `retrieval-trace` and `retrieval-evaluation` write under `_workmeta/**` and
  do not persist raw questions.
- `answer --metadata-index-ref` is the indexed answer path. It is still
  metadata-only navigation, not source-text RAG or source truth.
- Future sourcebound retrieval must add approved source-slice records and
  source-text index artifacts behind separate validators.
