simulation_source_packet:
  packet_identity:
    workflow_id: simulation_source_collect_v0
    fixture_id: simulation_source_collect_v0_public_fixture_mixed_model_states
    project_code: PUBLIC_FIXTURE
    run_id: calibration_public_fixture
    public_safe: true
    phase: pre_deck_pre_run_verify
  approval:
    packet_status: blocked_for_deck_and_run
    approved_for_executor_model_ids: []
    reason: >-
      Authoritative availability evidence exists for selected U1 assets, but
      model-file identity, dependency details, and complete terms evidence are
      not supplied. J1 assets are access-blocked, and M1 models are missing.
  target_scope:
    component_refs:
      - U1
      - J1
      - M1
    target_simulators:
      - ltspice
      - ngspice
      - ibis_parser
  source_policy:
    accepted_executor_sources:
      - manufacturer_or_authoritative_publisher_page
      - owner_approved_local_manifest
      - tool_library_manifest_approved_by_policy
    rejected_executor_sources:
      - random_mirror
      - forum_upload
      - search_snippet
      - account_bound_download_without_owner_supplied_file
    smoke_test_allowed: false
    conversion_allowed_without_owner_basis: false
    no_secret_handling_by_agent: true
    no_raw_payload_in_public_archive: true
  readiness:
    model_source_collection: incomplete
    deck_prepare: blocked
    runnable_deck_available: false
    run_verify: blocked
    approved_model_count: 0
    official_present_unapproved_count: 2
    blocked_model_need_count: 2
    missing_model_need_count: 3
  output_refs:
    model_inventory: model_inventory
    model_file_manifest: model_file_manifest
    demo_circuit_manifest: demo_circuit_manifest
    simulator_compatibility_matrix: simulator_compatibility_matrix
    missing_models: missing_models
    access_blockers: access_blockers
    owner_followup_needed: owner_followup_needed
    downstream_handoff: downstream_handoff
    boundary_review_note: boundary_review_note
  boundary_notes:
    - No raw model or vendor-package payload is included.
    - No runtime absolute path, credential, cookie, session, or account state is included.
    - No deck, netlist, testbench, conversion, import, syntax check, or simulation result is claimed.
    - Authoritative availability statements do not establish file-level readiness.
    - Unknown model revisions, dependencies, and compatibility remain explicit.

model_need_inventory:
  - model_need_id: NEED-U1-LTSPICE
    component_ref: U1
    manufacturer_part_number: FIXTURE-OPAMP-01
    requested_model_family: ltspice
    needed_for:
      - simulation_deck_prepare
      - run_verify_setup
    priority_basis: explicitly_requested_for_deck_and_run_setup
    source_identifier_refs:
      - official_source_packet:fixture-opamp-product-page
  - model_need_id: NEED-U1-PSPICE
    component_ref: U1
    manufacturer_part_number: FIXTURE-OPAMP-01
    requested_model_family: pspice
    needed_for:
      - simulation_deck_prepare
      - run_verify_setup
    priority_basis: explicitly_requested_for_deck_and_run_setup
    source_identifier_refs:
      - official_source_packet:fixture-opamp-product-page
  - model_need_id: NEED-U1-DEMO
    component_ref: U1
    manufacturer_part_number: FIXTURE-OPAMP-01
    requested_model_family: demo_circuit
    needed_for:
      - simulation_deck_prepare
      - run_verify_setup
    priority_basis: explicitly_requested_for_deck_and_run_setup
    source_identifier_refs:
      - official_source_packet:fixture-opamp-product-page
  - model_need_id: NEED-J1-SPARAM
    component_ref: J1
    manufacturer_part_number: FIXTURE-CONN-HS-02
    requested_model_family: s_parameter
    needed_for:
      - signal_integrity_review
      - harness_strengthening_context
    priority_basis: explicitly_requested_for_signal_integrity_context
    source_identifier_refs:
      - official_source_packet:fixture-connector-product-page
  - model_need_id: NEED-J1-IBIS
    component_ref: J1
    manufacturer_part_number: FIXTURE-CONN-HS-02
    requested_model_family: ibis
    needed_for:
      - signal_integrity_review
      - harness_strengthening_context
    priority_basis: explicitly_requested_for_signal_integrity_context
    source_identifier_refs:
      - official_source_packet:fixture-connector-product-page
  - model_need_id: NEED-M1-PSPICE
    component_ref: M1
    manufacturer_part_number: FIXTURE-POWER-MODULE-03
    requested_model_family: pspice
    needed_for:
      - simulation_deck_prepare
      - quantitative_enrichment_context
    priority_basis: explicitly_requested_for_deck_and_quantitative_context
    source_identifier_refs:
      - official_source_packet:fixture-power-module-datasheet
  - model_need_id: NEED-M1-SIMPLIS
    component_ref: M1
    manufacturer_part_number: FIXTURE-POWER-MODULE-03
    requested_model_family: simplis
    needed_for:
      - simulation_deck_prepare
      - quantitative_enrichment_context
    priority_basis: explicitly_requested_for_deck_and_quantitative_context
    source_identifier_refs:
      - official_source_packet:fixture-power-module-datasheet
  - model_need_id: NEED-M1-DEMO
    component_ref: M1
    manufacturer_part_number: FIXTURE-POWER-MODULE-03
    requested_model_family: demo_circuit
    needed_for:
      - simulation_deck_prepare
      - quantitative_enrichment_context
    priority_basis: explicitly_requested_for_deck_and_quantitative_context
    source_identifier_refs:
      - official_source_packet:fixture-power-module-datasheet

model_inventory:
  - model_id: MODEL-U1-LTSPICE
    model_need_id: NEED-U1-LTSPICE
    component_ref: U1
    manufacturer_part_number: FIXTURE-OPAMP-01
    model_family: ltspice
    source_status: official_present
    publisher: synthetic_authoritative_manufacturer
    title: FIXTURE-OPAMP-01 LTspice macromodel
    canonical_source_ref: official_source_packet:fixture-opamp-product-page
    model_revision: unknown
    component_revision: unknown
    publication_date: unknown
    access_date: unknown
    license_or_terms_note: evaluation_reuse_stated_in_supplied_source_summary
    required_dependency_refs: unknown
    executor_approved: false
    approval_blockers:
      - model_file_identity_not_supplied
      - dependency_requirements_not_recorded
      - detailed_terms_not_supplied
    public_summary_allowed: true
  - model_id: MODEL-U1-PSPICE
    model_need_id: NEED-U1-PSPICE
    component_ref: U1
    manufacturer_part_number: FIXTURE-OPAMP-01
    model_family: pspice
    source_status: missing
    publisher: unknown
    title: unknown
    canonical_source_ref: official_source_packet:fixture-opamp-product-page
    executor_approved: false
    rationale: supplied_authoritative_summary_identifies_LTspice_only
  - model_id: MODEL-U1-DEMO
    model_need_id: NEED-U1-DEMO
    component_ref: U1
    manufacturer_part_number: FIXTURE-OPAMP-01
    model_family: demo_circuit
    source_status: official_present
    publisher: synthetic_authoritative_manufacturer
    title: FIXTURE-OPAMP-01 demo circuit
    canonical_source_ref: official_source_packet:fixture-opamp-product-page
    model_revision: unknown
    component_revision: unknown
    publication_date: unknown
    access_date: unknown
    license_or_terms_note: evaluation_reuse_stated_in_supplied_source_summary
    required_dependency_refs:
      - MODEL-U1-LTSPICE
      - additional_dependencies_unknown
    executor_approved: false
    approval_blockers:
      - demo_file_identity_not_supplied
      - dependency_set_incomplete
      - reuse_limits_not_fully_recorded
    public_summary_allowed: true
  - model_id: MODEL-J1-SPARAM
    model_need_id: NEED-J1-SPARAM
    component_ref: J1
    manufacturer_part_number: FIXTURE-CONN-HS-02
    model_family: s_parameter
    source_status: blocked
    publisher: synthetic_authoritative_manufacturer
    title: unspecified signal-integrity asset
    canonical_source_ref: official_source_packet:fixture-connector-product-page
    model_revision: unknown
    component_revision: unknown
    license_or_terms_note: export_control_acknowledgement_required
    blocker_if_any: ACCESS-J1-AUTH
    required_dependency_refs: unknown
    executor_approved: false
  - model_id: MODEL-J1-IBIS
    model_need_id: NEED-J1-IBIS
    component_ref: J1
    manufacturer_part_number: FIXTURE-CONN-HS-02
    model_family: ibis
    source_status: blocked
    publisher: synthetic_authoritative_manufacturer
    title: unspecified signal-integrity asset
    canonical_source_ref: official_source_packet:fixture-connector-product-page
    model_revision: unknown
    component_revision: unknown
    license_or_terms_note: export_control_acknowledgement_required
    blocker_if_any: ACCESS-J1-AUTH
    required_dependency_refs: unknown
    executor_approved: false
  - model_id: MODEL-M1-PSPICE
    model_need_id: NEED-M1-PSPICE
    component_ref: M1
    manufacturer_part_number: FIXTURE-POWER-MODULE-03
    model_family: pspice
    source_status: missing
    canonical_source_ref: official_source_packet:fixture-power-module-datasheet
    executor_approved: false
    rationale: supplied_datasheet_summary_identifies_typical_curves_but_no_simulation_model
  - model_id: MODEL-M1-SIMPLIS
    model_need_id: NEED-M1-SIMPLIS
    component_ref: M1
    manufacturer_part_number: FIXTURE-POWER-MODULE-03
    model_family: simplis
    source_status: missing
    canonical_source_ref: official_source_packet:fixture-power-module-datasheet
    executor_approved: false
    rationale: supplied_datasheet_summary_identifies_no_SIMPLIS_source
  - model_id: MODEL-M1-DEMO
    model_need_id: NEED-M1-DEMO
    component_ref: M1
    manufacturer_part_number: FIXTURE-POWER-MODULE-03
    model_family: demo_circuit
    source_status: missing
    canonical_source_ref: official_source_packet:fixture-power-module-datasheet
    executor_approved: false
    rationale: supplied_datasheet_summary_identifies_no_demo_circuit

model_file_manifest:
  files: []
  unresolved_file_records:
    - model_id: MODEL-U1-LTSPICE
      state: file_identity_not_supplied
      filename: unknown
      revision: unknown
      checksum: unknown
      storage_ref: none
      raw_payload_included: false
    - model_id: MODEL-J1-SPARAM
      state: access_blocked
      filename: unknown
      revision: unknown
      checksum: unknown
      storage_ref: none
      raw_payload_included: false
    - model_id: MODEL-J1-IBIS
      state: access_blocked
      filename: unknown
      revision: unknown
      checksum: unknown
      storage_ref: none
      raw_payload_included: false

demo_circuit_manifest:
  - demo_circuit_id: DEMO-U1-OFFICIAL
    component_ref: U1
    manufacturer_part_number: FIXTURE-OPAMP-01
    source_status: official_present
    canonical_source_ref: official_source_packet:fixture-opamp-product-page
    file_identity: unknown
    revision: unknown
    reuse_note: evaluation_reuse_stated_but_complete_limits_unknown
    required_model_ids:
      - MODEL-U1-LTSPICE
    additional_dependencies: unknown
    approved_for_executor: false
    reuse_blockers:
      - demo_file_identity_not_supplied
      - dependency_set_incomplete
      - complete_reuse_limits_not_recorded
  - demo_circuit_id: DEMO-M1-MISSING
    component_ref: M1
    manufacturer_part_number: FIXTURE-POWER-MODULE-03
    source_status: missing
    canonical_source_ref: official_source_packet:fixture-power-module-datasheet
    approved_for_executor: false

simulator_compatibility_matrix:
  - model_id: MODEL-U1-LTSPICE
    simulator_family: ltspice
    compatibility_status: declared_supported
    compatibility_basis: vendor_declared
    evidence_ref: official_source_packet:fixture-opamp-product-page
    tested: false
    caveats:
      - file_not_supplied
      - model_revision_unknown
      - dependencies_unknown
      - no_import_or_syntax_test_permitted
  - model_id: MODEL-U1-LTSPICE
    simulator_family: ngspice
    compatibility_status: not_tested
    compatibility_basis: unknown
    evidence_ref: none
    tested: false
    caveats:
      - conversion_or_syntax_compatibility_not_established
  - model_id: MODEL-U1-PSPICE
    simulator_family: ltspice
    compatibility_status: not_applicable
    compatibility_basis: unknown
    evidence_ref: none
    tested: false
    caveats:
      - requested_PSpice_model_is_missing
  - model_id: MODEL-U1-PSPICE
    simulator_family: ngspice
    compatibility_status: not_applicable
    compatibility_basis: unknown
    evidence_ref: none
    tested: false
    caveats:
      - requested_PSpice_model_is_missing
  - model_id: MODEL-U1-DEMO
    simulator_family: ltspice
    compatibility_status: declared_supported
    compatibility_basis: vendor_declared
    evidence_ref: official_source_packet:fixture-opamp-product-page
    tested: false
    caveats:
      - demo_file_not_supplied
      - reuse_limits_incomplete
      - dependency_set_incomplete
  - model_id: MODEL-J1-SPARAM
    simulator_family: signal_integrity_tool
    compatibility_status: blocked_by_license
    compatibility_basis: vendor_declared
    evidence_ref: official_source_packet:fixture-connector-product-page
    tested: false
    caveats:
      - exact_asset_family_not_confirmed
      - login_and_export_control_acknowledgement_required
  - model_id: MODEL-J1-IBIS
    simulator_family: ibis_parser
    compatibility_status: blocked_by_license
    compatibility_basis: vendor_declared
    evidence_ref: official_source_packet:fixture-connector-product-page
    tested: false
    caveats:
      - exact_IBIS_asset_identity_not_confirmed
      - login_and_export_control_acknowledgement_required
  - model_id: MODEL-M1-PSPICE
    simulator_family: ltspice
    compatibility_status: not_applicable
    compatibility_basis: unknown
    evidence_ref: none
    tested: false
    caveats:
      - requested_model_is_missing
  - model_id: MODEL-M1-PSPICE
    simulator_family: ngspice
    compatibility_status: not_applicable
    compatibility_basis: unknown
    evidence_ref: none
    tested: false
    caveats:
      - requested_model_is_missing
  - model_id: MODEL-M1-SIMPLIS
    simulator_family: other
    compatibility_status: not_applicable
    compatibility_basis: unknown
    evidence_ref: none
    tested: false
    caveats:
      - requested_model_is_missing
      - SIMPLIS_is_not_a_target_simulator_in_the_supplied_policy
  - model_id: MODEL-M1-DEMO
    simulator_family: other
    compatibility_status: not_applicable
    compatibility_basis: unknown
    evidence_ref: none
    tested: false
    caveats:
      - requested_demo_circuit_is_missing

missing_models:
  - missing_model_id: MISSING-U1-PSPICE
    model_need_id: NEED-U1-PSPICE
    component_ref: U1
    requested_model_family: pspice
    source_refs_considered:
      - official_source_packet:fixture-opamp-product-page
    state: missing
    downstream_impact:
      - simulation_deck_prepare_requires_an_approved_alternative_or_scope_decision
      - run_verify_setup_cannot_assume_PSpice_availability
  - missing_model_id: MISSING-M1-PSPICE
    model_need_id: NEED-M1-PSPICE
    component_ref: M1
    requested_model_family: pspice
    source_refs_considered:
      - official_source_packet:fixture-power-module-datasheet
    state: missing
    downstream_impact:
      - simulation_deck_prepare_blocked_for_M1
      - quantitative_enrichment_must_not_infer_behavior_from_a_model
  - missing_model_id: MISSING-M1-SIMPLIS
    model_need_id: NEED-M1-SIMPLIS
    component_ref: M1
    requested_model_family: simplis
    source_refs_considered:
      - official_source_packet:fixture-power-module-datasheet
    state: missing
    downstream_impact:
      - no_SIMPLIS_based_deck_readiness
      - no_conversion_or_synthetic_substitute_allowed
  - missing_model_id: MISSING-M1-DEMO
    model_need_id: NEED-M1-DEMO
    component_ref: M1
    requested_model_family: demo_circuit
    source_refs_considered:
      - official_source_packet:fixture-power-module-datasheet
    state: missing
    downstream_impact:
      - no_demo_circuit_reuse_input_for_deck_prepare

access_blockers:
  - blocker_id: ACCESS-J1-AUTH
    component_ref: J1
    affected_model_need_ids:
      - NEED-J1-SPARAM
      - NEED-J1-IBIS
    state: blocked
    blocker_type:
      - account_login_required
      - export_control_acknowledgement_required
    source_ref: official_source_packet:fixture-connector-product-page
    agent_action_prohibited:
      - request_or_handle_credentials
      - accept_export_control_terms_for_owner
      - treat_asset_names_as_file_or_compatibility_evidence
    resolution_condition: >-
      Owner supplies an approved local manifest or public-safe source packet
      recording asset identity, approval scope, applicable terms, revision, and
      dependency information.

owner_followup_needed:
  required: true
  items:
    - followup_id: FOLLOWUP-U1-FILES
      component_ref: U1
      request: >-
        Supply an owner-approved local manifest or authoritative metadata for
        the LTspice model and demo circuit, including file identity, revision,
        dependency list, and complete reuse terms.
      resolves:
        - MODEL-U1-LTSPICE_executor_approval
        - DEMO-U1-OFFICIAL_executor_approval
    - followup_id: FOLLOWUP-U1-PSPICE
      component_ref: U1
      request: >-
        Confirm whether PSpice support is required independently of the
        identified LTspice asset and, if required, provide an approved
        authoritative source reference.
      resolves:
        - MISSING-U1-PSPICE
    - followup_id: FOLLOWUP-J1-ACCESS
      component_ref: J1
      request: >-
        If permitted, obtain the signal-integrity assets outside this workflow
        and provide an owner-approved local manifest identifying whether the
        package contains S-parameter and/or IBIS data, with revision, terms,
        dependencies, and approved use scope.
      resolves:
        - ACCESS-J1-AUTH
        - MODEL-J1-SPARAM
        - MODEL-J1-IBIS
    - followup_id: FOLLOWUP-M1-SCOPE
      component_ref: M1
      request: >-
        Provide an authoritative approved model source for each required family
        or explicitly revise the deck and quantitative-enrichment scope.
      resolves:
        - MISSING-M1-PSPICE
        - MISSING-M1-SIMPLIS
        - MISSING-M1-DEMO

downstream_handoff:
  simulation_deck_prepare:
    readiness: blocked
    approved_for_executor_model_ids: []
    demo_circuit_ids_with_reuse_limits: []
    compatibility_caveats:
      - U1_LTspice_support_is_vendor_declared_but_file_and_dependencies_are_unavailable
      - J1_assets_are_access_blocked_and_family_identity_is_unconfirmed
      - M1_requested_models_and_demo_circuit_are_missing
    blocked_reasons:
      - no_executor_approved_model_files
      - missing_required_models
      - blocked_required_assets
      - incomplete_dependency_and_terms_evidence
    stop_conditions:
      - do_not_generate_deck_or_netlist
      - do_not_convert_or_synthesize_models
      - do_not_treat_official_availability_as_file_readiness
  simulation_run_verify:
    readiness: blocked
    runnable_deck_available: false
    simulator_policy_ref: simulation_source_packet.target_scope
    setup_evidence_refs: []
    prohibited_claims:
      - simulation_pass_fail
      - waveform_validity
      - metric_verification
      - import_success
      - syntax_check_success
  quantitative_enrichment:
    readiness: limited_to_existing_source_supported_collateral
    numeric_model_collateral_refs: []
    prohibited_actions:
      - extract_behavioral_values_from_unrun_models
      - infer_M1_behavior_from_typical_curves_as_model_output
  harness:
    readiness: context_only
    model_availability_summary:
      U1: official_availability_evidence_present_but_not_executor_approved
      J1: access_blocked
      M1: requested_models_missing
    prohibited_claims:
      - final_harness_connection_validity
      - source_supported_join_promotion
  source_gap_followup:
    readiness: ready
    input_refs:
      - missing_models
      - access_blockers
      - owner_followup_needed

boundary_review_note:
  review_result: pass_with_downstream_stop
  packet_safe_for: pre_deck_source_gap_and_owner_followup_use
  packet_not_safe_for:
    - simulation_deck_generation
    - simulator_execution
    - waveform_or_metric_verification
    - model_conversion
    - synthetic_model_creation
    - harness_connection_promotion
  checks:
    model_source_states_are_explicit: true
    missing_models_are_first_class_outputs: true
    blocked_access_is_not_hidden_as_missing: true
    compatibility_basis_is_recorded_for_each_claim: true
    no_model_or_deck_is_invented: true
    no_simulation_deck_or_run_result_is_present: true
    owner_followup_is_specific: true
    downstream_handoff_preserves_blockers: true
    no_raw_payloads_or_runtime_absolute_paths_are_present: true
    no_secret_or_account_state_is_requested: true
  preserved_uncertainties:
    - U1 model and demo file identities are unknown.
    - U1 model and demo revisions are unknown.
    - U1 dependency requirements are incomplete.
    - U1 complete reuse terms are unavailable.
    - J1 downloadable asset families and revisions are unconfirmed.
    - J1 access remains subject to owner-controlled login and export requirements.
    - M1 has no identified simulation model or demo-circuit source.
    - No compatibility state is based on import, syntax, conversion, or simulation testing.
  final_stop_conditions:
    - Stop deck preparation until required assets are executor-approved or scope is revised.
    - Stop run verification until a runnable deck and permitted setup evidence exist.
    - Stop J1 retrieval until the owner resolves access and approval requirements.
    - Stop behavioral-value extraction from all unrun or unavailable models.
