You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-sol; reasoning_effort=low; species=dwarf; class=auditor.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: simulation_source_collect_v0
kind: workflow
status: active
title: Simulation Source Collect v0
summary: Collect or index official, tool-library, and owner-approved simulation source assets before any simulation deck preparation, execution, or run verification workflow claims model readiness.
entrypoint: run
execution_mode: local_tool_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
inputs:
  - simulation_source_binding
  - model_need_scope
  - approved_model_source_policy
optional_inputs:
  - official_source_packet_refs
  - component_inventory
  - page_module_sidecars
  - quantitative_enrichment_packet
  - layout_guide_packets
  - harness_priority_packet
  - owner_approved_local_model_manifest
  - tool_library_manifest
  - simulator_policy
outputs:
  - simulation_source_packet
  - model_inventory
  - model_file_manifest
  - demo_circuit_manifest
  - simulator_compatibility_matrix
  - missing_models
  - access_blockers
  - owner_followup_needed
  - downstream_handoff
  - boundary_review_note
validation_level: pilot_executed_private_fixture
registration_policy: owner_requested_registration
upstream_workflows:
  - workflow_id: official_source_packet_collect_v0
    expected_outputs:
      - source_inventory
      - source_gap_report
      - owner_followup_needed
      - downstream_ready_refs
  - workflow_id: exp_xml_component_materials
    expected_outputs:
      - component_inventory
      - source_discovery_packet
      - download_manifest
  - workflow_id: page_quantitative_enrichment_v0
    expected_outputs:
      - quantitative_claims
      - harness_readiness_delta
    optional: true
  - workflow_id: component_pcb_layout_guide_extraction
    expected_outputs:
      - layout_guide_source_gap_packet
      - source_map
    optional: true
downstream_workflows:
  - workflow_id: simulation_deck_prepare_v0
    expected_input: approved_model_refs_demo_circuit_refs_and_blocked_deck_reasons
    status: planned
  - workflow_id: simulation_run_verify_v0
    expected_input: runnable_deck_availability_simulator_policy_and_run_blockers
    status: planned
  - workflow_id: page_quantitative_enrichment_v0
    expected_input: numeric_model_collateral_refs_only_when_source_supported
  - workflow_id: xml_harness_composition_v0
    expected_input: model_availability_summary_missing_model_gaps_and_no_simulation_claims
  - workflow_id: source_gap_followup_packet_v0
    expected_input: missing_models_access_blockers_and_owner_followup_needed
  - workflow_id: library_catalog_index_v0
    expected_input: simulation_model_readiness_index
    status: planned
simulation_source_contract:
  owns:
    - simulation_model_need_inventory
    - model_source_provenance_index
    - model_file_manifest
    - demo_circuit_manifest
    - simulator_compatibility_evidence_matrix
    - missing_model_gap_records
    - access_blocker_records
    - owner_followup_queue
    - downstream_handoff_for_deck_prepare_run_verify_quantitative_and_harness_lanes
  does_not_own:
    - simulation_deck_generation
    - simulator_execution
    - waveform_or_metric_verification
    - model_conversion
    - synthetic_model_creation
    - source_document_authority_replacement
    - harness_connection_promotion
  model_families:
    - pspice
    - ltspice
    - generic_spice
    - ngspice
    - kicad_ngspice
    - simplis
    - spectre
    - verilog_a
    - verilog_ams
    - ibis
    - ibis_ami
    - s_parameter
    - demo_circuit
    - vendor_tool_package
    - other
  source_statuses:
    executor_approved:
      - official_present
      - owner_approved_local
      - tool_library_official
    review_or_gap:
      - candidate_official
      - third_party_unapproved
      - missing
      - blocked
      - conflicting
      - not_applicable
  compatibility_statuses:
    declared_or_tested:
      - declared_supported
      - declared_unsupported
      - syntax_check_passed
      - import_failed
    conservative_unverified:
      - likely_supported_unverified
      - requires_conversion
      - not_tested
      - not_applicable
    blocker_states:
      - blocked_by_license
      - blocked_by_missing_dependency
  compatibility_basis:
    - vendor_declared
    - tool_library_metadata
    - owner_tested
    - agent_smoke_test
    - file_format_only
    - unknown
  approval_rule: Only `official_present`, `owner_approved_local`, and `tool_library_official` models may become executor-approved, and only when terms, dependency, and simulator-scope evidence is recorded.
  no_model_invention: true
  no_guessing_rule: File extension, part name, package family, or search snippet alone cannot create a model record, compatibility claim, deck-ready state, or run-ready state.
required_output_shapes:
  simulation_source_packet: templates/simulation_source_packet.template.yaml
  model_inventory: templates/model_inventory.template.yaml
  model_file_manifest: templates/model_file_manifest.template.yaml
  demo_circuit_manifest: templates/demo_circuit_manifest.template.yaml
  simulator_compatibility_matrix: templates/simulator_compatibility_matrix.template.yaml
  missing_models: templates/missing_models.template.yaml
  access_blockers: templates/access_blockers.template.yaml
  owner_followup_needed: templates/owner_followup_needed.template.yaml
  downstream_handoff: templates/downstream_handoff.template.yaml
notes:
  - This workflow is explicitly pre-deck and pre-run/verify. It may write readiness and blocker packets, but it does not generate netlists, write testbenches, run simulators, or verify waveforms.
  - The correct v0 result may be mostly missing or blocked model states. That is successful when it prevents downstream workflows from inventing models or pretending unsupported decks are runnable.
  - Public workflow canon stores only portable orchestration rules, state semantics, and output-shape templates.
  - Model files, vendor archives, extracted model payloads, run outputs, tool caches, local library contents, private project values, credentials, cookies, sessions, and raw run truth do not belong in `.workflow`.


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: simulation_source_collect_v0
kind: step_graph
status: active
steps:
  - step_id: prepare_simulation_source_binding
    title: Prepare Simulation Source Binding
    actor_slot: workflow_runner
    action:
      kind: project_local_simulation_source_binding_setup
      requires:
        - simulation_source_binding
        - model_need_scope
        - approved_model_source_policy
      validates:
        - output_root_is_project_local_or_private_workmeta
        - workflow_is_pre_deck_and_pre_run_verify
        - source_policy_declares_official_owner_local_and_tool_library_rules
        - no_runtime_absolute_paths_in_public_package
        - no_raw_model_payloads_in_public_package
      creates:
        - simulation_source_output_root
        - collection_run_log_root
    summary: Resolve the private or project-local packet destination, source approval policy, model-family request, and simulator policy before any discovery or indexing work begins.
    next:
      on_success: build_model_need_inventory
      on_fail: stop
  - step_id: build_model_need_inventory
    title: Build Model Need Inventory
    actor_slot: model_need_collector
    action:
      kind: conservative_model_need_inventory
      artifacts_in:
        - model_need_scope
        - official_source_packet_refs
        - component_inventory
        - page_module_sidecars
        - quantitative_enrichment_packet
        - harness_priority_packet
      artifact_out: model_need_inventory
      records:
        - model_need_id
        - component_ref
        - manufacturer_part_number
        - page_asset_refs
        - interface_refs
        - requested_model_families
        - needed_for
        - priority_basis
        - source_identifier_refs
      requested_model_families:
        - pspice
        - ltspice
        - generic_spice
        - ibis
        - ibis_ami
        - s_parameter
        - demo_circuit
      forbidden_basis:
        - hidden_reference_oracle
        - verifier_report
        - previous_candidate_repair_packet
        - secret_or_session_state
        - deck_pressure_without_source_identity
    summary: Build a bounded list of model needs from approved non-oracle source and page/component context, preserving ambiguous or missing identifiers instead of filling gaps by guess.
    next:
      on_success: discover_or_index_model_sources
      on_fail: stop
  - step_id: discover_or_index_model_sources
    title: Discover Or Index Model Sources
    actor_slot: model_source_researcher
    action:
      kind: official_tool_or_owner_local_model_source_discovery
      artifact_in: model_need_inventory
      artifacts_out:
        - model_source_candidates
        - model_file_manifest_draft
        - demo_circuit_manifest_draft
      allowed_sources:
        - manufacturer_or_authoritative_publisher_page
        - standards_body_or_tool_vendor_page
        - owner_approved_local_model_manifest
        - owner_approved_local_library_metadata
        - installed_tool_library_manifest_approved_by_policy
        - existing_or_user_provided_oracle_free_source_packet
      model_source_families:
        - pspice
        - ltspice
        - generic_spice
        - ngspice
        - kicad_ngspice
        - simplis
        - spectre
        - verilog_a
        - verilog_ams
        - ibis
        - ibis_ami
        - s_parameter
        - demo_circuit
        - vendor_tool_package
        - other
      records_for_each_candidate:
        - publisher
        - title
        - canonical_url_or_owner_local_ref
        - model_revision
        - component_revision
        - publication_date
        - access_date
        - license_or_terms_note
        - blocker_if_any
        - required_dependency_refs
        - public_summary_allowed
      forbidden_sources:
        - random_mirror_as_authority
        - forum_upload_as_authority
        - search_snippet_as_model_evidence
        - account_bound_download_without_owner_supplied_file
        - unapproved_third_party_bundle
        - raw_project_payload_for_public_canon
    summary: Search official channels or index owner-approved local/tool-library sources without treating mirrors, blocked downloads, or file names as model truth.
    next:
      on_success: classify_model_and_file_states
      on_fail: stop
  - step_id: classify_model_and_file_states
    title: Classify Model And File States
    actor_slot: model_state_classifier
    action:
      kind: provenance_first_model_state_partition
      artifacts_in:
        - model_need_inventory
        - model_source_candidates
        - model_file_manifest_draft
        - demo_circuit_manifest_draft
      artifacts_out:
        - model_inventory
        - model_file_manifest
        - demo_circuit_manifest
        - missing_models
        - access_blockers
        - owner_followup_needed
      model_statuses:
        official_present:
          criteria:
            - authoritative_publisher_confirmed
            - target_component_or_interface_identity_recorded
            - model_family_and_source_provenance_recorded
        owner_approved_local:
          criteria:
            - owner_approval_scope_recorded
            - local_or_project_path_is_private_or_project_local
            - executor_use_scope_is_explicit
        tool_library_official:
          criteria:
            - tool_or_simulator_library_identity_recorded
            - tool_version_or_library_version_recorded_when_available
            - owner_policy_allows_indexing_or_use
        candidate_official:
          criteria:
            - source_looks_authoritative_but_identity_revision_terms_or_package_need_confirmation
        third_party_unapproved:
          criteria:
            - source_found_outside_authoritative_or_owner_approved_channels
        missing:
          criteria:
            - requested_model_family_searched
            - no_acceptable_source_found
            - downstream_impact_recorded
        blocked:
          criteria:
            - source_may_exist_but_access_terms_license_format_tool_or_owner_approval_blocks_use
        conflicting:
          criteria:
            - plausible_models_disagree_on_identity_package_revision_family_or_behavior
        not_applicable:
          criteria:
            - model_family_not_expected_for_target
            - rationale_recorded
      executor_approval_rule: only_official_present_owner_approved_local_or_tool_library_official_may_be_approved_for_executor
    summary: Make positive, missing, blocked, conflicting, and not-applicable model states equally explicit, with file-level handling rules and owner follow-up where needed.
    next:
      on_success: build_compatibility_matrix
      on_fail: stop
  - step_id: build_compatibility_matrix
    title: Build Compatibility Matrix
    actor_slot: compatibility_reviewer
    action:
      kind: simulator_compatibility_evidence_partition
      artifacts_in:
        - model_inventory
        - model_file_manifest
        - demo_circuit_manifest
        - simulator_policy
      artifact_out: simulator_compatibility_matrix
      simulator_families:
        - pspice
        - ltspice
        - ngspice
        - kicad_ngspice
        - simplis
        - spectre
        - vendor_tool
        - ibis_parser
        - signal_integrity_tool
        - other
      compatibility_statuses:
        - declared_supported
        - declared_unsupported
        - likely_supported_unverified
        - requires_conversion
        - blocked_by_license
        - blocked_by_missing_dependency
        - import_failed
        - syntax_check_passed
        - not_tested
        - not_applicable
      compatibility_basis:
        - vendor_declared
        - tool_library_metadata
        - owner_tested
        - agent_smoke_test
        - file_format_only
        - unknown
      rules:
        - file_extension_alone_cannot_mark_declared_supported
        - collection_v0_does_not_require_simulator_execution
        - safe_import_or_syntax_smoke_test_may_be_recorded_only_when_allowed
        - conversion_allowed_must_have_owner_or_source_basis
        - not_tested_is_preferred_over_guessing
    summary: Record declared, tested, blocked, conversion, and untested compatibility states without upgrading readiness from file names alone.
    next:
      on_success: write_simulation_source_packet
      on_fail: stop
  - step_id: write_simulation_source_packet
    title: Write Simulation Source Packet
    actor_slot: packet_manifest_writer
    action:
      kind: simulation_source_packet_bundle_write
      artifacts_in:
        - model_need_inventory
        - model_inventory
        - model_file_manifest
        - demo_circuit_manifest
        - simulator_compatibility_matrix
        - missing_models
        - access_blockers
        - owner_followup_needed
      artifacts_out:
        - simulation_source_packet
        - model_inventory
        - model_file_manifest
        - demo_circuit_manifest
        - simulator_compatibility_matrix
        - missing_models
        - access_blockers
        - owner_followup_needed
      required_sections:
        - packet_identity
        - approval
        - target_scope
        - source_policy
        - readiness
        - output_refs
        - boundary_notes
      write_policy:
        write_project_local_packet_only: true
        do_not_copy_raw_vendor_or_model_payload_to_public_canon: true
        do_not_embed_secret_or_session_material: true
        do_not_generate_simulation_deck: true
        do_not_run_simulation: true
    summary: Materialize the project-local packet bundle with explicit model inventory, files, demo circuits, compatibility, gaps, blockers, and follow-up.
    next:
      on_success: write_downstream_handoff
      on_fail: stop
  - step_id: write_downstream_handoff
    title: Write Downstream Handoff
    actor_slot: downstream_handoff_writer
    action:
      kind: conservative_simulation_source_handoff
      artifacts_in:
        - simulation_source_packet
        - model_inventory
        - model_file_manifest
        - demo_circuit_manifest
        - simulator_compatibility_matrix
        - missing_models
        - access_blockers
        - owner_followup_needed
      artifact_out: downstream_handoff
      consumers:
        simulation_deck_prepare:
          allowed_inputs:
            - approved_for_executor_model_ids
            - demo_circuit_ids_with_reuse_limits
            - compatibility_caveats
          must_block_on:
            - missing_required_model
            - blocked_required_model
            - unsupported_or_unapproved_conversion
            - missing_required_dependency
        simulation_run_verify:
          allowed_inputs:
            - runnable_deck_available_false_by_default
            - simulator_policy_ref
            - setup_evidence_refs
          must_not_claim:
            - simulation_pass_fail
            - waveform_validity
        quantitative_enrichment:
          allowed_inputs:
            - source_supported_numeric_collateral_refs
          must_not_extract:
            - behavioral_values_from_unrun_models
        harness:
          allowed_inputs:
            - model_availability_summary
            - missing_and_blocked_model_context
          must_not_claim:
            - final_harness_connection_validity
            - source_supported_join_promotion
    summary: Convert model evidence and gaps into conservative downstream readiness without creating decks, run results, or harness approvals.
    next:
      on_success: boundary_and_overclaim_review
      on_fail: stop
  - step_id: boundary_and_overclaim_review
    title: Boundary And Overclaim Review
    actor_slot: boundary_reviewer
    action:
      kind: public_private_boundary_and_simulation_overclaim_review
      artifacts_in:
        - simulation_source_packet
        - model_inventory
        - model_file_manifest
        - demo_circuit_manifest
        - simulator_compatibility_matrix
        - missing_models
        - access_blockers
        - owner_followup_needed
        - downstream_handoff
      artifact_out: boundary_review_note
      checks:
        - model_source_states_are_explicit
        - missing_models_are_first_class_outputs
        - blocked_access_is_not_hidden_as_missing
        - compatibility_basis_is_recorded_for_each_claim
        - no_model_or_deck_is_invented
        - no_simulation_deck_or_run_result_is_written
        - owner_followup_is_specific
        - downstream_handoff_preserves_blockers
        - no_raw_payloads_or_runtime_absolute_paths_in_public_package
        - no_secret_or_account_state_requested_from_agent
    summary: Confirm the packet is safe for downstream pre-deck use or stop with exact owner follow-up and source-gap records.
    next:
      on_success: complete
      on_fail: stop


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "fixture_id": "simulation_source_collect_v0_public_fixture_mixed_model_states",
  "workflow_id": "simulation_source_collect_v0",
  "public_safe": true,
  "purpose": "Exercise source-state classification, compatibility caution, downstream handoff, and boundary review without using private project inputs or raw model payloads.",
  "simulation_source_binding": {
    "project_code": "PUBLIC_FIXTURE",
    "run_id": "calibration_public_fixture",
    "output_root_policy": "project_local_or_private_workmeta_only",
    "public_archive_policy": "summary_and_orchestration_only_no_model_payloads"
  },
  "approved_model_source_policy": {
    "accepted_executor_sources": [
      "manufacturer_or_authoritative_publisher_page",
      "owner_approved_local_manifest",
      "tool_library_manifest_approved_by_policy"
    ],
    "rejected_executor_sources": [
      "random_mirror",
      "forum_upload",
      "search_snippet",
      "account_bound_download_without_owner_supplied_file"
    ],
    "blocked_access_handling": "record_blocked_and_owner_followup",
    "no_secret_handling_by_agent": true,
    "no_raw_payload_in_public_archive": true
  },
  "simulator_policy": {
    "target_simulators": [
      "ltspice",
      "ngspice",
      "ibis_parser"
    ],
    "smoke_test_allowed": false,
    "conversion_allowed_without_owner_basis": false
  },
  "model_need_scope": {
    "components": [
      {
        "component_ref": "U1",
        "manufacturer_part_number": "FIXTURE-OPAMP-01",
        "requested_model_families": [
          "ltspice",
          "pspice",
          "demo_circuit"
        ],
        "needed_for": [
          "simulation_deck_prepare",
          "run_verify_setup"
        ],
        "source_identifier_refs": [
          "official_source_packet:fixture-opamp-product-page"
        ]
      },
      {
        "component_ref": "J1",
        "manufacturer_part_number": "FIXTURE-CONN-HS-02",
        "requested_model_families": [
          "s_parameter",
          "ibis"
        ],
        "needed_for": [
          "signal_integrity_review",
          "harness_strengthening_context"
        ],
        "source_identifier_refs": [
          "official_source_packet:fixture-connector-product-page"
        ]
      },
      {
        "component_ref": "M1",
        "manufacturer_part_number": "FIXTURE-POWER-MODULE-03",
        "requested_model_families": [
          "pspice",
          "simplis",
          "demo_circuit"
        ],
        "needed_for": [
          "simulation_deck_prepare",
          "quantitative_enrichment_context"
        ],
        "source_identifier_refs": [
          "official_source_packet:fixture-power-module-datasheet"
        ]
      }
    ]
  },
  "official_source_packet_refs": [
    {
      "ref_id": "official_source_packet:fixture-opamp-product-page",
      "summary": "Authoritative manufacturer page states an LTspice macromodel and demo circuit are available for FIXTURE-OPAMP-01, with reuse allowed for evaluation.",
      "allowed_public_summary": true
    },
    {
      "ref_id": "official_source_packet:fixture-connector-product-page",
      "summary": "Authoritative manufacturer page names signal-integrity assets but download requires login and export-control acknowledgement.",
      "allowed_public_summary": true
    },
    {
      "ref_id": "official_source_packet:fixture-power-module-datasheet",
      "summary": "Datasheet mentions typical curves but no simulation model, demo circuit, or package-level source is identified.",
      "allowed_public_summary": true
    }
  ],
  "owner_approved_local_model_manifest": [],
  "tool_library_manifest": [],
  "expected_behavior": {
    "opamp": "official_present for LTspice/demo-circuit evidence, executor-approved only if terms and dependency notes are recorded; compatibility may be vendor_declared but not smoke-tested.",
    "connector": "blocked or candidate_official, not executor-approved, because login/export-control access prevents agent retrieval; owner_followup_needed is required.",
    "power_module": "missing for requested model families, with downstream deck_prepare blocked if required model is absent.",
    "global": "No deck, netlist, model conversion, simulation run, waveform claim, raw model payload, credential request, or runtime absolute path should appear."
  }
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
