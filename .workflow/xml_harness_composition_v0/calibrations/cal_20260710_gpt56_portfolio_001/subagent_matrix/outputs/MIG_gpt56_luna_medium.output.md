{
  "harness_identity": {
    "workflow_id": "xml_harness_composition_v0",
    "fixture_id": "xml_harness_composition_public_synthetic_001",
    "project_code": "PUBLIC_SYNTH_XML_HARNESS",
    "harness_id": "HARNESS_SYNTH_A",
    "composition_layer": "derived_harness_only",
    "source_assets_immutable": true,
    "raw_xml_included": false,
    "final_circuit_authority": false
  },
  "connection_candidates": [
    {
      "candidate_id": "CAND_PWR_MCU_3V3",
      "from_asset_id": "PAGE_PWR_001",
      "from_interface_id": "PWR_OUT_3V3",
      "to_asset_id": "PAGE_CTRL_001",
      "to_interface_id": "MCU_VDD_3V3",
      "connection_kind": "power",
      "basis": [
        "owner_connection_hint",
        "compatible_declared_connection_kind",
        "declared_direction",
        "declared_voltage_compatibility",
        "declared_current_budget"
      ],
      "classification": "candidate_safe",
      "owner_review_required": true,
      "electrical_approval": false
    },
    {
      "candidate_id": "CAND_PWR_SENSOR_3V3",
      "from_asset_id": "PAGE_PWR_001",
      "from_interface_id": "PWR_OUT_3V3",
      "to_asset_id": "PAGE_SENS_001",
      "to_interface_id": "SENSOR_VCC",
      "connection_kind": "power",
      "basis": [
        "owner_connection_hint",
        "compatible_declared_connection_kind",
        "declared_voltage_compatibility"
      ],
      "classification": "review_required",
      "reasons": [
        "sensor_current_requirement_missing",
        "source_gap_packet_present"
      ]
    },
    {
      "candidate_id": "CAND_INTERNAL_BAD",
      "from_asset_id": "PAGE_PWR_001",
      "from_interface_id": "SW_NODE_INTERNAL",
      "to_asset_id": "PAGE_CTRL_001",
      "to_interface_id": "MCU_VDD_3V3",
      "connection_kind": "power",
      "basis": [
        "owner_connection_hint"
      ],
      "classification": "blocked",
      "reasons": [
        "source_interface_is_local_internal_candidate",
        "local_internal_candidates_are_excluded_from_external_harness_joins_by_default"
      ]
    },
    {
      "candidate_id": "CAND_UART_DEBUG_MISSING",
      "from_asset_id": "PAGE_CTRL_001",
      "from_interface_id": "MCU_UART_TX",
      "to_asset_id": null,
      "to_interface_id": "DEBUG_RX_MISSING",
      "connection_kind": "digital_signal",
      "basis": [
        "owner_connection_hint"
      ],
      "classification": "blocked",
      "reasons": [
        "target_interface_absent_from_fixture",
        "external_endpoint_identity_unresolved"
      ]
    }
  ],
  "blocked_connections": [
    {
      "candidate_id": "CAND_INTERNAL_BAD",
      "reasons": [
        "local_internal_candidate_misused_as_external"
      ]
    },
    {
      "candidate_id": "CAND_UART_DEBUG_MISSING",
      "reasons": [
        "target_interface_absent",
        "endpoint_identity_unresolved"
      ]
    }
  ],
  "review_required_connections": [
    {
      "candidate_id": "CAND_PWR_SENSOR_3V3",
      "reasons": [
        "missing_sensor_current_requirement",
        "source_gap_packet_present"
      ]
    }
  ],
  "candidate_safe_connections": [
    {
      "candidate_id": "CAND_PWR_MCU_3V3",
      "basis": [
        "structurally_plausible",
        "voltage_declared_compatible",
        "current_budget_declared",
        "direction_declared",
        "owner_connection_hint_present"
      ],
      "limits": [
        "requires_owner_or_downstream_review",
        "not_electrically_approved",
        "not_final_circuit_synthesis"
      ]
    }
  ],
  "source_supported_connections": [],
  "owner_followup_needed": [
    {
      "topic": "sensor_power_budget",
      "question": "Provide the sensor current requirement and supporting source packet before evaluating the 3.3 V power join."
    },
    {
      "topic": "debug_endpoint",
      "question": "Identify or provide the missing debug receive interface before considering the UART join."
    },
    {
      "topic": "sensor_i2c",
      "question": "Provide controller-side I2C interfaces and source-backed pullup requirements before proposing sensor I2C joins."
    },
    {
      "topic": "candidate_safe_power_join",
      "question": "Review the regulator-to-controller 3.3 V join; candidate_safe does not constitute electrical approval."
    }
  ],
  "harness_open_questions": [
    "What is the sensor supply-current requirement?",
    "What pullup configuration and limits apply to SENSOR_SDA and SENSOR_SCL?",
    "Which controller-side interfaces, if any, connect to the sensor I2C signals?",
    "Does DEBUG_RX_MISSING correspond to an intended external interface?",
    "Are any additional source-backed connector, net, or ownership references available?"
  ],
  "composition_readiness": {
    "state": "not_ready_for_final_circuit_generation",
    "summary": "The derived harness layer contains one candidate-safe structural join, one review-required join, and two blocked joins. No source-supported joins are established.",
    "blocking_conditions": [
      "sensor source and quantitative gaps remain",
      "debug target interface is absent",
      "sensor I2C counterpart and pullup requirements are unresolved"
    ],
    "boundary_conditions": [
      "upstream source assets remain immutable",
      "raw XML bodies are not included",
      "candidate_safe is not final circuit approval",
      "source_supported remains empty"
    ]
  }
}
