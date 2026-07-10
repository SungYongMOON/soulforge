You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-luna; reasoning_effort=medium; species=human; class=auditor.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: xml_harness_composition_v0
kind: workflow
status: active
title: XML Harness Composition v0
summary: Compose a derived harness-layer packet from already prepared page-level XML assets, sidecars, intake packets, materials packets, and optional layout guides without mutating any library source asset.
entrypoint: run
execution_mode: local_tool_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
inputs:
  - harness_project_binding
  - page_level_asset_identities
  - page_module_sidecars
optional_inputs:
  - capture_intake_packets
  - component_materials_packets
  - layout_guide_packets
  - owner_connection_hints
outputs:
  - harness_identity
  - connection_candidates
  - blocked_connections
  - review_required_connections
  - candidate_safe_connections
  - source_supported_connections
  - owner_followup_needed
  - harness_open_questions
  - composition_readiness
validation_level: pilot_executed_private_fixture
upstream_workflows:
  - workflow_id: whole_xml_page_split_v0
    expected_output: page_xml_assets
  - workflow_id: page_xml_normalize_spec_v0
    expected_output: page_module_spec_v0_sidecars
  - workflow_id: capture_xml_intake_library_v0
    expected_output: page_level_or_whole_asset_intake_packets
  - workflow_id: exp_xml_component_materials
    expected_output: optional_component_materials_packets
  - workflow_id: component_pcb_layout_guide_extraction
    expected_output: optional_layout_guide_packets
notes:
  - This workflow creates a derived harness composition layer only; it is not final circuit synthesis, schematic generation, or netlist authority.
  - Library assets remain immutable. The workflow never rewrites source XML, normalized sidecars, intake packets, materials packets, layout guides, source packets, vendor collateral, or owner-provided source material.
  - The output is a project-local harness-layer packet that records possible joins, blockers, review gates, open questions, and readiness state.
  - "`local_internal_candidates` from page module specs are not external harness interfaces unless later source-backed evidence explicitly promotes them."
  - Missing source packets, source-gap packets, missing quantitative constraints, unknown directionality, or ambiguous interface ownership must produce `blocked` or `review_required` connection states rather than candidate-safe joins.
  - "`candidate_safe` means the join is structurally plausible for owner review; it does not mean the connection is electrically approved or ready for final circuit generation."
  - "`source_supported` is reserved for later runs where cited source evidence and quantitative compatibility are present; this first package defines the classification lane but does not overclaim automatic source support."
  - A first private pilot against representative power, interface, and ambiguous/channelized page assets produced only blocked and review-required joins, confirming that the workflow preserves missing-source and missing-quantitative blockers instead of fabricating candidate-safe connections.
  - Public workflow files must not contain raw XML bodies, private project payloads, vendor document text, runtime absolute paths, `_workspaces` outputs, credentials, cookies, or private run truth.


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: xml_harness_composition_v0
kind: step_graph
status: active
steps:
  - step_id: prepare_harness_binding
    title: Prepare Harness Binding
    actor_slot: workflow_runner
    action:
      kind: project_local_binding_setup
      requires:
        - harness_project_binding
        - page_level_asset_identities
        - page_module_sidecars
      validates:
        - output_root_is_project_local
        - source_assets_are_read_only
        - package_inputs_are_public_safe_references_or_project_local_bindings
      creates:
        - harness_run_log_root
        - harness_output_folder
    summary: Resolve the project-local harness output binding and confirm all upstream page assets are read-only inputs.
    next:
      on_success: collect_page_contracts
      on_fail: stop
  - step_id: collect_page_contracts
    title: Collect Page Contracts
    actor_slot: page_contract_collector
    action:
      kind: page_contract_inventory
      artifacts_in:
        - page_level_asset_identities
        - page_module_sidecars
        - capture_intake_packets
        - component_materials_packets
        - layout_guide_packets
      artifact_out: page_contract_inventory
      records:
        - page_asset_id
        - module_scope
        - system_contract_presence
        - interface_groups
        - electrical_domains
        - local_internal_candidates
        - source_gap_flags
        - quantitative_gap_flags
        - layout_gap_flags
        - provenance_refs
    summary: Build a conservative inventory of page-level module contracts and enrichment packets without copying raw payloads into the harness package.
    next:
      on_success: normalize_interface_terms
      on_fail: stop
  - step_id: normalize_interface_terms
    title: Normalize Interface Terms
    actor_slot: interface_normalizer
    action:
      kind: derived_contract_normalization
      artifact_in: page_contract_inventory
      artifact_out: normalized_interface_index
      connection_kinds:
        - power
        - ground
        - analog_signal
        - digital_signal
        - clock
        - control
        - status
        - mechanical_or_mounting
        - unknown
      preserves:
        - original_page_asset_id
        - original_interface_label
        - original_source_status
        - original_quantitative_status
      external_interface_rule: local_internal_candidates_are_excluded_by_default
    summary: Normalize labels and connection kinds for comparison while preserving original asset identity, evidence status, and local/internal separation.
    next:
      on_success: propose_connection_candidates
      on_fail: stop
  - step_id: propose_connection_candidates
    title: Propose Connection Candidates
    actor_slot: connection_candidate_builder
    action:
      kind: conservative_candidate_join
      artifact_in: normalized_interface_index
      artifact_out: connection_candidates
      candidate_basis:
        - explicit_matching_interface_id
        - compatible_declared_connection_kind
        - owner_connection_hint
        - source_supported_shared_net_or_connector_reference
        - compatible_page_scope_and_direction_when_declared
      forbidden_basis:
        - name_similarity_only
        - local_internal_candidate_without_promotion_evidence
        - missing_source_packet
        - missing_quantitative_limits
        - unresolved_no_connect_or_open_pin_state
    summary: Propose possible cross-page joins only when there is at least a conservative structural basis, and record the basis separately from approval state.
    next:
      on_success: classify_connection_safety
      on_fail: stop
  - step_id: classify_connection_safety
    title: Classify Connection Safety
    actor_slot: safety_classifier
    action:
      kind: harness_connection_classification
      artifact_in: connection_candidates
      artifacts_out:
        - blocked_connections
        - review_required_connections
        - candidate_safe_connections
        - source_supported_connections
      classification_states:
        blocked:
          - source_gap_packet_present
          - missing_required_source_packet
          - local_internal_candidate_misused_as_external
          - explicit_no_connect_or_conflict
          - incompatible_declared_connection_kind
        review_required:
          - missing_quantitative_constraints
          - direction_or_role_ambiguous
          - source_exists_but_does_not_cover_join
          - owner_hint_without_source_support
          - weak_name_or_label_alignment_only
        candidate_safe:
          - structurally_plausible
          - no_known_source_gap_or_conflict
          - required_quantitative_fields_present_or_declared_not_applicable
          - still_requires_owner_or_downstream_review
        source_supported:
          - cited_source_supports_join
          - quantitative_compatibility_recorded
          - direction_and_role_are_source_backed
          - no_unresolved_blockers
    summary: Partition every proposed join into explicit blocked, review-required, candidate-safe, or source-supported lanes without claiming final circuit safety.
    next:
      on_success: write_harness_packet
      on_fail: stop
  - step_id: write_harness_packet
    title: Write Harness Packet
    actor_slot: harness_packet_writer
    action:
      kind: derived_harness_packet_write
      artifacts_in:
        - page_contract_inventory
        - normalized_interface_index
        - connection_candidates
        - blocked_connections
        - review_required_connections
        - candidate_safe_connections
        - source_supported_connections
      artifact_out: harness_packet
      required_sections:
        - harness_identity
        - connection_candidates
        - blocked_connections
        - review_required_connections
        - candidate_safe_connections
        - source_supported_connections
        - owner_followup_needed
        - harness_open_questions
        - composition_readiness
      source_mutation_policy:
        write_back_to_upstream_assets: false
        write_derived_packet_only: true
    summary: Materialize a project-local derived harness packet with complete blocker and review rationale, leaving upstream assets untouched.
    next:
      on_success: boundary_and_readiness_review
      on_fail: stop
  - step_id: boundary_and_readiness_review
    title: Boundary And Readiness Review
    actor_slot: boundary_reviewer
    action:
      kind: boundary_and_readiness_review
      artifacts_in:
        - harness_packet
        - page_contract_inventory
      artifact_out: composition_readiness_note
      checks:
        - no_source_asset_mutation
        - no_raw_project_payload_in_public_package
        - blocked_and_review_required_connections_have_reasons
        - missing_source_and_missing_quantitative_gaps_are_preserved
        - candidate_safe_not_reported_as_final_circuit_synthesis
        - owner_followup_needed_is_explicit
    summary: Confirm that the harness packet is derived-only, public/private safe, and honest about remaining gates before any real pilot or downstream circuit work.
    next:
      on_success: complete
      on_fail: stop


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "fixture_id": "xml_harness_composition_public_synthetic_001",
  "fixture_kind": "public_safe_synthetic_workflow_contract_fixture",
  "workflow_id": "xml_harness_composition_v0",
  "public_safety": {
    "contains_real_xml_body": false,
    "contains_project_private_material": false,
    "contains_runtime_absolute_paths": false,
    "contains_credentials_or_secrets": false,
    "contains_vendor_text": false,
    "basis": "Synthetic fields derived from the public workflow contract only."
  },
  "harness_project_binding": {
    "project_code": "PUBLIC_SYNTH_XML_HARNESS",
    "harness_id": "HARNESS_SYNTH_A",
    "source_assets_are_immutable": true,
    "candidate_safe_is_not_final_circuit_approval": true,
    "local_internal_candidates_are_external_by_default": false
  },
  "page_level_asset_identities": [
    {
      "asset_id": "PAGE_PWR_001",
      "page_role": "power_regulator_page",
      "source_xml_ref": "public_synthetic_ref://pages/power",
      "raw_xml_body_included": false
    },
    {
      "asset_id": "PAGE_CTRL_001",
      "page_role": "controller_page",
      "source_xml_ref": "public_synthetic_ref://pages/controller",
      "raw_xml_body_included": false
    },
    {
      "asset_id": "PAGE_SENS_001",
      "page_role": "sensor_page",
      "source_xml_ref": "public_synthetic_ref://pages/sensor",
      "raw_xml_body_included": false
    }
  ],
  "page_module_sidecars": [
    {
      "asset_id": "PAGE_PWR_001",
      "module_id": "MOD_PWR_REG",
      "external_interfaces": [
        {
          "interface_id": "PWR_IN_5V",
          "label": "VIN_5V",
          "kind": "power",
          "direction": "input",
          "voltage_v": 5.0,
          "current_limit_ma": 1000,
          "source_evidence": "synthetic_source_backed"
        },
        {
          "interface_id": "PWR_OUT_3V3",
          "label": "VOUT_3V3",
          "kind": "power",
          "direction": "output",
          "voltage_v": 3.3,
          "current_limit_ma": 500,
          "source_evidence": "synthetic_source_backed"
        }
      ],
      "local_internal_candidates": [
        {
          "interface_id": "SW_NODE_INTERNAL",
          "label": "SW_NODE",
          "kind": "switching_node",
          "direction": "internal",
          "source_evidence": "local_internal_only"
        }
      ],
      "normalization_warnings": []
    },
    {
      "asset_id": "PAGE_CTRL_001",
      "module_id": "MOD_MCU",
      "external_interfaces": [
        {
          "interface_id": "MCU_VDD_3V3",
          "label": "VDD_3V3",
          "kind": "power",
          "direction": "input",
          "voltage_v": 3.3,
          "current_required_ma": 120,
          "source_evidence": "synthetic_source_backed"
        },
        {
          "interface_id": "MCU_UART_TX",
          "label": "UART_TX",
          "kind": "digital_uart",
          "direction": "output",
          "logic_level_v": 3.3,
          "source_evidence": "synthetic_source_backed"
        },
        {
          "interface_id": "MCU_UART_RX",
          "label": "UART_RX",
          "kind": "digital_uart",
          "direction": "input",
          "logic_level_v": 3.3,
          "source_evidence": "synthetic_source_backed"
        }
      ],
      "local_internal_candidates": [
        {
          "interface_id": "BOOT_STRAP_INTERNAL",
          "label": "BOOT0",
          "kind": "strap",
          "direction": "internal",
          "source_evidence": "local_internal_only"
        }
      ],
      "normalization_warnings": []
    },
    {
      "asset_id": "PAGE_SENS_001",
      "module_id": "MOD_SENSOR",
      "external_interfaces": [
        {
          "interface_id": "SENSOR_VCC",
          "label": "VCC_3V3",
          "kind": "power",
          "direction": "input",
          "voltage_v": 3.3,
          "current_required_ma": null,
          "source_evidence": "source_gap_missing_current"
        },
        {
          "interface_id": "SENSOR_SDA",
          "label": "I2C_SDA",
          "kind": "digital_i2c",
          "direction": "bidirectional",
          "logic_level_v": 3.3,
          "pullup_requirement": "unknown",
          "source_evidence": "source_gap_missing_pullup"
        },
        {
          "interface_id": "SENSOR_SCL",
          "label": "I2C_SCL",
          "kind": "digital_i2c",
          "direction": "input",
          "logic_level_v": 3.3,
          "pullup_requirement": "unknown",
          "source_evidence": "source_gap_missing_pullup"
        }
      ],
      "local_internal_candidates": [],
      "normalization_warnings": [
        "Sensor current requirement is missing.",
        "I2C pullup requirements are unresolved."
      ]
    }
  ],
  "capture_intake_packets": [
    {
      "asset_id": "PAGE_PWR_001",
      "intake_status": "reviewed_public_synthetic",
      "source_packet_status": "synthetic_source_backed"
    },
    {
      "asset_id": "PAGE_CTRL_001",
      "intake_status": "reviewed_public_synthetic",
      "source_packet_status": "synthetic_source_backed"
    },
    {
      "asset_id": "PAGE_SENS_001",
      "intake_status": "reviewed_public_synthetic",
      "source_packet_status": "source_gap_packet_present"
    }
  ],
  "component_materials_packets": [],
  "layout_guide_packets": [],
  "owner_connection_hints": [
    {
      "hint_id": "HINT_PWR_TO_MCU",
      "from_interface_id": "PWR_OUT_3V3",
      "to_interface_id": "MCU_VDD_3V3",
      "owner_intent": "Power the controller from the 3.3 V regulator output."
    },
    {
      "hint_id": "HINT_PWR_TO_SENSOR",
      "from_interface_id": "PWR_OUT_3V3",
      "to_interface_id": "SENSOR_VCC",
      "owner_intent": "Power the sensor from the 3.3 V regulator output."
    },
    {
      "hint_id": "HINT_INTERNAL_BAD",
      "from_interface_id": "SW_NODE_INTERNAL",
      "to_interface_id": "MCU_VDD_3V3",
      "owner_intent": "Intentionally unsafe hint to test local/internal exclusion."
    },
    {
      "hint_id": "HINT_UART_TO_MISSING_DEBUG",
      "from_interface_id": "MCU_UART_TX",
      "to_interface_id": "DEBUG_RX_MISSING",
      "owner_intent": "Expose UART to a debug header that is not present in the fixture."
    }
  ],
  "expected_workflow_behavior_summary": {
    "not_candidate_safe": [
      "SW_NODE_INTERNAL to MCU_VDD_3V3 because local_internal_candidates are excluded by default.",
      "PWR_OUT_3V3 to SENSOR_VCC because sensor current requirement is missing.",
      "MCU_UART_TX to DEBUG_RX_MISSING because the target interface is absent.",
      "Sensor I2C joins because no controller-side I2C interfaces or pullup requirements are established."
    ],
    "candidate_safe_possible": [
      "PWR_OUT_3V3 to MCU_VDD_3V3 can be candidate_safe only as owner-review structural plausibility, not final circuit approval, because direction, voltage, current budget, and source support are present."
    ],
    "source_supported_possible": [],
    "must_remain_explicit": [
      "No source XML body is included.",
      "No source asset is mutated.",
      "candidate_safe is not final circuit approval.",
      "source_supported remains empty because the fixture does not provide cited source packets strong enough for final support."
    ]
  }
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
