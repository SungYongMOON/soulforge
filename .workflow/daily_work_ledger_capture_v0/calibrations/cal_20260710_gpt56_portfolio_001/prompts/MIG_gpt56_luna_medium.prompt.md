You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-luna; reasoning_effort=medium; species=dwarf; class=auditor.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: daily_work_ledger_capture_v0
kind: workflow
status: active
title: Daily Work Ledger Capture v0
summary: Capture daily company project, company general/unassigned P00, and Soulforge sub-ledger work entries from approved metadata surfaces so later reports can read prepared ledgers instead of rediscovering work at report time.
entrypoint: run
execution_mode: local_tool_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
history: history/
calibrations: calibrations/
inputs:
  - daily_work_ledger_capture_scope
  - ledger_category_policy
  - approved_metadata_source_refs
  - ledger_write_policy
  - project_ordering_policy
optional_inputs:
  - prior_daily_ledger_refs
  - guild_hall_activity_refs
  - project_workmeta_report_refs
  - mission_status_refs
  - battle_log_summary_refs
  - mail_work_status_refs
  - deadline_watch_refs
  - owner_manual_work_note_refs
  - owner_decision_refs
outputs:
  - project_daily_work_ledger
  - soulforge_subledger_daily_work_ledgers
  - skipped_source_register
  - review_needed_register
  - ledger_capture_receipt
  - downstream_report_handoff
  - boundary_review_note
validation_level: registered_structure_with_local_automation_binding
registration_policy: owner_requested_registration
output_state: registered
classification_lane:
  primary: project_management
  primary_name_ko: 프로젝트 관리
  secondary:
    - mail_management
    - review_governance
  secondary_name_ko:
    - 메일 관리
    - 리뷰/거버넌스
  purpose: discovery_only
  authority: none
execution_binding:
  party_required: true
  candidate_party_id: daily_automation_party
  bound_party_id: daily_automation_party
  binding_authority: owner_requested_local_daily_automation_party
workflow_modes:
  - daily_capture
  - backfill_preview
  - rerun_update
upstream_workflows:
  - workflow_id: knowledge_access_event_capture_v0
    expected_outputs:
      - normalized_access_event_log
      - usage_rollup
    status: optional_metadata_context
  - workflow_id: project_readiness_digest_v0
    expected_outputs:
      - status_rollup
      - owner_input_queue
    status: optional_project_status_context
  - workflow_id: owner_decision_packet_v0
    expected_outputs:
      - scoped_owner_decision
    status: optional_policy_context
downstream_workflows:
  - workflow_id: daily_work_report_render_v0
    expected_input: company_project_p00_and_soulforge_subledger_daily_ledgers
    status: future_candidate_only
  - workflow_id: weekly_worklog_render_v0
    expected_input: week_of_company_project_p00_and_soulforge_subledger_daily_ledgers
    status: future_candidate_only
  - workflow_id: project_readiness_digest_v0
    expected_input: ledger_capture_receipt_and_review_needed_register
    status: optional_summary_context
  - workflow_id: post_development_review_gate_v0
    expected_input: workflow_or_schema_change_packet
    status: required_before_public_or_canon_policy_change
daily_work_ledger_capture_contract:
  owns:
    - capture_scope_binding
    - owner_facing_ledger_category_policy
    - approved_metadata_source_inventory
    - metadata_only_work_entry_normalization
    - company_project_ledger_routing
    - project_daily_ledger_output_shape
    - p00_company_general_daily_ledger_routing
    - soulforge_subledger_daily_ledger_routing
    - soulforge_subledger_daily_ledger_output_shape
    - skipped_source_register_shape
    - review_needed_register_shape
    - ledger_capture_receipt_shape
    - downstream_report_handoff_shape
    - boundary_review_note_shape
  does_not_own:
    - report_authoring
    - timesheet_finalization
    - source_truth
    - owner_acceptance
    - mail_body_or_attachment_parsing
    - office_pdf_hwp_payload_parsing
    - project_payload_reading
    - secret_inspection
    - codex_app_schedule_clock
    - codex_app_schedule_state
    - public_canon_promotion
    - project_code_assignment_truth
    - soulforge_subledger_owner_acceptance
  approved_metadata_surface_examples:
    - guild_hall/state/operations/soulforge_activity/**
    - _workmeta/<project_code>/reports/**
    - _workmeta/<project_code>/runs/<run_id>/metadata/**
    - _workmeta/system/reports/**
    - _workmeta/P00-000_INBOX/reports/**
    - _workmeta/P00-000_INBOX/daily_ledger/**
    - _workmeta/system/daily_ledger/**
    - _workmeta/system/daily_ledger/<soulforge_subledger>/**
    - _workmeta/<project_code>/daily_ledger/**
  forbidden_payloads:
    - raw_mail_body
    - mail_attachment_payload
    - office_pdf_hwp_payload
    - project_source_file_body
    - copied_chat_transcript
    - credential_or_session_or_token
    - local_absolute_payload_path
  required_input_shapes:
    daily_work_ledger_capture_scope: templates/daily_work_ledger_capture_scope.template.yaml
    ledger_category_policy: templates/ledger_category_policy.template.yaml
    metadata_source_inventory: templates/metadata_source_inventory.template.yaml
    project_binding: templates/project_binding.template.yaml
  required_output_shapes:
    daily_work_ledger_entry: templates/daily_work_ledger_entry.template.yaml
    project_daily_work_ledger: templates/project_daily_work_ledger.template.yaml
    soulforge_subledger_daily_work_ledger: templates/soulforge_subledger_daily_work_ledger.template.yaml
    skipped_source_register: templates/skipped_source_register.template.yaml
    review_needed_register: templates/review_needed_register.template.yaml
    ledger_capture_receipt: templates/ledger_capture_receipt.template.yaml
    downstream_report_handoff: templates/downstream_report_handoff.template.yaml
    boundary_review_note: templates/boundary_review_note.template.md
  authority_boundary:
    ledger_entry_is_observed_metadata_not_source_truth: true
    missing_input_becomes_gap_not_report_time_collection: true
    report_renderer_reads_ledgers_only: true
    source_payloads_remain_in_worksite_or_owner_approved_source_surface: true
    scheduled_host_is_not_truth_authority: true
    local_automation_state_is_not_public_canon: true
    p00_reserved_for_company_general_or_unresolved_company_work: true
    company_project_codes_use_pxx_xxx_owner_facing_pattern: true
    soulforge_subledger_ids_are_owner_facing_categories_not_execution_authority: true
    unknown_soulforge_subledger_becomes_review_needed_not_system_by_default: true
notes:
  - This package is listed in `.workflow/index.yaml` by owner request.
  - The daily automation party binds this workflow as the ledger capture stage after activity sync.
  - Local Codex app automations are the scheduler binding; schedule time and ACTIVE/PAUSED state remain PC-local.
  - Downstream reports must show missing or incomplete ledger sections as explicit gaps.
  - P00-000_INBOX is the reserved ledger code for real company work without a confirmed project code; it is not the Soulforge system ledger or a personal/promotional bucket.
  - Soulforge ledger categories are sub-ledgers under the system workmeta lane: system, knowledge, workflow, automation, ingress, skill, ui, and domain_cell.
  - Owner-facing daily ledger taxonomy is documented in `docs/architecture/workspace/DAILY_WORK_LEDGER_TAXONOMY_V0.md`.


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: daily_work_ledger_capture_v0
kind: step_graph
status: active
steps:
  - step_id: bind_capture_scope
    title: Bind Capture Scope
    actor_slot: scope_binder
    action:
      kind: daily_work_ledger_scope_binding
      requires:
        - daily_work_ledger_capture_scope
        - ledger_category_policy
        - approved_metadata_source_refs
        - ledger_write_policy
        - project_ordering_policy
      validates:
        - capture_date_declared
        - timezone_declared
        - company_project_codes_or_company_inbox_or_soulforge_subledger_scope_declared
        - ledger_category_policy_declares_company_project_p00_and_soulforge_subledgers
        - output_roots_are_workmeta_daily_ledger_surfaces
        - raw_payload_reading_forbidden
    summary: Resolve date window, company project scope, P00 scope, Soulforge sub-ledger scope, allowed metadata refs, output roots, and write mode before reading any source metadata.
    next:
      on_success: inventory_metadata_sources
      on_fail: stop
  - step_id: inventory_metadata_sources
    title: Inventory Metadata Sources
    actor_slot: metadata_source_curator
    action:
      kind: approved_metadata_surface_inventory
      artifacts_in:
        - approved_metadata_source_refs
        - prior_daily_ledger_refs
        - guild_hall_activity_refs
        - project_workmeta_report_refs
        - mission_status_refs
        - battle_log_summary_refs
        - mail_work_status_refs
        - deadline_watch_refs
        - owner_manual_work_note_refs
      artifacts_out:
        - metadata_source_inventory
        - skipped_source_register
      allowed_content:
        - source_ref
        - source_kind
        - project_code
        - event_or_packet_id
        - timestamp
        - status_label
        - summary_label
        - owner_review_state
        - ledger_family_hint
        - ledger_code_hint
        - soulforge_subledger_hint
      forbidden_content:
        - raw_mail_body
        - attachment_payload
        - office_pdf_hwp_payload
        - project_file_body
        - credential_or_session_or_token
        - host_absolute_payload_path
    summary: List approved metadata rows that can seed ledger entries and explicitly skip anything outside policy.
    next:
      on_success: classify_work_entry_candidates
      on_fail: stop
  - step_id: classify_work_entry_candidates
    title: Classify Work Entry Candidates
    actor_slot: entry_classifier
    action:
      kind: owner_facing_ledger_category_classification
      artifacts_in:
        - metadata_source_inventory
        - ledger_category_policy
        - project_ordering_policy
        - owner_decision_refs
      artifacts_out:
        - work_entry_candidate_batch
        - review_needed_register
      classification_states:
        - company_project_work
        - company_general_unassigned_work
        - soulforge_system_work
        - soulforge_knowledge_work
        - soulforge_workflow_work
        - soulforge_automation_work
        - soulforge_ingress_work
        - soulforge_skill_work
        - soulforge_ui_work
        - soulforge_domain_cell_work
        - skipped
        - review_needed
        - blocked
      rules:
        company_project_work_requires_confirmed_pxx_xxx_or_owner_project_binding: true
        unknown_project_code_goes_to_review_needed: true
        projectless_company_work_routes_to_p00: true
        p00_is_not_system_or_personal_work: true
        soulforge_work_routes_to_declared_subledger_not_p00: true
        soulforge_system_is_general_maintenance_only_when_no_narrower_subledger_is_supported: true
        unknown_soulforge_subledger_goes_to_review_needed: true
        company_project_and_p00_entries_sort_before_soulforge_entries: true
        ambiguous_source_refs_are_not_inferred: true
        duplicate_candidate_keys_are_flagged_not_silently_merged: true
    summary: Classify candidate work entries by company project, P00 company general/unassigned, or Soulforge sub-ledger ownership and mark ambiguous rows for review instead of guessing.
    next:
      on_success: normalize_ledger_entries
      on_fail: stop
  - step_id: normalize_ledger_entries
    title: Normalize Ledger Entries
    actor_slot: ledger_entry_normalizer
    action:
      kind: daily_work_ledger_entry_normalization
      artifacts_in:
        - work_entry_candidate_batch
      artifacts_out:
        - normalized_daily_work_ledger_entries
      required_fields:
        - entry_id
        - ledger_date
        - ledger_family
        - ledger_code
        - project_code
        - soulforge_subledger
        - entry_kind
        - summary_label
        - source_refs
        - confidence
        - owner_review_state
        - report_visibility
      normalization_rules:
        entry_id_is_deterministic_from_date_ledger_code_source_kind_and_source_id: true
        source_refs_are_metadata_refs_only: true
        confidence_is_observation_confidence_not_truth_score: true
        owner_review_state_required: true
        copied_source_text_forbidden: true
    summary: Normalize candidates into metadata-only ledger entries with stable ids and explicit review state.
    next:
      on_success: write_company_and_soulforge_ledgers
      on_fail: stop
  - step_id: write_company_and_soulforge_ledgers
    title: Write Company And Soulforge Ledgers
    actor_slot: ledger_writer
    action:
      kind: daily_work_ledger_bundle_write
      artifacts_in:
        - normalized_daily_work_ledger_entries
        - skipped_source_register
        - review_needed_register
        - ledger_write_policy
      artifacts_out:
        - project_daily_work_ledger
        - soulforge_subledger_daily_work_ledgers
      write_policy:
        project_ledgers_under_workmeta_project_daily_ledger: true
        p00_ledger_under_workmeta_p00_daily_ledger: true
        soulforge_subledgers_under_system_workmeta_daily_ledger_subdirs: true
        legacy_system_ledger_is_the_soulforge_system_subledger: true
        no_public_repo_payload_write: true
        rerun_updates_must_preserve_manual_review_marks: true
        missing_source_sections_written_as_gaps: true
    summary: Write or update company project, P00, and Soulforge sub-ledger daily ledger bundles under metadata-only owner surfaces.
    next:
      on_success: review_boundary_and_completeness
      on_fail: stop
  - step_id: review_boundary_and_completeness
    title: Review Boundary And Completeness
    actor_slot: boundary_reviewer
    action:
      kind: ledger_boundary_and_completeness_review
      artifacts_in:
        - project_daily_work_ledger
        - soulforge_subledger_daily_work_ledgers
        - skipped_source_register
        - review_needed_register
      artifacts_out:
        - boundary_review_note
      checks:
        - no_raw_payload_copied
        - no_secret_or_session_material
        - no_local_absolute_payload_path
        - unknown_project_codes_are_review_needed
        - unknown_soulforge_subledgers_are_review_needed
        - p00_contains_only_real_company_general_or_unassigned_work
        - soulforge_subledger_outputs_do_not_create_execution_authority
        - missing_or_incomplete_coverage_is_visible
        - report_renderer_input_is_ledger_only
    summary: Check that the ledger bundle is metadata-only and honest about skipped or incomplete coverage.
    next:
      on_success: emit_receipt_and_handoff
      on_fail: stop
  - step_id: emit_receipt_and_handoff
    title: Emit Receipt And Handoff
    actor_slot: downstream_handoff_router
    action:
      kind: ledger_capture_receipt_and_report_handoff
      artifacts_in:
        - project_daily_work_ledger
        - soulforge_subledger_daily_work_ledgers
        - skipped_source_register
        - review_needed_register
        - boundary_review_note
      artifacts_out:
        - ledger_capture_receipt
        - downstream_report_handoff
      handoff_rules:
        daily_report_reads_ledgers_only: true
        weekly_worklog_reads_ledgers_only: true
        report_sections_use_owner_facing_company_p00_and_soulforge_subledger_categories: true
        missing_ledger_reported_as_gap: true
        collector_does_not_send_owner_facing_report: true
    summary: Produce the capture receipt and handoff refs that report renderers can consume later.


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "schema_version": "soulforge.workflow_optimizer.input_fixture.v0",
  "fixture_id": "daily_work_ledger_capture_v0_public_synthetic_metadata_001",
  "workflow_id": "daily_work_ledger_capture_v0",
  "fixture_kind": "public_safe_synthetic_workflow_contract_fixture",
  "public_safety": {
    "contains_real_work_log": false,
    "contains_real_mail_body": false,
    "contains_attachment_payload": false,
    "contains_office_pdf_hwp_payload": false,
    "contains_project_source_file_body": false,
    "contains_secret_value": false,
    "contains_runtime_absolute_path": false,
    "basis": "Synthetic metadata rows derived from the public workflow contract only."
  },
  "daily_work_ledger_capture_scope": {
    "mode": "daily_capture",
    "ledger_date": "2026-06-10",
    "timezone": "Asia/Seoul",
    "company_project_codes": [
      "P01-SYNTH"
    ],
    "company_general_unassigned_code": "P00-000_INBOX",
    "soulforge_subledgers": [
      "workflow",
      "automation"
    ],
    "output_roots": {
      "company_project_ledgers": "_workmeta/<project_code>/daily_ledger/",
      "company_general_unassigned": "_workmeta/P00-000_INBOX/daily_ledger/",
      "soulforge_subledgers": "_workmeta/system/daily_ledger/<subledger>/"
    },
    "write_mode": "synthetic_preview_no_files_written"
  },
  "ledger_category_policy": {
    "company_project_work_requires_confirmed_project_code": true,
    "projectless_company_work_routes_to_p00": true,
    "p00_is_not_soulforge_system_or_personal_work": true,
    "soulforge_work_routes_to_declared_subledger": true,
    "unknown_project_code_goes_to_review_needed": true,
    "unknown_soulforge_subledger_goes_to_review_needed": true,
    "raw_payload_sources_are_skipped": true,
    "source_refs_are_metadata_refs_only": true,
    "company_project_and_p00_entries_sort_before_soulforge_entries": true
  },
  "project_ordering_policy": [
    "P01-SYNTH",
    "P00-000_INBOX",
    "_workmeta/system/daily_ledger/workflow",
    "_workmeta/system/daily_ledger/automation"
  ],
  "approved_metadata_source_refs": [
    "_workmeta/P01-SYNTH/reports/procedure_capture/synthetic_status_packet.yaml",
    "_workmeta/P00-000_INBOX/reports/mail_work_status/synthetic_unassigned_company_request.yaml",
    "_workmeta/system/reports/procedure_capture/workflow_optimizer/synthetic_optimizer_status.yaml",
    "guild_hall/state/operations/soulforge_activity/synthetic_automation_rollup.jsonl#row-004"
  ],
  "synthetic_metadata_rows": [
    {
      "source_id": "M1",
      "source_ref": "_workmeta/P01-SYNTH/reports/procedure_capture/synthetic_status_packet.yaml",
      "source_kind": "procedure_capture_metadata",
      "event_or_packet_id": "pkt-synth-project-001",
      "timestamp": "2026-06-10T09:10:00+09:00",
      "status_label": "applied",
      "summary_label": "Synthetic project checklist prepared for owner review",
      "project_code_hint": "P01-SYNTH",
      "ledger_family_hint": "company_project",
      "ledger_code_hint": "P01-SYNTH",
      "soulforge_subledger_hint": null,
      "owner_review_state": "observed_metadata"
    },
    {
      "source_id": "M2",
      "source_ref": "_workmeta/P00-000_INBOX/reports/mail_work_status/synthetic_unassigned_company_request.yaml",
      "source_kind": "mail_work_status_metadata",
      "event_or_packet_id": "pkt-synth-p00-001",
      "timestamp": "2026-06-10T10:20:00+09:00",
      "status_label": "needs_project_binding",
      "summary_label": "Synthetic company request logged without confirmed project code",
      "project_code_hint": null,
      "ledger_family_hint": "company_general_unassigned",
      "ledger_code_hint": "P00-000_INBOX",
      "soulforge_subledger_hint": null,
      "owner_review_state": "needs_owner_project_binding"
    },
    {
      "source_id": "M3",
      "source_ref": "_workmeta/system/reports/procedure_capture/workflow_optimizer/synthetic_optimizer_status.yaml",
      "source_kind": "workflow_optimizer_metadata",
      "event_or_packet_id": "pkt-synth-workflow-001",
      "timestamp": "2026-06-10T11:30:00+09:00",
      "status_label": "calibration_recorded",
      "summary_label": "Synthetic workflow calibration archive prepared",
      "project_code_hint": null,
      "ledger_family_hint": "soulforge",
      "ledger_code_hint": "_workmeta/system/daily_ledger/workflow",
      "soulforge_subledger_hint": "workflow",
      "owner_review_state": "observed_metadata"
    },
    {
      "source_id": "M4",
      "source_ref": "guild_hall/state/operations/soulforge_activity/synthetic_automation_rollup.jsonl#row-004",
      "source_kind": "activity_metadata",
      "event_or_packet_id": "evt-synth-automation-004",
      "timestamp": "2026-06-10T12:40:00+09:00",
      "status_label": "automation_checked",
      "summary_label": "Synthetic daily automation preflight status refreshed",
      "project_code_hint": null,
      "ledger_family_hint": "soulforge",
      "ledger_code_hint": "_workmeta/system/daily_ledger/automation",
      "soulforge_subledger_hint": "automation",
      "owner_review_state": "observed_metadata"
    },
    {
      "source_id": "M5",
      "source_ref": "_workmeta/P99-UNKNOWN/reports/procedure_capture/synthetic_unbound_project.yaml",
      "source_kind": "procedure_capture_metadata",
      "event_or_packet_id": "pkt-synth-unknown-project-001",
      "timestamp": "2026-06-10T13:50:00+09:00",
      "status_label": "ambiguous_project_code",
      "summary_label": "Synthetic project-like metadata has a code outside declared scope",
      "project_code_hint": "P99-UNKNOWN",
      "ledger_family_hint": "company_project",
      "ledger_code_hint": "P99-UNKNOWN",
      "soulforge_subledger_hint": null,
      "owner_review_state": "needs_owner_project_binding"
    },
    {
      "source_id": "M6",
      "source_ref": "synthetic_forbidden_payload/raw_mail_body_001",
      "source_kind": "raw_mail_body",
      "event_or_packet_id": "raw-synth-mail-001",
      "timestamp": "2026-06-10T14:00:00+09:00",
      "status_label": "payload_not_metadata",
      "summary_label": "Synthetic forbidden raw mail body placeholder without body text",
      "project_code_hint": "P01-SYNTH",
      "ledger_family_hint": "company_project",
      "ledger_code_hint": "P01-SYNTH",
      "soulforge_subledger_hint": null,
      "owner_review_state": "blocked_by_boundary"
    },
    {
      "source_id": "M7",
      "source_ref": "_workmeta/system/reports/procedure_capture/synthetic_unknown_subledger.yaml",
      "source_kind": "procedure_capture_metadata",
      "event_or_packet_id": "pkt-synth-subledger-unknown-001",
      "timestamp": "2026-06-10T15:10:00+09:00",
      "status_label": "unknown_soulforge_subledger",
      "summary_label": "Synthetic Soulforge row declares an unsupported subledger",
      "project_code_hint": null,
      "ledger_family_hint": "soulforge",
      "ledger_code_hint": "_workmeta/system/daily_ledger/unknown_lab",
      "soulforge_subledger_hint": "unknown_lab",
      "owner_review_state": "needs_owner_subledger_binding"
    },
    {
      "source_id": "M8",
      "source_ref": "_workmeta/P01-SYNTH/reports/procedure_capture/synthetic_status_packet.yaml",
      "source_kind": "procedure_capture_metadata",
      "event_or_packet_id": "pkt-synth-project-001",
      "timestamp": "2026-06-10T09:10:00+09:00",
      "status_label": "duplicate_candidate_key",
      "summary_label": "Synthetic duplicate of M1 used to test duplicate flagging",
      "project_code_hint": "P01-SYNTH",
      "ledger_family_hint": "company_project",
      "ledger_code_hint": "P01-SYNTH",
      "soulforge_subledger_hint": null,
      "owner_review_state": "duplicate_review_needed"
    }
  ],
  "expected_boundary_behavior": {
    "write_preview_only": true,
    "no_real_ledger_files_written": true,
    "no_raw_payload_reading": true,
    "metadata_source_refs_only": true,
    "unknown_project_code_goes_to_review_needed": true,
    "unknown_soulforge_subledger_goes_to_review_needed": true,
    "duplicate_candidate_keys_are_flagged_not_silently_merged": true,
    "p00_contains_only_company_general_unassigned_work": true,
    "soulforge_work_does_not_route_to_p00": true,
    "report_renderer_handoff_reads_ledgers_only": true,
    "claim_ceiling_is_observed_metadata": true
  },
  "required_output_shapes": [
    "capture_scope",
    "metadata_source_inventory",
    "normalized_entries",
    "project_daily_work_ledgers",
    "soulforge_subledger_daily_work_ledgers",
    "skipped_source_register",
    "review_needed_register",
    "ledger_capture_receipt",
    "downstream_report_handoff",
    "boundary_review_note",
    "completion_state"
  ],
  "acceptance_summary": [
    "Route M1 to the P01-SYNTH project ledger and flag M8 as a duplicate review item instead of silently merging it.",
    "Route M2 to P00-000_INBOX as company general or unresolved company work, not Soulforge or personal work.",
    "Route M3 to the workflow subledger and M4 to the automation subledger under _workmeta/system/daily_ledger/.",
    "Put M5 and M7 in review_needed because the project code or Soulforge subledger is outside declared scope.",
    "Put M6 in skipped_source_register because raw mail body placeholders are not approved metadata sources.",
    "Use metadata refs and summary labels only; do not copy source body text, raw payloads, local absolute paths, secrets, or real work logs.",
    "Emit a receipt and downstream handoff that state this synthetic run wrote no files and report renderers must read ledgers only."
  ]
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
