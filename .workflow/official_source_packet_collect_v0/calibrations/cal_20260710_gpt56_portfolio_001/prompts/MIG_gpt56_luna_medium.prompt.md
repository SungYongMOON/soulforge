You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-luna; reasoning_effort=medium; species=elf; class=archivist.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: official_source_packet_collect_v0
kind: workflow
status: active
title: Official Source Packet Collect v0
summary: Collect or index official and owner-approved local source evidence before downstream materials, layout, simulation, ECAD, or harness workflows make source-backed claims.
entrypoint: run
execution_mode: local_tool_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
inputs:
  - source_collection_binding
  - identifier_scope
  - approved_source_policy
optional_inputs:
  - page_module_sidecars
  - capture_intake_packets
  - component_inventory
  - existing_source_packets
  - owner_approved_local_source_manifest
  - owner_held_archive_policy
  - owner_held_archive_refs
  - downstream_source_requirements
outputs:
  - source_packet_manifest
  - source_inventory
  - source_gap_report
  - owner_followup_needed
  - download_or_reuse_manifest
  - owner_held_source_archive_manifest
  - downstream_ready_refs
  - boundary_review_note
validation_level: pilot_executed_private_fixture
upstream_workflows:
  - workflow_id: page_xml_normalize_spec_v0
    expected_output: optional_page_module_spec_v0_sidecars
  - workflow_id: capture_xml_intake_library_v0
    expected_output: optional_intake_packets_or_downstream_handoff
downstream_workflows:
  - workflow_id: exp_xml_component_materials
    expected_input: source_packet_manifest_or_source_inventory
  - workflow_id: component_pcb_layout_guide_extraction
    expected_input: layout_doc_source_refs_and_source_gap_report
  - workflow_id: xml_harness_composition_v0
    expected_input: source_gap_and_downstream_ready_refs
  - workflow_id: simulation_source_collect_v0
    expected_input: simulation_model_source_refs_or_missing_blocked_states
    status: planned
  - workflow_id: ecad_model_packet_v0
    expected_input: ecad_model_source_refs_or_missing_blocked_states
    status: planned
source_state_contract:
  required_states:
    - official_present
    - owner_approved_local
    - missing
    - blocked
    - not_applicable
  optional_review_states:
    - candidate_official
    - third_party_unapproved
    - conflicting
  executor_approved_source_states:
    - official_present
    - owner_approved_local
  non_executor_source_states:
    - missing
    - blocked
    - not_applicable
    - candidate_official
    - third_party_unapproved
    - conflicting
provenance_minimum:
  official_present:
    - authoritative_publisher
    - title
    - source_kind
    - canonical_url_or_landing_page
    - revision_or_publication_date_when_available
    - access_date
    - claims_supported
  owner_approved_local:
    - owner_approval_scope
    - root_relative_or_project_local_path
    - source_origin_type
    - approved_for_executor
    - public_summary_allowed
    - checksum_when_a_local_file_is_used
  missing_or_blocked:
    - searched_identifier
    - requested_source_kind
    - searched_locations_or_access_attempts
    - downstream_impact
    - required_next_action
notes:
  - This workflow is an R/source-bootstrap and provenance lane. It does not extract final design requirements from source documents by itself.
  - "Only `official_present` and explicitly scoped `owner_approved_local` sources may be marked `approved_for_executor: true`."
  - "`missing`, `blocked`, `not_applicable`, `candidate_official`, `third_party_unapproved`, and `conflicting` states must remain visible to downstream workflows."
  - Random mirrors, forums, distributor copies without official provenance, model aggregators, and search snippets are not official sources.
  - Owner-approved local sources require an approval scope before executor use; otherwise record owner follow-up instead of silently using the file.
  - Downloads, reused local files, hashes, caches, vendor binaries, model archives, and raw project payloads belong only in project-local or private run outputs.
  - Owner-held archive surfaces such as Google Drive may store initial candidates, source files, working bundles, and canon packages, but workflow packets must record status labels and manifest refs instead of treating archive presence as canon truth.
  - When `agent_upload_authority` is `codex_skill_auto_sync`, an approved Codex skill or Google Drive connector may upload or sync bounded archive files without per-file owner confirmation.
  - Automatic upload/sync still must reject secrets, credentials, unsupported private payloads, ZIP-as-truth storage, and files outside the declared archive policy.
  - Public workflow canon stores only portable orchestration rules, source-state semantics, and output-shape templates.
  - Public workflow files must not contain datasheet text, model payloads, raw XML, private project values, runtime absolute paths, credentials, cookies, sessions, or private run truth.


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: official_source_packet_collect_v0
kind: step_graph
status: active
steps:
  - step_id: prepare_source_scope_binding
    title: Prepare Source Scope Binding
    actor_slot: workflow_runner
    action:
      kind: project_local_source_binding_setup
      requires:
        - source_collection_binding
        - identifier_scope
        - approved_source_policy
      validates:
        - output_root_is_project_local_or_private_workmeta
        - public_package_contains_no_payloads
        - source_policy_declares_official_and_owner_local_rules
        - owner_held_archive_policy_declared_when_remote_archive_requested
        - codex_skill_auto_sync_scope_declared_when_enabled
        - no_runtime_absolute_paths_in_public_package
      creates:
        - source_packet_output_root
        - collection_run_log_root
    summary: Resolve the project-local packet destination and source policy before any lookup, download, reuse, or downstream readiness claim.
    next:
      on_success: extract_source_identifiers
      on_fail: stop
  - step_id: extract_source_identifiers
    title: Extract Source Identifiers
    actor_slot: source_scope_collector
    action:
      kind: conservative_identifier_inventory
      artifacts_in:
        - identifier_scope
        - page_module_sidecars
        - capture_intake_packets
        - component_inventory
        - existing_source_packets
      artifact_out: identifier_inventory
      records:
        - identifier_id
        - identifier_kind
        - display_value
        - source_basis
        - confidence_state
        - requested_source_kinds
        - downstream_consumers
      forbidden_basis:
        - hidden_reference_oracle
        - verifier_report
        - previous_candidate_repair_packet
        - secret_or_session_state
    summary: Build a bounded identifier list from approved non-oracle inputs, preserving weak or ambiguous identities as review states.
    next:
      on_success: discover_or_index_official_sources
      on_fail: stop
  - step_id: discover_or_index_official_sources
    title: Discover Or Index Official Sources
    actor_slot: official_source_researcher
    action:
      kind: official_source_discovery_or_owner_local_index
      artifact_in: identifier_inventory
      artifacts_out:
        - source_inventory_draft
        - download_or_reuse_manifest_draft
        - owner_held_source_archive_manifest_draft
      source_kinds:
        - datasheet
        - evaluation_board_or_reference_design
        - application_note_or_design_guide
        - simulation_model
        - ecad_model
        - layout_or_package_document
        - standard_or_tool_document
        - other_owner_requested_source
      allowed_sources:
        - manufacturer_or_authoritative_publisher_page
        - standards_body_or_tool_vendor_page
        - owner_approved_local_official_copy
        - owner_approved_local_library_metadata
        - existing_or_user_provided_oracle_free_source_packet
      records_for_each_candidate:
        - publisher
        - title
        - url_or_project_local_path
        - revision_or_date_when_available
        - access_date
        - approval_scope
        - blocker_if_any
        - public_summary_allowed
      forbidden_sources:
        - random_mirror
        - forum_or_search_snippet_as_authority
        - unapproved_model_aggregator
        - account_bound_download_without_owner_supplied_file
        - raw_project_payload
    summary: Search official channels or index owner-approved local official sources without treating unapproved mirrors or blocked downloads as complete evidence.
    next:
      on_success: classify_source_states
      on_fail: stop
  - step_id: classify_source_states
    title: Classify Source States
    actor_slot: source_state_classifier
    action:
      kind: provenance_first_source_state_partition
      artifacts_in:
        - identifier_inventory
        - source_inventory_draft
        - download_or_reuse_manifest_draft
        - owner_held_source_archive_manifest_draft
      artifacts_out:
        - source_inventory
        - source_gap_report
        - owner_followup_needed
      source_states:
        official_present:
          criteria:
            - authoritative_publisher_confirmed
            - enough_provenance_to_relocate
            - claims_supported_are_named
        owner_approved_local:
          criteria:
            - owner_approval_scope_recorded
            - local_or_project_path_is_portable
            - executor_use_scope_is_explicit
        missing:
          criteria:
            - requested_source_kind_searched
            - no_acceptable_source_found
            - downstream_impact_recorded
        blocked:
          criteria:
            - source_may_exist_but_access_or_terms_block_use
            - blocker_type_and_owner_action_recorded
        not_applicable:
          criteria:
            - source_kind_does_not_apply
            - reason_recorded
        candidate_official:
          criteria:
            - source_looks_authoritative_but_identity_or_revision_needs_confirmation
        third_party_unapproved:
          criteria:
            - source_found_outside_authoritative_or_owner_approved_channels
        conflicting:
          criteria:
            - official_or_official_looking_sources_disagree
      executor_approval_rule: only_official_present_or_owner_approved_local_may_be_approved_for_executor
    summary: Partition every requested source into explicit evidence or gap states, making uncertainty and owner follow-up first-class output.
    next:
      on_success: write_source_packet_bundle
      on_fail: stop
  - step_id: write_source_packet_bundle
    title: Write Source Packet Bundle
    actor_slot: packet_manifest_writer
    action:
      kind: source_packet_bundle_write
      artifacts_in:
        - identifier_inventory
        - source_inventory
        - source_gap_report
        - owner_followup_needed
        - download_or_reuse_manifest_draft
        - owner_held_source_archive_manifest_draft
      artifacts_out:
        - source_packet_manifest
        - source_inventory
        - source_gap_report
        - owner_followup_needed
        - download_or_reuse_manifest
        - owner_held_source_archive_manifest
      required_sections:
        - packet_identity
        - approval
        - scope
        - source_state_summary
        - source_inventory
        - source_gap_report
        - owner_followup_needed
        - download_or_reuse_manifest
        - owner_held_source_archive_manifest
        - boundary_notes
      write_policy:
        write_project_local_packet_only: true
        do_not_copy_raw_vendor_payload_to_public_canon: true
        do_not_embed_secret_or_session_material: true
        codex_skill_auto_sync_allowed_when_declared: true
        per_file_owner_confirmation_not_required_when_declared: true
    summary: Materialize the reusable project-local packet shape with explicit provenance, gap, blocker, and owner-action sections.
    next:
      on_success: partition_downstream_ready_refs
      on_fail: stop
  - step_id: partition_downstream_ready_refs
    title: Partition Downstream Ready Refs
    actor_slot: downstream_readiness_reviewer
    action:
      kind: downstream_source_dependency_partition
      artifacts_in:
        - source_packet_manifest
        - source_inventory
        - source_gap_report
      artifact_out: downstream_ready_refs
      downstream_consumers:
        materials:
          ready_requires:
            - approved_datasheet_or_owner_exception
            - unresolved_identity_gaps_absent_or_review_only
        layout:
          ready_requires:
            - package_or_layout_doc_or_recorded_layout_gap
            - no_layout_claim_without_source_refs
        simulation:
          ready_requires:
            - model_availability_or_missing_blocked_record
            - simulator_format_and_terms_when_present
        ecad:
          ready_requires:
            - symbol_footprint_3d_source_status_recorded
            - license_or_owner_local_scope_when_present
        harness:
          ready_requires:
            - source_gaps_and_blockers_visible
            - quantitative_or_model_gaps_not_hidden
      readiness_states:
        - ready
        - review_only
        - blocked
        - not_applicable
    summary: Convert source evidence and gaps into explicit readiness refs for downstream materials, layout, simulation, ECAD, and harness workflows.
    next:
      on_success: boundary_and_followup_review
      on_fail: stop
  - step_id: boundary_and_followup_review
    title: Boundary And Follow-Up Review
    actor_slot: boundary_reviewer
    action:
      kind: public_private_boundary_and_overclaim_review
      artifacts_in:
        - source_packet_manifest
        - source_inventory
        - source_gap_report
        - owner_followup_needed
        - download_or_reuse_manifest
        - owner_held_source_archive_manifest
        - downstream_ready_refs
      artifact_out: boundary_review_note
      checks:
        - official_and_owner_local_states_are_explicit
        - missing_blocked_not_applicable_states_have_reasons
        - provenance_fields_present_for_executor_approved_sources
        - owner_followup_is_structured
        - downstream_readiness_does_not_overclaim
        - owner_archive_manifest_distinguishes_inbox_candidate_working_canon_blocked
        - remote_archive_presence_not_treated_as_source_or_canon_authority
        - codex_skill_auto_sync_stays_inside_declared_archive_policy
        - no_raw_payloads_or_runtime_absolute_paths_in_public_package
        - no_secret_or_account_state_requested_from_agent
    summary: Confirm the packet can be safely handed to downstream workflows or stop with exact owner follow-up needed.
    next:
      on_success: complete
      on_fail: stop


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "schema_version": "gpt56_portfolio_gate_fixture_v1",
  "workflow_id": "official_source_packet_collect_v0",
  "fixture_id": "public_synthetic_mixed_source_states",
  "public_safe": true,
  "request": "Build a dry-run official source packet for the synthetic identifiers, classify each requested source kind, and partition downstream readiness. Do not browse, download, upload, or read local files.",
  "inputs": {
    "source_collection_binding": "fixture://source_packets/demo_board",
    "identifier_scope": [
      {
        "identifier_id": "ID-A",
        "identifier_kind": "component",
        "display_value": "ACME-100",
        "requested_source_kinds": [
          "datasheet",
          "layout_or_package_document",
          "simulation_model"
        ],
        "downstream_consumers": [
          "materials",
          "layout",
          "simulation"
        ]
      },
      {
        "identifier_id": "ID-B",
        "identifier_kind": "tool",
        "display_value": "SYNTH-TOOL",
        "requested_source_kinds": [
          "standard_or_tool_document"
        ],
        "downstream_consumers": [
          "harness"
        ]
      }
    ],
    "approved_source_policy": {
      "official_publishers": [
        "ACME Devices",
        "Synth Tool Foundation"
      ],
      "owner_local_use_requires_explicit_scope": true,
      "network_execution_allowed": false
    },
    "owner_approved_local_source_manifest": [
      {
        "identifier_id": "ID-B",
        "source_kind": "standard_or_tool_document",
        "title": "Synth Tool Format Guide",
        "root_relative_ref": "owner-local://docs/synth-format-guide.pdf",
        "owner_approval_scope": "executor_for_fixture",
        "public_summary_allowed": true,
        "checksum": "sha256:fixture-tool-guide"
      }
    ],
    "existing_source_packets": [
      {
        "identifier_id": "ID-A",
        "source_kind": "datasheet",
        "publisher": "ACME Devices",
        "title": "ACME-100 Data Sheet",
        "canonical_url": "https://example.invalid/acme/acme-100",
        "revision": "R2",
        "access_date": "2026-07-10",
        "claims_supported": [
          "identity",
          "electrical limits"
        ],
        "state": "official_present"
      },
      {
        "identifier_id": "ID-A",
        "source_kind": "layout_or_package_document",
        "publisher": "Unknown mirror",
        "title": "ACME-100 Layout Notes",
        "state": "third_party_unapproved"
      },
      {
        "identifier_id": "ID-A",
        "source_kind": "simulation_model",
        "state": "blocked",
        "blocker": "account-bound download unavailable",
        "searched_locations_or_access_attempts": [
          "fixture://official/acme/simulation-model-download"
        ],
        "downstream_impact": "simulation readiness remains blocked",
        "required_next_action": "owner supplies an approved local model or separately authorizes an acceptable access route"
      }
    ],
    "owner_held_archive_policy": {
      "requested": false
    }
  },
  "requested_deliverable": [
    "identifier inventory",
    "source inventory with explicit states and minimum provenance",
    "source gap and structured owner follow-up",
    "download/reuse and archive manifests",
    "materials/layout/simulation/harness readiness refs",
    "boundary review"
  ],
  "prohibitions": [
    "no mirror promotion, silent owner-local approval, executor approval for weak states, network or archive action, payload copy, or source-truth claim beyond supplied evidence"
  ],
  "boundary_attestation": "All publishers, identifiers, URLs, refs, checksums, and records are synthetic."
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
