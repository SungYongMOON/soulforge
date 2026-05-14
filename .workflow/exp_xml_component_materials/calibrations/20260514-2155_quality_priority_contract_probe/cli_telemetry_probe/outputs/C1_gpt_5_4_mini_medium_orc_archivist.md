## 1. profile
- `workflow_id`: `exp_xml_component_materials`
- `model`: `gpt-5.4-mini`
- `reasoning_effort`: `medium`
- `species`: `orc`
- `class`: `archivist`
- `fixture_type`: `public_safe_synthetic_page_fragment_local_reuse`
- `input_scope`: `page_fragment`

## 2. intake_context_note
- Source authority for placed inventory and identity is limited to `exp_xml_excerpt`.
- This is page-fragment intake only; it supports page-level materials preparation, not full-design material coverage.
- `downstream_handoff` is context only and must not be treated as confirmation of identity, manufacturer part number, connectivity, or full design scope.
- `J10` and `U11` are not component inventory rows because they are not confirmed in the EXP excerpt.
- `L10`, `C10`, `R10` are page-local support parts without manufacturer or MPN evidence in the excerpt.

## 3. component_inventory
| RefDes | Package | Value | Manufacturer | MPN | Status | Notes |
|---|---|---:|---|---|---|---|
| U10 | `PKG_LT8624SAV` | `Value` | `Analog Devices` | `LT8624SAV#PBF` | confirmed by EXP excerpt | `PCB Footprint=ADI_LQFN_24`, package user prop present |
| L10 | `IND_1210` | `2.2uH` | not evidenced | not evidenced | support part, review-required | page-local support only |
| C10 | `0603` | `10uF` | not evidenced | not evidenced | support part, review-required | page-local support only |
| R10 | `0603` | `100k` | not evidenced | not evidenced | support part, review-required | page-local support only |
| TP10 | `TP` | `TESTPOINT` | not evidenced | not evidenced | support part, review-required | page-local support only |

## 4. source_discovery_packet
- **Primary official source candidate**
  - Component key: `analog_devices_lt8624sav_pbf`
  - Manufacturer: `Analog Devices`
  - MPN: `LT8624SAV#PBF`
  - Product page: `https://www.analog.com/en/products/lt8624s.html`
  - Datasheet: `https://www.analog.com/media/en/technical-documentation/data-sheets/lt8624s.pdf`
- **Owner-approved local official collateral**
  - `LT8624S_datasheet_owner_copy.pdf`
  - `DC3215A_user_guide_owner_copy.pdf`
  - `DC3215A_design_files_owner_copy.zip`
- **Official evaluation material targets**
  - `evaluation_board_user_guide`
  - `reference_design_archive`
- **Discovery note**
  - The fixture already supplies official source metadata and local reuse status; no additional discovery is asserted here.

## 5. download_manifest
| Item | Source URL | Official | Local fixture label | Material status | Purpose |
|---|---|---:|---|---|---|
| Datasheet | `https://www.analog.com/media/en/technical-documentation/data-sheets/lt8624s.pdf` | yes | `LT8624S_datasheet_owner_copy.pdf` | owner_approved_local_official_collateral | primary device material |
| Evaluation board user guide | `https://www.analog.com/media/en/technical-documentation/user-guides/dc3215a.pdf` | yes | `DC3215A_user_guide_owner_copy.pdf` | owner_approved_local_official_collateral | board-level reference material |
| Reference design archive | `https://www.analog.com/media/en/reference-design-documentation/design-integration-files/dc3215a_design_files.zip` | yes | `DC3215A_design_files_owner_copy.zip` | owner_approved_local_official_collateral | reference design package |

## 6. downloaded_file_checksum_manifest
| Local fixture label | Byte size | File magic | SHA256 | Reuse status |
|---|---:|---|---|---|
| `LT8624S_datasheet_owner_copy.pdf` | 2512345 | `%PDF-` | `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` | owner-approved local official collateral |
| `DC3215A_user_guide_owner_copy.pdf` | 887766 | `%PDF-` | `bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb` | owner-approved local official collateral |
| `DC3215A_design_files_owner_copy.zip` | 456789 | `PK` | `cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc` | owner-approved local official collateral |

## 7. circuit_design_review_queue
- Verify the regulator page only at the page-fragment level; do not infer full-design coverage.
- Confirm `U10` against the official LT8624S datasheet and, if needed, the DC3215A user guide or reference design archive.
- Treat `L10`, `C10`, `R10`, and `TP10` as support parts until separate evidence is available.
- Keep `J10` out of inventory until an actual `PartInst` appears in the EXP source.
- Keep `U11` out of inventory; it is handoff-only context, not EXP-confirmed placement.
- Resolve cross-page topology and harness boundary in a downstream review step only.

## 8. boundary_review_note
- This output is intentionally limited to public-safe synthetic fixture evidence.
- No claim is made about actual network access, command execution, file writes, or binary downloads.
- No claim is made about full-design material completion, electrical connectivity, or connector identity.
- `exp_xml_source` remains authoritative for placement and identity, and only the excerpted `PartInst` rows are treated as confirmed.
- URL-only shortcuts are not treated as completed materials.

## 9. circuit_design_readiness_note
- Readiness status: `page-level materials prepared; circuit-design material coverage incomplete`
- The fixture is sufficient to stage official source materials for `U10` and preserve checksum metadata for approved local collateral.
- It is not sufficient to close full-design review, connector confirmation, or cross-page topology questions.
- Next downstream step should prioritize official LT8624S source review with the page fragment as context only.
