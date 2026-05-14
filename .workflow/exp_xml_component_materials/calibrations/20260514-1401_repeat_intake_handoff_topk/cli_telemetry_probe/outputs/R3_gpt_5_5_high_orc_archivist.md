**profile**
```yaml
candidate_id: R3_gpt_5_5_high_orc_archivist
workflow: exp_xml_component_materials
model: gpt-5.5
reasoning_effort: high
species: orc
class: archivist
fixture_mode: public_safe_synthetic
```

**intake_context_note**
```yaml
authority:
  placed_inventory_source: EXP.xml PartInst rows only
  package_metadata_use: allowed only when referenced by a placed PartInst
  downstream_handoff_use: priority hints and review questions only
  downstream_handoff_not_authoritative_for:
    - placed_components
    - component_identity
    - manufacturer
    - mpn
    - connectivity
materials_root: _workspaces/<project_code>/reference_materials/from_exp_xml
required_outputs:
  - intake_context_note.yaml
  - component_inventory.yaml
  - source_index.yaml
  - download_manifest.yaml
  - downloaded_file_checksum_manifest.yaml
  - circuit_design_review_queue.yaml
```

**component_inventory**
```yaml
placed_components:
  - refdes: U1
    component_key: U1_LT3045EDD-1
    source: EXP PartInst plus referenced Package SymbolUserProp
    part_value: Value
    package: PKG_LT3045EDD_1
    manufacturer: Analog Devices
    mpn: LT3045EDD-1
    package_name: DFN-10
    pcb_footprint: LTC_DD_10
    identity_status: recovered_from_package_metadata
    materials_status: official_sources_found

  - refdes: U2
    component_key: U2_MCP73831T-2ACI_OT
    source: EXP PartInst
    part_value: MCP73831T-2ACI/OT
    package: SOT23-5
    manufacturer: Microchip Technology
    mpn: MCP73831T-2ACI/OT
    identity_status: confirmed_from_partinst
    materials_status: official_sources_found

review_only_components:
  - refdes: R1
    part_value: 10k
    package: 0603
    reason: generic_passive_configuration_unknown
  - refdes: TP1
    part_value: TESTPOINT
    package: TP
    reason: symbolic_testpoint_no_mpn_required
  - refdes: J1
    part_value: USB-C-16P
    package: USB_C_RECEPTACLE
    manufacturer: null
    mpn: null
    reason: connector_identity_and_mpn_missing

excluded_handoff_only_entries:
  - refdes: J2
    reason: absent_from_EXP
  - refdes: U3
    reason: absent_from_EXP
```

**source_discovery_packet**
```yaml
official_sources_only: true
random_mirrors_forbidden: true
sources:
  - component_key: U1_LT3045EDD-1
    manufacturer: Analog Devices
    mpn: LT3045EDD-1
    data_sheet:
      - filename: LT3045_datasheet.pdf
        destination: parts/U1_LT3045EDD-1/DATA Sheet/LT3045_datasheet.pdf
        sha256: "1111111111111111111111111111111111111111111111111111111111111111"
        byte_size: 1854321
        file_magic: "%PDF-"
    eval:
      - filename: DC2222A_user_guide.pdf
        destination: parts/U1_LT3045EDD-1/EVAL/DC2222A_user_guide.pdf
        sha256: "2222222222222222222222222222222222222222222222222222222222222222"
        byte_size: 942210
        file_magic: "%PDF-"
      - filename: DC2222A_design_files.zip
        destination: parts/U1_LT3045EDD-1/EVAL/DC2222A_design_files.zip
        sha256: "3333333333333333333333333333333333333333333333333333333333333333"
        byte_size: 321004
        file_magic: PK

  - component_key: U2_MCP73831T-2ACI_OT
    manufacturer: Microchip Technology
    mpn: MCP73831T-2ACI/OT
    data_sheet:
      - filename: MCP73831_family_datasheet.pdf
        destination: parts/U2_MCP73831T-2ACI_OT/DATA Sheet/MCP73831_family_datasheet.pdf
        sha256: "4444444444444444444444444444444444444444444444444444444444444444"
        byte_size: 1210330
        file_magic: "%PDF-"
    eval:
      status: none_found
```

**download_manifest**
```yaml
download_mode: synthetic_fixture_records_only
completed_download_count: 4
entries:
  - component_key: U1_LT3045EDD-1
    category: DATA Sheet
    filename: LT3045_datasheet.pdf
    status: completed_from_mock_official_record
    destination: parts/U1_LT3045EDD-1/DATA Sheet/LT3045_datasheet.pdf
  - component_key: U1_LT3045EDD-1
    category: EVAL
    filename: DC2222A_user_guide.pdf
    status: completed_from_mock_official_record
    destination: parts/U1_LT3045EDD-1/EVAL/DC2222A_user_guide.pdf
  - component_key: U1_LT3045EDD-1
    category: EVAL
    filename: DC2222A_design_files.zip
    status: completed_from_mock_official_record
    destination: parts/U1_LT3045EDD-1/EVAL/DC2222A_design_files.zip
  - component_key: U2_MCP73831T-2ACI_OT
    category: DATA Sheet
    filename: MCP73831_family_datasheet.pdf
    status: completed_from_mock_official_record
    destination: parts/U2_MCP73831T-2ACI_OT/DATA Sheet/MCP73831_family_datasheet.pdf
```

**downloaded_file_checksum_manifest**
```yaml
verification_basis:
  required_fields:
    - sha256
    - byte_size
    - file_magic
  url_only_counts_as_download: false
files:
  - path: parts/U1_LT3045EDD-1/DATA Sheet/LT3045_datasheet.pdf
    sha256: "1111111111111111111111111111111111111111111111111111111111111111"
    byte_size: 1854321
    file_magic: "%PDF-"
  - path: parts/U1_LT3045EDD-1/EVAL/DC2222A_user_guide.pdf
    sha256: "2222222222222222222222222222222222222222222222222222222222222222"
    byte_size: 942210
    file_magic: "%PDF-"
  - path: parts/U1_LT3045EDD-1/EVAL/DC2222A_design_files.zip
    sha256: "3333333333333333333333333333333333333333333333333333333333333333"
    byte_size: 321004
    file_magic: PK
  - path: parts/U2_MCP73831T-2ACI_OT/DATA Sheet/MCP73831_family_datasheet.pdf
    sha256: "4444444444444444444444444444444444444444444444444444444444444444"
    byte_size: 1210330
    file_magic: "%PDF-"
```

**circuit_design_review_queue**
```yaml
priority_hints_from_downstream_handoff:
  - U1 low_noise_ldo priority_only
  - U2 battery_charger candidate
review_items:
  - refdes: J1
    severity: high
    question: USB-C connector manufacturer and MPN are missing.
    boundary: do_not_confirm_identity_or_connectivity_from_handoff
  - refdes: R1
    severity: medium
    question: Confirm passive role, tolerance, rating, and design intent for 10k 0603.
  - refdes: TP1
    severity: low
    question: Confirm whether any manufacturing or probe-access requirements apply.
  - refdes: J2
    severity: informational
    question: Mentioned in handoff but absent from EXP; not a placed component.
  - refdes: U3
    severity: informational
    question: Mentioned in handoff but absent from EXP; not a placed component.
```

**boundary_review_note**
```yaml
network_used: false
local_files_read: false
files_written: false
commands_run: false
real_project_data_included: false
secrets_credentials_cookies_included: false
workspace_materials_included: false
exp_xml_authority_preserved: true
downstream_handoff_limited_to_context: true
```

**circuit_design_readiness_note**
```yaml
materials_readiness: partial
ready_components:
  - U1_LT3045EDD-1
  - U2_MCP73831T-2ACI_OT
blocked_or_review_required:
  - J1 connector identity and MPN missing
  - R1 passive configuration unknown
  - J2 absent from EXP
  - U3 absent from EXP
summary: Official mocked materials are complete for confirmed U1 and U2; schematic-level readiness remains blocked on connector identity, passive intent, and handoff-only items not present in EXP.
```