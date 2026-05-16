{
  "xml_shape_summary": {
    "root_element": "CISExport",
    "design_name": "SYNTH_USB_CTRL",
    "export_version": "17.4",
    "schematic_count": 1,
    "page_count": 1,
    "package_cache_count": 3,
    "placed_instance_count": 7,
    "explicit_net_record_count": 4,
    "parser_mode": "explicit_net_table",
    "separation_note": "PartInst records are treated as placed instances; Package records are treated only as library/cache context."
  },
  "block_summary": {
    "placed_instances": [
      {
        "refdes": "U1",
        "kind": "placed_instance",
        "part_value_observed": "Value",
        "package_ref": "PKG_STM32F030F4P6",
        "identity_status": "recovered_high_confidence",
        "recovered_identity": {
          "manufacturer": "STMicroelectronics",
          "manufacturer_part_number": "STM32F030F4P6",
          "footprint": "TSSOP20",
          "evidence": "referenced Package SymbolUserProp values"
        }
      },
      {
        "refdes": "U2",
        "kind": "placed_instance",
        "part_value_observed": "AP2112K-3.3TRG1",
        "package_ref": "PKG_AP2112K_3V3",
        "identity_status": "confirmed_from_partinst_with_package_support",
        "manufacturer": "Diodes Incorporated",
        "manufacturer_part_number": "AP2112K-3.3TRG1",
        "footprint": "SOT23-5"
      },
      {
        "refdes": "J1",
        "kind": "placed_instance",
        "part_value_observed": "USB-C-16P",
        "package_ref": "PKG_USB_C_16P",
        "identity_status": "review_required",
        "reason": "connector candidate lacks manufacturer and MPN evidence"
      },
      {
        "refdes": "R1",
        "kind": "placed_instance",
        "part_value_observed": "5.1k",
        "package_ref": "0603",
        "identity_status": "generic_passive"
      },
      {
        "refdes": "R2",
        "kind": "placed_instance",
        "part_value_observed": "5.1k",
        "package_ref": "0603",
        "identity_status": "generic_passive"
      },
      {
        "refdes": "C1",
        "kind": "placed_instance",
        "part_value_observed": "10uF",
        "package_ref": "0603",
        "identity_status": "generic_passive"
      },
      {
        "refdes": "TP1",
        "kind": "placed_instance",
        "part_value_observed": "TESTPOINT",
        "package_ref": "TP",
        "identity_status": "utility_part"
      }
    ],
    "package_cache_context": [
      {
        "package_name": "PKG_STM32F030F4P6",
        "context_only": true,
        "manufacturer": "STMicroelectronics",
        "manufacturer_part_number": "STM32F030F4P6",
        "footprint": "TSSOP20"
      },
      {
        "package_name": "PKG_AP2112K_3V3",
        "context_only": true,
        "manufacturer": "Diodes Incorporated",
        "manufacturer_part_number": "AP2112K-3.3TRG1",
        "footprint": "SOT23-5"
      },
      {
        "package_name": "PKG_USB_C_16P",
        "context_only": true,
        "footprint": "USB_C_RECEPTACLE"
      }
    ],
    "no_connect_evidence": [
      {
        "refdes": "U1",
        "pin": "PA13",
        "status": "explicit_no_connect",
        "reason": "debug header omitted",
        "review_visible": true
      }
    ]
  },
  "extracted_nets": [
    {
      "name": "VBUS",
      "status": "explicit",
      "port": {
        "name": "VBUS_IN",
        "direction": "input"
      },
      "pins": [
        "J1.A4",
        "J1.B4",
        "U2.IN",
        "U2.EN",
        "TP1.1"
      ]
    },
    {
      "name": "+3V3",
      "status": "explicit_global",
      "pins": [
        "U2.OUT",
        "U1.VDD",
        "C1.1"
      ]
    },
    {
      "name": "GND",
      "status": "explicit_global",
      "pins": [
        "J1.A1",
        "J1.B1",
        "U2.GND",
        "U1.VSS",
        "C1.2",
        "R1.2",
        "R2.2"
      ]
    },
    {
      "name": "USB_CC1",
      "status": "explicit",
      "pins": [
        "J1.CC1",
        "R1.1"
      ]
    }
  ],
  "connectors": [
    {
      "refdes": "J1",
      "observed_role": "USB-C receptacle candidate",
      "part_value_observed": "USB-C-16P",
      "footprint_observed": "USB_C_RECEPTACLE",
      "identity_status": "review_required",
      "confirmed_pins_from_explicit_nets": [
        "A4",
        "B4",
        "A1",
        "B1",
        "CC1"
      ],
      "not_inferred": [
        "USB_CC2",
        "manufacturer",
        "manufacturer_part_number"
      ]
    }
  ],
  "power_summary": {
    "input_power": {
      "net": "VBUS",
      "source_evidence": [
        "VBUS_IN input port",
        "J1 A4/B4",
        "U2 IN",
        "U2 EN",
        "TP1 pin 1"
      ]
    },
    "regulated_power": {
      "net": "+3V3",
      "source_evidence": [
        "U2 OUT",
        "U1 VDD",
        "C1 pin 1"
      ]
    },
    "ground": {
      "net": "GND",
      "source_evidence": [
        "J1 A1/B1",
        "U2 GND",
        "U1 VSS",
        "C1 pin 2",
        "R1 pin 2",
        "R2 pin 2"
      ]
    }
  },
  "open_questions": [
    {
      "item": "J1",
      "status": "review_required",
      "question": "Confirm connector manufacturer and manufacturer part number."
    },
    {
      "item": "R2",
      "status": "unresolved_connectivity_context",
      "question": "R2 pin 1 has no explicit net in the fixture; do not assign it to USB_CC2 without source evidence."
    },
    {
      "item": "U1.PA13",
      "status": "review_visible_no_connect",
      "question": "Confirm that omitted debug header/no-connect treatment is intended for downstream schematic material checks."
    }
  ],
  "provenance": {
    "calibration_id": "20260514-135122_staged_cli_matrix",
    "workflow_id": "capture_xml_intake_library_v0",
    "fixture_type": "public_safe_synthetic",
    "source_identity": "project_binding.synthetic_exp_xml_source",
    "source_policy": "read_only_preserve_source_xml",
    "validation_claims": "No command execution, file inspection, browsing, source mutation, or external validation performed."
  },
  "downstream_handoff": {
    "target_workflow": "exp_xml_component_materials",
    "required_downstream_input": {
      "exp_xml_source_identity": "project_binding.synthetic_exp_xml_source"
    },
    "hints": {
      "confirmed_or_recovered_components": [
        "U1: STMicroelectronics STM32F030F4P6, recovered from package evidence",
        "U2: Diodes Incorporated AP2112K-3.3TRG1"
      ],
      "review_required_components": [
        "J1 USB-C connector candidate"
      ],
      "power_nets": [
        "VBUS",
        "+3V3",
        "GND"
      ],
      "interface_nets": [
        "USB_CC1"
      ],
      "no_connects": [
        "U1.PA13"
      ],
      "do_not_infer": [
        "USB_CC2"
      ]
    },
    "raw_xml_embedded": false,
    "runtime_absolute_paths_embedded": false
  },
  "boundary_notes": [
    "Used only the public-safe synthetic fixture supplied in the prompt.",
    "Did not embed raw XML or private project payloads.",
    "Did not infer nets, pin links, manufacturers, or MPNs absent from fixture evidence.",
    "Package records were used only as cache context unless referenced by a placed PartInst."
  ],
  "readiness_note": "Compact intake packet is ready for downstream component-materials review with J1 and U1.PA13 kept review-visible.",
  "quality_self_check": {
    "covered_requirements": [
      "Included required top-level intake sections.",
      "Kept PartInst placed instances separate from Package cache context.",
      "Recovered U1 identity from package evidence despite placeholder PartValue.",
      "Kept J1 review_required due to missing manufacturer and MPN evidence.",
      "Did not infer USB_CC2 from R2.",
      "Captured U1 PA13 explicit no-connect evidence.",
      "Handed off source identity to exp_xml_component_materials.",
      "Avoided raw XML, runtime absolute paths, credentials, cookies, and private-state data."
    ],
    "gaps": [
      "No external datasheet or library validation was performed or claimed.",
      "Connector identity remains unresolved because the fixture lacks manufacturer and MPN evidence.",
      "R2 pin 1 connectivity remains unknown because no explicit net is present."
    ],
    "boundary_notes": [
      "Output is derived solely from the synthetic fixture.",
      "No commands, browsing, local file inspection, or source mutation were used.",
      "Confirmed observations, candidates, and review-required items are separated."
    ]
  }
}