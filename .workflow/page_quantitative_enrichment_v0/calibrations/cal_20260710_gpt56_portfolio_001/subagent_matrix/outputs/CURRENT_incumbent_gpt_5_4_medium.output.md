```yaml
workflow_id: page_quantitative_enrichment_v0
fixture_id: public_synthetic_values_gaps_conflict_overlay
page_id: PAGE-DEMO
schema: page_module_spec_v0
source_checksum: sha256:fixture-page

quantitative_slot_inventory:
  - target_slot: interfaces.power.input_voltage
    quantity_kind: voltage
    scope: interface
    applies_to: power input
    existing_status: missing
    required_for_harness: true
    evidence_candidates:
      - fixture://sources/power-guide
    missing_or_conflict_reason: null

  - target_slot: performance.max_current
    quantity_kind: current
    scope: performance
    applies_to: module max current
    existing_status: review_required
    required_for_harness: true
    evidence_candidates:
      - fixture://sources/load-guide
      - fixture://sources/conflict-guide
    missing_or_conflict_reason: conflicting official values and unclear condition scope

  - target_slot: performance.max_power
    quantity_kind: power
    scope: performance
    applies_to: module max power
    existing_status: missing
    required_for_harness: true
    evidence_candidates:
      - derivation_request
    missing_or_conflict_reason: requested derivation blocked because max_current is not source_confirmed

  - target_slot: interfaces.aux.input_voltage
    quantity_kind: voltage
    scope: interface
    applies_to: aux input
    existing_status: missing
    required_for_harness: true
    evidence_candidates:
      - owner_recorded_constraints
      - previous_harness_blocker_packet
    missing_or_conflict_reason: label hint exists but no approved value evidence

quantitative_claims:
  - target_slot: interfaces.power.input_voltage
    claim_status: filled
    field_status: source_confirmed
    value: 5
    unit: V
    condition: nominal
    approved_evidence_ref: fixture://sources/power-guide
    source_location_or_packet_ref: page 4
    notes: synthetic official evidence supports this quantity

  - target_slot: performance.max_current
    claim_status: conflict
    field_status: review_required
    value: null
    unit: A
    condition: unresolved
    approved_evidence_refs:
      - fixture://sources/load-guide
      - fixture://sources/conflict-guide
    source_locations:
      - page 8
      - page 3
    conflict_detail:
      observed_values:
        - value: 2
          unit: A
          condition: ambient <= 40 C
          evidence_ref: fixture://sources/load-guide
        - value: 1.5
          unit: A
          condition: condition unclear
          evidence_ref: fixture://sources/conflict-guide
    notes: plausible evidence exists but source conflict and scope ambiguity prevent fill

  - target_slot: performance.max_power
    claim_status: blocked_missing_source
    field_status: missing
    value: null
    unit: W
    derivation_request:
      formula: input_voltage * max_current
      operand_slots:
        - interfaces.power.input_voltage
        - performance.max_current
    explicit_gap_reason: derivation forbidden because performance.max_current is not source_confirmed
    searched_or_available_inputs:
      - fixture://sources/power-guide
      - fixture://sources/load-guide
      - fixture://sources/conflict-guide
    downstream_impact: required harness quantity remains unresolved

  - target_slot: interfaces.aux.input_voltage
    claim_status: blocked_missing_source
    field_status: missing
    value: null
    unit: V
    explicit_gap_reason: only label hint and prior blocker context are present; neither is approved value evidence
    searched_or_available_inputs:
      - owner_recorded_constraints
      - previous_harness_blocker_packet
    downstream_impact: harness-relevant voltage remains unresolved
    forbidden_fill_basis_observed:
      - net_name_or_label_only
      - downstream_harness_desire

enriched_sidecar_overlay:
  overlay_kind: patch_like_overlay_against_page_module_spec_v0
  overlay_not_replacement: true
  target_page_id: PAGE-DEMO
  target_schema: page_module_spec_v0
  patches:
    - target_slot: interfaces.power.input_voltage
      proposed_status_update: source_confirmed
      value: 5
      unit: V
      condition: nominal
      evidence_refs:
        - fixture://sources/power-guide
      source_gap_refs: []
      derivation_refs: []

    - target_slot: performance.max_current
      proposed_status_update: review_required
      value: null
      unit: A
      evidence_refs:
        - fixture://sources/load-guide
        - fixture://sources/conflict-guide
      source_gap_refs:
        - gap://performance.max_current/source_conflict
      derivation_refs: []

    - target_slot: performance.max_power
      proposed_status_update: missing
      value: null
      unit: W
      evidence_refs: []
      source_gap_refs:
        - gap://performance.max_power/blocked_derivation
      derivation_refs: []

    - target_slot: interfaces.aux.input_voltage
      proposed_status_update: missing
      value: null
      unit: V
      evidence_refs: []
      source_gap_refs:
        - gap://interfaces.aux.input_voltage/missing_approved_source
      derivation_refs: []

source_gap_report:
  - gap_ref: gap://performance.max_current/source_conflict
    target_slot: performance.max_current
    gap_type: source_conflict
    blocking_level: blocks_harness
    machine_readable_reason: official source values disagree and one condition is unclear
    available_inputs:
      - fixture://sources/load-guide
      - fixture://sources/conflict-guide
    unblock_condition: owner-approved authoritative source or scope resolution for max current

  - gap_ref: gap://performance.max_power/blocked_derivation
    target_slot: performance.max_power
    gap_type: missing_source_value
    blocking_level: blocks_harness
    machine_readable_reason: derivation depends on unresolved performance.max_current
    available_inputs:
      - derivation_request
      - fixture://sources/power-guide
      - fixture://sources/load-guide
      - fixture://sources/conflict-guide
    unblock_condition: resolve performance.max_current to source_confirmed, then re-evaluate derivation

  - gap_ref: gap://interfaces.aux.input_voltage/missing_approved_source
    target_slot: interfaces.aux.input_voltage
    gap_type: missing_source_value
    blocking_level: blocks_harness
    machine_readable_reason: no approved evidence supports aux input voltage; label hint is non-authoritative
    available_inputs:
      - owner_recorded_constraints
      - previous_harness_blocker_packet
    unblock_condition: approved source packet or owner-approved local evidence with value, unit, and scope

owner_followup_needed:
  required: true
  actions:
    - target_slot: performance.max_current
      action_type: owner_decision_required
      request: provide authoritative resolution for conflicting max current evidence, including applicable operating condition and page scope
      unblock_effect: may allow source_confirmed current claim and enable max_power derivation

    - target_slot: interfaces.aux.input_voltage
      action_type: owner_decision_required
      request: provide approved value evidence for aux input voltage; label hint alone is insufficient
      unblock_effect: may close remaining harness blocker for aux voltage

harness_readiness_delta:
  delta_only: true
  before:
    - target_slot: interfaces.power.input_voltage
      status: missing
      harness_effect: blocker
    - target_slot: performance.max_current
      status: review_required
      harness_effect: blocker
    - target_slot: performance.max_power
      status: missing
      harness_effect: blocker
    - target_slot: interfaces.aux.input_voltage
      status: missing
      harness_effect: blocker

  after:
    - target_slot: interfaces.power.input_voltage
      status: source_confirmed
      harness_effect: blocker_closed_for_this_quantity
    - target_slot: performance.max_current
      status: review_required
      harness_effect: blocker_remains
    - target_slot: performance.max_power
      status: missing
      harness_effect: blocker_remains
    - target_slot: interfaces.aux.input_voltage
      status: missing
      harness_effect: blocker_remains

  closed_blockers:
    - target_slot: interfaces.power.input_voltage
      reason: source_confirmed quantitative evidence now present
      evidence_ref: fixture://sources/power-guide

  remaining_blockers:
    - target_slot: performance.max_current
      reason: conflicting official source evidence prevents quantitative fill
      gap_ref: gap://performance.max_current/source_conflict
    - target_slot: performance.max_power
      reason: derivation blocked by unresolved current operand
      gap_ref: gap://performance.max_power/blocked_derivation
    - target_slot: interfaces.aux.input_voltage
      reason: approved value evidence still missing
      gap_ref: gap://interfaces.aux.input_voltage/missing_approved_source

  newly_discovered_blockers:
    - target_slot: performance.max_power
      reason: explicit derivation dependency failure surfaced as machine-readable blocker

  candidate_safe_possible_for:
    - target_slot: interfaces.power.input_voltage
      basis: evidence complete and non-conflicting for this interface quantity only

  source_supported_possible_for:
    - target_slot: interfaces.power.input_voltage
      basis: cited synthetic official evidence is complete for value, unit, and condition

  not_claimed:
    - final_harness_connection_validity
    - final_circuit_synthesis
    - automatic_source_supported_join_promotion
    - global_page_readiness_from_partial_interface_evidence

enrichment_provenance:
  overlay_not_replacement: true
  public_safe_fixture: true
  source_authority_preserved:
    - page_module_spec_sidecar
    - official_source_inventory
    - owner_recorded_constraints
    - previous_harness_blocker_packet
  derivations_attempted:
    - target_slot: performance.max_power
      outcome: not_performed
      reason: required operand performance.max_current was not source_confirmed
  boundary_checks:
    - check: all_filled_values_have_source_refs_or_derivation_refs
      result: pass
    - check: missing_and_review_required_values_remain_visible
      result: pass
    - check: overlay_does_not_replace_sidecar
      result: pass
    - check: harness_readiness_is_delta_only
      result: pass
    - check: no_final_composition_approval_claim
      result: pass
    - check: no_raw_payloads_or_runtime_absolute_paths_in_public_package
      result: pass
    - check: no_secret_or_account_state_requested_from_agent
      result: pass

quantitative_enrichment_summary:
  page_id: PAGE-DEMO
  result: partial_quantitative_enrichment
  confirmed_quantities:
    - interfaces.power.input_voltage = 5 V nominal
  unresolved_quantities:
    - performance.max_current
    - performance.max_power
    - interfaces.aux.input_voltage
  key_reasons:
    - official source conflict on max current
    - max power derivation blocked by unresolved operand
    - aux voltage lacks approved evidence; label hint was not used
  stop_conditions_preserved:
    - no 12V fill from label
    - no derived max power while current evidence conflicts
    - no sidecar/schema/source mutation
    - no final connection approval
```
