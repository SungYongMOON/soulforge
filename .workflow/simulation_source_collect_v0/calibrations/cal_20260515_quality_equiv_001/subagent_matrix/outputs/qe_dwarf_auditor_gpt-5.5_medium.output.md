{
  "candidate_id": "qe_dwarf_auditor_gpt-5.5_medium",
  "simulation_source_packet": {
    "fixture_id": "simulation_source_collect_v0_public_fixture_mixed_model_states",
    "workflow_id": "simulation_source_collect_v0",
    "public_safe": true,
    "scope": "pre_deck_pre_run_source_collection_only",
    "source_policy_applied": {
      "accepted_sources": [
        "manufacturer_or_authoritative_publisher_page",
        "owner_approved_local_manifest",
        "tool_library_manifest_approved_by_policy"
      ],
      "rejected_sources": [
        "random_mirror",
        "forum_upload",
        "search_snippet",
        "account_bound_download_without_owner_supplied_file"
      ],
      "blocked_access_handling": "record_blocked_and_owner_followup",
      "raw_payload_handling": "no_raw_model_payloads_in_public_archive"
    },
    "source_provenance_index": [
      {
        "source_ref": "official_source_packet:fixture-opamp-product-page",
        "source_type": "manufacturer_or_authoritative_publisher_page",
        "public_summary": "Authoritative manufacturer page reports LTspice macromodel and demo circuit availability for FIXTURE-OPAMP-01, with reuse allowed for evaluation.",
        "status": "public_summary_available",
        "uncertainty": "Dependency details, exact file names, model contents, and simulator parse evidence are not present in the fixture.",
        "boundary_notes": "Do not treat summary text as raw model payload or deck-ready evidence.",
        "next_action": "Owner or downstream collector may supply an approved manifest containing exact files, terms, dependencies, and simulator scope evidence."
      },
      {
        "source_ref": "official_source_packet:fixture-connector-product-page",
        "source_type": "manufacturer_or_authoritative_publisher_page",
        "public_summary": "Authoritative manufacturer page names signal-integrity assets, but download requires login and export-control acknowledgement.",
        "status": "blocked",
        "uncertainty": "The fixture does not identify exact asset types available after gated access.",
        "boundary_notes": "Blocked access is not missing. Agent must not request credentials or complete export-control acknowledgement.",
        "next_action": "Owner must obtain and approve any gated files or provide an approved local manifest."
      },
      {
        "source_ref": "official_source_packet:fixture-power-module-datasheet",
        "source_type": "manufacturer_or_authoritative_publisher_page",
        "public_summary": "Datasheet mentions typical curves but identifies no simulation model, demo circuit, or package-level source.",
        "status": "public_summary_available_no_model_source",
        "uncertainty": "No approved model source is identified in the fixture.",
        "boundary_notes": "Typical curves are not model files and do not authorize synthetic model creation.",
        "next_action": "Record requested families as missing unless owner supplies an approved authoritative source or local manifest."
      }
    ]
  },
  "model_inventory": [
    {
      "component_ref": "U1",
      "manufacturer_part_number": "FIXTURE-OPAMP-01",
      "model_family": "ltspice",
      "needed_for": [
        "simulation_deck_prepare",
        "run_verify_setup"
      ],
      "provenance": [
        "official_source_packet:fixture-opamp-product-page"
      ],
      "status": "candidate_official",
      "uncertainty": "Official public summary says an LTspice macromodel is available, but no file manifest, dependency list, or parser/smoke evidence is provided.",
      "boundary_notes": "Not deck-ready or run-ready. Do not claim official_present until terms, dependencies, and simulator-scope evidence are recorded with an approved manifest.",
      "next_action": "Owner supplies or approves exact LTspice model file manifest and dependency evidence."
    },
    {
      "component_ref": "U1",
      "manufacturer_part_number": "FIXTURE-OPAMP-01",
      "model_family": "pspice",
      "needed_for": [
        "simulation_deck_prepare",
        "run_verify_setup"
      ],
      "provenance": [
        "official_source_packet:fixture-opamp-product-page"
      ],
      "status": "missing",
      "uncertainty": "Fixture source summary does not mention a PSPICE model.",
      "boundary_notes": "Do not infer PSPICE availability from LTspice availability.",
      "next_action": "Owner confirms whether an authoritative PSPICE source exists or accepts the gap."
    },
    {
      "component_ref": "U1",
      "manufacturer_part_number": "FIXTURE-OPAMP-01",
      "model_family": "demo_circuit",
      "needed_for": [
        "simulation_deck_prepare",
        "run_verify_setup"
      ],
      "provenance": [
        "official_source_packet:fixture-opamp-product-page"
      ],
      "status": "candidate_official",
      "uncertainty": "Official public summary says a demo circuit is available, but no exact file, dependency, or simulator-target evidence is included.",
      "boundary_notes": "Demo circuit availability does not authorize deck generation or simulation execution in this workflow.",
      "next_action": "Owner supplies or approves exact demo circuit manifest and permitted use scope."
    },
    {
      "component_ref": "J1",
      "manufacturer_part_number": "FIXTURE-CONN-HS-02",
      "model_family": "s_parameter",
      "needed_for": [
        "signal_integrity_review",
        "harness_strengthening_context"
      ],
      "provenance": [
        "official_source_packet:fixture-connector-product-page"
      ],
      "status": "blocked",
      "uncertainty": "Signal-integrity assets are named, but exact S-parameter availability is not visible before gated access.",
      "boundary_notes": "Do not treat login/export-gated assets as collected or missing.",
      "next_action": "Owner handles login/export-control process and provides approved local manifest if S-parameter files are obtained."
    },
    {
      "component_ref": "J1",
      "manufacturer_part_number": "FIXTURE-CONN-HS-02",
      "model_family": "ibis",
      "needed_for": [
        "signal_integrity_review",
        "harness_strengthening_context"
      ],
      "provenance": [
        "official_source_packet:fixture-connector-product-page"
      ],
      "status": "blocked",
      "uncertainty": "Signal-integrity assets are named, but exact IBIS availability is not visible before gated access.",
      "boundary_notes": "Do not claim IBIS parser compatibility without an approved IBIS file and parser evidence.",
      "next_action": "Owner handles gated access and provides approved local manifest if IBIS files are obtained."
    },
    {
      "component_ref": "M1",
      "manufacturer_part_number": "FIXTURE-POWER-MODULE-03",
      "model_family": "pspice",
      "needed_for": [
        "simulation_deck_prepare",
        "quantitative_enrichment_context"
      ],
      "provenance": [
        "official_source_packet:fixture-power-module-datasheet"
      ],
      "status": "missing",
      "uncertainty": "Datasheet mentions typical curves but no PSPICE source.",
      "boundary_notes": "Typical curves must not be converted into a synthetic model by this workflow.",
      "next_action": "Owner identifies an authoritative PSPICE source or accepts missing-model handoff."
    },
    {
      "component_ref": "M1",
      "manufacturer_part_number": "FIXTURE-POWER-MODULE-03",
      "model_family": "simplis",
      "needed_for": [
        "simulation_deck_prepare",
        "quantitative_enrichment_context"
      ],
      "provenance": [
        "official_source_packet:fixture-power-module-datasheet"
      ],
      "status": "missing",
      "uncertainty": "Datasheet identifies no SIMPLIS source.",
      "boundary_notes": "Do not infer SIMPLIS availability from power-module datasheet curves.",
      "next_action": "Owner identifies an authoritative SIMPLIS source or accepts missing-model handoff."
    },
    {
      "component_ref": "M1",
      "manufacturer_part_number": "FIXTURE-POWER-MODULE-03",
      "model_family": "demo_circuit",
      "needed_for": [
        "simulation_deck_prepare",
        "quantitative_enrichment_context"
      ],
      "provenance": [
        "official_source_packet:fixture-power-module-datasheet"
      ],
      "status": "missing",
      "uncertainty": "Datasheet identifies no demo circuit.",
      "boundary_notes": "No demo circuit may be invented or reconstructed from curves.",
      "next_action": "Owner identifies an authoritative demo circuit source or accepts missing-demo handoff."
    }
  ],
  "model_file_manifest": [],
  "demo_circuit_manifest": [
    {
      "component_ref": "U1",
      "manufacturer_part_number": "FIXTURE-OPAMP-01",
      "demo_family": "demo_circuit",
      "provenance": [
        "official_source_packet:fixture-opamp-product-page"
      ],
      "status": "candidate_official",
      "uncertainty": "Availability is stated in public summary, but no approved file manifest is present.",
      "boundary_notes": "No demo circuit file is included or converted.",
      "next_action": "Owner provides approved demo circuit file manifest if downstream deck preparation is desired."
    },
    {
      "component_ref": "M1",
      "manufacturer_part_number": "FIXTURE-POWER-MODULE-03",
      "demo_family": "demo_circuit",
      "provenance": [
        "official_source_packet:fixture-power-module-datasheet"
      ],
      "status": "missing",
      "uncertainty": "No demo circuit source identified.",
      "boundary_notes": "Missing demo circuit is a valid collection result.",
      "next_action": "Do not create substitute demo circuit; request owner source decision."
    }
  ],
  "simulator_compatibility_matrix": [
    {
      "component_ref": "U1",
      "model_family": "ltspice",
      "target_simulator": "ltspice",
      "compatibility_status": "candidate_compatible",
      "basis": "Official summary names an LTspice macromodel.",
      "uncertainty": "No file parse, dependency, or smoke-test evidence.",
      "boundary_notes": "Candidate compatibility only; not deck-ready or run-ready.",
      "next_action": "Record exact approved LTspice file and dependency manifest."
    },
    {
      "component_ref": "U1",
      "model_family": "ltspice",
      "target_simulator": "ngspice",
      "compatibility_status": "unknown",
      "basis": "No ngspice compatibility evidence provided.",
      "uncertainty": "Conversion or syntax compatibility is unverified.",
      "boundary_notes": "No conversion allowed without owner basis.",
      "next_action": "Downstream must obtain explicit compatibility evidence before use."
    },
    {
      "component_ref": "U1",
      "model_family": "pspice",
      "target_simulator": "ltspice",
      "compatibility_status": "missing_model",
      "basis": "No PSPICE source identified.",
      "uncertainty": "Availability unknown beyond fixture summary.",
      "boundary_notes": "Do not infer PSPICE model from LTspice model.",
      "next_action": "Owner source decision required."
    },
    {
      "component_ref": "J1",
      "model_family": "s_parameter",
      "target_simulator": "ltspice",
      "compatibility_status": "blocked_unknown",
      "basis": "Signal-integrity assets are gated by login/export acknowledgement.",
      "uncertainty": "Exact file type and simulator support are not visible.",
      "boundary_notes": "Blocked asset is not collected evidence.",
      "next_action": "Owner provides approved manifest after gated access."
    },
    {
      "component_ref": "J1",
      "model_family": "ibis",
      "target_simulator": "ibis_parser",
      "compatibility_status": "blocked_unknown",
      "basis": "Possible signal-integrity asset is behind login/export gate; exact IBIS file not confirmed.",
      "uncertainty": "No approved IBIS file or parser evidence.",
      "boundary_notes": "Do not claim parser compatibility from asset category alone.",
      "next_action": "Owner provides approved IBIS file manifest and parser-scope evidence."
    },
    {
      "component_ref": "M1",
      "model_family": "pspice",
      "target_simulator": "ltspice",
      "compatibility_status": "missing_model",
      "basis": "No PSPICE source identified.",
      "uncertainty": "None beyond absent approved source.",
      "boundary_notes": "No synthetic model creation or conversion.",
      "next_action": "Handoff missing model gap."
    },
    {
      "component_ref": "M1",
      "model_family": "simplis",
      "target_simulator": "ltspice",
      "compatibility_status": "not_applicable",
      "basis": "SIMPLIS is requested but no SIMPLIS source is identified and LTspice compatibility is not established.",
      "uncertainty": "No approved source exists in fixture.",
      "boundary_notes": "Do not convert SIMPLIS or substitute another model family.",
      "next_action": "Handoff missing model gap."
    }
  ],
  "missing_models": [
    {
      "component_ref": "U1",
      "manufacturer_part_number": "FIXTURE-OPAMP-01",
      "model_family": "pspice",
      "provenance_checked": [
        "official_source_packet:fixture-opamp-product-page"
      ],
      "status": "missing",
      "uncertainty": "No PSPICE model mentioned in fixture source summary.",
      "boundary_notes": "Missing state prevents downstream invention.",
      "next_action": "Owner confirms whether PSPICE is required or waived."
    },
    {
      "component_ref": "M1",
      "manufacturer_part_number": "FIXTURE-POWER-MODULE-03",
      "model_family": "pspice",
      "provenance_checked": [
        "official_source_packet:fixture-power-module-datasheet"
      ],
      "status": "missing",
      "uncertainty": "No model source identified.",
      "boundary_notes": "Do not derive model from typical curves.",
      "next_action": "Owner source decision required."
    },
    {
      "component_ref": "M1",
      "manufacturer_part_number": "FIXTURE-POWER-MODULE-03",
      "model_family": "simplis",
      "provenance_checked": [
        "official_source_packet:fixture-power-module-datasheet"
      ],
      "status": "missing",
      "uncertainty": "No SIMPLIS source identified.",
      "boundary_notes": "Do not create or convert a SIMPLIS model.",
      "next_action": "Owner source decision required."
    },
    {
      "component_ref": "M1",
      "manufacturer_part_number": "FIXTURE-POWER-MODULE-03",
      "model_family": "demo_circuit",
      "provenance_checked": [
        "official_source_packet:fixture-power-module-datasheet"
      ],
      "status": "missing",
      "uncertainty": "No demo circuit source identified.",
      "boundary_notes": "Do not create a substitute demo circuit.",
      "next_action": "Owner source decision required."
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
      "provenance": [
        "official_source_packet:fixture-connector-product-page"
      ],
      "status": "blocked",
      "blocker_type": [
        "login_required",
        "export_control_acknowledgement_required"
      ],
      "uncertainty": "Exact downloadable asset list is unavailable without owner-handled access.",
      "boundary_notes": "Agent must not request, handle, or bypass credentials or export acknowledgement.",
      "next_action": "Owner obtains assets if permitted and supplies approved local manifest."
    }
  ],
  "owner_followup_needed": [
    {
      "priority": "high",
      "subject": "J1 gated signal-integrity assets",
      "component_ref": "J1",
      "needed_decision": "Owner must decide whether to complete login/export-control workflow and provide approved local files.",
      "blocked_or_missing": "blocked",
      "boundary_notes": "No credential handling by agent."
    },
    {
      "priority": "medium",
      "subject": "U1 LTspice and demo exact manifests",
      "component_ref": "U1",
      "needed_decision": "Owner should provide exact approved file names, terms, dependency list, and simulator scope evidence.",
      "blocked_or_missing": "candidate_official",
      "boundary_notes": "Public summary alone is not deck-ready evidence."
    },
    {
      "priority": "medium",
      "subject": "U1 PSPICE gap",
      "component_ref": "U1",
      "needed_decision": "Owner should confirm whether PSPICE is required, waived, or available from another authoritative source.",
      "blocked_or_missing": "missing",
      "boundary_notes": "No inferred PSPICE model."
    },
    {
      "priority": "medium",
      "subject": "M1 PSPICE, SIMPLIS, and demo gaps",
      "component_ref": "M1",
      "needed_decision": "Owner should identify authoritative sources or accept missing-model handoff.",
      "blocked_or_missing": "missing",
      "boundary_notes": "No synthetic model or curve-derived substitute."
    }
  ],
  "downstream_handoff": {
    "handoff_status": "source_collection_complete_with_gaps",
    "deck_generation_allowed": false,
    "simulator_execution_allowed": false,
    "waveform_or_metric_verification_claimed": false,
    "model_conversion_allowed": false,
    "synthetic_model_creation_allowed": false,
    "ready_items": [],
    "candidate_items_requiring_owner_manifest": [
      "U1 ltspice",
      "U1 demo_circuit"
    ],
    "blocked_items_requiring_owner_access": [
      "J1 s_parameter",
      "J1 ibis"
    ],
    "missing_items_preventing_invention": [
      "U1 pspice",
      "M1 pspice",
      "M1 simplis",
      "M1 demo_circuit"
    ],
    "next_workflow_boundary": "Downstream deck preparation may begin only after owner-approved manifests and compatibility evidence are supplied."
  },
  "boundary_review_note": {
    "summary": "This result is limited to public-safe source-state classification and conservative handoff. It does not include raw model payloads, local absolute paths, credentials, private project facts, deck generation, simulator execution, waveform verification, model conversion, or invented models.",
    "executor_state_caution": "No model is promoted to official_present because the fixture lacks complete approved file, dependency, and simulator-scope evidence.",
    "public_archive_suitability": "Contains summaries and orchestration-relevant classification only."
  }
}