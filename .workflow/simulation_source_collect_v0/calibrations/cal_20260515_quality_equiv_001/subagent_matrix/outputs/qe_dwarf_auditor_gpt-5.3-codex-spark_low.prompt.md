You are running a public-safe synthetic calibration candidate for Soulforge workflow `simulation_source_collect_v0`.

Assigned candidate profile:

- model: `gpt-5.3-codex-spark`
- reasoning_effort: `low`
- species: `dwarf`
- class: `auditor`

Task:

Apply the workflow contract below to the public synthetic fixture. Return a conservative simulation-source collection result. This is a pre-deck, pre-run workflow: do not create a deck, do not run a simulator, do not claim waveform or metric verification, do not invent or convert models, and do not request or handle credentials.

Return strict JSON only, with these top-level keys:

- `candidate_id`
- `simulation_source_packet`
- `model_inventory`
- `model_file_manifest`
- `demo_circuit_manifest`
- `simulator_compatibility_matrix`
- `missing_models`
- `access_blockers`
- `owner_followup_needed`
- `downstream_handoff`
- `boundary_review_note`

Every model-family need in the fixture must be represented explicitly. For each record, separate provenance, status, uncertainty, boundary notes, and next action. Use public summaries only. Do not include raw model payloads, local absolute paths, secrets, private project facts, or account-bound download content.

Workflow contract summary:

- Owns model need inventory, model-source provenance index, model file manifest, demo circuit manifest, simulator compatibility evidence matrix, missing model gaps, access blockers, owner follow-up queue, downstream handoff.
- Does not own deck generation, simulator execution, waveform/metric verification, model conversion, synthetic model creation, source-document authority replacement, or harness connection promotion.
- Executor-approved model states are only `official_present`, `owner_approved_local`, or `tool_library_official`, and only when terms, dependency, and simulator-scope evidence are recorded.
- Review/gap model states are `candidate_official`, `third_party_unapproved`, `missing`, `blocked`, `conflicting`, and `not_applicable`.
- Compatibility must record status and basis. File extension, part name, package family, or search snippet alone cannot create model truth, compatibility truth, deck-ready state, or run-ready state.
- Blocked access is not the same as missing; preserve account/login/export/license blockers and owner follow-up.
- Missing model states are successful output when they prevent downstream model invention.

Public synthetic fixture:

```json
{
  "fixture_id": "simulation_source_collect_v0_public_fixture_mixed_model_states",
  "workflow_id": "simulation_source_collect_v0",
  "public_safe": true,
  "purpose": "Exercise source-state classification, compatibility caution, downstream handoff, and boundary review without using private project inputs or raw model payloads.",
  "simulation_source_binding": {
    "project_code": "PUBLIC_FIXTURE",
    "run_id": "calibration_public_fixture",
    "output_root_policy": "project_local_or_private_workmeta_only",
    "public_archive_policy": "summary_and_orchestration_only_no_model_payloads"
  },
  "approved_model_source_policy": {
    "accepted_executor_sources": [
      "manufacturer_or_authoritative_publisher_page",
      "owner_approved_local_manifest",
      "tool_library_manifest_approved_by_policy"
    ],
    "rejected_executor_sources": [
      "random_mirror",
      "forum_upload",
      "search_snippet",
      "account_bound_download_without_owner_supplied_file"
    ],
    "blocked_access_handling": "record_blocked_and_owner_followup",
    "no_secret_handling_by_agent": true,
    "no_raw_payload_in_public_archive": true
  },
  "simulator_policy": {
    "target_simulators": [
      "ltspice",
      "ngspice",
      "ibis_parser"
    ],
    "smoke_test_allowed": false,
    "conversion_allowed_without_owner_basis": false
  },
  "model_need_scope": {
    "components": [
      {
        "component_ref": "U1",
        "manufacturer_part_number": "FIXTURE-OPAMP-01",
        "requested_model_families": [
          "ltspice",
          "pspice",
          "demo_circuit"
        ],
        "needed_for": [
          "simulation_deck_prepare",
          "run_verify_setup"
        ],
        "source_identifier_refs": [
          "official_source_packet:fixture-opamp-product-page"
        ]
      },
      {
        "component_ref": "J1",
        "manufacturer_part_number": "FIXTURE-CONN-HS-02",
        "requested_model_families": [
          "s_parameter",
          "ibis"
        ],
        "needed_for": [
          "signal_integrity_review",
          "harness_strengthening_context"
        ],
        "source_identifier_refs": [
          "official_source_packet:fixture-connector-product-page"
        ]
      },
      {
        "component_ref": "M1",
        "manufacturer_part_number": "FIXTURE-POWER-MODULE-03",
        "requested_model_families": [
          "pspice",
          "simplis",
          "demo_circuit"
        ],
        "needed_for": [
          "simulation_deck_prepare",
          "quantitative_enrichment_context"
        ],
        "source_identifier_refs": [
          "official_source_packet:fixture-power-module-datasheet"
        ]
      }
    ]
  },
  "official_source_packet_refs": [
    {
      "ref_id": "official_source_packet:fixture-opamp-product-page",
      "summary": "Authoritative manufacturer page states an LTspice macromodel and demo circuit are available for FIXTURE-OPAMP-01, with reuse allowed for evaluation.",
      "allowed_public_summary": true
    },
    {
      "ref_id": "official_source_packet:fixture-connector-product-page",
      "summary": "Authoritative manufacturer page names signal-integrity assets but download requires login and export-control acknowledgement.",
      "allowed_public_summary": true
    },
    {
      "ref_id": "official_source_packet:fixture-power-module-datasheet",
      "summary": "Datasheet mentions typical curves but no simulation model, demo circuit, or package-level source is identified.",
      "allowed_public_summary": true
    }
  ],
  "owner_approved_local_model_manifest": [],
  "tool_library_manifest": []
}
```

Use candidate_id: qe_dwarf_auditor_gpt-5.3-codex-spark_low.

