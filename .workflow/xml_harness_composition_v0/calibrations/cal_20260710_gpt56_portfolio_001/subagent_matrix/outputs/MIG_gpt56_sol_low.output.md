{
  "harness_identity": {
    "fixture_id": "xml_harness_composition_public_synthetic_001",
    "workflow_id": "xml_harness_composition_v0",
    "project_code": "PUBLIC_SYNTH_XML_HARNESS",
    "harness_id": "HARNESS_SYNTH_A",
    "packet_kind": "derived_harness_layer_packet",
    "public_safe": true,
    "source_assets_declared_immutable": true,
    "raw_source_xml_included": false,
    "final_circuit_authority": false
  },
  "connection_candidates": [
    {
      "candidate_id": "CONN_SYNTH_PWR_MCU_001",
      "from": {
        "asset_id": "PAGE_PWR_001",
        "interface_id": "PWR_OUT_3V3"
      },
      "to": {
        "asset_id": "PAGE_CTRL_001",
        "interface_id": "MCU_VDD_3V3"
      },
      "connection_kind": "power",
      "basis": [
        "HINT_PWR_TO_MCU",
        "compatible_declared_connection_kind",
        "compatible_declared_direction",
        "matching_declared_voltage",
        "declared_current_budget"
      ],
      "classification": "candidate_safe",
      "non_claim": "Structurally plausible for owner review only; not electrically approved or authorized for final circuit generation."
    },
    {
      "candidate_id": "CONN_SYNTH_PWR_SENSOR_001",
      "from": {
        "asset_id": "PAGE_PWR_001",
        "interface_id": "PWR_OUT_3V3"
      },
      "to": {
        "asset_id": "PAGE_SENS_001",
        "interface_id": "SENSOR_VCC"
      },
      "connection_kind": "power",
      "basis": [
        "HINT_PWR_TO_SENSOR",
        "compatible_declared_connection_kind",
        "compatible_declared_direction",
        "matching_declared_voltage"
      ],
      "classification": "blocked",
      "non_claim": "No compatibility or safety conclusion is available because the sensor source gap and current requirement remain unresolved."
    },
    {
      "candidate_id": "CONN_SYNTH_INTERNAL_MCU_001",
      "from": {
        "asset_id": "PAGE_PWR_001",
        "interface_id": "SW_NODE_INTERNAL"
      },
      "to": {
        "asset_id": "PAGE_CTRL_001",
        "interface_id": "MCU_VDD_3V3"
      },
      "connection_kind": "unknown",
      "basis": [
        "HINT_INTERNAL_BAD"
      ],
      "classification": "blocked",
      "non_claim": "The internal switching node is not an external harness interface."
    },
    {
      "candidate_id": "CONN_SYNTH_UART_DEBUG_001",
      "from": {
        "asset_id": "PAGE_CTRL_001",
        "interface_id": "MCU_UART_TX"
      },
      "to": {
        "asset_id": null,
        "interface_id": "DEBUG_RX_MISSING"
      },
      "connection_kind": "digital_signal",
      "basis": [
        "HINT_UART_TO_MISSING_DEBUG"
      ],
      "classification": "blocked",
      "non_claim": "The synthetic target interface has no corresponding page-level asset or module contract in the fixture."
    }
  ],
  "blocked_connections": [
    {
      "candidate_id": "CONN_SYNTH_PWR_SENSOR_001",
      "reasons": [
        "PAGE_SENS_001 has source_gap_packet_present.",
        "SENSOR_VCC current_required_ma is missing.",
        "Available evidence does not establish quantitative load compatibility."
      ],
      "release_conditions": [
        "Provide source-backed sensor current requirements.",
        "Resolve the PAGE_SENS_001 source-gap packet.",
        "Record quantitative compatibility with the regulator output budget."
      ]
    },
    {
      "candidate_id": "CONN_SYNTH_INTERNAL_MCU_001",
      "reasons": [
        "SW_NODE_INTERNAL is listed under local_internal_candidates.",
        "No promotion evidence establishes it as an external interface.",
        "Its declared switching-node role is incompatible with MCU_VDD_3V3 power input."
      ],
      "release_conditions": [
        "None within the current fixture.",
        "Do not promote the interface without explicit source-backed external-interface evidence."
      ]
    },
    {
      "candidate_id": "CONN_SYNTH_UART_DEBUG_001",
      "reasons": [
        "DEBUG_RX_MISSING is absent from the supplied page-level interfaces.",
        "Target asset identity, direction, logic level, source status, and quantitative constraints are unknown."
      ],
      "release_conditions": [
        "Supply a page-level asset and sidecar defining the debug receive interface.",
        "Establish source-backed direction, role, logic level, and applicable quantitative constraints."
      ]
    }
  ],
  "review_required_connections": [],
  "candidate_safe_connections": [
    {
      "candidate_id": "CONN_SYNTH_PWR_MCU_001",
      "structural_findings": {
        "source_interface_direction": "output",
        "target_interface_direction": "input",
        "source_voltage_v": 3.3,
        "target_voltage_v": 3.3,
        "source_current_limit_ma": 500,
        "target_current_required_ma": 120,
        "declared_budget_margin_ma": 380,
        "known_source_gap": false,
        "known_declared_conflict": false
      },
      "remaining_gates": [
        "Owner review",
        "Downstream electrical review",
        "Final circuit synthesis and netlist authority"
      ],
      "non_claim": "The declared fields support structural plausibility only. They do not establish final electrical safety, implementation approval, or completeness."
    }
  ],
  "source_supported_connections": [],
  "owner_followup_needed": [
    {
      "followup_id": "FOLLOWUP_SYNTH_001",
      "subject": "CONN_SYNTH_PWR_MCU_001",
      "request": "Decide whether the candidate-safe power join should proceed to downstream electrical review."
    },
    {
      "followup_id": "FOLLOWUP_SYNTH_002",
      "subject": "CONN_SYNTH_PWR_SENSOR_001",
      "request": "Provide or approve source-backed sensor current requirements and resolve the sensor source-gap packet."
    },
    {
      "followup_id": "FOLLOWUP_SYNTH_003",
      "subject": "CONN_SYNTH_INTERNAL_MCU_001",
      "request": "Withdraw the unsafe hint unless separate source-backed evidence explicitly changes the interface contract."
    },
    {
      "followup_id": "FOLLOWUP_SYNTH_004",
      "subject": "CONN_SYNTH_UART_DEBUG_001",
      "request": "Provide the missing debug-interface page contract if this connection remains intended."
    },
    {
      "followup_id": "FOLLOWUP_SYNTH_005",
      "subject": "PAGE_SENS_001_I2C",
      "request": "Define the controller-side I2C interfaces and establish source-backed pull-up requirements before proposing sensor I2C joins."
    }
  ],
  "harness_open_questions": [
    {
      "question_id": "OPEN_SYNTH_001",
      "question": "What is the source-backed maximum current requirement for SENSOR_VCC?",
      "blocking_scope": "Sensor power connection"
    },
    {
      "question_id": "OPEN_SYNTH_002",
      "question": "Which controller-side interfaces, if any, are intended for SENSOR_SDA and SENSOR_SCL?",
      "blocking_scope": "Sensor I2C connections"
    },
    {
      "question_id": "OPEN_SYNTH_003",
      "question": "What pull-up topology, voltage, and resistance constraints apply to the synthetic I2C interfaces?",
      "blocking_scope": "Sensor I2C connections"
    },
    {
      "question_id": "OPEN_SYNTH_004",
      "question": "What page asset and interface contract define DEBUG_RX_MISSING?",
      "blocking_scope": "Debug UART connection"
    },
    {
      "question_id": "OPEN_SYNTH_005",
      "question": "Are there additional loads on PWR_OUT_3V3 that must be included in the total current budget?",
      "blocking_scope": "Downstream electrical approval"
    }
  ],
  "composition_readiness": {
    "state": "partially_composed_owner_review_required",
    "candidate_safe_count": 1,
    "review_required_count": 0,
    "blocked_count": 3,
    "source_supported_count": 0,
    "unproposed_interface_groups": [
      {
        "interfaces": [
          "SENSOR_SDA",
          "SENSOR_SCL"
        ],
        "reason": "No controller-side I2C interfaces are supplied, and pull-up requirements remain unresolved."
      }
    ],
    "ready_for_final_circuit_generation": false,
    "ready_for_owner_review": true,
    "stop_conditions": [
      "Do not convert blocked connections into joins until their release conditions are satisfied.",
      "Do not propose sensor I2C joins without corresponding controller interfaces and resolved pull-up constraints.",
      "Do not treat local_internal_candidates as external interfaces without explicit source-backed promotion evidence.",
      "Do not classify any connection as source_supported from this fixture.",
      "Do not interpret candidate_safe as final circuit approval."
    ],
    "boundary_notes": [
      "No source XML body is included in this derived packet.",
      "The packet defines no mutation or write-back to source assets or upstream packets.",
      "All identifiers and references remain synthetic and public-safe.",
      "The absence of cited source packets strong enough to support a join keeps source_supported_connections empty.",
      "Runtime state and implementation verification are outside this deliverable."
    ]
  }
}
