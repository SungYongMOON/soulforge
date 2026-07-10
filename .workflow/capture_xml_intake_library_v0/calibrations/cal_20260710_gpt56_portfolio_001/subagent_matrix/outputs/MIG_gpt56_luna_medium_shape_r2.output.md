{
  "asset_identity": {
    "asset_set_id": "synthetic:SYNTH_USB_CTRL",
    "source_asset": {
      "asset_id": "synthetic:exp_xml:SYNTH_USB_CTRL",
      "source_binding": "project_binding.synthetic_exp_xml_source",
      "source_type": "Cadence Capture EXP.xml",
      "read_only": true
    },
    "asset_version": 1,
    "scope": "whole_export",
    "mdd_attachment": {
      "state": "absent",
      "attachment_mode": "none",
      "next_action": "expected_later",
      "patch_workflow_id": "asset_patch_attach_mdd_v0"
    }
  },
  "block_summary": {
    "design_name": "SYNTH_USB_CTRL",
    "schematics": [
      {
        "name": "MAIN",
        "pages": [
          {
            "name": "PAGE1",
            "title": "USB power and controller"
          }
        ]
      }
    ],
    "cache_packages": [
      "PKG_STM32F030F4P6",
      "PKG_AP2112K_3V3",
      "PKG_USB_C_16P"
    ],
    "placed_instances": [
      {
        "refdes": "U1",
        "part_value": "Value",
        "recovered_identity": {
          "manufacturer": "STMicroelectronics",
          "manufacturer_part_number": "STM32F030F4P6",
          "confidence": "high",
          "basis": "referenced package properties"
        },
        "occurrence_path": "/MAIN/PAGE1/U1"
      },
      {
        "refdes": "U2",
        "part_value": "AP2112K-3.3TRG1",
        "manufacturer": "Diodes Incorporated",
        "manufacturer_part_number": "AP2112K-3.3TRG1",
        "occurrence_path": "/MAIN/PAGE1/U2"
      },
      {
        "refdes": "J1",
        "part_value": "USB-C-16P",
        "occurrence_path": "/MAIN/PAGE1/J1",
        "identity_status": "review_required"
      },
      {
        "refdes": "R1",
        "part_value": "5.1k",
        "occurrence_path": "/MAIN/PAGE1/R1",
        "identity_status": "generic_or_utility"
      },
      {
        "refdes": "R2",
        "part_value": "5.1k",
        "occurrence_path": "/MAIN/PAGE1/R2",
        "identity_status": "generic_or_utility"
      },
      {
        "refdes": "C1",
        "part_value": "10uF",
        "occurrence_path": "/MAIN/PAGE1/C1",
        "identity_status": "generic_or_utility"
      },
      {
        "refdes": "TP1",
        "part_value": "TESTPOINT",
        "occurrence_path": "/MAIN/PAGE1/TP1",
        "identity_status": "generic_or_utility"
      }
    ]
  },
  "extracted_nets": {
    "connectivity_status": "explicit_net_table",
    "confirmed": [
      {
        "net_name": "VBUS",
        "pins": [
          "J1:A4",
          "J1:B4",
          "U2:IN",
          "U2:EN",
          "TP1:1"
        ]
      },
      {
        "net_name": "+3V3",
        "global": true,
        "pins": [
          "U2:OUT",
          "U1:VDD",
          "C1:1"
        ]
      },
      {
        "net_name": "GND",
        "global": true,
        "pins": [
          "J1:A1",
          "J1:B1",
          "U2:GND",
          "U1:VSS",
          "C1:2",
          "R1:2",
          "R2:2"
        ]
      },
      {
        "net_name": "USB_CC1",
        "pins": [
          "J1:CC1",
          "R1:1"
        ]
      }
    ],
    "no_connect": [
      {
        "pin": "U1:PA13",
        "reason": "debug header omitted",
        "status": "review_visible"
      }
    ],
    "not_inferred": [
      "USB_CC2 connectivity is not established because no explicit USB_CC2 net record is present."
    ]
  },
  "connectors": {
    "confirmed": [],
    "candidates": [
      {
        "refdes": "J1",
        "symbol_or_value": "USB-C-16P",
        "interface": "USB-C",
        "status": "review_required",
        "evidence": [
          "reference designator J",
          "component value USB-C-16P",
          "explicit USB-related pin observations"
        ],
        "missing_evidence": [
          "manufacturer",
          "manufacturer_part_number"
        ]
      }
    ],
    "review_required": [
      "Do not promote J1 to confirmed connector identity without component evidence."
    ]
  },
  "power_summary": {
    "confirmed_power_nets": [
      {
        "net_name": "VBUS",
        "evidence": "explicit net record"
      },
      {
        "net_name": "+3V3",
        "evidence": "explicit net and global record"
      }
    ],
    "candidate_power_nets": [],
    "confirmed_ground_nets": [
      {
        "net_name": "GND",
        "evidence": "explicit net and global record"
      }
    ],
    "candidate_ground_nets": [],
    "enable_or_uvlo_pins": [
      {
        "pin": "U2:EN",
        "net_name": "VBUS",
        "evidence": "explicit net record"
      }
    ],
    "sense_or_feedback_pins": [],
    "no_connect_pins": [
      "U1:PA13"
    ],
    "unresolved_power_questions": []
  },
  "open_questions": [
    {
      "id": "OQ-001",
      "topic": "connector_identity",
      "status": "open",
      "question": "What are the manufacturer and manufacturer part number for J1?"
    },
    {
      "id": "OQ-002",
      "topic": "usb_cc2",
      "status": "open",
      "question": "Is USB_CC2 intentionally absent, or does the source require further review?"
    },
    {
      "id": "OQ-003",
      "topic": "no_connect",
      "status": "review_required",
      "question": "Confirm that U1:PA13 is intentionally left unconnected because the debug header was omitted."
    }
  ],
  "pcb_pairing_placeholder": {
    "state": "expected_later",
    "xml_asset_id": "synthetic:exp_xml:SYNTH_USB_CTRL",
    "mdd_asset": null,
    "pairing_status": "not_established",
    "next_workflow_id": "asset_patch_attach_mdd_v0",
    "non_claim": "No XML/MDD pairing is asserted."
  },
  "provenance": {
    "calibration_id": "20260514-135122_staged_cli_matrix",
    "workflow_id": "capture_xml_intake_library_v0",
    "fixture_type": "public_safe_synthetic",
    "source_file_identity": "synthetic:exp_xml:SYNTH_USB_CTRL",
    "input_scope": "whole_export",
    "xml_shape_summary": {
      "root_element": "CISExport",
      "schema_marker": "ExportVersion=17.4",
      "schematic_count": 1,
      "page_count": 1,
      "cache_package_count": 3,
      "placed_instance_count": 7,
      "occurrence_count": 7,
      "explicit_net_record_count": 4,
      "parser_mode": "explicit_net_table"
    },
    "source_policy": "read_only_preserve_source_xml",
    "source_mutation_check": "not asserted beyond the contract; source is designated read-only",
    "raw_xml_included": false,
    "runtime_absolute_paths_included": false,
    "created_at": "not supplied",
    "tool_version_or_script_identity": "not supplied"
  },
  "downstream_handoff": {
    "workflow_id": "exp_xml_component_materials",
    "expected_input": "exp_xml_source",
    "exp_xml_source": "project_binding.synthetic_exp_xml_source",
    "context": {
      "asset_identity": "synthetic:exp_xml:SYNTH_USB_CTRL",
      "scope": "whole_export",
      "placed_component_count": 7,
      "connector_candidates": [
        "J1"
      ],
      "confirmed_power_nets": [
        "VBUS",
        "+3V3"
      ],
      "confirmed_ground_nets": [
        "GND"
      ],
      "open_question_ids": [
        "OQ-001",
        "OQ-002",
        "OQ-003"
      ]
    },
    "raw_xml_embedded": false,
    "runtime_absolute_paths_embedded": false,
    "readiness": {
      "asset_identity_present": true,
      "mdd_placeholder_present": true,
      "confirmed_and_unresolved_separated": true,
      "downstream_material_collection_required": true
    }
  }
}
