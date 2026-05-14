`profile_metadata`
- calibration_id: `20260514-135122_staged_cli_matrix`
- workflow_id: `capture_xml_intake_library_v0`
- fixture_type: `public_safe_synthetic`
- assigned_profile: `{ model: gpt-5.4-mini, reasoning_effort: high, species: elf, class: administrator }`
- source_policy: `read_only_preserve_source_xml`

`xml_shape_summary`
- root_element: `CISExport`
- schematic_count: `1`
- page_count: `1`
- cache_package_count: `3`
- placed_instance_count: `7`
- explicit_net_record_count: `4`
- parser_mode: `explicit_net_table`

`block_summary`
- confirmed_placed_instances: `[U1, U2, J1, R1, R2, C1, TP1]`
- confirmed_identity:
  - `U1`: recovered from package-level evidence as `STMicroelectronics STM32F030F4P6` with high confidence
  - `U2`: direct placed-instance value `AP2112K-3.3TRG1`, with package evidence from `PKG_AP2112K_3V3`
- review_required:
  - `J1`: connector/interface candidate; insufficient manufacturer/MPN evidence for confirmation
- utility_parts_not_promoted:
  - `R1`, `R2`, `C1`, `TP1`: generic/passive/test utility instances, kept as placed components only

`extracted_nets`
- `VBUS`: explicit net; connects `J1:A4`, `J1:B4`, `U2:IN`, `U2:EN`, `TP1:1`
- `+3V3`: explicit global net; connects `U2:OUT`, `U1:VDD`, `C1:1`
- `GND`: explicit global net; connects `J1:A1`, `J1:B1`, `U2:GND`, `U1:VSS`, `C1:2`, `R1:2`, `R2:2`
- `USB_CC1`: explicit net; connects `J1:CC1`, `R1:1`
- not_inferred: `USB_CC2` not present; do not merge with `R2`

`connectors`
- confirmed: none
- candidate: `J1` USB-C receptacle interface
- notes: connector role is supported by placement and net topology, but identity remains review_required due to missing maker/MPN evidence

`power_summary`
- input_rail: `VBUS` from `J1` into `U2:IN` and `U2:EN`
- regulated_rail: `+3V3` from `U2:OUT` to `U1:VDD` and `C1:1`
- return: `GND` shared by `J1`, `U2`, `U1`, `C1`, `R1`, `R2`
- power_path_observation: sheet reads as USB-powered controller with a 3.3 V regulator stage feeding the MCU
- no_connect_evidence: `U1:PA13` marked no-connect, review-visible

`open_questions`
- `J1`: confirm connector manufacturer and part identity if available
- `R2`: confirm intended role; no explicit `USB_CC2` net exists, so do not infer one
- `TP1`: confirm whether testpoint is power, signal, or mechanical-only
- `U1:PA13`: verify the intentional omission of the debug header path

`provenance`
- source_basis: synthetic EXP.xml excerpt only
- preserved_identity: `exp_xml_source` remains the required upstream binding reference
- evidence_policy: package-level properties used only where a placed instance referenced the package and direct instance identity was weak
- boundary: no raw XML, runtime path, private project truth, or inferred nets beyond explicit records

`downstream_handoff`
- next_stage: `exp_xml_component_materials`
- handoff_payload: `{ source_ref: project_binding.synthetic_exp_xml_source, placed_instances: [U1, U2, J1, R1, R2, C1, TP1], nets: [VBUS, +3V3, GND, USB_CC1], review_required: [J1, U1:PA13, USB_CC2 absence] }`
- constraints: keep source immutable; do not embed raw XML or absolute runtime paths

`readiness_note`
- ready_for_next_stage: `yes`
- confidence: `high` for shape, nets, power rails, and `U1` identity recovery; `medium` for connector classification; `low` for any unsupported inference beyond the explicit net table