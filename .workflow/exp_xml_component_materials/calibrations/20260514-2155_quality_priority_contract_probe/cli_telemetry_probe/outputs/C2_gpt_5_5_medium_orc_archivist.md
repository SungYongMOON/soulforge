## 1. profile

```yaml
workflow_id: exp_xml_component_materials
model: gpt-5.5
reasoning_effort: medium
species: orc
class: archivist
fixture_type: public_safe_synthetic_page_fragment_local_reuse
input_scope: page_fragment
```

## 2. intake_context_note

This is a dry synthetic probe using only the provided fixture evidence. The `exp_xml_source` excerpt is authoritative for placed component inventory and identity.

The optional downstream handoff is used only as context for review priority and open questions. It does not confirm component identity, manufacturer part numbers, electrical connectivity, source authority, download completion, or placed inventory.

Because the input is a page fragment, the prepared materials support page-level review only and do not establish full-design coverage.

## 3. component_inventory

| RefDes | EXP package | Value | Manufacturer | MPN | Footprint | Inventory status | Material action |
|---|---:|---:|---|---|---|---|---|
| U10 | PKG_LT8624SAV | Value | Analog Devices | LT8624SAV#PBF | ADI_LQFN_24 | confirmed from EXP excerpt | prepare official local collateral |
| L10 | IND_1210 | 2.2uH | unresolved | unresolved | unresolved | confirmed placed, identity incomplete | review-required, no download |
| C10 | 0603 | 10uF | unresolved | unresolved | unresolved | confirmed placed, identity incomplete | review-required, no download |
| R10 | 0603 | 100k | unresolved | unresolved | unresolved | confirmed placed, identity incomplete | review-required, no download |
| TP10 | TP | TESTPOINT | unresolved | unresolved | unresolved | confirmed placed, identity incomplete | review-required, no download |

Excluded from inventory: `J10` and `U11`, because they appear only in downstream handoff context and have no `PartInst` in the EXP excerpt.

## 4. source_discovery_packet

```yaml
materials_root: _workspaces/<project_code>/reference_materials/page_lt8624s
parts_folder: parts
datasheet_folder: "DATA Sheet"
eval_folder: EVAL

discovered_sources:
  - component_key: analog_devices_lt8624sav_pbf
    refdes_scope:
      - U10
    manufacturer: Analog Devices
    mpn: LT8624SAV#PBF
    source_authority: fixture_catalog_official
    product_page:
      url: https://www.analog.com/en/products/lt8624s.html
      status: source_reference_only
    materials:
      - type: datasheet
        source_url: https://www.analog.com/media/en/technical-documentation/data-sheets/lt8624s.pdf
        official: true
        completion_basis: owner_approved_local_official_collateral
      - type: evaluation_board_user_guide
        source_url: https://www.analog.com/media/en/technical-documentation/user-guides/dc3215a.pdf
        official: true
        completion_basis: owner_approved_local_official_collateral
      - type: reference_design_archive
        source_url: https://www.analog.com/media/en/reference-design-documentation/design-integration-files/dc3215a_design_files.zip
        official: true
        completion_basis: owner_approved_local_official_collateral
```

## 5. download_manifest

No network download is claimed. Completed materials are limited to owner-approved local official collateral represented in the fixture.

| RefDes | Material type | Source URL | Planned local placement | Status |
|---|---|---|---|---|
| U10 | datasheet | https://www.analog.com/media/en/technical-documentation/data-sheets/lt8624s.pdf | `_workspaces/<project_code>/reference_materials/page_lt8624s/parts/LT8624SAV_PBF/DATA Sheet/LT8624S_datasheet_owner_copy.pdf` | completed by local approved collateral |
| U10 | evaluation board user guide | https://www.analog.com/media/en/technical-documentation/user-guides/dc3215a.pdf | `_workspaces/<project_code>/reference_materials/page_lt8624s/parts/LT8624SAV_PBF/EVAL/DC3215A_user_guide_owner_copy.pdf` | completed by local approved collateral |
| U10 | reference design archive | https://www.analog.com/media/en/reference-design-documentation/design-integration-files/dc3215a_design_files.zip | `_workspaces/<project_code>/reference_materials/page_lt8624s/parts/LT8624SAV_PBF/EVAL/DC3215A_design_files_owner_copy.zip` | completed by local approved collateral |

URL-only entries are not treated as completed materials.

## 6. downloaded_file_checksum_manifest

```yaml
files:
  - component_key: analog_devices_lt8624sav_pbf
    refdes_scope: [U10]
    material_type: datasheet
    local_fixture_label: LT8624S_datasheet_owner_copy.pdf
    byte_size: 2512345
    file_magic: "%PDF-"
    sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa

  - component_key: analog_devices_lt8624sav_pbf
    refdes_scope: [U10]
    material_type: evaluation_board_user_guide
    local_fixture_label: DC3215A_user_guide_owner_copy.pdf
    byte_size: 887766
    file_magic: "%PDF-"
    sha256: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb

  - component_key: analog_devices_lt8624sav_pbf
    refdes_scope: [U10]
    material_type: reference_design_archive
    local_fixture_label: DC3215A_design_files_owner_copy.zip
    byte_size: 456789
    file_magic: PK
    sha256: cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
```

## 7. circuit_design_review_queue

| Priority | Item | Reason | Required review |
|---:|---|---|---|
| 1 | U10 LT8624SAV#PBF | Power-sensitive regulator with official datasheet and eval collateral available in fixture | Compare page fragment usage against datasheet limits and demo-board guidance |
| 2 | L10 2.2uH | Support inductor has value and package only; no manufacturer or MPN evidence | Identify rated current, saturation current, DCR, shielding, package, and vendor part |
| 3 | C10 10uF | Support capacitor has value and package only | Identify voltage rating, dielectric, tolerance, DC bias behavior, and placement role |
| 4 | R10 100k | Support resistor has value and package only | Confirm tolerance, power rating, and functional role once topology is available |
| 5 | TP10 TESTPOINT | Test point exists in EXP excerpt but identity is generic | Confirm intended signal/net and mechanical/test access requirements |
| 6 | J10 | Handoff-only page edge label, not placed in EXP excerpt | Do not inventory; keep as unresolved page-boundary question |
| 7 | U11 | Handoff-only possible adjacent regulator, not placed in EXP excerpt | Do not inventory; keep as unresolved cross-page question |

## 8. boundary_review_note

The prepared artifact set is bounded to the EXP excerpt and fixture catalog. It confirms placed inventory only for `U10`, `L10`, `C10`, `R10`, and `TP10`.

The handoff context may influence review order, especially for the buck regulator page, but it cannot promote `J10` or `U11` into inventory. It also cannot prove connector identity, electrical connectivity, full-design coverage, source authority, or completed downloads.

## 9. circuit_design_readiness_note

Page-level material readiness is partial but usable for first review of `U10`. The LT8624SAV#PBF official datasheet, evaluation board user guide, and design archive are represented as completed owner-approved local official collateral with provenance, byte-size or file-magic evidence, and SHA256 preserved.

The page fragment is not ready for full circuit design approval. Support components lack manufacturer part numbers and rating evidence, and cross-page topology, connector boundary, and harness context remain unresolved.
