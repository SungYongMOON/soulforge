{
  "workflow_output_identity": {
    "workflow_id": "xml_harness_composition_v0",
    "candidate_id": "MIG_gpt56_sol_low_shape_r2",
    "fixture_id": "xml_harness_composition_public_synthetic_001",
    "project_code": "PUBLIC_SYNTH_XML_HARNESS",
    "harness_id": "HARNESS_SYNTH_A",
    "output_status": "review_required",
    "authority": "derived_harness_candidate_only"
  },
  "input_asset_summary": {
    "page_level_assets": [
      {
        "asset_id": "PAGE_PWR_001",
        "module_id": "MOD_PWR_REG",
        "page_role": "power_regulator_page"
      },
      {
        "asset_id": "PAGE_CTRL_001",
        "module_id": "MOD_MCU",
        "page_role": "controller_page"
      },
      {
        "asset_id": "PAGE_SENS_001",
        "module_id": "MOD_SENSOR",
        "page_role": "sensor_page"
      }
    ],
    "component_materials_packet_count": 0,
    "layout_guide_packet_count": 0,
    "raw_xml_bodies_received": false,
    "all_source_assets_treated_as_immutable": true
  },
  "blocked_connections": [
    {
      "connection_id": "BLOCKED_INTERNAL_SW_TO_MCU",
      "hint_id": "HINT_INTERNAL_BAD",
      "from_interface_id": "SW_NODE_INTERNAL",
      "to_interface_id": "MCU_VDD_3V3",
      "status": "blocked",
      "reason_codes": [
        "local_internal_interface",
        "no_external_promotion_evidence",
        "unsafe_power_topology"
      ],
      "rationale": "SW_NODE_INTERNAL is classified as local_internal_only and cannot be promoted to an external harness interface. The owner hint supplies no source-backed promotion evidence."
    },
    {
      "connection_id": "BLOCKED_UART_TO_MISSING_DEBUG",
      "hint_id": "HINT_UART_TO_MISSING_DEBUG",
      "from_interface_id": "MCU_UART_TX",
      "to_interface_id": "DEBUG_RX_MISSING",
      "status": "blocked",
      "reason_codes": [
        "target_interface_absent",
        "debug_header_not_established",
        "missing_source_evidence"
      ],
      "rationale": "The fixture contains no DEBUG_RX_MISSING interface or debug-header asset. A target interface or header must not be invented."
    }
  ],
  "review_required_connections": [
    {
      "connection_id": "REVIEW_PWR_TO_SENSOR",
      "hint_id": "HINT_PWR_TO_SENSOR",
      "from_interface_id": "PWR_OUT_3V3",
      "to_interface_id": "SENSOR_VCC",
      "status": "review_required",
      "confirmed_compatibility": {
        "source_direction": "output",
        "target_direction": "input",
        "source_voltage_v": 3.3,
        "target_voltage_v": 3.3
      },
      "unresolved_evidence": [
        "SENSOR_VCC current requirement is missing.",
        "The regulator current budget cannot be checked against the combined controller and sensor demand."
      ],
      "required_follow_up": "Obtain source-backed sensor current requirements and verify the complete 3.3 V rail budget."
    },
    {
      "connection_id": "REVIEW_SENSOR_I2C_SDA",
      "hint_id": null,
      "from_interface_id": null,
      "to_interface_id": "SENSOR_SDA",
      "status": "review_required",
      "reason_codes": [
        "controller_side_interface_absent",
        "pullup_requirement_unresolved",
        "no_owner_connection_hint"
      ],
      "rationale": "The sensor exposes an I2C SDA interface, but no controller-side I2C interface or source-backed pullup requirement is established. No join is proposed."
    },
    {
      "connection_id": "REVIEW_SENSOR_I2C_SCL",
      "hint_id": null,
      "from_interface_id": null,
      "to_interface_id": "SENSOR_SCL",
      "status": "review_required",
      "reason_codes": [
        "controller_side_interface_absent",
        "pullup_requirement_unresolved",
        "no_owner_connection_hint"
      ],
      "rationale": "The sensor exposes an I2C SCL interface, but no controller-side I2C interface or source-backed pullup requirement is established. No join is proposed."
    }
  ],
  "candidate_safe_connections": [
    {
      "connection_id": "CANDIDATE_PWR_TO_MCU",
      "hint_id": "HINT_PWR_TO_MCU",
      "from_interface_id": "PWR_OUT_3V3",
      "to_interface_id": "MCU_VDD_3V3",
      "status": "candidate_safe",
      "basis": {
        "owner_intent_present": true,
        "direction_compatible": true,
        "voltage_compatible": true,
        "source_voltage_v": 3.3,
        "target_voltage_v": 3.3,
        "source_current_limit_ma": 500,
        "target_current_required_ma": 120,
        "individual_load_within_source_limit": true,
        "interface_evidence": "synthetic_source_backed"
      },
      "limitations": [
        "This is structural plausibility for owner review only.",
        "This classification is not final circuit approval.",
        "The total shared 3.3 V rail load remains incomplete while sensor current is unknown."
      ]
    }
  ],
  "source_supported_connections": [],
  "owner_follow_ups": [
    {
      "follow_up_id": "FOLLOWUP_SENSOR_CURRENT",
      "priority": "required",
      "question": "What is the source-backed maximum current requirement for SENSOR_VCC?",
      "blocks": [
        "PWR_OUT_3V3 to SENSOR_VCC classification",
        "complete 3.3 V rail budget verification"
      ]
    },
    {
      "follow_up_id": "FOLLOWUP_I2C_CONTROLLER",
      "priority": "required",
      "question": "Is an I2C controller interface intended, and if so, which source-backed controller interfaces should connect to SENSOR_SDA and SENSOR_SCL?",
      "blocks": [
        "sensor I2C harness joins"
      ]
    },
    {
      "follow_up_id": "FOLLOWUP_I2C_PULLUPS",
      "priority": "required",
      "question": "What source-backed I2C pullup requirements and implementation location apply?",
      "blocks": [
        "sensor I2C harness joins"
      ]
    },
    {
      "follow_up_id": "FOLLOWUP_DEBUG_INTERFACE",
      "priority": "required_if_debug_requested",
      "question": "Should a debug connector be introduced through a separately sourced and reviewed asset?",
      "blocks": [
        "MCU_UART_TX to debug receiver join"
      ]
    },
    {
      "follow_up_id": "FOLLOWUP_INTERNAL_PROMOTION",
      "priority": "required_if_requested",
      "question": "Is there explicit source-backed evidence authorizing any local/internal interface for external harness use?",
      "blocks": [
        "any external use of SW_NODE_INTERNAL or BOOT_STRAP_INTERNAL"
      ]
    }
  ],
  "open_questions": [
    {
      "question_id": "OPEN_TOTAL_3V3_LOAD",
      "status": "open",
      "question": "Does the combined maximum controller and sensor load remain within the regulator's 500 mA output limit?"
    },
    {
      "question_id": "OPEN_I2C_TOPOLOGY",
      "status": "open",
      "question": "What source-backed controller endpoints, bus directionality details, and pullup arrangement define the intended I2C topology?"
    },
    {
      "question_id": "OPEN_DEBUG_HEADER",
      "status": "open",
      "question": "Is a source-defined debug header part of the intended harness?"
    }
  ],
  "boundary_review": {
    "public_safe_handling": {
      "status": "passed",
      "raw_xml_included_in_output": false,
      "runtime_absolute_paths_included": false,
      "private_project_material_included": false,
      "credentials_or_secrets_included": false,
      "vendor_text_included": false
    },
    "immutability": {
      "status": "preserved",
      "source_xml_mutated": false,
      "sidecars_mutated": false,
      "intake_packets_mutated": false,
      "materials_packets_mutated": false,
      "layout_guides_mutated": false,
      "owner_material_mutated": false
    },
    "authority_limits": {
      "candidate_safe_is_final_circuit_approval": false,
      "output_grants_final_circuit_authority": false,
      "local_internal_candidates_promoted": false,
      "source_supported_empty_due_to_insufficient_cited_source_packets": true
    },
    "overall_status": "public_safe_candidate_packet_with_owner_review_required"
  }
}
