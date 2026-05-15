{
  "packet_identity": {
    "workflow_id": "official_source_packet_collect_v0",
    "fixture_type": "public_safe_synthetic_from_contract",
    "collection_date": "2026-05-15",
    "output_root": "_workspaces/<project_code>/sources/official_packet",
    "public_archive_policy": "no_payloads_no_runtime_absolute_paths",
    "validation_basis": "public-safe fixture only"
  },
  "identifier_inventory": [
    {
      "identifier_id": "U1",
      "display_value": "STM32F030F4P6",
      "requested_source_kinds": [
        "datasheet",
        "evaluation_board_or_reference_design",
        "ecad_model"
      ],
      "downstream_consumers": [
        "materials",
        "layout",
        "ecad"
      ]
    },
    {
      "identifier_id": "U2",
      "display_value": "AP2112K-3.3TRG1",
      "requested_source_kinds": [
        "datasheet",
        "simulation_model",
        "layout_or_package_document"
      ],
      "downstream_consumers": [
        "materials",
        "layout",
        "simulation"
      ]
    },
    {
      "identifier_id": "J1",
      "display_value": "USB-C-16P generic connector",
      "requested_source_kinds": [
        "datasheet",
        "ecad_model"
      ],
      "downstream_consumers": [
        "materials",
        "harness"
      ]
    }
  ],
  "source_inventory": [
    {
      "identifier_id": "U1",
      "source_kind": "datasheet",
      "state": "official_present",
      "approved_for_executor": true,
      "publisher": "STMicroelectronics",
      "title": "STM32F030x4/x6 datasheet landing page",
      "url": "https://www.st.com/example-official-u1",
      "claims_supported": [
        "identity",
        "package",
        "pinout"
      ],
      "access_date": "2026-05-15"
    },
    {
      "identifier_id": "U1",
      "source_kind": "evaluation_board_or_reference_design",
      "state": "missing",
      "approved_for_executor": false,
      "searched_locations": [
        "manufacturer product page",
        "owner local manifest"
      ],
      "downstream_impact": "layout remains review_only for reference-board-specific claims"
    },
    {
      "identifier_id": "U1",
      "source_kind": "ecad_model",
      "state": "not_found_in_fixture",
      "approved_for_executor": false,
      "downstream_impact": "ecad model cannot be used until official_present or owner_approved_local source is supplied"
    },
    {
      "identifier_id": "U2",
      "source_kind": "datasheet",
      "state": "official_present",
      "approved_for_executor": true,
      "publisher": "Diodes Incorporated",
      "title": "AP2112 datasheet landing page",
      "url": "https://www.diodes.com/example-official-u2",
      "claims_supported": [
        "identity",
        "package",
        "electrical ratings"
      ],
      "access_date": "2026-05-15"
    },
    {
      "identifier_id": "U2",
      "source_kind": "simulation_model",
      "state": "blocked",
      "approved_for_executor": false,
      "blocker": "official model download requires owner account acceptance",
      "downstream_impact": "simulation source ref blocked until owner supplies approved file"
    },
    {
      "identifier_id": "U2",
      "source_kind": "layout_or_package_document",
      "state": "not_found_in_fixture",
      "approved_for_executor": false,
      "downstream_impact": "layout/package claims remain unsupported beyond datasheet-supported package claims"
    },
    {
      "identifier_id": "J1",
      "source_kind": "datasheet",
      "state": "candidate_official",
      "approved_for_executor": false,
      "blocker": "generic connector identity lacks manufacturer and MPN"
    },
    {
      "identifier_id": "J1",
      "source_kind": "ecad_model",
      "state": "not_found_in_fixture",
      "approved_for_executor": false,
      "downstream_impact": "ecad/harness references blocked until exact connector identity and approved source are supplied"
    }
  ],
  "source_gap_report": [
    {
      "identifier_id": "U1",
      "source_kind": "evaluation_board_or_reference_design",
      "state": "missing",
      "impact": "layout remains review_only for reference-board-specific claims"
    },
    {
      "identifier_id": "U1",
      "source_kind": "ecad_model",
      "state": "not_found_in_fixture",
      "impact": "no approved ECAD source available"
    },
    {
      "identifier_id": "U2",
      "source_kind": "simulation_model",
      "state": "blocked",
      "blocker": "official model download requires owner account acceptance",
      "impact": "simulation source ref blocked until owner supplies approved file"
    },
    {
      "identifier_id": "U2",
      "source_kind": "layout_or_package_document",
      "state": "not_found_in_fixture",
      "impact": "dedicated layout/package document unavailable in fixture"
    },
    {
      "identifier_id": "J1",
      "source_kind": "datasheet",
      "state": "candidate_official",
      "blocker": "generic connector identity lacks manufacturer and MPN",
      "impact": "candidate cannot be approved for executor use"
    },
    {
      "identifier_id": "J1",
      "source_kind": "ecad_model",
      "state": "not_found_in_fixture",
      "impact": "no approved connector ECAD model available"
    }
  ],
  "owner_followup_needed": [
    {
      "identifier_id": "U2",
      "request": "Provide owner-approved official simulation model file or account-download authorization evidence.",
      "reason": "Official model download is blocked by owner account acceptance."
    },
    {
      "identifier_id": "J1",
      "request": "Provide exact manufacturer and MPN for the USB-C connector.",
      "reason": "Generic identity prevents approving datasheet or ECAD sources."
    },
    {
      "identifier_id": "U1",
      "request": "Provide owner-approved local ECAD model or official ECAD model source if executor ECAD use is required.",
      "reason": "No ECAD model source is present in the fixture."
    },
    {
      "identifier_id": "U2",
      "request": "Provide official or owner-approved layout/package document if claims beyond datasheet package information are required.",
      "reason": "Requested layout_or_package_document is absent from the fixture."
    }
  ],
  "download_or_reuse_manifest": [
    {
      "identifier_id": "U1",
      "source_kind": "datasheet",
      "action": "reuse_or_download_public_official_landing_page",
      "approved_for_executor": true,
      "url": "https://www.st.com/example-official-u1",
      "payload_embedded": false
    },
    {
      "identifier_id": "U2",
      "source_kind": "datasheet",
      "action": "reuse_or_download_public_official_landing_page",
      "approved_for_executor": true,
      "url": "https://www.diodes.com/example-official-u2",
      "payload_embedded": false
    },
    {
      "identifier_id": "U2",
      "source_kind": "simulation_model",
      "action": "do_not_download_until_owner_approval",
      "approved_for_executor": false,
      "payload_embedded": false
    },
    {
      "identifier_id": "J1",
      "source_kind": "datasheet",
      "action": "hold_candidate_until_exact_identity",
      "approved_for_executor": false,
      "payload_embedded": false
    }
  ],
  "downstream_ready_refs": [
    {
      "ref_id": "U1_datasheet_official",
      "identifier_id": "U1",
      "source_kind": "datasheet",
      "approved_for_executor": true,
      "publisher": "STMicroelectronics",
      "url": "https://www.st.com/example-official-u1",
      "usable_for_claims": [
        "identity",
        "package",
        "pinout"
      ],
      "downstream_consumers": [
        "materials",
        "layout",
        "ecad"
      ]
    },
    {
      "ref_id": "U2_datasheet_official",
      "identifier_id": "U2",
      "source_kind": "datasheet",
      "approved_for_executor": true,
      "publisher": "Diodes Incorporated",
      "url": "https://www.diodes.com/example-official-u2",
      "usable_for_claims": [
        "identity",
        "package",
        "electrical ratings"
      ],
      "downstream_consumers": [
        "materials",
        "layout",
        "simulation"
      ]
    }
  ],
  "boundary_notes": [
    "No commands, browsing, local file inspection, or external validation were used.",
    "Only official_present records are approved for executor use in this packet.",
    "No raw PDFs, account downloads, credentials, runtime absolute paths, or private project files are embedded.",
    "Candidate, missing, blocked, and fixture-absent states are preserved and not promoted."
  ],
  "quality_self_check": {
    "covered_requirements": [
      "Included all required top-level keys.",
      "Partitioned source states explicitly.",
      "Approved only official_present records for executor use.",
      "Preserved missing, blocked, candidate, and absent requested-source states.",
      "Produced downstream_ready_refs only for approved official sources.",
      "Avoided raw payloads, runtime absolute paths, credentials, and private-state data."
    ],
    "gaps": [
      "No external source validation was performed because the rules prohibit browsing or commands.",
      "Requested ECAD, simulation, reference-design, and layout/package sources remain unavailable unless supplied by owner or official source discovery in a permitted environment."
    ],
    "boundary_notes": [
      "Result is derived only from the synthetic public-safe fixture.",
      "URLs and titles are treated as fixture-provided metadata, not independently verified facts.",
      "No candidate_official or blocked source is approved for executor use."
    ]
  }
}