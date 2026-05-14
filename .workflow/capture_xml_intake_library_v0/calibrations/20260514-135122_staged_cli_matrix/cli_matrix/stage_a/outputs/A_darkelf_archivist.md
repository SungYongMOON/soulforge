1. `profile_metadata`
- `calibration_id`: `20260514-135122_staged_cli_matrix`
- `workflow_id`: `capture_xml_intake_library_v0`
- `fixture_type`: `public_safe_synthetic`
- `profile`: `gpt-5.4-mini / low / darkelf / archivist`
- `source_policy`: `read_only_preserve_source_xml`
- `scope`: synthetic EXP.xml intake only, no runtime or private-state assumptions

2. `xml_shape_summary`
- `root_element`: `CISExport`
- `schematic_count`: `1`
- `page_count`: `1`
- `cache_package_count`: `3`
- `placed_instance_count`: `7`
- `explicit_net_record_count`: `4`
- `parser_mode`: `explicit_net_table`

3. `block_summary`
- `confirmed_instances`:
  - `U1`: recovered as STMicroelectronics `STM32F030F4P6` from package-level manufacturer + MPN evidence; high confidence
  - `U2`: `AP2112K-3.3TRG1`; package-level evidence also supports Diodes Incorporated regulator identity
- `review_required_instances`:
  - `J1`: connector/interface instance, but no manufacturer or MPN evidence
- `utility_or_generic_instances`:
  - `R1`, `R2`, `C1`, `TP1`: generic parts; keep as placed utility components, do not promote identity
- `no_connect_evidence`:
  - `U1 PA13` is explicitly no-connect and should remain visible in review artifacts

4. `extracted_nets`
- `VBUS`:
  - explicit net
  - members: `J1 A4`, `J1 B4`, `U2 IN`, `U2 EN`, `TP1 1`
- `+3V3`:
  - explicit global net
  - members: `U2 OUT`, `U1 VDD`, `C1 1`
- `GND`:
  - explicit global net
  - members: `J1 A1`, `J1 B1`, `U2 GND`, `U1 VSS`, `C1 2`, `R1 2`, `R2 2`
- `USB_CC1`:
  - explicit net
  - members: `J1 CC1`, `R1 1`
- `not_inferred`:
  - `USB_CC2` not present explicitly and not inferred from `R2`

5. `connectors`
- `J1`:
  - placed instance: yes
  - role: USB-C receptacle / interface candidate
  - confirmation status: `review_required`
  - evidence: connected to `VBUS`, `GND`, and `USB_CC1`
  - missing evidence: manufacturer and MPN
- `PortInst VBUS_IN`:
  - net binding: `VBUS`
  - direction: `input`
  - treated as page-level interface evidence, not a separate physical connector

6. `power_summary`
- `power_rails`:
  - `VBUS`: external USB input rail
  - `+3V3`: regulated output rail
  - `GND`: return
- `power_path`:
  - `J1 VBUS` feeds `U2 IN` and `U2 EN`
  - `U2 OUT` generates `+3V3`
  - `U1 VDD` is powered from `+3V3`
- `supporting_passives`:
  - `C1` is tied to `+3V3` and `GND`
  - `R1` on `USB_CC1` is consistent with USB-C CC termination use
- `review_notes`:
  - `TP1` on `VBUS` is a test access point, not a power source
  - no additional rails should be inferred

7. `open_questions`
- `J1` manufacturer and MPN are not provided; connector identity remains review-required
- `R1`, `R2`, `C1`, and `TP1` lack explicit manufacturer identity; retain as generic utility parts
- `R2` is present on `GND` but no explicit `USB_CC2` net exists; do not infer a second CC termination
- verify whether `U2 EN` is intentionally tied to `VBUS` as shown, or if this is a schematic simplification requiring later review
- `U1 PA13` no-connect should be preserved as intentional debug-header omission evidence

8. `provenance`
- `source_class`: synthetic fixture only
- `input_identity`: `project_binding.synthetic_exp_xml_source`
- `preservation_state`: source treated as read-only and immutable
- `evidence_bases`:
  - placed instances from `PartInst`
  - library/cache context from `Package`
  - connectivity from explicit `Net` and `NoConnect` records
  - package-level manufacturer and MPN used only where a placed instance referenced that package
- `excluded_from_output`:
  - raw XML
  - runtime absolute paths
  - private project truth
  - inferred nets not explicitly present

9. `downstream_handoff`
- `target`: `exp_xml_component_materials`
- `required_input_identity`: `project_binding.synthetic_exp_xml_source`
- `handoff_payload_hints`:
  - placed components: `U1`, `U2`, `J1`, `R1`, `R2`, `C1`, `TP1`
  - confirmed power rails: `VBUS`, `+3V3`, `GND`
  - connector review item: `J1`
  - no-connect evidence: `U1 PA13`
- `handoff_constraints`:
  - no raw XML
  - no runtime absolute paths
  - preserve source immutability

10. `readiness_note`
- Packet is ready for downstream synthesis.
- Confidence is high for XML shape, net extraction, `U1` recovery, and power structure.
- Confidence is lower for `J1` identity and generic passive classification, which should remain review-visible rather than promoted.