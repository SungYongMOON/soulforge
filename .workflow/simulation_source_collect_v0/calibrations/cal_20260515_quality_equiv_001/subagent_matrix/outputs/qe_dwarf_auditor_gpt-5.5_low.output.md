{
  "candidate_id": "qe_dwarf_auditor_gpt-5.5_low",
  "simulation_source_packet": {
    "fixture_id": "simulation_source_collect_v0_public_fixture_mixed_model_states",
    "workflow_id": "simulation_source_collect_v0",
    "public_safe": true,
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
      "raw_payload_included": false,
      "credentials_requested_or_handled": false
    },
    "collection_status": "conservative_public_summary_only",
    "boundary": "pre_deck_pre_run_no_conversion_no_payload_archive"
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
      "provenance": {
        "source_ref": "official_source_packet:fixture-opamp-product-page",
        "source_type": "manufacturer_or_authoritative_publisher_page",
        "public_summary": "Authoritative manufacturer page states an LTspice macromodel is available for evaluation."
      },
      "status": "candidate_official",
      "uncertainty": "Availability is publicly summarized, but no owner-supplied file manifest, terms detail, dependency list, or simulator-scope evidence is present in the fixture.",
      "boundary_notes": "Not deck-ready or run-ready. No raw model payload collected or converted.",
      "next_action": "Owner or authorized collector should supply an approved local manifest with file identity, terms, dependencies, and simulator scope."
    },
    {
      "component_ref": "U1",
      "manufacturer_part_number": "FIXTURE-OPAMP-01",
      "model_family": "pspice",
      "needed_for": [
        "simulation_deck_prepare",
        "run_verify_setup"
      ],
      "provenance": {
        "source_ref": "official_source_packet:fixture-opamp-product-page",
        "source_type": "manufacturer_or_authoritative_publisher_page",
        "public_summary": "The fixture summary names LTspice and demo circuit availability, not a PSpice model."
      },
      "status": "missing",
      "uncertainty": "No authoritative PSpice model source is identified in the fixture.",
      "boundary_notes": "Do not infer PSpice compatibility from LTspice availability.",
      "next_action": "Ask owner to confirm whether a PSpice model exists from an authoritative source or mark this need out of scope."
    },
    {
      "component_ref": "U1",
      "manufacturer_part_number": "FIXTURE-OPAMP-01",
      "model_family": "demo_circuit",
      "needed_for": [
        "simulation_deck_prepare",
        "run_verify_setup"
      ],
      "provenance": {
        "source_ref": "official_source_packet:fixture-opamp-product-page",
        "source_type": "manufacturer_or_authoritative_publisher_page",
        "public_summary": "Authoritative manufacturer page states a demo circuit is available for evaluation."
      },
      "status": "candidate_official",
      "uncertainty": "Demo circuit availability is summarized, but no approved local file manifest or dependency evidence is present.",
      "boundary_notes": "Demo circuit is not collected as a deck and has not been run or verified.",
      "next_action": "Owner should provide approved local demo-circuit manifest and permitted downstream use scope."
    },
    {
      "component_ref": "J1",
      "manufacturer_part_number": "FIXTURE-CONN-HS-02",
      "model_family": "s_parameter",
      "needed_for": [
        "signal_integrity_review",
        "harness_strengthening_context"
      ],
      "provenance": {
        "source_ref": "official_source_packet:fixture-connector-product-page",
        "source_type": "manufacturer_or_authoritative_publisher_page",
        "public_summary": "Authoritative manufacturer page names signal-integrity assets, but download requires login and export-control acknowledgement."
      },
      "status": "blocked",
      "uncertainty": "A signal-integrity asset may exist, but the fixture does not expose an approved public or owner-supplied file manifest.",
      "boundary_notes": "Blocked access is preserved separately from missing. No account-bound download attempted.",
      "next_action": "Owner must complete access/export-control process and provide an approved local manifest if use is permitted."
    },
    {
      "component_ref": "J1",
      "manufacturer_part_number": "FIXTURE-CONN-HS-02",
      "model_family": "ibis",
      "needed_for": [
        "signal_integrity_review",
        "harness_strengthening_context"
      ],
      "provenance": {
        "source_ref": "official_source_packet:fixture-connector-product-page",
        "source_type": "manufacturer_or_authoritative_publisher_page",
        "public_summary": "Authoritative manufacturer page names signal-integrity assets, but download requires login and export-control acknowledgement."
      },
      "status": "blocked",
      "uncertainty": "The fixture does not prove that the blocked signal-integrity assets include an IBIS file.",
      "boundary_notes": "Do not treat part family or asset category as IBIS truth.",
      "next_action": "Owner should confirm whether an IBIS file exists after authorized access and provide approved manifest evidence."
    },
    {
      "component_ref": "M1",
      "manufacturer_part_number": "FIXTURE-POWER-MODULE-03",
      "model_family": "pspice",
      "needed_for": [
        "simulation_deck_prepare",
        "quantitative_enrichment_context"
      ],
      "provenance": {
        "source_ref": "official_source_packet:fixture-power-module-datasheet",
        "source_type": "manufacturer_or_authoritative_publisher_page",
        "public_summary": "Datasheet mentions typical curves but no simulation model is identified."
      },
      "status": "missing",
      "uncertainty": "No authoritative PSpice model source is identified.",
      "boundary_notes": "Typical curves are not a model source and do not authorize synthetic model creation.",
      "next_action": "Owner should locate an authoritative model source or accept missing-model handoff."
    },
    {
      "component_ref": "M1",
      "manufacturer_part_number": "FIXTURE-POWER-MODULE-03",
      "model_family": "simplis",
      "needed_for": [
        "simulation_deck_prepare",
        "quantitative_enrichment_context"
      ],
      "provenance": {
        "source_ref": "official_source_packet:fixture-power-module-datasheet",
        "source_type": "manufacturer_or_authoritative_publisher_page",
        "public_summary": "Datasheet mentions typical curves but no SIMPLIS model is identified."
      },
      "status": "missing",
      "uncertainty": "No authoritative SIMPLIS model source is identified.",
      "boundary_notes": "No conversion from curves or other model families is allowed.",
      "next_action": "Owner should provide authoritative SIMPLIS source evidence or mark need unresolved."
    },
    {
      "component_ref": "M1",
      "manufacturer_part_number": "FIXTURE-POWER-MODULE-03",
      "model_family": "demo_circuit",
      "needed_for": [
        "simulation_deck_prepare",
        "quantitative_enrichment_context"
      ],
      "provenance": {
        "source_ref": "official_source_packet:fixture-power-module-datasheet",
        "source_type": "manufacturer_or_authoritative_publisher_page",
        "public_summary": "Datasheet mentions typical curves but no demo circuit is identified."
      },
      "status": "missing",
      "uncertainty": "No authoritative demo circuit source is identified.",
      "boundary_notes": "Do not create a substitute demo circuit in this workflow.",
      "next_action": "Owner should provide approved demo-circuit source evidence or leave gap explicit for downstream planning."
    }
  ],
  "model_file_manifest": [],
  "demo_circuit_manifest": [
    {
      "component_ref": "U1",
      "manufacturer_part_number": "FIXTURE-OPAMP-01",
      "model_family": "demo_circuit",
      "status": "candidate_official",
      "provenance": "official_source_packet:fixture-opamp-product-page",
      "uncertainty": "Availability is summarized but no file identity, checksum, dependencies, or approved local manifest is present.",
      "boundary_notes": "No demo payload included and no deck generated.",
      "next_action": "Owner-approved local manifest required before downstream deck preparation."
    },
    {
      "component_ref": "M1",
      "manufacturer_part_number": "FIXTURE-POWER-MODULE-03",
      "model_family": "demo_circuit",
      "status": "missing",
      "provenance": "official_source_packet:fixture-power-module-datasheet",
      "uncertainty": "No demo circuit identified.",
      "boundary_notes": "Missing state prevents invention of a substitute demo circuit.",
      "next_action": "Owner to provide authoritative source or accept unresolved gap."
    }
  ],
  "simulator_compatibility_matrix": [
    {
      "component_ref": "U1",
      "model_family": "ltspice",
      "target_simulator": "ltspice",
      "compatibility_status": "candidate",
      "basis": "Manufacturer summary names an LTspice macromodel.",
      "uncertainty": "No file manifest, syntax inspection, dependency evidence, or smoke test allowed.",
      "next_action": "Record terms, dependencies, and simulator scope from approved manifest."
    },
    {
      "component_ref": "U1",
      "model_family": "ltspice",
      "target_simulator": "ngspice",
      "compatibility_status": "unknown",
      "basis": "No ngspice compatibility evidence supplied.",
      "uncertainty": "LTspice naming alone does not prove ngspice compatibility.",
      "next_action": "Do not convert or assume compatibility without owner basis."
    },
    {
      "component_ref": "U1",
      "model_family": "pspice",
      "target_simulator": "ltspice",
      "compatibility_status": "not_applicable",
      "basis": "Requested PSpice model is missing.",
      "uncertainty": "No model file exists in the fixture for compatibility assessment.",
      "next_action": "Resolve source gap first."
    },
    {
      "component_ref": "U1",
      "model_family": "pspice",
      "target_simulator": "ngspice",
      "compatibility_status": "not_applicable",
      "basis": "Requested PSpice model is missing.",
      "uncertainty": "No model file exists in the fixture for compatibility assessment.",
      "next_action": "Resolve source gap first."
    },
    {
      "component_ref": "U1",
      "model_family": "demo_circuit",
      "target_simulator": "ltspice",
      "compatibility_status": "candidate",
      "basis": "Manufacturer summary states a demo circuit is available alongside LTspice model availability.",
      "uncertainty": "No demo circuit file or simulator declaration is present.",
      "next_action": "Owner-approved manifest must identify simulator and dependencies."
    },
    {
      "component_ref": "J1",
      "model_family": "s_parameter",
      "target_simulator": "ltspice",
      "compatibility_status": "blocked",
      "basis": "Signal-integrity asset access requires login and export-control acknowledgement.",
      "uncertainty": "No file type, port count, format, or terms evidence available.",
      "next_action": "Owner access and approved local manifest required."
    },
    {
      "component_ref": "J1",
      "model_family": "s_parameter",
      "target_simulator": "ngspice",
      "compatibility_status": "blocked",
      "basis": "Signal-integrity asset access requires login and export-control acknowledgement.",
      "uncertainty": "No file type, port count, format, or terms evidence available.",
      "next_action": "Owner access and approved local manifest required."
    },
    {
      "component_ref": "J1",
      "model_family": "ibis",
      "target_simulator": "ibis_parser",
      "compatibility_status": "blocked",
      "basis": "Requested IBIS need is behind access-controlled signal-integrity asset source, and file identity is not confirmed.",
      "uncertainty": "Cannot confirm IBIS existence or parser compatibility.",
      "next_action": "Owner should provide authorized IBIS manifest if available."
    },
    {
      "component_ref": "M1",
      "model_family": "pspice",
      "target_simulator": "ltspice",
      "compatibility_status": "not_applicable",
      "basis": "No PSpice model source identified.",
      "uncertainty": "No compatibility evidence exists.",
      "next_action": "Do not create or convert a model."
    },
    {
      "component_ref": "M1",
      "model_family": "pspice",
      "target_simulator": "ngspice",
      "compatibility_status": "not_applicable",
      "basis": "No PSpice model source identified.",
      "uncertainty": "No compatibility evidence exists.",
      "next_action": "Do not create or convert a model."
    },
    {
      "component_ref": "M1",
      "model_family": "simplis",
      "target_simulator": "ltspice",
      "compatibility_status": "not_applicable",
      "basis": "No SIMPLIS model source identified and LTspice is not a SIMPLIS target in the fixture.",
      "uncertainty": "No compatibility evidence exists.",
      "next_action": "Resolve missing source before simulator assessment."
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
      "uncertainty": "Official summary does not mention PSpice.",
      "next_action": "Owner confirmation or authoritative source needed."
    },
    {
      "component_ref": "M1",
      "manufacturer_part_number": "FIXTURE-POWER-MODULE-03",
      "model_family": "pspice",
      "provenance_checked": [
        "official_source_packet:fixture-power-module-datasheet"
      ],
      "status": "missing",
      "uncertainty": "Datasheet identifies no simulation model.",
      "next_action": "Leave unresolved unless owner supplies authoritative source."
    },
    {
      "component_ref": "M1",
      "manufacturer_part_number": "FIXTURE-POWER-MODULE-03",
      "model_family": "simplis",
      "provenance_checked": [
        "official_source_packet:fixture-power-module-datasheet"
      ],
      "status": "missing",
      "uncertainty": "Datasheet identifies no SIMPLIS model.",
      "next_action": "Leave unresolved unless owner supplies authoritative source."
    },
    {
      "component_ref": "M1",
      "manufacturer_part_number": "FIXTURE-POWER-MODULE-03",
      "model_family": "demo_circuit",
      "provenance_checked": [
        "official_source_packet:fixture-power-module-datasheet"
      ],
      "status": "missing",
      "uncertainty": "Datasheet identifies no demo circuit.",
      "next_action": "Do not invent a demo circuit."
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
      "blocker_type": "login_and_export_control_acknowledgement",
      "provenance": "official_source_packet:fixture-connector-product-page",
      "status": "blocked",
      "boundary_notes": "Agent must not request credentials, handle account-bound downloads, or bypass access terms.",
      "next_action": "Owner should complete authorized access flow and provide public-safe approved local manifest if use is permitted."
    }
  ],
  "owner_followup_needed": [
    {
      "priority": "high",
      "component_ref": "J1",
      "request": "Confirm authorized access outcome for signal-integrity assets and provide approved local manifest if permitted.",
      "reason": "Both requested connector model-family needs are blocked, not missing."
    },
    {
      "priority": "medium",
      "component_ref": "U1",
      "request": "Provide approved local manifest for LTspice model and demo circuit, including terms, dependencies, simulator scope, and file identities.",
      "reason": "Official availability is only candidate-level without manifest evidence."
    },
    {
      "priority": "medium",
      "component_ref": "U1",
      "request": "Confirm whether an authoritative PSpice model exists.",
      "reason": "Requested PSpice need is not represented in the official summary."
    },
    {
      "priority": "medium",
      "component_ref": "M1",
      "request": "Confirm whether any authoritative PSpice, SIMPLIS, or demo circuit source exists outside the provided datasheet.",
      "reason": "Fixture source identifies typical curves only, which are not model sources."
    }
  ],
  "downstream_handoff": {
    "handoff_status": "source_collection_summary_only",
    "deck_generation_allowed": false,
    "simulator_execution_allowed": false,
    "waveform_or_metric_verification_claimed": false,
    "model_conversion_allowed": false,
    "synthetic_model_creation_allowed": false,
    "usable_for_downstream": [
      "model need inventory",
      "source provenance index",
      "candidate official source notes",
      "missing model gap list",
      "blocked access queue",
      "compatibility caution matrix"
    ],
    "blocked_from_downstream": [
      "deck-ready assertion",
      "run-ready assertion",
      "model payload archive",
      "simulator compatibility truth",
      "harness connection promotion"
    ]
  },
  "boundary_review_note": {
    "summary": "This result preserves public-safe source summaries and separates candidate, missing, and blocked states. It does not include raw model files, private paths, credentials, account-bound content, generated decks, simulator runs, waveform claims, model conversion, or synthetic replacement models.",
    "conservative_findings": [
      "U1 LTspice and demo circuit are candidate_official only because availability is summarized but manifest evidence is absent.",
      "J1 signal-integrity assets are blocked because authorized access is required.",
      "M1 requested model families are missing because typical curves do not establish model availability.",
      "Missing and blocked states are successful workflow outputs because they prevent downstream invention."
    ]
  }
}