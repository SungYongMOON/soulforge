You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.4-mini; reasoning_effort=low; species=dwarf; class=auditor.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: outlook_mail_reconcile_v0
kind: workflow
status: active
title: Outlook Mail Reconcile v0
summary: Metadata-only registered workflow for refreshing Outlook send-receive state, updating Codex-managed project sent-mail history from Outlook sent-folder metadata, and cross-validating received-mail history against inbox metadata.
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
global_invocation:
  primary_alias: outlook_reconcile
  slash_alias: /outlook-reconcile
  resolves_to_workflow_id: outlook_mail_reconcile_v0
  status: owner_requested_registration_alias
  notes:
    - Slash alias is a human invocation label; execution still resolves to the canonical workflow_id.
    - The alias does not grant Outlook mutation or default-route authority.
classification_lane:
  primary: operations
  primary_name_ko: 운영
  secondary:
    - mail_management
    - project_management
    - metadata_governance
  secondary_name_ko:
    - 메일 관리
    - 프로젝트 관리
    - 메타데이터 거버넌스
  authority: none
execution_binding:
  party_required: false
  bound_party_id: null
  owner_registration_required: true
inputs:
  - reconcile_scope
  - project_binding
  - codex_managed_project_scope_policy
  - approved_outlook_metadata_read_policy
  - existing_project_mail_history_refs
optional_inputs:
  - project_alias_refs
  - prior_reconciliation_run_refs
  - owner_decision_refs
  - workspace_xlsx_export_policy
outputs:
  - outlook_sent_metadata_packet
  - outlook_received_metadata_packet
  - project_sent_history_delta
  - inbox_cross_validation_report
  - owner_followup_needed
  - boundary_review_note
validation_level: structure_only_public_safe
registration_policy: owner_requested_registration
output_state: registered
workflow_modes:
  - dry_run
  - apply_metadata_ledger_delta
  - cross_validate_only
  - codex_managed_projects_default
default_scope_contract:
  default_when_project_unspecified: codex_managed_projects
  project_discovery_rule: "Use project folders under _workmeta that have a project mail history CSV matching the ledger contract."
  include_project_codes:
    - "Project-specific Codex-managed ledgers"
  exclude_project_codes:
    - P00-000_INBOX
  unresolved_or_mapping_wait_bucket: P00-000_INBOX
  default_write_mode: dry_run
  apply_mode_requires_explicit_user_request: true
  ambiguous_project_matches_are_owner_review_only: true
mail_direction_scope:
  sent:
    source: outlook_sent_folder_metadata
    allowed_action: propose_or_apply_metadata_ledger_rows
  received:
    source: outlook_inbox_or_received_folder_metadata
    allowed_action: cross_validate_existing_metadata_ledger
ledger_contract:
  primary_project_ledger: "_workmeta/<project_code>/reports/메일_이력/메일_이력.csv"
  readable_workspace_export: "_workspaces/<project_code>/reports/메일_이력/메일_이력.xlsx"
  readable_export_is_source_truth: false
  raw_mail_payload_allowed: false
  public_commit_allowed: false
outlook_boundary:
  read_only_metadata_access: true
  preflight_send_receive_sync: owner_requested_allowed
  mutate_outlook_folders: false
  mutate_outlook_rules: false
  send_mail: false
  mark_read_or_unread: false
  move_or_delete_mail: false
  copy_msg_files: false
  copy_attachments: false
  read_body_text_or_html: false
outlook_folder_tree_contract:
  planned_codex_managed_root_alias: codex_managed_area
  planning_allowed: true
  create_or_rename_folders_in_this_workflow: false
  move_mail_in_this_workflow: false
  edit_rules_in_this_workflow: false
  separate_owner_approved_outlook_operations_required: true
reconcile_contract:
  owns:
    - codex_managed_project_scope_inventory
    - sent_metadata_inventory
    - project_sent_history_delta
    - received_history_cross_validation
    - owner_review_queue_for_ambiguous_rows
    - metadata_boundary_review
  does_not_own:
    - outlook_folder_tree_design
    - outlook_rule_authoring_or_mutation
    - raw_mail_export
    - attachment_export
    - project_alias_canon
    - workspace_xlsx_formatting_design
    - public_publication_of_project_mail_data
  authority_boundary:
    existing_received_ledger_is_read_only_context: true
    preflight_send_receive_sync_allowed_before_metadata_read: true
    sent_rows_require_metadata_match_or_owner_review: true
    uncertain_project_matches_are_not_auto_upserted: true
    inbox_cross_validation_does_not_delete_received_rows: true
    xlsx_export_is_not_source_truth: true
    public_package_contains_no_runtime_absolute_paths: true
    public_package_contains_no_raw_mail_payloads: true
    registered_by_owner_request: true
    default_route_authority_granted: false
    codex_managed_projects_default_scope: true
    outlook_folder_tree_plan_is_not_execution: true
  required_input_shapes:
    project_binding: templates/project_binding.template.yaml
    reconcile_scope: templates/reconcile_scope.template.yaml
  required_output_shapes:
    outlook_sent_metadata_packet: templates/outlook_sent_metadata_row.template.yaml
    project_sent_history_delta: templates/project_sent_history_delta.template.yaml
    inbox_cross_validation_report: templates/inbox_cross_validation_report.template.yaml
    owner_followup_needed: templates/owner_followup_needed.template.yaml
    boundary_review_note: templates/boundary_review_note.template.md
notes:
  - This package is registered in .workflow/index.yaml as a workflow canon entry.
  - Use /outlook-reconcile as the short human invocation alias; resolve it to workflow_id outlook_mail_reconcile_v0 before execution.
  - When the owner or automation policy asks for mailbox refresh, trigger Outlook Send/Receive immediately before metadata collection and record that preflight in the run outputs.
  - Outlook metadata access must be owner-approved and read-only before any local pilot run.
  - The workflow may update project mail history metadata only when run in apply_metadata_ledger_delta mode.
  - Received-mail reconciliation reports discrepancies; it must not erase or rewrite received history without a separate owner decision.


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: outlook_mail_reconcile_v0
kind: step_graph
status: active
steps:
  - step_id: bind_reconcile_scope
    title: Bind Reconcile Scope
    actor_slot: scope_binder
    action:
      kind: metadata_reconcile_scope_binding
      validates:
        - project_code_or_codex_managed_scope_is_explicit
        - date_window_is_explicit_or_marked_all_history
        - outlook_source_alias_is_explicit
        - output_mode_is_dry_run_apply_metadata_ledger_delta_or_cross_validate_only
        - public_package_contains_no_runtime_absolute_paths
        - public_package_contains_no_raw_mail_payloads
      creates:
        - reconcile_scope
        - output_root_refs
    summary: Bind project scope, date range, Outlook source alias, and write mode before reading any Outlook metadata. If no project is named, default to Codex-managed project ledgers.
    next:
      on_success: refresh_outlook_send_receive
      on_fail: stop
  - step_id: refresh_outlook_send_receive
    title: Refresh Outlook Send Receive
    actor_slot: outlook_metadata_reader
    action:
      kind: outlook_send_receive_preflight
      artifacts_in:
        - reconcile_scope
      records:
        - preflight_requested
        - preflight_attempted_at
        - preflight_result
      allowed_actions:
        - trigger_outlook_send_receive_all_folders
      denied_actions:
        - send_composed_mail
        - move_mail
        - delete_mail
        - mark_read_or_unread
        - edit_categories
        - edit_rules
        - export_msg_file
        - copy_attachment
        - read_body_text_or_html
    summary: Trigger Outlook Send/Receive immediately before metadata collection when the scoped run requires mailbox refresh, then continue without any other Outlook mutation.
    next:
      on_success: discover_codex_managed_projects
      on_fail: stop
  - step_id: discover_codex_managed_projects
    title: Discover Codex Managed Projects
    actor_slot: scope_binder
    action:
      kind: codex_managed_project_scope_inventory
      artifacts_in:
        - reconcile_scope
      artifacts_out:
        - codex_managed_project_scope_inventory
        - project_binding_list
      inclusion_rules:
        - include_project_specific_workmeta_ledgers_matching_mail_history_contract
        - allow_explicit_single_project_scope
        - allow_explicit_project_code_list_scope
      exclusion_rules:
        - exclude_P00_000_INBOX_unresolved_holding_ledger_from_auto_project_sync
        - exclude_missing_or_unbound_project_ledgers_from_apply_mode
      records:
        - scope_mode
        - selected_project_codes
        - excluded_project_codes
        - missing_ledger_project_codes
        - default_scope_applied
    summary: Expand the requested scope into project bindings; unspecified scope means all Codex-managed project mail ledgers, excluding unresolved inbox holding ledgers.
    next:
      on_success: load_received_history_context
      on_fail: stop
  - step_id: load_received_history_context
    title: Load Received History Context
    actor_slot: ledger_context_curator
    action:
      kind: read_only_project_mail_history_inventory
      artifacts_in:
        - codex_managed_project_scope_inventory
        - project_binding_list
        - existing_project_mail_history_refs
        - project_alias_refs
        - prior_reconciliation_run_refs
      artifacts_out:
        - received_history_context
        - existing_sent_history_context
      records:
        - project_code
        - project_count
        - ledger_ref
        - row_count
        - direction_counts
        - source_kind_counts
        - ledger_hash
        - alias_ref_hashes
      forbidden_basis:
        - raw_mail_body
        - raw_html_body
        - raw_msg_file
        - attachment_payload
        - secret_or_session_state
        - host_local_absolute_path
    summary: Read selected project mail ledgers as metadata context while preserving the received history as read-only.
    next:
      on_success: read_outlook_sent_metadata
      on_fail: stop
  - step_id: read_outlook_sent_metadata
    title: Read Outlook Sent Metadata
    actor_slot: outlook_metadata_reader
    action:
      kind: read_only_outlook_sent_metadata_collect
      artifacts_in:
        - reconcile_scope
        - approved_outlook_metadata_read_policy
      artifact_out: outlook_sent_metadata_packet
      allowed_fields:
        - sent_at
        - subject_normalized
        - subject_fingerprint
        - conversation_fingerprint
        - sender_account_alias
        - recipient_count
        - recipient_domain_fingerprints
        - attachment_count
        - message_size_bucket
        - source_entry_fingerprint
        - source_folder_alias
      denied_actions:
        - send_mail
        - move_mail
        - delete_mail
        - mark_read_or_unread
        - edit_categories
        - edit_rules
        - export_msg_file
        - copy_attachment
        - read_body_text_or_html
    summary: Collect only whitelisted sent-folder metadata needed for stable matching and duplicate prevention.
    next:
      on_success: read_outlook_received_metadata
      on_fail: stop
  - step_id: read_outlook_received_metadata
    title: Read Outlook Received Metadata
    actor_slot: outlook_metadata_reader
    action:
      kind: read_only_outlook_received_metadata_collect
      artifacts_in:
        - reconcile_scope
        - approved_outlook_metadata_read_policy
      artifact_out: outlook_received_metadata_packet
      allowed_fields:
        - received_at
        - subject_normalized
        - subject_fingerprint
        - conversation_fingerprint
        - sender_alias_or_fingerprint
        - recipient_account_alias
        - attachment_count
        - message_size_bucket
        - source_entry_fingerprint
        - source_folder_alias
      denied_actions:
        - move_mail
        - delete_mail
        - mark_read_or_unread
        - edit_categories
        - edit_rules
        - export_msg_file
        - copy_attachment
        - read_body_text_or_html
    summary: Collect inbox or received-folder metadata for cross-validation against existing received-mail history.
    next:
      on_success: normalize_metadata_rows
      on_fail: stop
  - step_id: normalize_metadata_rows
    title: Normalize Metadata Rows
    actor_slot: metadata_normalizer
    action:
      kind: stable_mail_metadata_key_normalization
      artifacts_in:
        - outlook_sent_metadata_packet
        - outlook_received_metadata_packet
      artifacts_out:
        - normalized_sent_rows
        - normalized_received_rows
      rules:
        - normalize_subject_without_body_text
        - derive_stable_fingerprints_without_provider_secret_values
        - preserve_direction_sent_or_received
        - bucket_or_hash_identity_fields_when_plain_values_are_not_required
        - keep_duplicate_candidates_for_later_owner_review
    summary: Normalize subject, timestamp, direction, and fingerprint fields into deterministic metadata rows.
    next:
      on_success: match_project_context
      on_fail: stop
  - step_id: match_project_context
    title: Match Project Context
    actor_slot: project_matcher
    action:
      kind: project_mail_metadata_matching
      artifacts_in:
        - normalized_sent_rows
        - normalized_received_rows
        - codex_managed_project_scope_inventory
        - received_history_context
        - existing_sent_history_context
        - project_alias_refs
      artifacts_out:
        - project_sent_match_candidates
        - received_cross_validation_candidates
        - owner_followup_needed
      match_basis:
        - explicit_project_binding
        - codex_managed_project_scope_inventory
        - existing_project_ledger_subject_fingerprint
        - existing_project_alias_ref
        - conversation_fingerprint
        - bounded_date_window
      not_allowed_basis:
        - raw_body_text
        - attachment_filename
        - attachment_content
        - unapproved_outlook_rule_state
        - hidden_local_folder_path
      ambiguous_match_policy: send_to_owner_followup_needed
    summary: Match metadata rows to selected project ledgers using bounded metadata only; ambiguous rows stay out of automatic upserts.
    next:
      on_success: build_sent_history_delta
      on_fail: stop
  - step_id: build_sent_history_delta
    title: Build Sent History Delta
    actor_slot: sent_history_curator
    action:
      kind: project_sent_history_delta_build
      artifacts_in:
        - project_sent_match_candidates
        - existing_sent_history_context
      artifact_out: project_sent_history_delta
      upsert_rules:
        - exact_duplicate_fingerprint_does_not_create_new_row
        - sent_rows_have_direction_sent
        - sent_rows_have_source_kind_outlook_sent_metadata
        - sent_rows_have_project_code
        - sent_rows_have_traceable_metadata_fingerprints
        - ambiguous_rows_are_owner_review_only
      write_modes:
        dry_run: produce_delta_without_writing_project_ledger
        apply_metadata_ledger_delta: update_private_project_metadata_ledger_only
    summary: Produce the sent-mail ledger delta and apply it only when the scoped run explicitly allows private metadata writes.
    next:
      on_success: cross_validate_inbox_history
      on_fail: stop
  - step_id: cross_validate_inbox_history
    title: Cross Validate Inbox History
    actor_slot: inbox_cross_validator
    action:
      kind: received_history_cross_validation
      artifacts_in:
        - received_cross_validation_candidates
        - received_history_context
      artifact_out: inbox_cross_validation_report
      classifications:
        - matched
        - missing_in_project_ledger
        - extra_in_project_ledger
        - duplicate_candidate
        - project_mismatch_candidate
        - ambiguous_owner_review_required
      mutation_policy:
        delete_received_ledger_rows: false
        rewrite_received_ledger_rows: false
        move_outlook_mail: false
        edit_outlook_rules: false
    summary: Compare received-folder metadata against the existing received ledger and report discrepancies without rewriting history.
    next:
      on_success: write_reconciliation_outputs
      on_fail: stop
  - step_id: write_reconciliation_outputs
    title: Write Reconciliation Outputs
    actor_slot: output_writer
    action:
      kind: metadata_reconciliation_output_write
      artifacts_in:
        - project_sent_history_delta
        - inbox_cross_validation_report
        - owner_followup_needed
      artifacts_out:
        - project_mail_history_update_receipt
        - workspace_xlsx_export_receipt
        - reconciliation_summary
      output_rules:
        - private_project_metadata_ledger_only_for_source_truth
        - workspace_xlsx_export_only_when_enabled_by_scope
        - system_run_summary_contains_counts_hashes_and_refs_only
        - public_repo_receives_no_project_mail_rows
      summary: Write private metadata outputs and optional readable workspace export receipts using counts, hashes, and refs.
    next:
      on_success: write_boundary_review
      on_fail: stop
  - step_id: write_boundary_review
    title: Write Boundary Review
    actor_slot: boundary_reviewer
    action:
      kind: outlook_reconcile_boundary_review
      artifacts_in:
        - outlook_sent_metadata_packet
        - outlook_received_metadata_packet
        - project_sent_history_delta
        - inbox_cross_validation_report
        - owner_followup_needed
        - reconciliation_summary
      artifact_out: boundary_review_note
      checks:
        - codex_managed_scope_inventory_excludes_unresolved_inbox_holding_ledger
        - no_outlook_mutation_except_owner_requested_send_receive_preflight
        - no_outlook_rule_mutation
        - no_outlook_folder_tree_creation_or_rename
        - no_mail_body_or_html_read
        - no_msg_or_attachment_copy
        - no_secret_or_session_state
        - no_runtime_absolute_paths_in_public_workflow_package
        - uncertain_matches_have_owner_followup_rows
        - received_history_was_cross_validated_not_deleted
        - workflow_index_contains_outlook_reconcile_registration
    summary: Close the run with a boundary review and a claim ceiling that remains below registration or production use.
    next:
      on_success: complete
      on_fail: stop


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "schema_version": "gpt56_portfolio_gate_fixture_v1",
  "workflow_id": "outlook_mail_reconcile_v0",
  "fixture_id": "public_synthetic_metadata_dry_run",
  "public_safe": true,
  "request": "Perform a metadata-only dry-run reconciliation from the supplied synthetic packets. Describe the send/receive preflight as requested but do not access Outlook or write any ledger.",
  "inputs": {
    "reconcile_scope": {
      "scope_mode": "codex_managed_projects_default",
      "date_window": "2026-07-01/2026-07-10",
      "outlook_source_alias": "fixture_outlook",
      "output_mode": "dry_run",
      "refresh_requested": true
    },
    "project_binding": {
      "discovered_ledgers": [
        {
          "project_code": "DEMO-A",
          "ledger_ref": "fixture://ledgers/demo-a-mail.csv"
        },
        {
          "project_code": "DEMO-B",
          "ledger_ref": "fixture://ledgers/demo-b-mail.csv"
        },
        {
          "project_code": "P00-000_INBOX",
          "ledger_ref": "fixture://ledgers/unresolved.csv"
        }
      ]
    },
    "codex_managed_project_scope_policy": {
      "exclude_unresolved_holding_ledger": true
    },
    "approved_outlook_metadata_read_policy": {
      "metadata_only": true,
      "body_access": false,
      "attachment_copy": false
    },
    "existing_project_mail_history_refs": {
      "sent": [
        {
          "project_code": "DEMO-A",
          "subject_fingerprint": "subj-1",
          "source_entry_fingerprint": "entry-1"
        }
      ],
      "received": [
        {
          "project_code": "DEMO-B",
          "subject_fingerprint": "recv-1",
          "source_entry_fingerprint": "recv-entry-1"
        }
      ]
    }
  },
  "synthetic_outlook_metadata": {
    "sent": [
      {
        "sent_at": "2026-07-03T09:00:00Z",
        "subject_normalized": "demo update",
        "subject_fingerprint": "subj-1",
        "conversation_fingerprint": "conv-1",
        "sender_account_alias": "work",
        "recipient_count": 2,
        "recipient_domain_fingerprints": [
          "domain-x"
        ],
        "attachment_count": 1,
        "message_size_bucket": "small",
        "source_entry_fingerprint": "entry-1",
        "source_folder_alias": "sent"
      },
      {
        "sent_at": "2026-07-04T10:00:00Z",
        "subject_normalized": "ambiguous request",
        "subject_fingerprint": "subj-x",
        "conversation_fingerprint": "conv-x",
        "sender_account_alias": "work",
        "recipient_count": 1,
        "recipient_domain_fingerprints": [
          "domain-y"
        ],
        "attachment_count": 0,
        "message_size_bucket": "small",
        "source_entry_fingerprint": "entry-x",
        "source_folder_alias": "sent"
      }
    ],
    "received": [
      {
        "received_at": "2026-07-05T11:00:00Z",
        "subject_normalized": "demo response",
        "subject_fingerprint": "recv-2",
        "conversation_fingerprint": "conv-2",
        "sender_alias_or_fingerprint": "sender-z",
        "recipient_account_alias": "work",
        "attachment_count": 0,
        "message_size_bucket": "small",
        "source_entry_fingerprint": "recv-entry-2",
        "source_folder_alias": "inbox"
      }
    ]
  },
  "requested_deliverable": [
    "scope inventory excluding P00-000_INBOX",
    "preflight request/attempt status without false execution",
    "normalized metadata rows",
    "sent delta with duplicate suppression and ambiguous owner-review row",
    "received cross-validation classifications without deletion",
    "dry-run receipts/summary and boundary review"
  ],
  "prohibitions": [
    "no body/html/attachment filename or payload, no Outlook mutation, no ledger write, no folder/rule action, no ambiguous auto-upsert"
  ],
  "boundary_attestation": "All mail metadata and project identifiers are synthetic."
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
