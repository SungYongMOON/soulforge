simulation_source_packet:
  packet_identity:
    workflow_id: simulation_source_collect_v0
    fixture_id: simulation_source_collect_v0_public_fixture_mixed_model_states
    project_code: PUBLIC_FIXTURE
    run_id: calibration_public_fixture
    public_safe: true
  approval:
    packet_status: complete_with_blockers
    executor_approved_model_ids: []
    approval_note: No model is executor-approved because dependency evidence is incomplete or access is blocked or no acceptable source is identified.
  target_scope:
    component_refs:
      - U1
      - J1
      - M1
    target_simulators:
      - ltspice
      - ngspice
      - ibis_parser
    phase: pre_deck_pre_run_verify
  source_policy:
    accepted_executor_sources:
      - manufacturer_or_authoritative_publisher_page
      - owner_approved_local_manifest
      - tool_library_manifest_approved_by_policy
    blocked_access_handling: record_blocked_and_owner_followup
    raw_payload_publication_allowed: false
    secret_handling_by_agent: false
    smoke_test_allowed: false
    conversion_allowed_without_owner_basis: false
  readiness:
    overall: not_ready_for_deck_or_run
    approved_model_count: 0
    official_evidence_count: 2
    blocked_need_count: 2
    missing_need_count: 3
    runnable_deck_available: false
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
    - No model payload, deck, netlist, conversion, simulation result, waveform claim, credential, session material, or runtime absolute path is included.
    - Authoritative availability statements are not treated as proof of file contents, importability, or simulation behavior.
    - Missing dependency evidence prevents executor approval of the U1 assets.

model_inventory:
  - model_id: MODEL-U1-LTSPICE-01
    model_need_id: NEED-U1-LTSPICE
    component_ref: U1
    manufacturer_part_number: FIXTURE-OPAMP-01
    model_family: ltspice
    source_status: official_present
    publisher: synthetic_authoritative_manufacturer
    source_ref: official_source_packet:fixture-opamp-product-page
    source_identity_evidence: Authoritative page states that an LTspice macromodel is available for the identified component.
    license_or_terms_note: Reuse is stated as allowed for evaluation; broader reuse rights are not established.
    required_dependency_refs: []
    dependency_status: unknown
    executor_approved: false
    approval_blocker: Required dependencies or an explicit no-dependency statement are not recorded.
    downstream_impact: Required simulation deck preparation remains blocked.
  - model_id: MODEL-U1-PSPICE-01
    model_need_id: NEED-U1-PSPICE
    component_ref: U1
    manufacturer_part_number: FIXTURE-OPAMP-01
    model_family: pspice
    source_status: missing
    publisher: unknown
    source_ref: official_source_packet:fixture-opamp-product-page
    source_identity_evidence: The supplied authoritative summary identifies an LTspice model but does not identify a PSpice model.
    license_or_terms_note: unknown
    required_dependency_refs: []
    dependency_status: unknown
    executor_approved: false
    downstream_impact: PSpice-based deck preparation is blocked.
  - model_id: MODEL-J1-SPARAMETER-01
    model_need_id: NEED-J1-SPARAMETER
    component_ref: J1
    manufacturer_part_number: FIXTURE-CONN-HS-02
    model_family: s_parameter
    source_status: blocked
    publisher: synthetic_authoritative_manufacturer
    source_ref: official_source_packet:fixture-connector-product-page
    source_identity_evidence: Authoritative page names signal-integrity assets, but the supplied summary does not confirm an asset-specific identity or revision.
    license_or_terms_note: Login and export-control acknowledgement are required.
    required_dependency_refs: []
    dependency_status: unknown
    executor_approved: false
    approval_blocker: Account-bound and export-control-gated access; no owner-supplied file or approval scope.
    downstream_impact: Signal-integrity review lacks an approved S-parameter asset.
  - model_id: MODEL-J1-IBIS-01
    model_need_id: NEED-J1-IBIS
    component_ref: J1
    manufacturer_part_number: FIXTURE-CONN-HS-02
    model_family: ibis
    source_status: blocked
    publisher: synthetic_authoritative_manufacturer
    source_ref: official_source_packet:fixture-connector-product-page
    source_identity_evidence: Authoritative page names signal-integrity assets, but the supplied summary does not establish that an IBIS file is included.
    license_or_terms_note: Login and export-control acknowledgement are required.
    required_dependency_refs: []
    dependency_status: unknown
    executor_approved: false
    approval_blocker: Asset identity is unconfirmed and access requires owner action.
    downstream_impact: IBIS-parser readiness and harness-strengthening context remain unavailable.
  - model_id: MODEL-M1-PSPICE-01
    model_need_id: NEED-M1-PSPICE
    component_ref: M1
    manufacturer_part_number: FIXTURE-POWER-MODULE-03
    model_family: pspice
    source_status: missing
    publisher: unknown
    source_ref: official_source_packet:fixture-power-module-datasheet
    source_identity_evidence: The supplied datasheet summary identifies typical curves but no simulation model.
    license_or_terms_note: not_applicable
    required_dependency_refs: []
    dependency_status: unknown
    executor_approved: false
    downstream_impact: Required deck preparation is blocked.
  - model_id: MODEL-M1-SIMPLIS-01
    model_need_id: NEED-M1-SIMPLIS
    component_ref: M1
    manufacturer_part_number: FIXTURE-POWER-MODULE-03
    model_family: simplis
    source_status: missing
    publisher: unknown
    source_ref: official_source_packet:fixture-power-module-datasheet
    source_identity_evidence: The supplied datasheet summary identifies no SIMPLIS model or package-level source.
    license_or_terms_note: not_applicable
    required_dependency_refs: []
    dependency_status: unknown
    executor_approved: false
    downstream_impact: SIMPLIS deck preparation is blocked.

model_file_manifest:
  - file_record_id: FILE-U1-LTSPICE-01
    model_id: MODEL-U1-LTSPICE-01
    source_ref: official_source_packet:fixture-opamp-product-page
    file_name: unknown
    file_format: unknown
    model_revision: unknown
    component_revision: unknown
    publication_date: unknown
    access_date: not_recorded
    payload_present: false
    checksum: not_recorded
    required_dependency_refs: []
    dependency_status: unknown
    public_summary_allowed: true
    executor_usable: false
    handling_note: Availability is source-supported, but no raw file, file identity, revision, checksum, or dependency evidence is supplied.
  - file_record_id: FILE-J1-SI-ASSET-01
    model_id_refs:
      - MODEL-J1-SPARAMETER-01
      - MODEL-J1-IBIS-01
    source_ref: official_source_packet:fixture-connector-product-page
    file_name: unknown
    file_format: unknown
    model_revision: unknown
    component_revision: unknown
    publication_date: unknown
    access_date: not_recorded
    payload_present: false
    checksum: not_recorded
    required_dependency_refs: []
    dependency_status: unknown
    public_summary_allowed: true
    executor_usable: false
    blocker_ref: BLOCKER-J1-ACCESS-01
  - file_record_id: FILE-M1-MODEL-01
    model_id_refs:
      - MODEL-M1-PSPICE-01
      - MODEL-M1-SIMPLIS-01
    source_ref: official_source_packet:fixture-power-module-datasheet
    file_name: unknown
    file_format: unknown
    payload_present: false
    executor_usable: false
    state: missing
    handling_note: No acceptable model-file source is identified by the supplied evidence.

demo_circuit_manifest:
  - demo_circuit_id: DEMO-U1-LTSPICE-01
    model_need_id: NEED-U1-DEMO
    component_ref: U1
    manufacturer_part_number: FIXTURE-OPAMP-01
    source_status: official_present
    source_ref: official_source_packet:fixture-opamp-product-page
    source_identity_evidence: Authoritative page states that a demo circuit is available for the identified component.
    reuse_limit: evaluation_only
    file_name: unknown
    circuit_revision: unknown
    required_dependency_refs: []
    dependency_status: unknown
    payload_present: false
    executor_approved: false
    approval_blocker: File identity and dependency evidence are not recorded.
  - demo_circuit_id: DEMO-M1-01
    model_need_id: NEED-M1-DEMO
    component_ref: M1
    manufacturer_part_number: FIXTURE-POWER-MODULE-03
    source_status: missing
    source_ref: official_source_packet:fixture-power-module-datasheet
    source_identity_evidence: No demo circuit or package-level source is identified.
    reuse_limit: unknown
    payload_present: false
    executor_approved: false

simulator_compatibility_matrix:
  - compatibility_id: COMPAT-U1-LTSPICE-01
    asset_id: MODEL-U1-LTSPICE-01
    simulator: ltspice
    status: declared_supported
    basis: vendor_declared
    evidence_ref: official_source_packet:fixture-opamp-product-page
    smoke_tested: false
    caveat: Declared availability does not establish syntax validity, import success, dependency completeness, or behavioral correctness.
  - compatibility_id: COMPAT-U1-LTSPICE-NGSPICE-01
    asset_id: MODEL-U1-LTSPICE-01
    simulator: ngspice
    status: not_tested
    basis: unknown
    smoke_tested: false
    caveat: Cross-simulator compatibility and any required conversion are unsupported by the supplied evidence.
  - compatibility_id: COMPAT-U1-DEMO-LTSPICE-01
    asset_id: DEMO-U1-LTSPICE-01
    simulator: ltspice
    status: declared_supported
    basis: vendor_declared
    smoke_tested: false
    caveat: Demo-circuit availability is declared, but its file identity, dependencies, and run behavior are unknown.
  - compatibility_id: COMPAT-J1-SPARAMETER-01
    asset_id: MODEL-J1-SPARAMETER-01
    simulator: ibis_parser
    status: not_applicable
    basis: file_format_only
    smoke_tested: false
    caveat: An IBIS parser is not established as the appropriate consumer for an unconfirmed S-parameter asset.
  - compatibility_id: COMPAT-J1-IBIS-01
    asset_id: MODEL-J1-IBIS-01
    simulator: ibis_parser
    status: blocked_by_license
    basis: vendor_declared
    smoke_tested: false
    caveat: The specific presence of an IBIS asset remains unconfirmed, and access requires login and export-control acknowledgement.
  - compatibility_id: COMPAT-M1-PSPICE-LTSPICE-01
    asset_id: MODEL-M1-PSPICE-01
    simulator: ltspice
    status: not_tested
    basis: unknown
    smoke_tested: false
    caveat: No model asset is available for compatibility assessment.
  - compatibility_id: COMPAT-M1-PSPICE-NGSPICE-01
    asset_id: MODEL-M1-PSPICE-01
    simulator: ngspice
    status: not_tested
    basis: unknown
    smoke_tested: false
    caveat: No model asset is available for compatibility assessment.
  - compatibility_id: COMPAT-M1-SIMPLIS-01
    asset_id: MODEL-M1-SIMPLIS-01
    simulator: ltspice
    status: not_applicable
    basis: unknown
    smoke_tested: false
    caveat: No SIMPLIS asset or conversion basis is supplied.

missing_models:
  - missing_model_id: MISSING-U1-PSPICE-01
    model_need_id: NEED-U1-PSPICE
    component_ref: U1
    requested_model_family: pspice
    evidence_ref: official_source_packet:fixture-opamp-product-page
    gap: No acceptable PSpice source is identified.
    downstream_impact:
      - PSpice deck preparation blocked
      - PSpice run-verify setup blocked
  - missing_model_id: MISSING-M1-PSPICE-01
    model_need_id: NEED-M1-PSPICE
    component_ref: M1
    requested_model_family: pspice
    evidence_ref: official_source_packet:fixture-power-module-datasheet
    gap: No PSpice model or package-level source is identified.
    downstream_impact:
      - Required deck preparation blocked
      - Quantitative enrichment cannot derive behavioral values from a model
  - missing_model_id: MISSING-M1-SIMPLIS-01
    model_need_id: NEED-M1-SIMPLIS
    component_ref: M1
    requested_model_family: simplis
    evidence_ref: official_source_packet:fixture-power-module-datasheet
    gap: No SIMPLIS model or package-level source is identified.
    downstream_impact:
      - SIMPLIS deck preparation blocked
  - missing_model_id: MISSING-M1-DEMO-01
    model_need_id: NEED-M1-DEMO
    component_ref: M1
    requested_model_family: demo_circuit
    evidence_ref: official_source_packet:fixture-power-module-datasheet
    gap: No demo circuit is identified.
    downstream_impact:
      - No source-supported demonstration topology is available

access_blockers:
  - blocker_id: BLOCKER-J1-ACCESS-01
    component_ref: J1
    affected_model_families:
      - s_parameter
      - ibis
    source_ref: official_source_packet:fixture-connector-product-page
    blocker_state: blocked_by_license
    blocker_detail: Download requires login and export-control acknowledgement.
    agent_action_prohibited:
      - request_credentials
      - handle_account_session
      - accept_export_control_terms
      - treat gated asset as retrieved
    resolution_boundary: Owner must determine eligibility and provide an approved local manifest or permitted asset reference.
  - blocker_id: BLOCKER-U1-DEPENDENCY-01
    component_ref: U1
    affected_asset_ids:
      - MODEL-U1-LTSPICE-01
      - DEMO-U1-LTSPICE-01
    blocker_state: blocked_by_missing_dependency
    blocker_detail: Dependency requirements or an explicit no-dependency statement are not recorded.
    resolution_boundary: Authoritative package metadata or owner-approved local manifest must record dependency scope before executor approval.

owner_followup_needed:
  - followup_id: FOLLOWUP-J1-ACCESS-01
    priority: required
    component_ref: J1
    question: Can the owner lawfully access and approve the gated signal-integrity package for project-local use?
    requested_evidence:
      - owner-approved local manifest
      - permitted asset family identity
      - model revision
      - component revision
      - applicable terms or export-control scope
      - dependency list
    stop_condition: Do not approve, retrieve, convert, or use the J1 assets until owner-provided evidence resolves access and identity.
  - followup_id: FOLLOWUP-U1-PACKAGE-01
    priority: required
    component_ref: U1
    question: Can authoritative package metadata or an owner-approved local manifest identify the LTspice model and demo-circuit files and their dependencies?
    requested_evidence:
      - file identity
      - model or circuit revision
      - dependency list or explicit no-dependency statement
      - evaluation-use scope confirmation
    stop_condition: Do not mark the U1 assets executor-approved or deck-ready until dependency and package evidence is recorded.
  - followup_id: FOLLOWUP-M1-SOURCE-01
    priority: required_if_simulation_is_required
    component_ref: M1
    question: Is there an owner-approved or authoritative PSpice, SIMPLIS, or demo-circuit source not represented in the supplied packet?
    requested_evidence:
      - authoritative source reference or owner-approved local manifest
      - exact component identity
      - model family
      - revision
      - terms
      - dependencies
    stop_condition: Keep M1 deck preparation blocked unless an acceptable source is supplied.

downstream_handoff:
  overall_state: blocked
  simulation_deck_prepare:
    status: blocked
    approved_for_executor_model_ids: []
    demo_circuit_ids_with_reuse_limits: []
    compatibility_caveats:
      - U1 LTspice compatibility is vendor-declared but untested.
      - U1 package dependencies are unknown.
      - J1 assets are access-blocked and their exact families are unconfirmed.
      - M1 requested models and demo circuit are missing.
    blocked_reasons:
      - missing_required_model
      - blocked_required_model
      - missing_required_dependency
    stop_condition: Do not generate a deck until the required asset is executor-approved with terms, dependencies, identity, and simulator-scope evidence.
  simulation_run_verify:
    status: blocked
    runnable_deck_available: false
    simulator_policy_ref: simulator_policy
    setup_evidence_refs: []
    non_claims:
      - no_simulation_pass_fail
      - no_waveform_validity
      - no_metric_verification
  quantitative_enrichment:
    status: limited
    allowed_numeric_collateral_refs:
      - official_source_packet:fixture-power-module-datasheet
    restriction: Typical-curve references may remain source context only; no behavioral values may be extracted from unrun or missing models.
  harness:
    status: context_only
    model_availability_summary:
      U1: Official LTspice and demo-circuit availability is stated, but neither asset is executor-approved.
      J1: Signal-integrity assets are access-blocked and exact asset families remain unconfirmed.
      M1: Requested models and demo circuit are missing.
    non_claims:
      - no_final_harness_connection_validity
      - no_source_supported_join_promotion
  source_gap_followup:
    status: required
    missing_model_refs:
      - MISSING-U1-PSPICE-01
      - MISSING-M1-PSPICE-01
      - MISSING-M1-SIMPLIS-01
      - MISSING-M1-DEMO-01
    access_blocker_refs:
      - BLOCKER-J1-ACCESS-01
      - BLOCKER-U1-DEPENDENCY-01
    owner_followup_refs:
      - FOLLOWUP-J1-ACCESS-01
      - FOLLOWUP-U1-PACKAGE-01
      - FOLLOWUP-M1-SOURCE-01

boundary_review_note:
  review_status: pass_with_preserved_blockers
  checks:
    model_source_states_are_explicit: true
    missing_models_are_first_class_outputs: true
    blocked_access_is_not_hidden_as_missing: true
    compatibility_basis_is_recorded_for_each_claim: true
    no_model_or_deck_is_invented: true
    no_simulation_deck_or_run_result_is_written: true
    owner_followup_is_specific: true
    downstream_handoff_preserves_blockers: true
    no_raw_payloads_or_runtime_absolute_paths_in_public_package: true
    no_secret_or_account_state_requested_from_agent: true
  preserved_uncertainties:
    - U1 model and demo-circuit file identities, revisions, and dependencies are unknown.
    - J1 gated package contents may include S-parameter or IBIS assets, but the supplied evidence does not establish either asset identity.
    - M1 typical curves do not establish the existence of any requested simulation model.
    - No compatibility state is based on import, syntax, execution, waveform, or metric evidence.
  final_stop_conditions:
    - Stop deck preparation when any required model is missing, blocked, unapproved, or dependency-incomplete.
    - Stop run verification while runnable_deck_available is false.
    - Do not perform model conversion without owner or authoritative source basis.
    - Do not request credentials, accept gated terms, or represent account-bound assets as available.
    - Do not promote source context into harness validity or behavioral simulation claims.
