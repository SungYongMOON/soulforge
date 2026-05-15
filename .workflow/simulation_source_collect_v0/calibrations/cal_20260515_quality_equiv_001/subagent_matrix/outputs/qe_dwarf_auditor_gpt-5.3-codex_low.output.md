{
  "candidate_id": "qe_dwarf_auditor_gpt-5.3-codex_low",
  "simulation_source_packet": {
    "fixture_id": "simulation_source_collect_v0_public_fixture_mixed_model_states",
    "workflow_id": "simulation_source_collect_v0",
    "public_safe": true,
    "collection_scope_result": "conservative_pre_deck_pre_run",
    "provenance_basis": [
      {
        "source_ref": "official_source_packet:fixture-opamp-product-page",
        "source_type": "manufacturer_or_authoritative_publisher_page",
        "status": "usable_public_summary_only",
        "uncertainty": "public summary confirms availability claim, not payload inspection",
        "boundary_note": "No raw model payload or account-bound content handled",
        "next_action": "Owner to provide approved local files/manifests for executable-stage use"
      },
      {
        "source_ref": "official_source_packet:fixture-connector-product-page",
        "source_type": "manufacturer_or_authoritative_publisher_page",
        "status": "blocked_access_documented",
        "uncertainty": "asset names known, files not accessible without login/export acknowledgement",
        "boundary_note": "Blocked access preserved as blocker, not reclassified as missing payload evidence",
        "next_action": "Owner to perform compliant download and provide approved local manifest"
      },
      {
        "source_ref": "official_source_packet:fixture-power-module-datasheet",
        "source_type": "manufacturer_or_authoritative_publisher_page",
        "status": "no_model_identified_in_source",
        "uncertainty": "datasheet may be incomplete for model distribution channels",
        "boundary_note": "No model invention or conversion attempted",
        "next_action": "Owner to confirm whether any official model portal exists for this part"
      }
    ],
    "contract_boundaries_applied": {
      "deck_generation": "not_performed",
      "simulator_execution": "not_performed",
      "waveform_or_metric_verification": "not_performed",
      "model_conversion": "not_performed",
      "synthetic_model_creation": "not_performed",
      "credential_handling": "not_performed"
    }
  },
  "model_inventory": [
    {
      "component_ref": "U1",
      "manufacturer_part_number": "FIXTURE-OPAMP-01",
      "model_family": "ltspice",
      "provenance": "official_source_packet:fixture-opamp-product-page",
      "status": "candidate_official",
      "uncertainty": "availability stated but file/package integrity not inspected",
      "boundary_note": "Cannot elevate to official_present without file-level evidence and terms/dependency/simulator scope record",
      "next_action": "Obtain owner-approved local manifest entry for LTspice model file"
    },
    {
      "component_ref": "U1",
      "manufacturer_part_number": "FIXTURE-OPAMP-01",
      "model_family": "pspice",
      "provenance": "no explicit mention in provided official summary",
      "status": "missing",
      "uncertainty": "possible alternate official channel not included in fixture",
      "boundary_note": "Missing retained to prevent model invention",
      "next_action": "Owner to verify official PSpice availability or approve not_applicable decision"
    },
    {
      "component_ref": "U1",
      "manufacturer_part_number": "FIXTURE-OPAMP-01",
      "model_family": "demo_circuit",
      "provenance": "official_source_packet:fixture-opamp-product-page",
      "status": "candidate_official",
      "uncertainty": "demo circuit referenced but artifact not reviewed",
      "boundary_note": "No deck-readiness claim from summary text alone",
      "next_action": "Owner to provide demo circuit files and usage terms evidence"
    },
    {
      "component_ref": "J1",
      "manufacturer_part_number": "FIXTURE-CONN-HS-02",
      "model_family": "s_parameter",
      "provenance": "official_source_packet:fixture-connector-product-page",
      "status": "blocked",
      "uncertainty": "likely exists, but account/export gate prevents access confirmation",
      "boundary_note": "Blocked access tracked separately from missing",
      "next_action": "Owner to complete compliant access flow and share approved local manifest"
    },
    {
      "component_ref": "J1",
      "manufacturer_part_number": "FIXTURE-CONN-HS-02",
      "model_family": "ibis",
      "provenance": "official_source_packet:fixture-connector-product-page",
      "status": "blocked",
      "uncertainty": "asset family implied by SI resources, payload unavailable",
      "boundary_note": "No parser compatibility claim without actual file metadata/content",
      "next_action": "Owner to provide IBIS package and license/export terms record"
    },
    {
      "component_ref": "M1",
      "manufacturer_part_number": "FIXTURE-POWER-MODULE-03",
      "model_family": "pspice",
      "provenance": "official_source_packet:fixture-power-module-datasheet",
      "status": "missing",
      "uncertainty": "datasheet-only evidence may omit separate simulation portal",
      "boundary_note": "No synthetic substitute permitted",
      "next_action": "Owner to confirm manufacturer support channel or accept unresolved gap"
    },
    {
      "component_ref": "M1",
      "manufacturer_part_number": "FIXTURE-POWER-MODULE-03",
      "model_family": "simplis",
      "provenance": "official_source_packet:fixture-power-module-datasheet",
      "status": "missing",
      "uncertainty": "no simplis mention in provided official summary",
      "boundary_note": "No conversion from other families without owner basis",
      "next_action": "Owner to request official SIMPLIS model from manufacturer if required"
    },
    {
      "component_ref": "M1",
      "manufacturer_part_number": "FIXTURE-POWER-MODULE-03",
      "model_family": "demo_circuit",
      "provenance": "official_source_packet:fixture-power-module-datasheet",
      "status": "missing",
      "uncertainty": "typical curves do not imply demo circuit availability",
      "boundary_note": "Curve plots not promoted to executable source truth",
      "next_action": "Owner to verify if any official reference design exists"
    }
  ],
  "model_file_manifest": {
    "records": [],
    "note": "No model files were provided via owner_approved_local_model_manifest or tool_library_manifest; therefore no executor-approved file records can be emitted."
  },
  "demo_circuit_manifest": {
    "records": [
      {
        "component_ref": "U1",
        "manufacturer_part_number": "FIXTURE-OPAMP-01",
        "status": "candidate_official",
        "provenance": "official_source_packet:fixture-opamp-product-page",
        "uncertainty": "referenced but file not supplied",
        "boundary_note": "Not deck-ready without artifact-level review",
        "next_action": "Owner-supplied demo circuit package required"
      },
      {
        "component_ref": "M1",
        "manufacturer_part_number": "FIXTURE-POWER-MODULE-03",
        "status": "missing",
        "provenance": "official_source_packet:fixture-power-module-datasheet",
        "uncertainty": "none in provided source",
        "boundary_note": "No inferred demo circuit from curves",
        "next_action": "Owner to confirm official availability"
      }
    ]
  },
  "simulator_compatibility_matrix": [
    {
      "simulator": "ltspice",
      "component_ref": "U1",
      "model_family": "ltspice",
      "compatibility_status": "unknown_candidate",
      "basis": "official summary states LTspice macromodel availability",
      "uncertainty": "no payload-level syntax/dependency check",
      "boundary_note": "Name/claim alone does not establish run-ready compatibility",
      "next_action": "Validate after owner-approved local file intake"
    },
    {
      "simulator": "ngspice",
      "component_ref": "U1",
      "model_family": "pspice",
      "compatibility_status": "not_evaluable_missing_source",
      "basis": "requested family present in scope but no source identified",
      "uncertainty": "official PSpice model may exist outside fixture",
      "boundary_note": "No conversion or substitution performed",
      "next_action": "Acquire official PSpice source first"
    },
    {
      "simulator": "ibis_parser",
      "component_ref": "J1",
      "model_family": "ibis",
      "compatibility_status": "blocked_access",
      "basis": "official page indicates gated SI assets",
      "uncertainty": "parser-version/package compliance cannot be checked",
      "boundary_note": "Blocked access retained distinctly",
      "next_action": "Owner to provide downloaded IBIS artifact and terms evidence"
    },
    {
      "simulator": "ngspice",
      "component_ref": "M1",
      "model_family": "pspice",
      "compatibility_status": "not_evaluable_missing_source",
      "basis": "no simulation model identified in datasheet summary",
      "uncertainty": "unknown external official portal",
      "boundary_note": "No synthetic macro/model created",
      "next_action": "Owner follow-up with manufacturer"
    },
    {
      "simulator": "ltspice",
      "component_ref": "M1",
      "model_family": "simplis",
      "compatibility_status": "not_applicable_without_source",
      "basis": "SIMPLIS model absent; ltspice target listed only for workflow policy",
      "uncertainty": "cross-simulator mapping not authorized",
      "boundary_note": "No model conversion allowed without owner basis",
      "next_action": "Treat as unresolved until official SIMPLIS source decision"
    }
  ],
  "missing_models": [
    {
      "component_ref": "U1",
      "manufacturer_part_number": "FIXTURE-OPAMP-01",
      "model_family": "pspice",
      "status": "missing",
      "reason": "No official/source-manifest evidence in fixture inputs",
      "next_action": "Owner confirm availability or mark not_applicable"
    },
    {
      "component_ref": "M1",
      "manufacturer_part_number": "FIXTURE-POWER-MODULE-03",
      "model_family": "pspice",
      "status": "missing",
      "reason": "Datasheet summary identifies no simulation model source",
      "next_action": "Owner manufacturer inquiry"
    },
    {
      "component_ref": "M1",
      "manufacturer_part_number": "FIXTURE-POWER-MODULE-03",
      "model_family": "simplis",
      "status": "missing",
      "reason": "No official SIMPLIS source identified",
      "next_action": "Owner support-ticket or FAE request"
    },
    {
      "component_ref": "M1",
      "manufacturer_part_number": "FIXTURE-POWER-MODULE-03",
      "model_family": "demo_circuit",
      "status": "missing",
      "reason": "No demo/reference circuit source identified",
      "next_action": "Owner confirm reference design availability"
    }
  ],
  "access_blockers": [
    {
      "component_ref": "J1",
      "manufacturer_part_number": "FIXTURE-CONN-HS-02",
      "model_families": [
        "s_parameter",
        "ibis"
      ],
      "status": "blocked",
      "blocker_type": "login_and_export_control_acknowledgement_required",
      "provenance": "official_source_packet:fixture-connector-product-page",
      "boundary_note": "Agent did not request credentials or gated downloads",
      "owner_followup": "Owner to complete gated access and provide approved local files/manifests"
    }
  ],
  "owner_followup_needed": [
    {
      "priority": "high",
      "item": "Provide owner-approved local manifest entries for all obtained official model/demo files",
      "why": "Required to promote candidate_official/blocked states toward executor-approved states"
    },
    {
      "priority": "high",
      "item": "Resolve J1 gated download workflow under export/license compliance",
      "why": "Current blocked state prevents SI model intake"
    },
    {
      "priority": "medium",
      "item": "Confirm whether U1 PSpice is required or can be marked not_applicable",
      "why": "Prevents ambiguous downstream scope"
    },
    {
      "priority": "medium",
      "item": "Confirm official model/reference-design availability for M1",
      "why": "Three model-family gaps remain unresolved"
    }
  ],
  "downstream_handoff": {
    "handoff_readiness": "partial_inventory_only_not_deck_ready",
    "safe_to_pass": [
      "model family need inventory with explicit state labels",
      "source provenance index using public summaries",
      "blocked-vs-missing separation",
      "compatibility caution matrix with basis/uncertainty"
    ],
    "not_ready_for": [
      "deck generation",
      "simulator execution",
      "waveform or metric verification",
      "model conversion or synthesis"
    ],
    "required_inputs_for_next_stage": [
      "owner-approved local model file manifest",
      "terms/license/export evidence per file family",
      "simulator-scope/dependency notes tied to actual files"
    ]
  },
  "boundary_review_note": {
    "result": "boundary_compliant",
    "notes": [
      "Used only public synthetic fixture summaries",
      "Did not access credentials, private project data, or account-bound payloads",
      "Did not output raw model payloads or local absolute paths",
      "Maintained conservative states where evidence was incomplete",
      "Preserved blocked access as distinct from missing"
    ]
  }
}