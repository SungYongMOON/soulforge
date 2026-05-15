You are a CLI-only public-safe calibration candidate for Soulforge workflow capture_xml_intake_library_v0.
Profile: model=gpt-5.5 reasoning_effort=xhigh species=elf class=administrator.

Rules:
- Do not run commands, browse, inspect local files, or claim external validation.
- Use only the public-safe fixture below and the workflow task.
- Do not include raw project payloads, runtime absolute paths, credentials, cookies, or private-state data.
- Output only one valid JSON object. No markdown fences.
- Include these top-level keys: xml_shape_summary, block_summary, extracted_nets, connectors, power_summary, open_questions, provenance, downstream_handoff, boundary_notes.
- Also include quality_self_check with arrays named covered_requirements, gaps, and boundary_notes.

Task:
Produce a compact Capture XML intake packet. Keep PartInst placed instances separate from Package cache context, recover U1 identity from package evidence, keep J1 review_required, do not infer USB_CC2, capture U1 PA13 no-connect evidence, and hand off source identity to exp_xml_component_materials.

Public-safe fixture:
{
  "calibration_id": "20260514-135122_staged_cli_matrix",
  "workflow_id": "capture_xml_intake_library_v0",
  "fixture_type": "public_safe_synthetic",
  "scenario": "Synthetic Cadence Capture EXP.xml intake for a small USB-powered controller sheet. No real project EXP.xml, customer input, runtime path, credential, cookie, or private run truth is included.",
  "candidate_task": "Given the synthetic EXP.xml excerpt and workflow contract, produce the capture_xml_intake_library_v0 output packet: xml_shape_summary, block_summary, extracted_nets, connectors, power_summary, open_questions, provenance, downstream_handoff, and readiness_note.",
  "binding_contract": {
    "exp_xml_source": "project_binding.synthetic_exp_xml_source",
    "intake_library_root": "_workspaces/<project_code>/intake/capture_xml",
    "source_policy": "read_only_preserve_source_xml",
    "public_archive_policy": "do_not_store_raw_real_xml_or_runtime_absolute_paths"
  },
  "exp_xml_excerpt": [
    "<CISExport DesignName=\"SYNTH_USB_CTRL\" ExportVersion=\"17.4\">",
    "  <Schematic Name=\"MAIN\"><Page Name=\"PAGE1\" Title=\"USB power and controller\" /></Schematic>",
    "  <Package Name=\"PKG_STM32F030F4P6\">",
    "    <SymbolUserProp Name=\"Manufacturer\" Value=\"STMicroelectronics\" />",
    "    <SymbolUserProp Name=\"Manufacturer Part Number\" Value=\"STM32F030F4P6\" />",
    "    <SymbolUserProp Name=\"PCB Footprint\" Value=\"TSSOP20\" />",
    "  </Package>",
    "  <Package Name=\"PKG_AP2112K_3V3\">",
    "    <SymbolUserProp Name=\"Manufacturer\" Value=\"Diodes Incorporated\" />",
    "    <SymbolUserProp Name=\"Manufacturer Part Number\" Value=\"AP2112K-3.3TRG1\" />",
    "    <SymbolUserProp Name=\"PCB Footprint\" Value=\"SOT23-5\" />",
    "  </Package>",
    "  <Package Name=\"PKG_USB_C_16P\"><SymbolUserProp Name=\"PCB Footprint\" Value=\"USB_C_RECEPTACLE\" /></Package>",
    "  <PartInst RefDes=\"U1\" Name=\"U1\" PartValue=\"Value\" Package=\"PKG_STM32F030F4P6\" OccPath=\"/MAIN/PAGE1/U1\" />",
    "  <PartInst RefDes=\"U2\" Name=\"U2\" PartValue=\"AP2112K-3.3TRG1\" Package=\"PKG_AP2112K_3V3\" OccPath=\"/MAIN/PAGE1/U2\" />",
    "  <PartInst RefDes=\"J1\" Name=\"J1\" PartValue=\"USB-C-16P\" Package=\"PKG_USB_C_16P\" OccPath=\"/MAIN/PAGE1/J1\" />",
    "  <PartInst RefDes=\"R1\" Name=\"R1\" PartValue=\"5.1k\" Package=\"0603\" OccPath=\"/MAIN/PAGE1/R1\" />",
    "  <PartInst RefDes=\"R2\" Name=\"R2\" PartValue=\"5.1k\" Package=\"0603\" OccPath=\"/MAIN/PAGE1/R2\" />",
    "  <PartInst RefDes=\"C1\" Name=\"C1\" PartValue=\"10uF\" Package=\"0603\" OccPath=\"/MAIN/PAGE1/C1\" />",
    "  <PartInst RefDes=\"TP1\" Name=\"TP1\" PartValue=\"TESTPOINT\" Package=\"TP\" OccPath=\"/MAIN/PAGE1/TP1\" />",
    "  <PortInst Name=\"VBUS_IN\" Net=\"VBUS\" Direction=\"input\" Page=\"PAGE1\" />",
    "  <Global Name=\"+3V3\" Net=\"+3V3\" /><Global Name=\"GND\" Net=\"GND\" />",
    "  <Net Name=\"VBUS\"><PinRef RefDes=\"J1\" Pin=\"A4\" /><PinRef RefDes=\"J1\" Pin=\"B4\" /><PinRef RefDes=\"U2\" Pin=\"IN\" /><PinRef RefDes=\"U2\" Pin=\"EN\" /><PinRef RefDes=\"TP1\" Pin=\"1\" /></Net>",
    "  <Net Name=\"+3V3\"><PinRef RefDes=\"U2\" Pin=\"OUT\" /><PinRef RefDes=\"U1\" Pin=\"VDD\" /><PinRef RefDes=\"C1\" Pin=\"1\" /></Net>",
    "  <Net Name=\"GND\"><PinRef RefDes=\"J1\" Pin=\"A1\" /><PinRef RefDes=\"J1\" Pin=\"B1\" /><PinRef RefDes=\"U2\" Pin=\"GND\" /><PinRef RefDes=\"U1\" Pin=\"VSS\" /><PinRef RefDes=\"C1\" Pin=\"2\" /><PinRef RefDes=\"R1\" Pin=\"2\" /><PinRef RefDes=\"R2\" Pin=\"2\" /></Net>",
    "  <Net Name=\"USB_CC1\"><PinRef RefDes=\"J1\" Pin=\"CC1\" /><PinRef RefDes=\"R1\" Pin=\"1\" /></Net>",
    "  <NoConnect><PinRef RefDes=\"U1\" Pin=\"PA13\" Reason=\"debug header omitted\" /></NoConnect>",
    "</CISExport>"
  ],
  "expected_observations": {
    "xml_shape": {
      "root_element": "CISExport",
      "schematic_count": 1,
      "page_count": 1,
      "cache_package_count": 3,
      "placed_instance_count": 7,
      "explicit_net_record_count": 4,
      "parser_mode": "explicit_net_table"
    },
    "placed_instances": [
      "U1",
      "U2",
      "J1",
      "R1",
      "R2",
      "C1",
      "TP1"
    ],
    "identity_rules": [
      "U1 has placeholder PartValue and must recover STMicroelectronics STM32F030F4P6 from referenced Package/SymbolUserProp with recovered high confidence.",
      "U2 has direct PartInst value AP2112K-3.3TRG1 and package-level manufacturer evidence.",
      "J1 is a connector/interface candidate but lacks manufacturer and MPN evidence, so it remains review_required rather than confirmed.",
      "R1, R2, C1, and TP1 are generic or utility parts that should not be promoted to confirmed component identity."
    ],
    "net_rules": [
      "VBUS is explicit and connects J1 A4/B4, U2 IN, U2 EN, and TP1 pin 1.",
      "+3V3 is explicit/global and connects U2 OUT, U1 VDD, and C1 pin 1.",
      "GND is explicit/global and connects J1 A1/B1, U2 GND, U1 VSS, C1 pin 2, R1 pin 2, and R2 pin 2.",
      "USB_CC1 is explicit and connects J1 CC1 to R1 pin 1; do not infer CC2 from R2 because no explicit USB_CC2 net is present.",
      "U1 PA13 is no_connect and must be captured as review-visible no-connect evidence."
    ],
    "handoff_rules": [
      "downstream_handoff points to exp_xml_component_materials and preserves the original exp_xml_source identity as the required downstream input.",
      "handoff may include compact connector, power, placed-component, and open-question hints only; it must not embed raw XML or runtime absolute paths."
    ]
  },
  "hard_rules": [
    "Do not claim actual command execution, local file creation, source mutation, network access, browser use, or private project inspection.",
    "Do not use real project XML, _workspaces material, _workmeta raw truth, credentials, cookies, secrets, account sessions, or private-state data.",
    "Treat PartInst nodes as placed instances; Package nodes alone are library/cache context.",
    "Never invent nets, manufacturers, MPNs, pin links, or connector confirmation from names alone.",
    "Keep confirmed observations, candidates, and review_required/open questions separate.",
    "Do not copy raw XML into output artifacts; summarize source-derived facts only."
  ]
}
