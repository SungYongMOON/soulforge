1. `profile_metadata`
- `calibration_id`: `20260514-135122_staged_cli_matrix`
- `workflow_id`: `capture_xml_intake_library_v0`
- `fixture_type`: `public_safe_synthetic`
- `profile`: `gpt-5.4-mini / low / dwarf / archivist`
- `source_policy`: `read_only_preserve_source_xml`

2. `xml_shape_summary`
- `root_element`: `CISExport`
- `design_name`: `SYNTH_USB_CTRL`
- `schematic_count`: `1`
- `page_count`: `1`
- `cache_package_count`: `3`
- `placed_instance_count`: `7`
- `explicit_net_record_count`: `4`
- `parser_mode`: `explicit_net_table`

3. `block_summary`
- `confirmed`
  - `U1`: recovered identity with high confidence from package properties as `STMicroelectronics STM32F030F4P6`; package footprint `TSSOP20`
  - `U2`: direct placed value `AP2112K-3.3TRG1`; package manufacturer `Diodes Incorporated`; footprint `SOT23-5`
- `review_required`
  - `J1`: USB-C interface/connector candidate; placed instance is present, but manufacturer and MPN are not confirmed
- `utility / generic`
  - `R1`: `5.1k`, generic resistor, not promoted to confirmed identity
  - `R2`: `5.1k`, generic resistor, not promoted to confirmed identity
  - `C1`: `10uF`, generic capacitor, not promoted to confirmed identity
  - `TP1`: testpoint, utility instance, not promoted to confirmed identity

4. `extracted_nets`
- `VBUS`: explicit net; connects `J1:A4`, `J1:B4`, `U2:IN`, `U2:EN`, `TP1:1`
- `+3V3`: explicit global net; connects `U2:OUT`, `U1:VDD`, `C1:1`
- `GND`: explicit global net; connects `J1:A1`, `J1:B1`, `U2:GND`, `U1:VSS`, `C1:2`, `R1:2`, `R2:2`
- `USB_CC1`: explicit net; connects `J1:CC1`, `R1:1`
- `no_connect`: `U1:PA13` marked no-connect with reason `debug header omitted`

5. `connectors`
- `J1`: connector/interface candidate, likely USB-C receptacle from part value and package context
- `confirmed_status`: `review_required`
- `evidence`: placed instance exists; footprint `USB_C_RECEPTACLE`; explicit USB-related nets present
- `non_evidence`: do not infer manufacturer, exact connector series, or missing CC2 wiring

6. `power_summary`
- `input_rail`: `VBUS` enters through `J1` and is also present on `TP1`
- `regulation`: `U2` takes `VBUS` on `IN` and `EN`, outputs `+3V3`
- `logic_rail`: `+3V3` powers `U1:VDD` and `C1:1`
- `return`: `GND` is explicit and shared by `J1`, `U2`, `U1`, `C1`, `R1`, `R2`
- `review_note`: no inferred secondary power nets; only explicit nets captured

7. `open_questions`
- `J1` manufacturer and MPN remain unconfirmed
- `USB_CC2` is not present as an explicit net; do not infer it from `R2`
- `R1`, `R2`, `C1`, and `TP1` remain generic utility parts without promoted identity
- `U1` debug pin `PA13` is intentionally no-connect; downstream may want to preserve that annotation

8. `provenance`
- `source_kind`: synthetic EXP.xml excerpt
- `source_identity`: `project_binding.synthetic_exp_xml_source`
- `preservation_state`: source summarized only; no raw XML copied
- `boundary_state`: public-safe, no runtime paths, no private project truth, no credentials
- `evidence_basis`: placed instances, package properties, explicit net records, and no-connect record only

9. `downstream_handoff`
- `target`: `exp_xml_component_materials`
- `input_identity`: preserve `project_binding.synthetic_exp_xml_source`
- `handoff_payload`: compact placed-component identities, connector candidate status, explicit power/net summary, and no-connect evidence
- `handoff_limits`: no raw XML, no runtime absolute paths, no inferred nets, no hidden state

10. `readiness_note`
- Ready for downstream component-material extraction with explicit-net and placed-instance evidence only
- Confidence is high for `U1`, medium for `U2`, and review-required for `J1`
- No blocking shape issues detected for a library-intake handoff