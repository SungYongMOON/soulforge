{
  "candidate_id": "qe_dwarf_auditor_gpt-5.4-mini_low",
  "simulation_source_packet": {
    "workflow_id": "simulation_source_collect_v0",
    "fixture_id": "simulation_source_collect_v0_public_fixture_mixed_model_states",
    "public_safe": true,
    "scope": "Public-safe source-state collection only; no deck generation, no simulator execution, no waveform/metric verification, no model invention or conversion, and no credential handling.",
    "provenance_basis": [
      {
        "ref_id": "official_source_packet:fixture-opamp-product-page",
        "type": "manufacturer_or_authoritative_publisher_page",
        "public_summary": "Manufacturer page states an LTspice macromodel and demo circuit are available for FIXTURE-OPAMP-01, with reuse allowed for evaluation."
      },
      {
        "ref_id": "official_source_packet:fixture-connector-product-page",
        "type": "manufacturer_or_authoritative_publisher_page",
        "public_summary": "Manufacturer page names signal-integrity assets but download requires login and export-control acknowledgement."
      },
      {
        "ref_id": "official_source_packet:fixture-power-module-datasheet",
        "type": "manufacturer_or_authoritative_publisher_page",
        "public_summary": "Datasheet mentions typical curves but no simulation model, demo circuit, or package-level source is identified."
      }
    ],
    "boundary_notes": [
      "File extension, part name, package family, or search snippet alone does not establish model truth or deck-ready state.",
      "Blocked access is preserved as distinct from missing.",
      "Public summaries only are used; no raw payloads or account-bound content are included."
    ],
    "overall_state": "mixed_source_state_with_blocked_and_missing_gaps"
  },
  "model_inventory": [
    {
      "component_ref": "U1",
      "manufacturer_part_number": "FIXTURE-OPAMP-01",
      "requested_model_families": [
        "ltspice",
        "pspice",
        "demo_circuit"
      ],
      "need_purpose": [
        "simulation_deck_prepare",
        "run_verify_setup"
      ],
      "source_reference": "official_source_packet:fixture-opamp-product-page",
      "provenance": "official_manufacturer_page",
      "status": "official_present",
      "uncertainty": "Medium: the source summary supports availability, but this packet does not include the raw downloadable artifact or checksum.",
      "boundary_notes": "Only the LTspice macromodel and demo circuit are supported by the public source summary; no claim is made that a PSPICE file is present unless explicitly evidenced.",
      "next_action": "Request or locate the official manufacturer-provided LTspice macromodel and demo circuit through the approved source path, then record exact file-level provenance before any deck work."
    },
    {
      "component_ref": "J1",
      "manufacturer_part_number": "FIXTURE-CONN-HS-02",
      "requested_model_families": [
        "s_parameter",
        "ibis"
      ],
      "need_purpose": [
        "signal_integrity_review",
        "harness_strengthening_context"
      ],
      "source_reference": "official_source_packet:fixture-connector-product-page",
      "provenance": "official_manufacturer_page",
      "status": "blocked",
      "uncertainty": "Low: the public summary explicitly states that download requires login and export-control acknowledgement.",
      "boundary_notes": "This is not a missing-model conclusion; access is blocked by account/login/export conditions, so no simulator readiness inference is allowed.",
      "next_action": "Owner must supply an approved local manifest or complete the access workflow and provide the downloaded official assets."
    },
    {
      "component_ref": "M1",
      "manufacturer_part_number": "FIXTURE-POWER-MODULE-03",
      "requested_model_families": [
        "pspice",
        "simplis",
        "demo_circuit"
      ],
      "need_purpose": [
        "simulation_deck_prepare",
        "quantitative_enrichment_context"
      ],
      "source_reference": "official_source_packet:fixture-power-module-datasheet",
      "provenance": "official_datasheet",
      "status": "missing",
      "uncertainty": "Low: the public summary says only typical curves are mentioned and no simulation model, demo circuit, or package-level source is identified.",
      "boundary_notes": "This is a valid missing-model outcome and should not be converted into a guessed or synthetic model state.",
      "next_action": "Escalate to owner for an official model source, approved local manifest, or a documented decision that no model will be provided."
    }
  ],
  "model_file_manifest": [
    {
      "component_ref": "U1",
      "manufacturer_part_number": "FIXTURE-OPAMP-01",
      "file_family": "ltspice",
      "file_status": "official_present",
      "file_provenance": "manufacturer_or_authoritative_publisher_page",
      "file_visibility": "public_summary_only",
      "file_truth_basis": "Source summary explicitly states an LTspice macromodel is available.",
      "compatibility_implication": "Potentially compatible with LTspice pending exact file retrieval and validation; no run-ready claim is made."
    },
    {
      "component_ref": "U1",
      "manufacturer_part_number": "FIXTURE-OPAMP-01",
      "file_family": "pspice",
      "file_status": "candidate_official",
      "file_provenance": "insufficient_public_evidence",
      "file_visibility": "not_confirmed",
      "file_truth_basis": "The provided public summary does not explicitly confirm a PSPICE model.",
      "compatibility_implication": "No compatibility claim can be made from the current evidence."
    },
    {
      "component_ref": "U1",
      "manufacturer_part_number": "FIXTURE-OPAMP-01",
      "file_family": "demo_circuit",
      "file_status": "official_present",
      "file_provenance": "manufacturer_or_authoritative_publisher_page",
      "file_visibility": "public_summary_only",
      "file_truth_basis": "Source summary explicitly states a demo circuit is available.",
      "compatibility_implication": "Potentially usable as a reference/demo artifact once retrieved from the approved source."
    },
    {
      "component_ref": "J1",
      "manufacturer_part_number": "FIXTURE-CONN-HS-02",
      "file_family": "s_parameter",
      "file_status": "blocked",
      "file_provenance": "manufacturer_or_authoritative_publisher_page",
      "file_visibility": "access_restricted",
      "file_truth_basis": "Public summary says download requires login and export-control acknowledgement.",
      "compatibility_implication": "Compatibility cannot be assessed until access is resolved and the official file is available."
    },
    {
      "component_ref": "J1",
      "manufacturer_part_number": "FIXTURE-CONN-HS-02",
      "file_family": "ibis",
      "file_status": "blocked",
      "file_provenance": "manufacturer_or_authoritative_publisher_page",
      "file_visibility": "access_restricted",
      "file_truth_basis": "Public summary says download requires login and export-control acknowledgement.",
      "compatibility_implication": "Compatibility cannot be assessed until access is resolved and the official file is available."
    },
    {
      "component_ref": "M1",
      "manufacturer_part_number": "FIXTURE-POWER-MODULE-03",
      "file_family": "pspice",
      "file_status": "missing",
      "file_provenance": "official_datasheet_only",
      "file_visibility": "not_identified",
      "file_truth_basis": "Public summary identifies typical curves only and no simulation model source.",
      "compatibility_implication": "No compatibility evidence exists."
    },
    {
      "component_ref": "M1",
      "manufacturer_part_number": "FIXTURE-POWER-MODULE-03",
      "file_family": "simplis",
      "file_status": "missing",
      "file_provenance": "official_datasheet_only",
      "file_visibility": "not_identified",
      "file_truth_basis": "Public summary identifies no simulation model source.",
      "compatibility_implication": "No compatibility evidence exists."
    },
    {
      "component_ref": "M1",
      "manufacturer_part_number": "FIXTURE-POWER-MODULE-03",
      "file_family": "demo_circuit",
      "file_status": "missing",
      "file_provenance": "official_datasheet_only",
      "file_visibility": "not_identified",
      "file_truth_basis": "Public summary identifies no demo circuit.",
      "compatibility_implication": "No compatibility evidence exists."
    }
  ],
  "demo_circuit_manifest": [
    {
      "component_ref": "U1",
      "manufacturer_part_number": "FIXTURE-OPAMP-01",
      "demo_circuit_status": "official_present",
      "provenance": "official_manufacturer_page",
      "uncertainty": "Medium",
      "boundary_notes": "A demo circuit is referenced in the public summary, but no raw content is included here.",
      "next_action": "Retrieve the official demo circuit from the approved manufacturer source if downstream deck preparation is authorized."
    },
    {
      "component_ref": "J1",
      "manufacturer_part_number": "FIXTURE-CONN-HS-02",
      "demo_circuit_status": "not_applicable",
      "provenance": "official_manufacturer_page",
      "uncertainty": "Low",
      "boundary_notes": "The fixture scope requests SI assets rather than a demo circuit for this component, and the public summary only mentions access-restricted assets.",
      "next_action": "No demo circuit action unless the owner later provides one."
    },
    {
      "component_ref": "M1",
      "manufacturer_part_number": "FIXTURE-POWER-MODULE-03",
      "demo_circuit_status": "missing",
      "provenance": "official_datasheet_only",
      "uncertainty": "Low",
      "boundary_notes": "The public summary does not identify a demo circuit, and no surrogate demo is allowed.",
      "next_action": "Ask the owner whether an official demo circuit exists or whether this remains a no-demo source state."
    }
  ],
  "simulator_compatibility_matrix": [
    {
      "component_ref": "U1",
      "manufacturer_part_number": "FIXTURE-OPAMP-01",
      "simulator": "ltspice",
      "status": "candidate_compatible",
      "basis": "The public summary explicitly states an LTspice macromodel is available, which is consistent with LTspice use.",
      "uncertainty": "Medium",
      "boundary_notes": "Candidate compatible is not deck-ready or run-ready; exact file retrieval and validation are still required.",
      "next_action": "Confirm the retrieved file is the official one and record file-level provenance."
    },
    {
      "component_ref": "U1",
      "manufacturer_part_number": "FIXTURE-OPAMP-01",
      "simulator": "ngspice",
      "status": "blocked_by_unverified_model_format",
      "basis": "No public summary evidence confirms ngspice compatibility.",
      "uncertainty": "High",
      "boundary_notes": "Do not infer ngspice compatibility from generic SPICE phrasing or model family naming alone.",
      "next_action": "Require explicit source evidence or an owner-approved local manifest before any ngspice compatibility claim."
    },
    {
      "component_ref": "U1",
      "manufacturer_part_number": "FIXTURE-OPAMP-01",
      "simulator": "ibis_parser",
      "status": "not_applicable",
      "basis": "The component scope is an op-amp model and demo circuit; no IBIS model is identified in the public summary.",
      "uncertainty": "Medium",
      "boundary_notes": "No IBIS parser compatibility claim should be attached to an op-amp source packet absent an explicit IBIS asset.",
      "next_action": "No action unless an IBIS-family artifact is later supplied."
    },
    {
      "component_ref": "J1",
      "manufacturer_part_number": "FIXTURE-CONN-HS-02",
      "simulator": "ltspice",
      "status": "not_applicable",
      "basis": "The requested families are s-parameter and ibis, not a circuit macromodel for LTspice.",
      "uncertainty": "Low",
      "boundary_notes": "Do not repurpose connector SI assets into an LTspice model truth claim.",
      "next_action": "None."
    },
    {
      "component_ref": "J1",
      "manufacturer_part_number": "FIXTURE-CONN-HS-02",
      "simulator": "ngspice",
      "status": "not_applicable",
      "basis": "No circuit model evidence is available, and access is blocked.",
      "uncertainty": "Low",
      "boundary_notes": "No compatibility inference permitted.",
      "next_action": "Resolve access first if the owner wants a compatibility check."
    },
    {
      "component_ref": "J1",
      "manufacturer_part_number": "FIXTURE-CONN-HS-02",
      "simulator": "ibis_parser",
      "status": "blocked",
      "basis": "The official source summary says download requires login and export-control acknowledgement.",
      "uncertainty": "Low",
      "boundary_notes": "Blocked access prevents any parser-level compatibility validation.",
      "next_action": "Owner to provide approved local files or complete the access workflow."
    },
    {
      "component_ref": "M1",
      "manufacturer_part_number": "FIXTURE-POWER-MODULE-03",
      "simulator": "ltspice",
      "status": "missing",
      "basis": "No simulation model source is identified in the public summary.",
      "uncertainty": "Low",
      "boundary_notes": "No compatibility claim can be made without an official model artifact.",
      "next_action": "Request an official model source from the owner or manufacturer."
    },
    {
      "component_ref": "M1",
      "manufacturer_part_number": "FIXTURE-POWER-MODULE-03",
      "simulator": "ngspice",
      "status": "missing",
      "basis": "No simulation model source is identified in the public summary.",
      "uncertainty": "Low",
      "boundary_notes": "No compatibility claim can be made without an official model artifact.",
      "next_action": "Request an official model source from the owner or manufacturer."
    },
    {
      "component_ref": "M1",
      "manufacturer_part_number": "FIXTURE-POWER-MODULE-03",
      "simulator": "ibis_parser",
      "status": "not_applicable",
      "basis": "No IBIS-family artifact is identified in the public summary.",
      "uncertainty": "Low",
      "boundary_notes": "IBIS parser compatibility is not relevant to the available source state.",
      "next_action": "None."
    }
  ],
  "missing_models": [
    {
      "component_ref": "J1",
      "manufacturer_part_number": "FIXTURE-CONN-HS-02",
      "missing_families": [
        "s_parameter",
        "ibis"
      ],
      "reason": "Access is blocked by login and export-control acknowledgement, so the asset is not presently available for collection.",
      "status_detail": "blocked_not_missing",
      "boundary_notes": "This gap is intentionally separated from true missing-model states.",
      "next_action": "Owner follow-up required to obtain approved local files or complete the access process."
    },
    {
      "component_ref": "M1",
      "manufacturer_part_number": "FIXTURE-POWER-MODULE-03",
      "missing_families": [
        "pspice",
        "simplis",
        "demo_circuit"
      ],
      "reason": "The official datasheet summary identifies no model or demo circuit source.",
      "status_detail": "missing",
      "boundary_notes": "Do not fabricate or infer a model from typical curves.",
      "next_action": "Owner follow-up required for an official model source or an explicit no-model decision."
    },
    {
      "component_ref": "U1",
      "manufacturer_part_number": "FIXTURE-OPAMP-01",
      "missing_families": [
        "pspice"
      ],
      "reason": "The public summary confirms LTspice and demo circuit availability, but does not explicitly confirm PSPICE.",
      "status_detail": "candidate_gap",
      "boundary_notes": "This is an evidence gap rather than a confirmed absence.",
      "next_action": "Verify with the authoritative publisher page or owner-provided manifest before classifying PSPICE as present or absent."
    }
  ],
  "access_blockers": [
    {
      "component_ref": "J1",
      "manufacturer_part_number": "FIXTURE-CONN-HS-02",
      "blocker_type": "login_required",
      "status": "active",
      "impact": "Prevents direct collection of the official signal-integrity assets.",
      "boundary_notes": "Do not attempt to bypass access controls.",
      "next_action": "Owner to provide access-approved downloads or an approved local manifest."
    },
    {
      "component_ref": "J1",
      "manufacturer_part_number": "FIXTURE-CONN-HS-02",
      "blocker_type": "export_control_acknowledgement_required",
      "status": "active",
      "impact": "Prevents direct collection of the official signal-integrity assets.",
      "boundary_notes": "Credential or compliance handling is out of scope for this agent.",
      "next_action": "Owner must complete the required acknowledgement and supply the resulting approved files."
    }
  ],
  "owner_followup_needed": [
    {
      "component_ref": "U1",
      "manufacturer_part_number": "FIXTURE-OPAMP-01",
      "request": "Provide or confirm the exact official LTspice macromodel and demo circuit file names, versions, and approved source location.",
      "reason": "Public summary supports availability, but file-level provenance is not yet recorded."
    },
    {
      "component_ref": "U1",
      "manufacturer_part_number": "FIXTURE-OPAMP-01",
      "request": "Confirm whether an official PSPICE model exists for this part.",
      "reason": "The current public summary does not explicitly support PSPICE."
    },
    {
      "component_ref": "J1",
      "manufacturer_part_number": "FIXTURE-CONN-HS-02",
      "request": "Provide approved local copies of the official s-parameter and IBIS assets, or complete the required access workflow and then supply the downloads.",
      "reason": "Collection is blocked by login and export-control requirements."
    },
    {
      "component_ref": "M1",
      "manufacturer_part_number": "FIXTURE-POWER-MODULE-03",
      "request": "Provide an official PSPICE or SIMPLIS model if one exists, or explicitly confirm that no model will be supplied.",
      "reason": "The datasheet summary does not identify any simulation model source."
    },
    {
      "component_ref": "M1",
      "manufacturer_part_number": "FIXTURE-POWER-MODULE-03",
      "request": "Confirm whether any official demo circuit exists for this component.",
      "reason": "No demo circuit is identified in the public summary."
    }
  ],
  "downstream_handoff": {
    "primary_receiving_role": "deck_preparer_or_source_curator",
    "handoff_state": "source_state_only",
    "ready_inputs": [
      "U1 official LTspice macromodel source summary",
      "U1 official demo circuit source summary",
      "J1 access-blocked asset identifiers and owner follow-up items",
      "M1 confirmed missing-model gap state"
    ],
    "explicit_non_handoff": [
      "No deck file",
      "No simulator execution output",
      "No waveform or metric verification",
      "No model conversion artifact",
      "No synthetic model creation"
    ],
    "handoff_note": "Proceed only after the owner resolves access blockers or supplies approved local manifests; do not infer readiness from partial source-state evidence."
  },
  "boundary_review_note": {
    "result": "Conservative and boundary-compliant",
    "checks": [
      "No raw payloads included",
      "No secret handling performed",
      "No private project facts introduced",
      "No deck or simulator claims made",
      "Blocked access preserved separately from missing",
      "Model-state labels kept within the allowed contract vocabulary"
    ],
    "residual_risk": "Medium, because two component families depend on either explicit owner confirmation or blocked-source resolution before downstream work can proceed.",
    "public_archive_suitability": "summary_only"
  }
}