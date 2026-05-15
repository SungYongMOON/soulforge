{
  "candidate_id": "qe_dwarf_auditor_gpt-5.3-codex-spark_low",
  "simulation_source_packet": {
    "fixture_id": "simulation_source_collect_v0_public_fixture_mixed_model_states",
    "workflow_id": "simulation_source_collect_v0",
    "project_code": "PUBLIC_FIXTURE",
    "run_id": "calibration_public_fixture",
    "public_safe": true,
    "policy_notes": [
      "pre-deck, pre-run: no deck generation, no simulator execution, no waveform/metric verification",
      "no credentials, no secret handling, no model conversion, no synthetic model creation",
      "source evidence limited to public summaries in provided official packets"
    ],
    "source_packet_refs": [
      "official_source_packet:fixture-opamp-product-page",
      "official_source_packet:fixture-connector-product-page",
      "official_source_packet:fixture-power-module-datasheet"
    ]
  },
  "model_inventory": [
    {
      "component_ref": "U1",
      "manufacturer_part_number": "FIXTURE-OPAMP-01",
      "model_family": "ltspice",
      "provenance": {
        "source_ref": "official_source_packet:fixture-opamp-product-page",
        "source_type": "official_source_packet",
        "summary": "Manufacturer page indicates an LTspice macromodel is available and reuse is allowed for evaluation."
      },
      "status": "official_present",
      "uncertainty": {
        "level": "medium",
        "rationale": "Model existence and family are stated, but payload file and exact revision are not provided."
      },
      "boundary_notes": [
        "No raw model payload is present in fixture",
        "Compatibility needs explicit simulator-scope confirmation before promotion",
        "Use only for public summary and orchestration handoff"
      ],
      "next_action": "Owner should provide approved local copy or signed-off download location before deck use."
    },
    {
      "component_ref": "U1",
      "manufacturer_part_number": "FIXTURE-OPAMP-01",
      "model_family": "pspice",
      "provenance": {
        "source_ref": "official_source_packet:fixture-opamp-product-page",
        "source_type": "official_source_packet",
        "summary": "No PSPICE model is identified in the provided summary; LTspice and demo assets only are mentioned."
      },
      "status": "missing",
      "uncertainty": {
        "level": "medium",
        "rationale": "No source evidence for PSPICE family in packet; absence inferred from provided scope."
      },
      "boundary_notes": [
        "No model payload in fixture",
        "Do not infer equivalence or convert from LTspice without owner basis"
      ],
      "next_action": "Request owner-approved official PSPICE source or approved alternate family path from owner."
    },
    {
      "component_ref": "U1",
      "manufacturer_part_number": "FIXTURE-OPAMP-01",
      "model_family": "demo_circuit",
      "provenance": {
        "source_ref": "official_source_packet:fixture-opamp-product-page",
        "source_type": "official_source_packet",
        "summary": "Manufacturer page states a demo circuit is available."
      },
      "status": "official_present",
      "uncertainty": {
        "level": "high",
        "rationale": "Existence of demo circuit is claimed, but the fixture does not include files or simulator-target linkage."
      },
      "boundary_notes": [
        "Demo circuit exists at source level only",
        "No file retrieval/verification performed",
        "Compatibility cannot be asserted to specific simulator from source summary alone"
      ],
      "next_action": "Owner should provide approved demo-circuit artifact and explicit simulator constraints before use."
    },
    {
      "component_ref": "J1",
      "manufacturer_part_number": "FIXTURE-CONN-HS-02",
      "model_family": "s_parameter",
      "provenance": {
        "source_ref": "official_source_packet:fixture-connector-product-page",
        "source_type": "official_source_packet",
        "summary": "Manufacturer names signal-integrity assets, but download requires login and export-control acknowledgement."
      },
      "status": "blocked",
      "uncertainty": {
        "level": "low",
        "rationale": "Family and blocker cause are explicitly stated."
      },
      "boundary_notes": [
        "Not a model-absence condition; blocker is access-control gated",
        "No payload/terms text was provided in public fixture"
      ],
      "next_action": "Owner must complete access workflow (login + export-control ack) and provide approved artifact."
    },
    {
      "component_ref": "J1",
      "manufacturer_part_number": "FIXTURE-CONN-HS-02",
      "model_family": "ibis",
      "provenance": {
        "source_ref": "official_source_packet:fixture-connector-product-page",
        "source_type": "official_source_packet",
        "summary": "Manufacturer names signal-integrity assets, but download requires login and export-control acknowledgement."
      },
      "status": "blocked",
      "uncertainty": {
        "level": "low",
        "rationale": "Family mention is present, but acquisition is explicitly gated."
      },
      "boundary_notes": [
        "Not a conversion candidate without source payload",
        "Cannot confirm simulator scope until owner-supplied/authorized files are available"
      ],
      "next_action": "Owner must resolve access and share approved IBIS source file under project-safe terms."
    },
    {
      "component_ref": "M1",
      "manufacturer_part_number": "FIXTURE-POWER-MODULE-03",
      "model_family": "pspice",
      "provenance": {
        "source_ref": "official_source_packet:fixture-power-module-datasheet",
        "source_type": "official_source_packet",
        "summary": "Datasheet mentions typical curves only; no simulation model is identified."
      },
      "status": "missing",
      "uncertainty": {
        "level": "low",
        "rationale": "Source explicitly omits simulation model information."
      },
      "boundary_notes": [
        "No simulation model family found in source summary",
        "No conversion or synthetic substitute is allowed in this workflow"
      ],
      "next_action": "Owner should provide official model source if this family is required; otherwise route to design alternative."
    },
    {
      "component_ref": "M1",
      "manufacturer_part_number": "FIXTURE-POWER-MODULE-03",
      "model_family": "simplis",
      "provenance": {
        "source_ref": "official_source_packet:fixture-power-module-datasheet",
        "source_type": "official_source_packet",
        "summary": "Datasheet mentions typical curves only; no simulation model is identified."
      },
      "status": "missing",
      "uncertainty": {
        "level": "low",
        "rationale": "No SIMPLIS family evidence is present."
      },
      "boundary_notes": [
        "No official SIMPLIS source in provided packet",
        "No local or tool-library model manifest exists"
      ],
      "next_action": "Owner follow-up needed to source approved SIMPLIS model or approve an accepted substitute path."
    },
    {
      "component_ref": "M1",
      "manufacturer_part_number": "FIXTURE-POWER-MODULE-03",
      "model_family": "demo_circuit",
      "provenance": {
        "source_ref": "official_source_packet:fixture-power-module-datasheet",
        "source_type": "official_source_packet",
        "summary": "No demo circuit or package-level source is identified."
      },
      "status": "missing",
      "uncertainty": {
        "level": "low",
        "rationale": "Explicitly absent in the official summary."
      },
      "boundary_notes": [
        "Cannot infer demo circuit from performance curves alone",
        "No simulator-scope evidence available"
      ],
      "next_action": "Owner must provide official demo circuit source if required by downstream deck path."
    }
  ],
  "model_file_manifest": [
    {
      "component_ref": "U1",
      "model_family": "ltspice",
      "source_ref": "official_source_packet:fixture-opamp-product-page",
      "file_status": "not_collected",
      "evidence": "public summary states model exists",
      "notes": "Do not include payload. File location, hash, and revision absent."
    },
    {
      "component_ref": "U1",
      "model_family": "demo_circuit",
      "source_ref": "official_source_packet:fixture-opamp-product-page",
      "file_status": "not_collected",
      "evidence": "public summary states demo circuit exists",
      "notes": "No downloadable artifact provided in fixture."
    },
    {
      "component_ref": "J1",
      "model_family": "s_parameter",
      "source_ref": "official_source_packet:fixture-connector-product-page",
      "file_status": "blocked",
      "evidence": "source exists but gated by login/export-control",
      "notes": "Access required; no payload or terms content available."
    },
    {
      "component_ref": "J1",
      "model_family": "ibis",
      "source_ref": "official_source_packet:fixture-connector-product-page",
      "file_status": "blocked",
      "evidence": "source exists but gated by login/export-control",
      "notes": "Access required; no payload or terms content available."
    }
  ],
  "demo_circuit_manifest": [
    {
      "component_ref": "U1",
      "manufacturer_part_number": "FIXTURE-OPAMP-01",
      "status": "available_source_level",
      "source_ref": "official_source_packet:fixture-opamp-product-page",
      "simulator_context": "not_explicit_in_packet",
      "provenance_uncertainty": "high",
      "next_action": "Owner should provide approved demo artifact and explicit simulator applicability."
    },
    {
      "component_ref": "J1",
      "manufacturer_part_number": "FIXTURE-CONN-HS-02",
      "status": "not_identified",
      "source_ref": "official_source_packet:fixture-connector-product-page",
      "provenance_uncertainty": "low",
      "next_action": "No demo-circuit requirement identified for this component in fixture; keep off for this run."
    },
    {
      "component_ref": "M1",
      "manufacturer_part_number": "FIXTURE-POWER-MODULE-03",
      "status": "not_identified",
      "source_ref": "official_source_packet:fixture-power-module-datasheet",
      "provenance_uncertainty": "low",
      "next_action": "Request owner-provided demo circuit source if required by downstream process."
    }
  ],
  "simulator_compatibility_matrix": [
    {
      "component_ref": "U1",
      "model_family": "ltspice",
      "compatibility": [
        {
          "simulator": "ltspice",
          "status": "evidence_supported",
          "basis": "official source explicitly mentions LTspice macromodel availability"
        },
        {
          "simulator": "ngspice",
          "status": "not_supported_not_supported_evidence",
          "basis": "no explicit NGSPICE source evidence in packet"
        },
        {
          "simulator": "ibis_parser",
          "status": "not_applicable",
          "basis": "IBIS family not claimed for this part/model need"
        }
      ]
    },
    {
      "component_ref": "U1",
      "model_family": "pspice",
      "compatibility": [
        {
          "simulator": "ltspice",
          "status": "not_applicable",
          "basis": "no PSPICE model identified"
        },
        {
          "simulator": "ngspice",
          "status": "not_applicable",
          "basis": "no PSPICE model identified"
        },
        {
          "simulator": "ibis_parser",
          "status": "not_applicable",
          "basis": "family mismatch and no model payload"
        }
      ]
    },
    {
      "component_ref": "U1",
      "model_family": "demo_circuit",
      "compatibility": [
        {
          "simulator": "ltspice",
          "status": "needs_verification",
          "basis": "source says demo circuit is available, but simulator mapping was not provided"
        },
        {
          "simulator": "ngspice",
          "status": "needs_verification",
          "basis": "simulator mapping not provided"
        },
        {
          "simulator": "ibis_parser",
          "status": "not_applicable",
          "basis": "not an IBIS model family"
        }
      ]
    },
    {
      "component_ref": "J1",
      "model_family": "s_parameter",
      "compatibility": [
        {
          "simulator": "ltspice",
          "status": "blocked",
          "basis": "access blocked before file-level inspection"
        },
        {
          "simulator": "ngspice",
          "status": "blocked",
          "basis": "access blocked before file-level inspection"
        },
        {
          "simulator": "ibis_parser",
          "status": "blocked",
          "basis": "asset retrieval blocked at source level"
        }
      ]
    },
    {
      "component_ref": "J1",
      "model_family": "ibis",
      "compatibility": [
        {
          "simulator": "ltspice",
          "status": "blocked",
          "basis": "access blocked before file-level inspection"
        },
        {
          "simulator": "ngspice",
          "status": "not_applicable",
          "basis": "no data in packet"
        },
        {
          "simulator": "ibis_parser",
          "status": "blocked",
          "basis": "IBIS asset referenced but inaccessible due access controls"
        }
      ]
    },
    {
      "component_ref": "M1",
      "model_family": "pspice",
      "compatibility": [
        {
          "simulator": "ltspice",
          "status": "not_applicable",
          "basis": "no official PSPICE model source identified"
        },
        {
          "simulator": "ngspice",
          "status": "not_applicable",
          "basis": "no official PSPICE model source identified"
        },
        {
          "simulator": "ibis_parser",
          "status": "not_applicable",
          "basis": "model family not identified"
        }
      ]
    },
    {
      "component_ref": "M1",
      "model_family": "simplis",
      "compatibility": [
        {
          "simulator": "ltspice",
          "status": "not_applicable",
          "basis": "no SIMPLIS model source identified"
        },
        {
          "simulator": "ngspice",
          "status": "not_applicable",
          "basis": "no SIMPLIS model source identified"
        },
        {
          "simulator": "ibis_parser",
          "status": "not_applicable",
          "basis": "model family mismatch and no source"
        }
      ]
    },
    {
      "component_ref": "M1",
      "model_family": "demo_circuit",
      "compatibility": [
        {
          "simulator": "ltspice",
          "status": "not_applicable",
          "basis": "no demo circuit identified in source packet"
        },
        {
          "simulator": "ngspice",
          "status": "not_applicable",
          "basis": "no demo circuit identified in source packet"
        },
        {
          "simulator": "ibis_parser",
          "status": "not_applicable",
          "basis": "no demo circuit identified in source packet"
        }
      ]
    }
  ],
  "missing_models": [
    {
      "component_ref": "U1",
      "manufacturer_part_number": "FIXTURE-OPAMP-01",
      "model_family": "pspice",
      "reason": "No PSPICE model identified in official source summary",
      "next_action": "owner follow-up required if PSPICE is mandatory"
    },
    {
      "component_ref": "M1",
      "manufacturer_part_number": "FIXTURE-POWER-MODULE-03",
      "model_family": "pspice",
      "reason": "Datasheet does not include model source for PSPICE",
      "next_action": "request alternative approved source or model family reroute"
    },
    {
      "component_ref": "M1",
      "manufacturer_part_number": "FIXTURE-POWER-MODULE-03",
      "model_family": "simplis",
      "reason": "Datasheet does not include SIMPLIS model source",
      "next_action": "request alternative approved source or SIMPLIS substitute strategy"
    },
    {
      "component_ref": "M1",
      "manufacturer_part_number": "FIXTURE-POWER-MODULE-03",
      "model_family": "demo_circuit",
      "reason": "No demo circuit is identified in source summary",
      "next_action": "owner should provide official demo circuit if required by downstream context"
    }
  ],
  "access_blockers": [
    {
      "blocker_id": "BLK-J1-01",
      "component_ref": "J1",
      "model_families": [
        "s_parameter",
        "ibis"
      ],
      "blocker_type": "vendor_login_required",
      "source_ref": "official_source_packet:fixture-connector-product-page",
      "impact": "Asset retrieval cannot be completed without authenticated access"
    },
    {
      "blocker_id": "BLK-J1-02",
      "component_ref": "J1",
      "model_families": [
        "s_parameter",
        "ibis"
      ],
      "blocker_type": "export_control_ack_required",
      "source_ref": "official_source_packet:fixture-connector-product-page",
      "impact": "Legal/regulatory gate prevents immediate artifact capture"
    },
    {
      "blocker_id": "BLK-GLOBAL-01",
      "component_ref": "ALL",
      "model_families": [
        "all"
      ],
      "blocker_type": "public_fixture_scope",
      "source_ref": "fixture_metadata",
      "impact": "No model payloads available in public safe fixture; orchestration can only proceed with source metadata"
    }
  ],
  "owner_followup_needed": [
    {
      "priority": "high",
      "owner_action": "Resolve J1 access blockers (login + export-control) and provide approved S-parameter/IBIS source payloads or formal unavailability note."
    },
    {
      "priority": "high",
      "owner_action": "Provide approved file artifact for U1 LTspice macromodel (and any related metadata: version, license scope, dependencies)."
    },
    {
      "priority": "medium",
      "owner_action": "Provide official demo-circuit artifact and simulator applicability for U1 before downstream deck wiring."
    },
    {
      "priority": "medium",
      "owner_action": "For M1, confirm whether alternative approved families can be used in place of missing PSPICE/SIMPLIS/demo-circuit needs."
    }
  ],
  "downstream_handoff": {
    "summary": "Synthetic source-collection is conservative: only one official-present model family (U1 LTspice) and one official-present demo-circuit claim (U1) can be carried as sourced references; all others are blocked or missing without payloads. Deck-building and simulator execution must not begin from this dataset.",
    "handoff_recommendations": [
      "Import model_inventory + blocker evidence into source tracking first",
      "Do not promote any file for simulation until owner supplies official payloads and scope-complete compatibility evidence",
      "Do not claim simulator readiness for missing/blocked families",
      "Keep outputs as summary-only per public-safe policy"
    ],
    "pre_run_constraints": [
      "No deck generation in this workflow",
      "No model conversions",
      "No waveform/metric verification",
      "No synthetic model invention"
    ]
  },
  "boundary_review_note": "Strictly bounded to public-safe, summary-only collection. Model truth is limited to provided official summaries and explicit access states. Missing != blocked: J1 families are blocked by access controls; U1 PSPICE and all M1 requested families are missing per source scope. No secret handling, no local/private artifact details, and no simulator execution claims were made."
}