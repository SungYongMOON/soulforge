You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-luna; reasoning_effort=medium; species=elf; class=administrator.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.
Emit the exact public workflow output groups as top-level fields: asset_identity, block_summary, extracted_nets, connectors, power_summary, open_questions, pcb_pairing_placeholder, provenance, downstream_handoff.
This shape correction comes from the public workflow output contract and fixture handoff; it is not evaluator or golden material.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: capture_xml_intake_library_v0
kind: workflow
status: active
title: Capture XML Intake Library v0
summary: Build an XML-first asset registration packet from a project-provided Cadence Capture EXP.xml, with optional initial owner-supplied MDD attachment metadata, before downstream component-material collection.
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
  - project_intake_binding
  - extraction_policy
optional_inputs:
  - initial_mdd_attachment
  - normalize_context_sidecar
  - normalize_downstream_handoff
outputs:
  - asset_identity
  - block_summary
  - extracted_nets
  - connectors
  - power_summary
  - open_questions
  - pcb_pairing_placeholder
  - provenance
  - downstream_handoff
validation_level: pilot_executed_private_fixture
page_fragment_validation_level: representative_page_chain_executed_private_fixture
attachment_extension_validation_level: draft_contract_only
downstream_workflow:
  workflow_id: exp_xml_component_materials
  expected_input: exp_xml_source
  optional_context_packet: downstream_handoff
follow_on_workflow:
  workflow_id: asset_patch_attach_mdd_v0
  expected_input: asset_identity
  optional_context_packet: pcb_pairing_placeholder
notes:
  - The EXP.xml input is a read-only baseline artifact; this workflow never edits, normalizes, or rewrites the source XML.
  - The input may be a whole Capture export or a bounded page-fragment XML asset; page-fragment runs produce page-level intake only and must not be reported as full-library or full-design completion.
  - Optional page normalize sidecars or normalize handoffs are context-only review metadata; they may carry page labels, module-scope hints, channelization hints, classification rationale, and warnings, but they cannot override source XML or confirm topology.
  - XML-first asset registration is the primary responsibility: every run must create asset identity metadata and an explicit MDD/PCB placeholder state even when no MDD is provided.
  - If an owner supplies an MDD file during initial intake, record it as an owner-supplied attached asset only; do not infer true XML/MDD pairing beyond the owner assertion.
  - The workflow is an upstream intake step before `exp_xml_component_materials`, not a replacement for component material collection.
  - Later owner-supplied MDD attachment or revision patching is handled by `asset_patch_attach_mdd_v0`.
  - Confirmed extracted structure and unresolved review-required observations must remain separate in every output artifact.
  - If explicit net tables are absent or schema-specific links are unclear, record conservative pin, port, global, and no-connect observations with review status instead of inventing connectivity.
  - When page-fragment scope omits whole-export hierarchy, cache/library coverage, occurrence paths, or cross-page nets, preserve those caveats in provenance and open_questions rather than filling gaps from naming hints.
  - Connector and power summaries must distinguish strong evidence from name-based candidates.
  - Reusable workflow files use portable binding identities only; runtime absolute paths and concrete fixture data belong only in private run evidence.
  - Public canon must not include raw XML body, local library cache paths, vendor document text, raw MDD payloads, credentials, cookies, `_workspaces` outputs, or `_workmeta` raw run truth.


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: capture_xml_intake_library_v0
kind: step_graph
status: active
steps:
  - step_id: prepare_intake_binding
    title: Prepare Intake Binding
    actor_slot: workflow_runner
    action:
      kind: local_workspace_setup
      requires:
        - exp_xml_source
        - intake_library_root
        - extraction_policy
      optional_accepts:
        - initial_mdd_attachment
        - normalize_context_sidecar
        - normalize_downstream_handoff
      validates:
        - exp_xml_exists
        - exp_xml_is_read_only_input
        - intake_library_root_is_project_local
        - input_scope_declared_whole_export_or_page_fragment
      creates:
        - intake_library_root
        - run_log_root
    summary: Resolve the project binding, confirm the Capture XML source will not be modified, note whether the input is whole-export or page-fragment scope, reduce any normalize context to non-authoritative review metadata, note whether an owner-supplied initial MDD attachment exists, and create only project-local output folders.
    next:
      on_success: inspect_capture_xml_shape
      on_fail: stop
  - step_id: inspect_capture_xml_shape
    title: Inspect Capture XML Shape
    actor_slot: capture_xml_inspector
    action:
      kind: capture_xml_shape_probe
      artifact_in: exp_xml_source
      artifact_out: xml_shape_summary
      records:
        - input_scope
        - parser_mode
        - root_element
        - schema_marker
        - schematic_count
        - page_count
        - cache_package_count
        - placed_instance_count
        - occurrence_count
        - explicit_net_record_count
        - missing_whole_export_context_if_page_fragment
      source_policy:
        preserve_source_xml: true
        copy_raw_xml_to_outputs: false
    summary: Load or stream the XML, record schema and element-shape facts, record page-fragment caveats when the input is not a whole export, and choose the safest parser mode without copying raw XML into reusable material.
    next:
      on_success: extract_blocks_instances_and_ports
      on_fail: stop
  - step_id: extract_blocks_instances_and_ports
    title: Extract Blocks Instances And Ports
    actor_slot: capture_xml_inspector
    action:
      kind: capture_structure_extraction
      artifact_in: exp_xml_source
      artifact_out: block_summary
      extracts:
        - schematic_blocks
        - pages
        - cache_packages
        - placed_instances
        - instance_properties
        - symbol_pins
        - port_instances
        - occurrences
      confidence_policy:
        placed_component_preferred_node: PartInst
        cache_package_is_library_context: true
        unresolved_items_to_open_questions: true
    summary: Build a block and instance summary while keeping cache/library definitions distinct from actual placed design instances.
    next:
      on_success: extract_nets_and_pin_observations
      on_fail: stop
  - step_id: extract_nets_and_pin_observations
    title: Extract Nets And Pin Observations
    actor_slot: topology_extractor
    action:
      kind: conservative_connectivity_extraction
      artifacts_in:
        - exp_xml_source
        - block_summary
      artifact_out: extracted_nets
      extraction_order:
        - explicit_net_nodes
        - wire_or_bus_nodes
        - port_occurrence_links
        - placed_instance_pin_records
        - global_symbol_records
        - no_connect_flags
      unresolved_policy:
        if_explicit_net_mapping_missing: record_review_required
        never_invent_net_names: true
        never_merge_pins_by_name_only: true
    summary: Extract explicit connectivity when the XML provides it, or record pin, port, global, and no-connect observations as review-required evidence.
    next:
      on_success: classify_connectors_and_interfaces
      on_fail: stop
  - step_id: classify_connectors_and_interfaces
    title: Classify Connectors And Interfaces
    actor_slot: connector_classifier
    action:
      kind: connector_interface_classification
      artifacts_in:
        - block_summary
        - extracted_nets
      artifact_out: connectors
      evidence_sources:
        - reference_designator_prefix
        - component_value
        - manufacturer_part_number
        - symbol_name
        - pin_name_pattern
        - occurrence_path
      classification_policy:
        confirmed_requires_component_evidence: true
        pin_name_only_is_candidate: true
        unresolved_to_open_questions: true
    summary: Identify connector and external-interface candidates without promoting weak name-only evidence to confirmed design truth.
    next:
      on_success: summarize_power_ground_and_no_connects
      on_fail: stop
  - step_id: summarize_power_ground_and_no_connects
    title: Summarize Power Ground And No-Connects
    actor_slot: power_reviewer
    action:
      kind: power_summary_review
      artifacts_in:
        - block_summary
        - extracted_nets
        - connectors
      artifact_out: power_summary
      categories:
        - confirmed_power_nets
        - candidate_power_nets
        - confirmed_ground_nets
        - candidate_ground_nets
        - enable_or_uvlo_pins
        - sense_or_feedback_pins
        - no_connect_pins
        - unresolved_power_questions
      source_policy:
        require_explicit_net_or_symbol_evidence_for_confirmed: true
        name_pattern_candidates_need_review: true
    summary: Summarize power-sensitive structure and open review questions while separating confirmed evidence from pattern-based candidates.
    next:
      on_success: register_asset_identity_and_attachment_state
      on_fail: stop
  - step_id: register_asset_identity_and_attachment_state
    title: Register Asset Identity And Attachment State
    actor_slot: asset_registrar
    action:
      kind: asset_registration_manifest
      artifacts_in:
        - exp_xml_source
        - block_summary
        - connectors
        - power_summary
      optional_artifact_in: initial_mdd_attachment
      artifacts_out:
        - asset_identity
        - pcb_pairing_placeholder
      registration_policy:
        source_xml_is_first_class_asset: true
        initial_asset_version: 1
        if_initial_mdd_present:
          record_attachment_mode: owner_supplied
          do_not_infer_true_pairing_beyond_owner_assertion: true
        if_initial_mdd_absent:
          write_placeholder_state: expected_later
          later_patch_workflow_id: asset_patch_attach_mdd_v0
    summary: Create XML-first asset-set metadata and either record an owner-supplied initial MDD attachment or leave an explicit later-attachment placeholder.
    next:
      on_success: write_intake_library_outputs
      on_fail: stop
  - step_id: write_intake_library_outputs
    title: Write Intake Library Outputs
    actor_slot: intake_writer
    action:
      kind: manifest_write
      artifacts_in:
        - xml_shape_summary
        - asset_identity
        - block_summary
        - extracted_nets
        - connectors
        - power_summary
      artifacts_out:
        - asset_identity
        - block_summary
        - extracted_nets
        - connectors
        - power_summary
        - open_questions
        - pcb_pairing_placeholder
        - provenance
        - downstream_handoff
      output_files:
        asset_identity: asset_identity.yaml
        block_summary: block_summary.yaml
        extracted_nets: extracted_nets.yaml
        connectors: connectors.yaml
        power_summary: power_summary.yaml
        open_questions: open_questions.yaml
        pcb_pairing_placeholder: pcb_pairing_placeholder.yaml
        provenance: provenance.yaml
        downstream_handoff: downstream_handoff.yaml
      provenance_records:
        - input_scope
        - source_file_identity
        - source_file_sha256
        - parser_mode
        - created_at
        - tool_version_or_script_identity
        - source_mutation_check
        - page_fragment_caveats
    summary: Write project-local YAML artifacts with enough provenance for downstream review, explicitly marking page-level scope when applicable, and without embedding raw XML text.
    next:
      on_success: boundary_and_handoff_review
      on_fail: stop
  - step_id: boundary_and_handoff_review
    title: Boundary And Handoff Review
    actor_slot: boundary_reviewer
    action:
      kind: boundary_and_readiness_review
      artifacts_in:
        - asset_identity
        - block_summary
        - extracted_nets
        - connectors
        - power_summary
        - open_questions
        - pcb_pairing_placeholder
        - provenance
        - downstream_handoff
      artifact_out: readiness_note
      checks:
        - source_xml_unchanged
        - page_fragment_outputs_marked_page_level_when_applicable
        - asset_identity_written
        - mdd_attachment_record_owner_supplied_only
        - placeholder_exists_when_mdd_absent
        - no_raw_xml_in_public_package
        - no_runtime_absolute_paths_in_public_package
        - confirmed_and_unresolved_outputs_separated
        - downstream_handoff_points_to_exp_xml_component_materials
    summary: Confirm source immutability, asset registration state, public/private boundaries, unresolved question capture, and readiness for downstream material collection or later MDD patching.
    next:
      on_success: complete
      on_fail: stop


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
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


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
