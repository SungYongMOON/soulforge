```yaml
deliverable_type: simulation_source_collect_v0_bundle
fixture_id: simulation_source_collect_v0_public_fixture_mixed_model_states
workflow_id: simulation_source_collect_v0
public_safe: true

simulation_source_packet:
  packet_identity:
    project_code: PUBLIC_FIXTURE
    run_id: calibration_public_fixture
    packet_id: simulation_source_packet_public_fixture
  approval:
    status: conditional_pre_deck_only
    executor_approved_model_ids: []
    approval_basis: terms_and_dependency_evidence_incomplete
  target_scope:
    simulators:
      - ltspice
      - ngspice
      - ibis_parser
    components:
      - U1
      - J1
      - M1
  source_policy:
    accepted_executor_sources:
      - manufacturer_or_authoritative_publisher_page
      - owner_approved_local_manifest
      - tool_library_manifest_approved_by_policy
    blocked_access_handling: record_blocked_and_owner_followup
    no_secret_handling_by_agent: true
    no_raw_payload_in_public_archive: true
  readiness:
    model_readiness: partial
    deck_ready: false
    run_ready: false
    waveform_or_metric_verified: false
    required_model_gaps_present: true
  output_refs:
    model_inventory: model_inventory_public_fixture
    model_file_manifest: model_file_manifest_public_fixture
    demo_circuit_manifest: demo_circuit_manifest_public_fixture
    simulator_compatibility_matrix: simulator_compatibility_matrix_public_fixture
    missing_models: missing_models_public_fixture
    access_blockers: access_blockers_public_fixture
    owner_followup_needed: owner_followup_needed_public_fixture
    downstream_handoff: downstream_handoff_public_fixture
  boundary_notes:
    - Pre-deck and pre-run/verify output only.
    - No netlist, deck, conversion, simulation execution, waveform claim, or metric verification.
    - No raw model payloads, credentials, sessions, or runtime absolute paths included.

model_inventory:
  inventory_id: model_inventory_public_fixture
  records:
    - model_id: model_U1_ltspice
      component_ref: U1
      manufacturer_part_number: FIXTURE-OPAMP-01
      model_family: ltspice
      source_status: official_present
      executor_approved: false
      provenance_ref: official_source_packet:fixture-opamp-product-page
      evidence_summary: Manufacturer page states an LTspice macromodel is available.
      terms_note: Reuse allowed for evaluation.
      dependency_note: not supplied; confirmation required
      needed_for:
        - simulation_deck_prepare
        - run_verify_setup
    - model_id: model_U1_demo
      component_ref: U1
      manufacturer_part_number: FIXTURE-OPAMP-01
      model_family: demo_circuit
      source_status: official_present
      executor_approved: false
      provenance_ref: official_source_packet:fixture-opamp-product-page
      evidence_summary: Manufacturer page states a demo circuit is available.
      terms_note: Reuse allowed for evaluation.
      dependency_note: not supplied; confirmation required
      needed_for:
        - simulation_deck_prepare
    - model_id: model_J1_s_parameter
      component_ref: J1
      manufacturer_part_number: FIXTURE-CONN-HS-02
      model_family: s_parameter
      source_status: blocked
      executor_approved: false
      provenance_ref: official_source_packet:fixture-connector-product-page
      evidence_summary: Manufacturer page names signal-integrity assets.
      blocker_ref: access_blocker_J1_login_export_control
      needed_for:
        - signal_integrity_review
        - harness_strengthening_context
    - model_id: model_J1_ibis
      component_ref: J1
      manufacturer_part_number: FIXTURE-CONN-HS-02
      model_family: ibis
      source_status: blocked
      executor_approved: false
      provenance_ref: official_source_packet:fixture-connector-product-page
      evidence_summary: Manufacturer page names signal-integrity assets.
      blocker_ref: access_blocker_J1_login_export_control
      needed_for:
        - signal_integrity_review
        - harness_strengthening_context
    - model_id: model_M1_pspice
      component_ref: M1
      manufacturer_part_number: FIXTURE-POWER-MODULE-03
      model_family: pspice
      source_status: missing
      executor_approved: false
      provenance_ref: official_source_packet:fixture-power-module-datasheet
      evidence_summary: No PSpice model identified.
      needed_for:
        - simulation_deck_prepare
        - quantitative_enrichment_context
    - model_id: model_M1_simplis
      component_ref: M1
      manufacturer_part_number: FIXTURE-POWER-MODULE-03
      model_family: simplis
      source_status: missing
      executor_approved: false
      provenance_ref: official_source_packet:fixture-power-module-datasheet
      evidence_summary: No SIMPLIS model identified.
      needed_for:
        - simulation_deck_prepare
        - quantitative_enrichment_context
    - model_id: model_M1_demo
      component_ref: M1
      manufacturer_part_number: FIXTURE-POWER-MODULE-03
      model_family: demo_circuit
      source_status: missing
      executor_approved: false
      provenance_ref: official_source_packet:fixture-power-module-datasheet
      evidence_summary: No demo circuit identified.
      needed_for:
        - simulation_deck_prepare
        - quantitative_enrichment_context

model_file_manifest:
  manifest_id: model_file_manifest_public_fixture
  files: []
  policy:
    raw_model_payloads_included: false
    file_paths: []
    file_extension_as_evidence: false
  notes:
    - No owner-approved local manifest or tool-library manifest was supplied.
    - No downloadable or locally available model file is asserted.

demo_circuit_manifest:
  manifest_id: demo_circuit_manifest_public_fixture
  records:
    - demo_circuit_id: demo_U1_official
      component_ref: U1
      source_status: official_present
      provenance_ref: official_source_packet:fixture-opamp-product-page
      reuse_limits: evaluation_reuse_allowed
      executor_approved: false
      dependency_note: not supplied; confirmation required
    - demo_circuit_id: demo_M1_missing
      component_ref: M1
      source_status: missing
      provenance_ref: official_source_packet:fixture-power-module-datasheet
      reuse_limits: not_applicable

simulator_compatibility_matrix:
  matrix_id: simulator_compatibility_matrix_public_fixture
  records:
    - model_id: model_U1_ltspice
      simulator_family: ltspice
      compatibility_status: declared_supported
      compatibility_basis: vendor_declared
      smoke_test_performed: false
      caveat: Dependency evidence is not supplied; executor approval remains pending.
    - model_id: model_U1_demo
      simulator_family: ltspice
      compatibility_status: not_tested
      compatibility_basis: unknown
      smoke_test_performed: false
      caveat: Demo-circuit availability does not establish simulator execution readiness.
    - model_id: model_J1_s_parameter
      simulator_family: signal_integrity_tool
      compatibility_status: blocked_by_license
      compatibility_basis: unknown
      smoke_test_performed: false
      caveat: Login and export-control acknowledgement are required.
    - model_id: model_J1_ibis
      simulator_family: ibis_parser
      compatibility_status: blocked_by_license
      compatibility_basis: unknown
      smoke_test_performed: false
      caveat: Login and export-control acknowledgement are required.
    - model_id: model_M1_pspice
      simulator_family: other
      compatibility_status: not_applicable
      compatibility_basis: unknown
      smoke_test_performed: false
      caveat: No model source identified.
    - model_id: model_M1_simplis
      simulator_family: simplis
      compatibility_status: not_applicable
      compatibility_basis: unknown
      smoke_test_performed: false
      caveat: No model source identified.
  global_notes:
    - No smoke test was allowed by simulator policy.
    - No conversion is authorized without owner basis.
    - File-format or product-family inference is not used as compatibility evidence.

missing_models:
  packet_id: missing_models_public_fixture
  records:
    - component_ref: U1
      manufacturer_part_number: FIXTURE-OPAMP-01
      missing_model_families:
        - pspice
      downstream_impact:
        - simulation_deck_prepare
    - component_ref: M1
      manufacturer_part_number: FIXTURE-POWER-MODULE-03
      missing_model_families:
        - pspice
        - simplis
        - demo_circuit
      downstream_impact:
        - simulation_deck_prepare
        - quantitative_enrichment_context

access_blockers:
  packet_id: access_blockers_public_fixture
  records:
    - blocker_id: access_blocker_J1_login_export_control
      component_ref: J1
      affected_model_families:
        - s_parameter
        - ibis
      status: blocked
      reason: Manufacturer assets require login and export-control acknowledgement.
      required_owner_action: Supply an owner-approved accessible source or approve an owner-supplied local asset.
      credentials_requested_from_agent: false

owner_followup_needed:
  packet_id: owner_followup_needed_public_fixture
  items:
    - followup_id: followup_U1_dependency_terms
      scope:
        - model_U1_ltspice
        - model_U1_demo
      request: Confirm dependency information and executor-use terms for evaluation reuse.
    - followup_id: followup_J1_access
      scope:
        - model_J1_s_parameter
        - model_J1_ibis
      request: Provide owner-approved accessible assets or an approved local manifest.
    - followup_id: followup_M1_models
      scope:
        - model_M1_pspice
        - model_M1_simplis
        - model_M1_demo
      request: Identify an authoritative or owner-approved source, or accept the missing-model state.

downstream_handoff:
  packet_id: downstream_handoff_public_fixture
  simulation_deck_prepare:
    approved_model_ids: []
    demo_circuit_ids:
      - demo_U1_official
    readiness: blocked
    block_reasons:
      - U1 executor approval pending terms and dependency evidence.
      - Required M1 model families are missing.
      - J1 assets are access-blocked where applicable.
  simulation_run_verify:
    runnable_deck_available: false
    simulator_policy_ref: simulator_policy_public_fixture
    setup_evidence_refs: []
    run_claims: none
    waveform_claims: none
  quantitative_enrichment:
    source_supported_numeric_collateral_refs: []
    behavioral_values_from_unrun_models: prohibited
  harness:
    model_availability_summary:
      available_with_conditions:
        - U1 LTspice and demo-circuit source evidence
      blocked:
        - J1 signal-integrity assets
      missing:
        - M1 requested model families
    final_connection_validity: not_claimed
    source_supported_join_promotion: not_claimed
  source_gap_followup:
    missing_models_ref: missing_models_public_fixture
    access_blockers_ref: access_blockers_public_fixture
    owner_followup_ref: owner_followup_needed_public_fixture

boundary_review_note:
  review_id: boundary_review_public_fixture
  status: safe_for_pre_deck_handoff_with_blockers
  confirmed:
    - Model source states are explicit.
    - Missing models are first-class outputs.
    - Access blockers are distinct from missing models.
    - Compatibility basis is recorded.
    - No model or deck is invented.
    - No simulation run, waveform result, or metric verification is claimed.
    - Owner follow-up is specific.
    - Downstream blockers are preserved.
    - No raw payloads, credentials, sessions, or runtime absolute paths are included.
  non_claims:
    - No deck readiness.
    - No run readiness.
    - No simulator execution.
    - No waveform validity.
    - No harness connection validity.
    - No model conversion.
```
