calibration_id: 20260514-2155_quality_priority_contract_probe
workflow_id: exp_xml_component_materials
deliverable_status: candidate_from_supplied_synthetic_evidence
input_scope: page_fragment
coverage_claim: page_level_only
materials_root: "_workspaces/<project_code>/reference_materials/page_lt8624s"

intake_context_note:
  source_workflow_id: capture_xml_intake_library_v0
  status: context_ready_with_open_questions
  authority: context_only
  applied_priority_hints:
    - refdes: U10
      reason: power_sensitive_reference_design
      prerequisite: U10 independently appears in the EXP PartInst inventory
  excluded_from_inventory:
    - refdes: J10
      reason: handoff-only page-edge observation without a PartInst
    - refdes: U11
      reason: handoff-only page-note observation without a PartInst
  unresolved_questions:
    - Page fragment cannot establish full-design component coverage.
    - Cross-page topology and harness boundaries remain unresolved.
    - Connector identity and electrical connectivity are not confirmed.

component_inventory:
  - refdes: U10
    instance_name: U10
    value: "LT8624SAV#PBF"
    symbol_name: null
    manufacturer: Analog Devices
    manufacturer_part_number: "LT8624SAV#PBF"
    package: LQFN-24
    pcb_footprint: ADI_LQFN_24
    source_property_names:
      - PartInst.PartValue
      - PartInst.Package
      - PartInstUserProp.PCB Footprint
      - Package.SymbolUserProp.Manufacturer_Part_Number
      - Package.SymbolUserProp.Mfr_Name
      - Package.SymbolUserProp.PackageName
      - Package.SymbolUserProp.PCB Footprint
    identity_confidence: strong_package_property_fallback
    identity_note: PartValue was the placeholder "Value"; identity was recovered from the matching Package/SymbolUserProp definition.
    normalized_component_key: analog_devices_lt8624sav_pbf
    material_disposition: official_material_candidate

  - refdes: L10
    instance_name: L10
    value: 2.2uH
    symbol_name: null
    manufacturer: null
    manufacturer_part_number: null
    package: IND_1210
    source_property_names:
      - PartInst.PartValue
      - PartInst.Package
    identity_confidence: generic_support_part_without_mpn
    normalized_component_key: null
    material_disposition: review_required_no_download

  - refdes: C10
    instance_name: C10
    value: 10uF
    symbol_name: null
    manufacturer: null
    manufacturer_part_number: null
    package: "0603"
    source_property_names:
      - PartInst.PartValue
      - PartInst.Package
    identity_confidence: generic_support_part_without_mpn
    normalized_component_key: null
    material_disposition: review_required_no_download

  - refdes: R10
    instance_name: R10
    value: 100k
    symbol_name: null
    manufacturer: null
    manufacturer_part_number: null
    package: "0603"
    source_property_names:
      - PartInst.PartValue
      - PartInst.Package
    identity_confidence: generic_support_part_without_mpn
    normalized_component_key: null
    material_disposition: review_required_no_download

  - refdes: TP10
    instance_name: TP10
    value: TESTPOINT
    symbol_name: null
    manufacturer: null
    manufacturer_part_number: null
    package: TP
    source_property_names:
      - PartInst.PartValue
      - PartInst.Package
    identity_confidence: symbolic_test_point
    normalized_component_key: null
    material_disposition: review_required_no_download

source_discovery_packet:
  - component_key: analog_devices_lt8624sav_pbf
    refdes:
      - U10
    manufacturer: Analog Devices
    manufacturer_part_number: "LT8624SAV#PBF"
    provenance_basis: supplied_mock_official_source_catalog
    product_page:
      url: "https://www.analog.com/en/products/lt8624s.html"
      classification: official_manufacturer_page
    datasheet_candidates:
      - source_url: "https://www.analog.com/media/en/technical-documentation/data-sheets/lt8624s.pdf"
        classification: official_manufacturer_datasheet
        reuse_policy: owner_approved_local_official_collateral
        local_fixture_label: LT8624S_datasheet_owner_copy.pdf
    eval_candidates:
      - type: evaluation_board_user_guide
        source_url: "https://www.analog.com/media/en/technical-documentation/user-guides/dc3215a.pdf"
        classification: official_manufacturer_collateral
        reuse_policy: owner_approved_local_official_collateral
        local_fixture_label: DC3215A_user_guide_owner_copy.pdf
      - type: reference_design_archive
        source_url: "https://www.analog.com/media/en/reference-design-documentation/design-integration-files/dc3215a_design_files.zip"
        classification: official_manufacturer_collateral
        reuse_policy: owner_approved_local_official_collateral
        local_fixture_label: DC3215A_design_files_owner_copy.zip

parts_materials_tree:
  root: "_workspaces/<project_code>/reference_materials/page_lt8624s"
  proposed_entries:
    - "parts/analog_devices_lt8624sav_pbf/DATA Sheet/LT8624S_datasheet_owner_copy.pdf"
    - "parts/analog_devices_lt8624sav_pbf/EVAL/DC3215A_user_guide_owner_copy.pdf"
    - "parts/analog_devices_lt8624sav_pbf/EVAL/DC3215A_design_files_owner_copy.zip"
    - "parts/analog_devices_lt8624sav_pbf/source_index.yaml"
  tree_status: prescribed_candidate
  non_claim: No filesystem creation or saved-file existence is asserted.

download_manifest:
  - component_key: analog_devices_lt8624sav_pbf
    category: datasheet
    target_relative_path: "parts/analog_devices_lt8624sav_pbf/DATA Sheet/LT8624S_datasheet_owner_copy.pdf"
    source_url: "https://www.analog.com/media/en/technical-documentation/data-sheets/lt8624s.pdf"
    acquisition_mode: owner_approved_local_official_collateral_reuse
    material_status: evidenced_by_fixture
    byte_size: 2512345
    content_validation_evidence:
      kind: file_magic
      expected_value: "%PDF-"
      supplied_value: "%PDF-"
    sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    retrieval_date: null
    completion_status: candidate_pending_local_binding
    completion_non_claim: Supplied metadata does not establish that the file is present at the target path.

  - component_key: analog_devices_lt8624sav_pbf
    category: evaluation_board_user_guide
    target_relative_path: "parts/analog_devices_lt8624sav_pbf/EVAL/DC3215A_user_guide_owner_copy.pdf"
    source_url: "https://www.analog.com/media/en/technical-documentation/user-guides/dc3215a.pdf"
    acquisition_mode: owner_approved_local_official_collateral_reuse
    material_status: evidenced_by_fixture
    byte_size: 887766
    content_validation_evidence:
      kind: file_magic
      expected_value: "%PDF-"
      supplied_value: "%PDF-"
    sha256: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
    retrieval_date: null
    completion_status: candidate_pending_local_binding
    completion_non_claim: Supplied metadata does not establish that the file is present at the target path.

  - component_key: analog_devices_lt8624sav_pbf
    category: reference_design_archive
    target_relative_path: "parts/analog_devices_lt8624sav_pbf/EVAL/DC3215A_design_files_owner_copy.zip"
    source_url: "https://www.analog.com/media/en/reference-design-documentation/design-integration-files/dc3215a_design_files.zip"
    acquisition_mode: owner_approved_local_official_collateral_reuse
    material_status: evidenced_by_fixture
    byte_size: 456789
    content_validation_evidence:
      kind: file_magic
      expected_value: PK
      supplied_value: PK
    sha256: cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
    retrieval_date: null
    completion_status: candidate_pending_local_binding
    completion_non_claim: Supplied metadata does not establish that the archive is present or structurally valid at the target path.

downloaded_file_checksum_manifest:
  evidence_scope: supplied_fixture_metadata_only
  entries:
    - relative_path: "parts/analog_devices_lt8624sav_pbf/DATA Sheet/LT8624S_datasheet_owner_copy.pdf"
      sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
      byte_size: 2512345
      file_magic: "%PDF-"
    - relative_path: "parts/analog_devices_lt8624sav_pbf/EVAL/DC3215A_user_guide_owner_copy.pdf"
      sha256: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
      byte_size: 887766
      file_magic: "%PDF-"
    - relative_path: "parts/analog_devices_lt8624sav_pbf/EVAL/DC3215A_design_files_owner_copy.zip"
      sha256: cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
      byte_size: 456789
      file_magic: PK
  non_claim: These are fixture-supplied checksum records, not independently computed checksums.

circuit_design_review_queue:
  - priority: high
    subject: page_fragment_scope
    refs:
      - U10
      - L10
      - C10
      - R10
      - TP10
    issue: Full-design coverage and cross-page topology are unknown.
    required_action: Bind additional page or whole-export evidence before making full-design completeness claims.
    stop_condition: Do not promote this inventory to a full-design BOM.

  - priority: high
    subject: generic_support_part_identity
    refs:
      - L10
      - C10
      - R10
    issue: Values and packages are present, but manufacturer and MPN evidence are absent.
    required_action: Obtain owner-approved BOM, design constraint, or component-property evidence.
    stop_condition: Do not select or attribute manufacturer datasheets from value/package alone.

  - priority: medium
    subject: test_point
    refs:
      - TP10
    issue: Symbolic test point has no manufacturer part identity.
    required_action: Confirm whether a purchasable test-point part is required.
    stop_condition: Do not assign a guessed datasheet.

  - priority: high
    subject: handoff_only_refs
    refs:
      - J10
      - U11
    issue: These references occur only in optional intake context.
    required_action: Require matching EXP PartInst evidence before inventory inclusion.
    stop_condition: Do not create component folders or material requirements for these refs.

  - priority: high
    subject: connectivity
    refs:
      - U10
      - L10
      - C10
      - R10
    issue: The fixture does not establish electrical connectivity or suitability of the listed evaluation design for the page topology.
    required_action: Review schematic connectivity and operating requirements separately.
    stop_condition: Do not treat evaluation-board collateral as proof of circuit equivalence.

  - priority: medium
    subject: local_collateral_binding
    refs:
      - U10
    issue: Local filenames, sizes, magic values, and checksums are supplied as synthetic evidence, but target-path presence is not established.
    required_action: Bind approved local copies and confirm actual file evidence before marking reuse complete.
    stop_condition: Do not label the manifest entries as completed saved files until local binding is established.

boundary_review_note:
  status: conditional_pass_from_fixture_evidence
  public_safe_material:
    - Synthetic EXP excerpt
    - Mock official-source URLs
    - Synthetic local fixture labels
    - Synthetic sizes and checksums
    - Proposed project-local paths
  prohibited_public_canon_payloads:
    - Downloaded binaries
    - Credentials, cookies, or account material
    - Private workspace or run-state content
  conditions:
    - Keep binaries under the project-local materials root.
    - Preserve official source URLs and owner-approval provenance.
    - Require owner action for any account, license, click-through, or export-control gate.
    - Do not substitute URL shortcuts for saved-file evidence.

circuit_design_readiness_note:
  overall_status: partial_page_level_materials_candidate
  ready_for_reference:
    - refdes: U10
      component: "Analog Devices LT8624SAV#PBF"
      readiness: conditional
      available_material_classes:
        - official datasheet
        - evaluation-board user guide
        - reference-design archive
      conditions:
        - Establish actual local-file binding and checksum evidence.
        - Independently review circuit requirements and topology.
  owner_review_required:
    - L10
    - C10
    - R10
    - TP10
  excluded_until_exp_confirmed:
    - J10
    - U11
  unresolved:
    - Full-design component coverage
    - Cross-page topology
    - Harness boundary
    - Connector identity
    - Electrical connectivity
    - Suitability of DC3215A collateral for the intended circuit
  completion_boundary: This deliverable supports bounded page-level materials preparation only and does not establish download completion, full-design readiness, or circuit correctness.
