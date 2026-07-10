```yaml
workflow_id: exp_xml_component_materials
calibration_id: 20260514-2155_quality_priority_contract_probe
status: bounded_page_fragment_ready_with_review_items
input_scope: page_fragment
materials_root: _workspaces/<project_code>/reference_materials/page_lt8624s
coverage_claim: page-level materials only; full-design coverage is unresolved

component_inventory:
  - refdes: U10
    instance_name: U10
    value: LT8624SAV#PBF
    symbol_name: unknown_from_fixture
    manufacturer: Analog Devices
    manufacturer_part_number: LT8624SAV#PBF
    package: LQFN-24
    source_property_names:
      - PartInst.PartValue
      - Package.SymbolUserProp.Manufacturer_Part_Number
      - Package.SymbolUserProp.Mfr_Name
      - Package.SymbolUserProp.PackageName
      - PartInst.PartInstUserProp.PCB Footprint
    pcb_footprint: ADI_LQFN_24
    identity_confidence: confirmed_from_package_identity_fallback
    intake_priority:
      - power_sensitive_reference_design
    review_required: false

  - refdes: L10
    instance_name: L10
    value: 2.2uH
    symbol_name: unknown_from_fixture
    manufacturer: null
    manufacturer_part_number: null
    package: IND_1210
    source_property_names:
      - PartInst.PartValue
      - PartInst.Package
    identity_confidence: weak
    review_required: true

  - refdes: C10
    instance_name: C10
    value: 10uF
    symbol_name: unknown_from_fixture
    manufacturer: null
    manufacturer_part_number: null
    package: "0603"
    source_property_names:
      - PartInst.PartValue
      - PartInst.Package
    identity_confidence: weak
    review_required: true

  - refdes: R10
    instance_name: R10
    value: 100k
    symbol_name: unknown_from_fixture
    manufacturer: null
    manufacturer_part_number: null
    package: "0603"
    source_property_names:
      - PartInst.PartValue
      - PartInst.Package
    identity_confidence: weak
    review_required: true

  - refdes: TP10
    instance_name: TP10
    value: TESTPOINT
    symbol_name: unknown_from_fixture
    manufacturer: null
    manufacturer_part_number: null
    package: TP
    source_property_names:
      - PartInst.PartValue
      - PartInst.Package
    identity_confidence: generic_symbol_only
    review_required: true

excluded_from_inventory:
  - refdes: J10
    reason: handoff-only candidate; absent from EXP.xml PartInst nodes
  - refdes: U11
    reason: handoff-only candidate; absent from EXP.xml PartInst nodes

intake_context_note:
  source_workflow_id: capture_xml_intake_library_v0
  handoff_status: context_ready_with_open_questions
  authority: context_only
  permitted_effects:
    - prioritize U10 official materials
    - retain unresolved topology questions in review queue
  non_claims:
    - does_not_confirm_J10_identity
    - does_not_confirm_U11_identity
    - does_not_confirm_electrical_connectivity
    - does_not_confirm_full_design_coverage
  open_questions:
    - Page fragment cannot prove full-design component coverage.
    - Cross-page topology and harness boundary remain unresolved.

source_discovery_packet:
  analog_devices_lt8624sav_pbf:
    manufacturer: Analog Devices
    mpn: LT8624SAV#PBF
    product_page: https://www.analog.com/en/products/lt8624s.html
    official_source: true
    datasheet:
      source_url: https://www.analog.com/media/en/technical-documentation/data-sheets/lt8624s.pdf
      material_status: owner_approved_local_official_collateral
      local_fixture_label: LT8624S_datasheet_owner_copy.pdf
    eval_materials:
      - type: evaluation_board_user_guide
        source_url: https://www.analog.com/media/en/technical-documentation/user-guides/dc3215a.pdf
        material_status: owner_approved_local_official_collateral
        local_fixture_label: DC3215A_user_guide_owner_copy.pdf
      - type: reference_design_archive
        source_url: https://www.analog.com/media/en/reference-design-documentation/design-integration-files/dc3215a_design_files.zip
        material_status: owner_approved_local_official_collateral
        local_fixture_label: DC3215A_design_files_owner_copy.zip

parts_materials_tree:
  parts/
    analog_devices_lt8624sav_pbf/
      DATA Sheet/
        LT8624S_datasheet_owner_copy.pdf
      EVAL/
        DC3215A_user_guide_owner_copy.pdf
        DC3215A_design_files_owner_copy.zip
    l10_mpn_unresolved/
      DATA Sheet/: pending_owner_review
      EVAL/: pending_owner_review
    c10_mpn_unresolved/
      DATA Sheet/: pending_owner_review
      EVAL/: pending_owner_review
    r10_mpn_unresolved/
      DATA Sheet/: pending_owner_review
      EVAL/: pending_owner_review
    tp10_mpn_unresolved/
      DATA Sheet/: pending_owner_review
      EVAL/: pending_owner_review

download_manifest:
  - refdes: U10
    component_key: analog_devices_lt8624sav_pbf
    folder: parts/analog_devices_lt8624sav_pbf/DATA Sheet
    file: LT8624S_datasheet_owner_copy.pdf
    source_url: https://www.analog.com/media/en/technical-documentation/data-sheets/lt8624s.pdf
    material_status: owner_approved_local_official_collateral
    byte_size: 2512345
    file_magic: "%PDF-"
    completion_state: evidenced_local_reuse
  - refdes: U10
    component_key: analog_devices_lt8624sav_pbf
    folder: parts/analog_devices_lt8624sav_pbf/EVAL
    file: DC3215A_user_guide_owner_copy.pdf
    material_type: evaluation_board_user_guide
    source_url: https://www.analog.com/media/en/technical-documentation/user-guides/dc3215a.pdf
    material_status: owner_approved_local_official_collateral
    byte_size: 887766
    file_magic: "%PDF-"
    completion_state: evidenced_local_reuse
  - refdes: U10
    component_key: analog_devices_lt8624sav_pbf
    folder: parts/analog_devices_lt8624sav_pbf/EVAL
    file: DC3215A_design_files_owner_copy.zip
    material_type: reference_design_archive
    source_url: https://www.analog.com/media/en/reference-design-documentation/design-integration-files/dc3215a_design_files.zip
    material_status: owner_approved_local_official_collateral
    byte_size: 456789
    file_magic: PK
    completion_state: evidenced_local_reuse

downloaded_file_checksum_manifest:
  - file: parts/analog_devices_lt8624sav_pbf/DATA Sheet/LT8624S_datasheet_owner_copy.pdf
    sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  - file: parts/analog_devices_lt8624sav_pbf/EVAL/DC3215A_user_guide_owner_copy.pdf
    sha256: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  - file: parts/analog_devices_lt8624sav_pbf/EVAL/DC3215A_design_files_owner_copy.zip
    sha256: cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc

circuit_design_review_queue:
  - refdes: L10
    reason: page-local support part lacks manufacturer and MPN evidence
    action: owner identification required; no guessed datasheet
  - refdes: C10
    reason: page-local support part lacks manufacturer and MPN evidence
    action: owner identification required; no guessed datasheet
  - refdes: R10
    reason: page-local support part lacks manufacturer and MPN evidence
    action: owner identification required; no guessed datasheet
  - refdes: TP10
    reason: generic test point without manufacturer and MPN
    action: owner review; no guessed datasheet
  - refdes: J10
    reason: handoff-only candidate absent from EXP.xml
    action: do not add to inventory without EXP.xml confirmation
  - refdes: U11
    reason: handoff-only candidate absent from EXP.xml
    action: do not add to inventory without EXP.xml confirmation
  - topic: full_design_coverage
    reason: input is a page fragment
    action: resolve remaining pages before claiming full-design materials coverage
  - topic: cross_page_topology
    reason: connectivity and harness boundary are unresolved
    action: circuit-design owner review required

boundary_review_note:
  provenance: official Analog Devices URLs preserved for all U10 materials
  local_reuse: owner-approved local official collateral only
  secret_or_account_material: none_in_fixture
  public_canon_binary_staging: not_claimed
  boundary_state: acceptable_with_page_scope_and_review_caveats

circuit_design_readiness_note:
  ready_for_reference:
    - U10: official datasheet and evaluation/reference-design collateral identified with file evidence
  blocked_or_review_required:
    - L10
    - C10
    - R10
    - TP10
    - J10
    - U11
    - full_design_coverage
    - cross_page_topology
  readiness_scope: U10 and associated page-fragment materials only
```
