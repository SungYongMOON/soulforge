workflow_id: test_harness_asset_planning_v0
fixture_id: PUBLIC_SYNTH_TEST_HARNESS_ASSET_PLANNING_V0
deliverable_kind: test_harness_asset_plan
source_kind: synthetic_from_workflow_contract
public_safe: true
scope:
  mode: planning_only
  execution_authorized: false
  trr_approval_granted: false
  upstream_mutation_authorized: false

project_binding:
  binding_ref: SYNTHETIC_PLANNING_BINDING_001
  verification_readiness_ref: SYNTHETIC_READINESS_REF_001
  planning_policy_ref: SYNTHETIC_POLICY_REF_001
  bounded_scope: representative_physical_and_simulation_harness_assets
  output_root: unspecified
  uncertainty:
    - No project-local paths, module specifications, interface-control packets, or available-resource records were supplied.

test_harness_manifest:
  - asset_id: SYNTH_PHYSICAL_FIXTURE_001
    asset_kind: physical_fixture
    purpose: Hold and connect a representative page module during planned verification.
    status: needed_unconfirmed
    source_basis: synthetic_scenario_fact
    execution_status: not_executed
    dependencies:
      - SYNTH_TEST_INTERFACE_001
      - SYNTH_INSTRUMENT_RESOURCE_001
    non_claims:
      - Mechanical dimensions are not established.
      - Electrical compatibility is not established.
      - Availability and fitness for use are not established.

  - asset_id: SYNTH_SIMULATION_HARNESS_001
    asset_kind: simulation_harness
    purpose: Provide a representative stimulus, load, and observation context for planned simulation.
    status: needed_unconfirmed
    source_basis: synthetic_scenario_fact
    execution_status: not_executed
    dependencies:
      - SYNTH_SIM_FIXTURE_NEED_001
    non_claims:
      - No simulator, model set, deck, or executable configuration is identified.
      - Simulation behavior and convergence are not established.

test_interface_list:
  - interface_id: SYNTH_TEST_INTERFACE_001
    related_asset_id: SYNTH_PHYSICAL_FIXTURE_001
    interface_kind: module_to_fixture_connection
    direction: unspecified
    signals_or_media: unspecified
    connector_or_access_method: unspecified
    electrical_limits: unspecified
    readiness: blocked_pending_interface_definition
    evidence_boundary: No page-module specification or interface-control packet was supplied.

simulation_fixture_needs:
  - need_id: SYNTH_SIM_FIXTURE_NEED_001
    related_asset_id: SYNTH_SIMULATION_HARNESS_001
    need_kind: stimulus_load_observation_fixture
    required_elements:
      - representative_input_stimulus_definition
      - representative_load_definition
      - observation_point_definition
      - model_and_deck_provenance
      - expected_behavior_or_acceptance_reference
    readiness: not_ready_for_execution
    uncertainty:
      - Required values, models, simulator compatibility, and acceptance criteria are unspecified.

instrumentation_resource_list:
  - resource_id: SYNTH_INSTRUMENT_RESOURCE_001
    resource_kind: measurement_instrument
    intended_use: Observe the representative physical interface during planned verification.
    required_capabilities:
      - capability_compatible_with_unspecified_signal_type
      - range_and_accuracy_compatible_with_unspecified_limits
      - suitable_connection_or_probe_access
      - current_calibration_or_equivalent_status_evidence
    selected_resource: null
    availability: unknown
    readiness: unconfirmed
    owner_boundary: Resource selection and availability require owner-supplied evidence or decision.

trr_readiness_checklist:
  - checklist_id: SYNTH_TRR_CHECK_001
    item: Planning scope and representative verification item are identified.
    state: partial
    basis: Synthetic fixture identifies physical and simulation needs but no page-module identity.

  - checklist_id: SYNTH_TRR_CHECK_002
    item: Physical fixture requirements and interfaces are defined.
    state: blocked
    blocker_ref: SYNTH_PLANNING_BLOCKER_001

  - checklist_id: SYNTH_TRR_CHECK_003
    item: Simulation stimulus, load, models, deck, and observation points are defined.
    state: incomplete
    basis: Only the need for a simulation harness is established.

  - checklist_id: SYNTH_TRR_CHECK_004
    item: Instrument capability, range, accuracy, access, availability, and status evidence are confirmed.
    state: incomplete
    owner_followup_ref: SYNTH_OWNER_FOLLOWUP_001

  - checklist_id: SYNTH_TRR_CHECK_005
    item: Verification requirements and acceptance references are traceable.
    state: unknown
    basis: No verification-requirements matrix or acceptance reference was supplied.

  - checklist_id: SYNTH_TRR_CHECK_006
    item: Safety, protection, and operating-limit constraints are documented.
    state: unknown
    basis: No applicable constraints were supplied.

  - checklist_id: SYNTH_TRR_CHECK_007
    item: Execution procedures and result-recording provisions are available.
    state: out_of_scope_unassessed
    basis: This deliverable plans assets and does not authorize or perform execution.

  - checklist_id: SYNTH_TRR_CHECK_008
    item: TRR approval is recorded.
    state: not_claimed
    basis: TRR approval is outside workflow authority.

planning_blockers:
  - blocker_id: SYNTH_PLANNING_BLOCKER_001
    title: Physical fixture interface definition is missing.
    affected_items:
      - SYNTH_PHYSICAL_FIXTURE_001
      - SYNTH_TEST_INTERFACE_001
      - SYNTH_TRR_CHECK_002
    impact: Fixture dimensions, connection method, compatibility, and protective provisions cannot be planned to an execution-ready level.
    resolution_needed:
      - Owner-approved representative module interface definition
      - Applicable mechanical and electrical constraints
      - Required access and protection provisions
    stop_condition: Do not release the physical fixture for fabrication, connection, or test execution until the missing interface definition is resolved and reviewed.
    status: open

owner_followup_needed:
  - followup_id: SYNTH_OWNER_FOLLOWUP_001
    owner_role: unspecified_owner
    decision_or_evidence_needed: Identify an available measurement resource or approve acquisition planning after signal type, limits, accuracy, access, and status requirements are defined.
    related_items:
      - SYNTH_INSTRUMENT_RESOURCE_001
      - SYNTH_TRR_CHECK_004
    due_date: unspecified
    status: pending_owner_input
    non_claim: No resource reservation, acquisition, or approval has occurred.

boundary_review_note:
  review_scope: public_safe_synthetic_deliverable
  disposition: planning_packet_only
  preserved_boundaries:
    - The asset identities and references are synthetic.
    - The packet records needs, readiness gaps, a blocker, and owner follow-up without claiming test or simulation execution.
    - The checklist is preparation evidence and is not TRR approval.
    - Upstream artifacts remain read-only and unchanged.
    - No runtime path, hidden evidence, resource availability, compatibility, or verification result is asserted.
  unresolved_uncertainty:
    - Representative module identity and specifications
    - Interface definitions and operating limits
    - Verification requirements and acceptance criteria
    - Simulation models, deck, and simulator compatibility
    - Instrument selection, availability, and status evidence
    - Safety and protection constraints
  terminal_condition: Planning may continue only when bounded source or owner inputs resolve the applicable gaps; execution and approval remain outside this workflow.
