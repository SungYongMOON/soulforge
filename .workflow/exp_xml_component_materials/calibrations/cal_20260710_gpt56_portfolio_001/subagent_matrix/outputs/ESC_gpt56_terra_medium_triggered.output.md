{
  "component_inventory": {
    "input_scope": "page_fragment",
    "coverage_statement": "Page-level inventory only; this fixture does not establish full-design component coverage.",
    "parser_mode": "structured_xml_parse",
    "placed_components": [
      {
        "refdes": "U10",
        "instance_name": "U10",
        "value": "LT8624SAV#PBF",
        "symbol_name": "PKG_LT8624SAV",
        "manufacturer": "Analog Devices",
        "manufacturer_part_number": "LT8624SAV#PBF",
        "package": "LQFN-24",
        "source_property_names": [
          "PartInst.PartValue",
          "Package.SymbolUserProp.Manufacturer_Part_Number",
          "Package.SymbolUserProp.Mfr_Name",
          "Package.SymbolUserProp.PackageName",
          "Package.SymbolUserProp.PCB Footprint",
          "PartInst.PartInstUserProp.PCB Footprint"
        ],
        "identity_confidence": "high_package_symboluserprop_fallback",
        "identity_note": "PartInst PartValue is the placeholder \"Value\"; identity is recovered from the matching Package SymbolUserProp definition."
      },
      {
        "refdes": "L10",
        "instance_name": "L10",
        "value": "2.2uH",
        "symbol_name": "IND_1210",
        "manufacturer": null,
        "manufacturer_part_number": null,
        "package": "IND_1210",
        "source_property_names": [
          "PartInst.PartValue",
          "PartInst.Package"
        ],
        "identity_confidence": "insufficient_generic_passive",
        "identity_note": "No manufacturer or manufacturer part number is present."
      },
      {
        "refdes": "C10",
        "instance_name": "C10",
        "value": "10uF",
        "symbol_name": "0603",
        "manufacturer": null,
        "manufacturer_part_number": null,
        "package": "0603",
        "source_property_names": [
          "PartInst.PartValue",
          "PartInst.Package"
        ],
        "identity_confidence": "insufficient_generic_passive",
        "identity_note": "No manufacturer or manufacturer part number is present."
      },
      {
        "refdes": "R10",
        "instance_name": "R10",
        "value": "100k",
        "symbol_name": "0603",
        "manufacturer": null,
        "manufacturer_part_number": null,
        "package": "0603",
        "source_property_names": [
          "PartInst.PartValue",
          "PartInst.Package"
        ],
        "identity_confidence": "insufficient_generic_passive",
        "identity_note": "No manufacturer or manufacturer part number is present."
      },
      {
        "refdes": "TP10",
        "instance_name": "TP10",
        "value": "TESTPOINT",
        "symbol_name": "TP",
        "manufacturer": null,
        "manufacturer_part_number": null,
        "package": "TP",
        "source_property_names": [
          "PartInst.PartValue",
          "PartInst.Package"
        ],
        "identity_confidence": "review_required_test_point",
        "identity_note": "Test point has no manufacturer or manufacturer part number evidence."
      }
    ],
    "excluded_handoff_only_references": [
      "J10",
      "U11"
    ]
  },
  "intake_context_note": {
    "status": "accepted_as_context_only",
    "source_workflow_id": "capture_xml_intake_library_v0",
    "authoritative_inventory_source": "exp_xml_excerpt",
    "priority_hints_applied": [
      {
        "refdes": "U10",
        "effect": "Prioritize official datasheet and evaluation/reference-design material discovery after EXP confirmation."
      }
    ],
    "non_confirming_context": [
      "J10 is handoff-only and is not an inventory row.",
      "U11 is handoff-only and is not an inventory row.",
      "The handoff does not confirm connector identity, electrical connectivity, or full-design coverage."
    ],
    "open_questions_forwarded_to_review": [
      "Page fragment cannot prove full-design component coverage.",
      "Cross-page topology and harness boundary remain unresolved.",
      "L10, C10, and R10 lack manufacturer and manufacturer-part-number evidence."
    ]
  },
  "source_discovery_packet": {
    "official_source_policy": "official_sources_first",
    "components": [
      {
        "component_key": "analog_devices_lt8624sav_pbf",
        "refdes": [
          "U10"
        ],
        "manufacturer": "Analog Devices",
        "manufacturer_part_number": "LT8624SAV#PBF",
        "product_page": "https://www.analog.com/en/products/lt8624s.html",
        "datasheet_candidate": {
          "source_url": "https://www.analog.com/media/en/technical-documentation/data-sheets/lt8624s.pdf",
          "provenance": "official_manufacturer",
          "material_status": "owner_approved_local_official_collateral"
        },
        "eval_candidates": [
          {
            "type": "evaluation_board_user_guide",
            "source_url": "https://www.analog.com/media/en/technical-documentation/user-guides/dc3215a.pdf",
            "provenance": "official_manufacturer",
            "material_status": "owner_approved_local_official_collateral"
          },
          {
            "type": "reference_design_archive",
            "source_url": "https://www.analog.com/media/en/reference-design-documentation/design-integration-files/dc3215a_design_files.zip",
            "provenance": "official_manufacturer",
            "material_status": "owner_approved_local_official_collateral"
          }
        ]
      }
    ],
    "no_query_without_mpn": [
      "L10",
      "C10",
      "R10",
      "TP10"
    ]
  },
  "parts_materials_tree": {
    "materials_root": "_workspaces/<project_code>/reference_materials/page_lt8624s",
    "scope_note": "Synthetic page-fragment materials layout; no full-design materials coverage is implied.",
    "tree": {
      "parts": {
        "analog_devices_lt8624sav_pbf": {
          "DATA Sheet": [
            "LT8624S_datasheet_owner_copy.pdf"
          ],
          "EVAL": [
            "DC3215A_user_guide_owner_copy.pdf",
            "DC3215A_design_files_owner_copy.zip"
          ]
        }
      }
    },
    "review_required_without_material_folder": [
      "L10",
      "C10",
      "R10",
      "TP10"
    ]
  },
  "download_manifest": {
    "completion_semantics": "Records owner-approved local official collateral evidence; URLs alone are not treated as completed material.",
    "entries": [
      {
        "component_key": "analog_devices_lt8624sav_pbf",
        "refdes": [
          "U10"
        ],
        "destination_folder": "parts/analog_devices_lt8624sav_pbf/DATA Sheet",
        "file_name": "LT8624S_datasheet_owner_copy.pdf",
        "material_type": "datasheet",
        "material_status": "owner_approved_local_official_collateral",
        "source_url": "https://www.analog.com/media/en/technical-documentation/data-sheets/lt8624s.pdf",
        "provenance": "official_manufacturer",
        "byte_size": 2512345,
        "content_type_or_file_magic": "%PDF-",
        "completion_status": "local_reuse_evidence_supplied"
      },
      {
        "component_key": "analog_devices_lt8624sav_pbf",
        "refdes": [
          "U10"
        ],
        "destination_folder": "parts/analog_devices_lt8624sav_pbf/EVAL",
        "file_name": "DC3215A_user_guide_owner_copy.pdf",
        "material_type": "evaluation_board_user_guide",
        "material_status": "owner_approved_local_official_collateral",
        "source_url": "https://www.analog.com/media/en/technical-documentation/user-guides/dc3215a.pdf",
        "provenance": "official_manufacturer",
        "byte_size": 887766,
        "content_type_or_file_magic": "%PDF-",
        "completion_status": "local_reuse_evidence_supplied"
      },
      {
        "component_key": "analog_devices_lt8624sav_pbf",
        "refdes": [
          "U10"
        ],
        "destination_folder": "parts/analog_devices_lt8624sav_pbf/EVAL",
        "file_name": "DC3215A_design_files_owner_copy.zip",
        "material_type": "reference_design_archive",
        "material_status": "owner_approved_local_official_collateral",
        "source_url": "https://www.analog.com/media/en/reference-design-documentation/design-integration-files/dc3215a_design_files.zip",
        "provenance": "official_manufacturer",
        "byte_size": 456789,
        "content_type_or_file_magic": "PK",
        "completion_status": "local_reuse_evidence_supplied"
      }
    ],
    "not_completed_or_not_applicable": [
      {
        "refdes": "L10",
        "reason": "Generic inductor without manufacturer part number; official collateral query is not justified."
      },
      {
        "refdes": "C10",
        "reason": "Generic capacitor without manufacturer part number; official collateral query is not justified."
      },
      {
        "refdes": "R10",
        "reason": "Generic resistor without manufacturer part number; official collateral query is not justified."
      },
      {
        "refdes": "TP10",
        "reason": "Test point without manufacturer part number; official collateral query is not justified."
      }
    ]
  },
  "downloaded_file_checksum_manifest": {
    "algorithm": "SHA256",
    "entries": [
      {
        "component_key": "analog_devices_lt8624sav_pbf",
        "file_name": "LT8624S_datasheet_owner_copy.pdf",
        "relative_path": "parts/analog_devices_lt8624sav_pbf/DATA Sheet/LT8624S_datasheet_owner_copy.pdf",
        "byte_size": 2512345,
        "file_magic": "%PDF-",
        "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "evidence_status": "fixture_supplied_owner_approved_local_official_collateral"
      },
      {
        "component_key": "analog_devices_lt8624sav_pbf",
        "file_name": "DC3215A_user_guide_owner_copy.pdf",
        "relative_path": "parts/analog_devices_lt8624sav_pbf/EVAL/DC3215A_user_guide_owner_copy.pdf",
        "byte_size": 887766,
        "file_magic": "%PDF-",
        "sha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        "evidence_status": "fixture_supplied_owner_approved_local_official_collateral"
      },
      {
        "component_key": "analog_devices_lt8624sav_pbf",
        "file_name": "DC3215A_design_files_owner_copy.zip",
        "relative_path": "parts/analog_devices_lt8624sav_pbf/EVAL/DC3215A_design_files_owner_copy.zip",
        "byte_size": 456789,
        "file_magic": "PK",
        "sha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        "evidence_status": "fixture_supplied_owner_approved_local_official_collateral"
      }
    ]
  },
  "circuit_design_review_queue": {
    "ready_for_page_level_reference": [
      {
        "refdes": "U10",
        "component_key": "analog_devices_lt8624sav_pbf",
        "readiness": "conditional",
        "note": "Identity is supported by Package SymbolUserProp fallback and official-source collateral evidence is supplied. Page-fragment scope and unresolved topology remain limitations."
      }
    ],
    "owner_review_required": [
      {
        "refdes": "L10",
        "reason": "Select or confirm manufacturer part number, current rating, saturation characteristics, and footprint suitability before collecting component-specific materials."
      },
      {
        "refdes": "C10",
        "reason": "Select or confirm manufacturer part number, voltage rating, dielectric, capacitance bias behavior, and footprint suitability before collecting component-specific materials."
      },
      {
        "refdes": "R10",
        "reason": "Select or confirm manufacturer part number, tolerance, rating, and footprint suitability before collecting component-specific materials."
      },
      {
        "refdes": "TP10",
        "reason": "Confirm required test-point implementation and manufacturer part number if component-specific collateral is needed."
      }
    ],
    "unresolved_context_questions": [
      "Full-design component coverage is not established by this page fragment.",
      "Cross-page topology and harness boundary are unresolved.",
      "J10 and U11 remain handoff-only observations and must not be treated as placed components.",
      "No electrical connectivity is confirmed by this materials workflow."
    ],
    "stop_conditions": [
      "Do not infer or download component-specific collateral for L10, C10, R10, or TP10 until owner-supplied identity evidence is available.",
      "Do not promote page-level material availability into full-design readiness.",
      "Do not treat the intake handoff as evidence of connector identity, component placement, or electrical connectivity."
    ]
  }
}
