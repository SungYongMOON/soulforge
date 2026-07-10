You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-terra; reasoning_effort=medium; species=orc; class=archivist.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.
Emit the exact public workflow output groups as top-level fields: component_inventory, intake_context_note, source_discovery_packet, parts_materials_tree, download_manifest, downloaded_file_checksum_manifest, circuit_design_review_queue.
This shape correction comes from the public workflow output contract and fixture handoff; it is not evaluator or golden material.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: exp_xml_component_materials
kind: workflow
status: active
title: EXP XML Component Materials Collection
summary: Parse an EXP.xml component list and collect official datasheets plus evaluation-board/reference-design files into per-component DATA Sheet and EVAL folders for circuit-design preparation.
entrypoint: run
execution_mode: local_tool_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
inputs:
  - exp_xml_source
  - project_materials_binding
  - approved_download_policy
optional_inputs:
  - downstream_handoff
outputs:
  - component_inventory
  - intake_context_note
  - source_discovery_packet
  - parts_materials_tree
  - download_manifest
  - downloaded_file_checksum_manifest
  - circuit_design_review_queue
upstream_context:
  - workflow_id: capture_xml_intake_library_v0
    output: downstream_handoff
    binding_key: downstream_handoff
    required: false
    authority: context_only
    may_influence:
      - connector_or_interface_refdes_prioritization
      - power_sensitive_ref_review_priority
      - topology_open_question_review_items
      - source_bootstrap_search_hints_after_exp_xml_confirmation
    may_not_confirm:
      - component_identity
      - placed_component_inventory
      - electrical_connectivity
      - manufacturer_or_part_number
intake_handoff_policy:
  required: false
  source_workflow_id: capture_xml_intake_library_v0
  expected_artifact: downstream_handoff
  authoritative_source: exp_xml_source
  safe_context_fields:
    - handoff_status
    - pass_to_downstream
    - block_summary
    - connectors
    - power_summary
    - open_questions
    - provenance
    - do_not_pass_as_confirmed
  usage_rules:
    - Use the handoff only to prioritize review queues, source-bootstrap order, and owner questions after the component exists in the parsed EXP.xml inventory.
    - Treat connector, interface, power, control, and pin-name-only observations as candidates unless the EXP.xml parsing step independently confirms the placed component identity.
    - Carry unresolved topology questions into circuit_design_review_queue rather than converting them into confirmed material requirements.
    - If the handoff is absent, malformed, or outside the approved binding, continue from exp_xml_source alone or stop only when the binding itself is unsafe.
validation_level: pilot_executed_binary_download
intake_handoff_validation_level: pilot_ready_context_only
page_fragment_materials_validation_level: narrowed_page_pilot_executed_private_fixture
notes:
  - The EXP.xml input is the baseline artifact and must be read-only during collection.
  - The input may be a whole Capture export or a bounded page-fragment XML asset; page-fragment runs prepare page-level materials only and must not claim full-design coverage.
  - The optional capture_xml_intake_library_v0 downstream_handoff is context only; it can prioritize likely connectors, power-sensitive refs, and open topology questions, but cannot replace EXP.xml parsing or confirm component identity/connectivity.
  - Downloaded PDFs, CAD archives, schematics, PCB files, and vendor collateral belong under a project-local materials root, not inside .workflow.
  - Each normalized component key gets DATA Sheet and EVAL subfolders under the materials root.
  - For Cadence Capture EXP.xml, placed design components should be extracted from PartInst nodes; Package nodes can include library/cache definitions that are not actual placed BOM lines.
  - If a full XML DOM parser fails on a large Capture export, use a bounded PartInst block parser as a fallback and record that parser mode in run evidence.
  - When PartInst PartValue is missing or a placeholder such as Value, recover identity only from the matching Package/SymbolUserProp definition and mark the confidence source.
  - Generic passives, test points, and symbolic power entries without a manufacturer part number go to the review queue rather than receiving guessed datasheets.
  - Source discovery prefers official manufacturer pages, official distributor-hosted manufacturer datasheets, and official evaluation-board/reference-design download pages.
  - Owner-approved local copies of official collateral may be reused when provenance is preserved, source identity remains traceable, and completed files still have checksum/file evidence in the manifests.
  - For page-fragment inputs, a strong per-page source packet is an acceptable bounded output; unresolved full-design coverage, cross-page topology, and generic/support parts remain review items.
  - URL shortcuts or source links alone are not a completed download; completion requires actual saved files with byte size, content type or file-magic validation, and SHA256 checksum in the manifest.
  - Vendor-account, click-through-license, or export-controlled files require owner action and must be recorded in the review queue instead of bypassed.
  - Binary download pilot saved official Analog Devices datasheet, demo manual, schematic PDF, evaluation design ZIP, and LTspice demo file for the extracted LT3045EDD-1 part.
  - Large-fixture evolution pilot exercised multi-hundred-instance parsing, Package/SymbolUserProp identity fallback, official PDF/ZIP download validation, and unavailable-material review notes.


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: exp_xml_component_materials
kind: step_graph
status: active
steps:
  - step_id: prepare_runtime_binding
    title: Prepare Runtime Binding
    actor_slot: workflow_runner
    action:
      kind: local_workspace_setup
      requires:
        - exp_xml_source
        - materials_root
        - download_policy
      optional_accepts:
        - downstream_handoff
        - owner_approved_local_official_collateral
      creates:
        - run_log_root
        - materials_root
    summary: Confirm that the EXP.xml input exists, input scope is declared as whole-export or page-fragment, the output root is project-local, the download/reuse policy is explicit, and any upstream downstream_handoff binding is optional context only before any network request or file write.
    next:
      on_success: review_optional_intake_context
      on_fail: stop
  - step_id: review_optional_intake_context
    title: Review Optional Intake Context
    actor_slot: workflow_runner
    action:
      kind: optional_context_review
      required_artifact_in: exp_xml_source
      optional_artifact_in: downstream_handoff
      expected_source_workflow_id: capture_xml_intake_library_v0
      artifact_out: intake_context_note
      required: false
      allowed_context_fields:
        - handoff_status
        - pass_to_downstream
        - block_summary
        - connectors
        - power_summary
        - open_questions
        - provenance
        - do_not_pass_as_confirmed
      context_only_rules:
        - exp_xml_source_remains_authoritative
        - candidate_connectors_do_not_confirm_identity
        - candidate_power_or_control_pins_do_not_confirm_connectivity
        - open_questions_flow_to_review_queue
    summary: If a capture_xml_intake_library_v0 downstream_handoff is provided, reduce it to public-safe prioritization and review hints; if it is absent, continue from EXP.xml alone.
    next:
      on_success: parse_exp_xml_component_inventory
      on_absent: parse_exp_xml_component_inventory
      on_fail: stop
  - step_id: parse_exp_xml_component_inventory
    title: Parse EXP XML Component Inventory
    actor_slot: exp_xml_parser
    action:
      kind: structured_xml_parse_with_capture_fallback
      artifact_in: exp_xml_source
      optional_context_in: intake_context_note
      artifact_out: component_inventory
      required_fields:
        - refdes
        - instance_name
        - value
        - symbol_name
        - manufacturer
        - manufacturer_part_number
        - package
        - source_property_names
        - identity_confidence
      cadence_capture_rule:
        placed_component_node: PartInst
        library_cache_node: Package
        instance_property_node: PartInstUserProp
        parser_order:
          - normal_xml_parser
          - bounded_partinst_block_parser
        package_identity_fallback:
          enabled: true
          when_part_value_missing_or_placeholder: true
          property_node: SymbolUserProp
          fallback_fields:
            - "< Value >"
            - Manufacturer_Part_Number
            - Mfr_Name
            - PackageName
            - PCB Footprint
      generic_review_queue_rule:
        applies_to:
          - generic_passive_without_mpn
          - test_point_or_symbolic_power_entry
          - unknown_component_without_mpn
    summary: Parse EXP.xml with an XML parser or Capture-safe PartInst block fallback, extract placed component properties from PartInst nodes, recover placeholder identities from matching Package/SymbolUserProp definitions when needed, deduplicate by manufacturer part number when possible, flag weak identities, and only attach intake context as non-authoritative review metadata.
    next:
      on_success: normalize_part_queries
      on_fail: stop
  - step_id: normalize_part_queries
    title: Normalize Part Queries
    actor_slot: exp_xml_parser
    action:
      kind: inventory_normalization
      artifact_in: component_inventory
      optional_context_in: intake_context_note
      artifact_out: component_query_set
      intake_context_usage:
        - prioritize_exp_confirmed_connector_or_interface_refs
        - prioritize_exp_confirmed_power_sensitive_refs
        - add_unresolved_topology_questions_to_review_queue
        - keep_candidate_only_observations_out_of_confirmed_inventory
    summary: Build official-source search queries and per-component output keys while sending missing or ambiguous MPNs to the review queue. Optional intake context may adjust priority and review notes only after the part exists in component_inventory.
    next:
      on_success: source_bootstrap_official_materials
      on_fail: stop
  - step_id: source_bootstrap_official_materials
    title: Source Bootstrap Official Materials
    actor_slot: source_researcher
    action:
      kind: source_bootstrap
      artifact_in: component_query_set
      optional_context_in: intake_context_note
      artifact_out: source_discovery_packet
      source_policy:
        official_sources_first: true
        random_mirrors_forbidden: true
        owner_approved_local_sources_allowed: true
    summary: Find datasheets, product pages, evaluation boards, reference designs, user guides, design zips, schematics, PCB layout files, BOMs, and CAD/EDA packages from approved sources, optionally searching EXP-confirmed connector/interface and power-sensitive refs first; owner-approved local official collateral may be reused only with preserved provenance.
    next:
      on_success: download_datasheet_materials
      on_fail: stop
  - step_id: download_datasheet_materials
    title: Download Datasheet Materials
    actor_slot: download_operator
    action:
      kind: approved_download
      artifact_in: source_discovery_packet
      artifact_out: datasheet_downloads
      output_folder_name: "DATA Sheet"
      completion_requires:
        - saved_binary_file
        - source_url
        - byte_size
        - content_type_or_file_magic
        - sha256
      accepted_file_magic:
        pdf: "%PDF-"
      url_shortcut_is_completion: false
    summary: Download approved datasheets and product briefs into each component's DATA Sheet folder, preserving source URL, retrieval date, file size, content type or file magic, and SHA256 checksum.
    next:
      on_success: download_eval_board_materials
      on_fail: stop
  - step_id: download_eval_board_materials
    title: Download EVAL Board Materials
    actor_slot: download_operator
    action:
      kind: approved_download
      artifact_in: source_discovery_packet
      artifact_out: eval_downloads
      output_folder_name: EVAL
      accepted_material_types:
        - evaluation_board_user_guide
        - reference_design_schematic
        - pcb_layout_source_or_archive
        - gerber_or_fabrication_archive
        - bom
        - cad_or_eda_project
        - application_note
      completion_requires:
        - saved_binary_file
        - source_url
        - byte_size
        - content_type_or_file_magic
        - sha256
      accepted_file_magic:
        pdf: "%PDF-"
        zip: PK
      url_shortcut_is_completion: false
    summary: Download official evaluation-board and reference-design collateral into each component's EVAL folder; record none_found rather than inventing substitutes, and do not treat URL shortcuts as completed downloads.
    next:
      on_success: write_source_index_and_manifest
      on_fail: stop
  - step_id: write_source_index_and_manifest
    title: Write Source Index And Manifest
    actor_slot: download_operator
    action:
      kind: manifest_write
      artifacts_in:
        - component_inventory
        - source_discovery_packet
        - datasheet_downloads
        - eval_downloads
      artifacts_out:
        - source_index
        - download_manifest
        - downloaded_file_checksum_manifest
        - circuit_design_review_queue
    summary: Write per-component source indexes, actual saved-file or approved-local-reuse checksums, unavailable or not-applicable material reasons, page-level scope caveats when applicable, and owner-review items for ambiguous parts or gated downloads.
    next:
      on_success: source_boundary_review
      on_fail: stop
  - step_id: source_boundary_review
    title: Source Boundary Review
    actor_slot: boundary_reviewer
    action:
      kind: boundary_review
      artifacts_in:
        - source_index
        - download_manifest
        - circuit_design_review_queue
      artifact_out: boundary_review_note
    summary: Check that every downloaded file has approved provenance, no secret/account material was used, and no downloaded binary is staged for public canon.
    next:
      on_success: circuit_design_readiness_review
      on_fail: stop
  - step_id: circuit_design_readiness_review
    title: Circuit Design Readiness Review
    actor_slot: circuit_prep_reviewer
    action:
      kind: readiness_review
      artifacts_in:
        - component_inventory
        - intake_context_note
        - source_index
        - download_manifest
        - boundary_review_note
      artifact_out: circuit_design_readiness_note
    summary: Summarize which components are ready for schematic/PCB reference, which need owner review, which have no official EVAL material found, and which intake-surfaced topology questions remain unresolved without promoting them to confirmed connectivity.
    next:
      on_success: complete
      on_fail: stop


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "calibration_id": "20260514-2155_quality_priority_contract_probe",
  "workflow_id": "exp_xml_component_materials",
  "fixture_type": "public_safe_synthetic_page_fragment_local_reuse",
  "input_scope": "page_fragment",
  "materials_root": "_workspaces/<project_code>/reference_materials/page_lt8624s",
  "scenario": "Synthetic page-fragment EXP XML materials probe using mocked official-source records and owner-approved local official collateral evidence. No real project EXP.xml, customer input, credentials, cookies, downloaded vendor binaries, _workspaces payloads, _workmeta run truth, or private-state content is included.",
  "exp_xml_excerpt": [
    "<CISExport>",
    "  <Package Name=\"PKG_LT8624SAV\">",
    "    <SymbolUserProp Name=\"Manufacturer_Part_Number\" Value=\"LT8624SAV#PBF\" />",
    "    <SymbolUserProp Name=\"Mfr_Name\" Value=\"Analog Devices\" />",
    "    <SymbolUserProp Name=\"PackageName\" Value=\"LQFN-24\" />",
    "    <SymbolUserProp Name=\"PCB Footprint\" Value=\"ADI_LQFN_24\" />",
    "  </Package>",
    "  <PartInst RefDes=\"U10\" Name=\"U10\" PartValue=\"Value\" Package=\"PKG_LT8624SAV\"><PartInstUserProp Name=\"PCB Footprint\" Value=\"ADI_LQFN_24\" /></PartInst>",
    "  <PartInst RefDes=\"L10\" Name=\"L10\" PartValue=\"2.2uH\" Package=\"IND_1210\" />",
    "  <PartInst RefDes=\"C10\" Name=\"C10\" PartValue=\"10uF\" Package=\"0603\" />",
    "  <PartInst RefDes=\"R10\" Name=\"R10\" PartValue=\"100k\" Package=\"0603\" />",
    "  <PartInst RefDes=\"TP10\" Name=\"TP10\" PartValue=\"TESTPOINT\" Package=\"TP\" />",
    "</CISExport>"
  ],
  "optional_downstream_handoff": {
    "source_workflow_id": "capture_xml_intake_library_v0",
    "handoff_status": "context_ready_with_open_questions",
    "pass_to_downstream": true,
    "block_summary": [
      {
        "block_id": "buck_regulator_page",
        "candidate_refs": ["U10", "L10", "C10", "R10"],
        "summary": "Power regulator page fragment; prioritize official LT8624S datasheet and demo board material after EXP confirms U10."
      }
    ],
    "connectors": [
      {
        "candidate_refdes": "J10",
        "evidence": "page edge label only; no PartInst in EXP excerpt",
        "confidence": "handoff_only",
        "do_not_confirm_identity": true
      }
    ],
    "power_summary": [
      {
        "candidate_refdes": "U10",
        "priority_hint": "power_sensitive_reference_design",
        "authority": "priority_only"
      },
      {
        "candidate_refdes": "U11",
        "priority_hint": "possible adjacent regulator mentioned in page notes",
        "authority": "handoff_only_not_in_exp"
      }
    ],
    "open_questions": [
      "Page fragment cannot prove full-design component coverage.",
      "J10 and U11 appear only in intake context and must not become component inventory rows.",
      "L10/C10/R10 are page-local support parts without MPN/manufacturer evidence; keep review-required or no-download.",
      "Cross-page topology and harness boundary remain unresolved."
    ],
    "do_not_pass_as_confirmed": [
      "full-design coverage",
      "connector identity",
      "electrical connectivity",
      "handoff-only refdes J10",
      "handoff-only refdes U11"
    ]
  },
  "mock_official_source_catalog": [
    {
      "component_key": "analog_devices_lt8624sav_pbf",
      "manufacturer": "Analog Devices",
      "mpn": "LT8624SAV#PBF",
      "product_page": "https://www.analog.com/en/products/lt8624s.html",
      "datasheet": {
        "source_url": "https://www.analog.com/media/en/technical-documentation/data-sheets/lt8624s.pdf",
        "official": true,
        "material_status": "owner_approved_local_official_collateral",
        "local_fixture_label": "LT8624S_datasheet_owner_copy.pdf",
        "byte_size": 2512345,
        "file_magic": "%PDF-",
        "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      },
      "eval_materials": [
        {
          "type": "evaluation_board_user_guide",
          "source_url": "https://www.analog.com/media/en/technical-documentation/user-guides/dc3215a.pdf",
          "official": true,
          "material_status": "owner_approved_local_official_collateral",
          "local_fixture_label": "DC3215A_user_guide_owner_copy.pdf",
          "byte_size": 887766,
          "file_magic": "%PDF-",
          "sha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
        },
        {
          "type": "reference_design_archive",
          "source_url": "https://www.analog.com/media/en/reference-design-documentation/design-integration-files/dc3215a_design_files.zip",
          "official": true,
          "material_status": "owner_approved_local_official_collateral",
          "local_fixture_label": "DC3215A_design_files_owner_copy.zip",
          "byte_size": 456789,
          "file_magic": "PK",
          "sha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
        }
      ]
    }
  ],
  "output_tree_contract": {
    "parts_folder_name": "parts",
    "datasheet_folder_name": "DATA Sheet",
    "eval_folder_name": "EVAL"
  }
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
