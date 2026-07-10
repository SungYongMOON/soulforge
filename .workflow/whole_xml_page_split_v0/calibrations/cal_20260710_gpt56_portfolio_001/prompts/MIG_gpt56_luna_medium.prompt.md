You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-luna; reasoning_effort=medium; species=dwarf; class=archivist.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: whole_xml_page_split_v0
kind: workflow
status: active
title: Whole XML Page Split v0
summary: Split one project-bound large multi-page XML source into project-local page XML assets, page manifests, and provenance before page normalization.
entrypoint: run
execution_mode: local_tool_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
inputs:
  - whole_xml_source
  - page_split_project_binding
  - split_policy
outputs:
  - page_xml_assets
  - page_manifest
  - page_index
  - source_provenance
  - page_role_hints
  - split_readiness
validation_level: pilot_executed_private_fixture
downstream_workflow:
  workflow_id: page_xml_normalize_spec_v0
  expected_input: page_xml_assets
  optional_context_packet: page_manifest
  status: planned_follow_on
notes:
  - This workflow is the first hardware XML library step when a whole multi-page XML source arrives.
  - The source XML is a read-only baseline artifact; this workflow never edits, normalizes, renames, or saves over the source XML.
  - Page XML assets are derived project-local outputs resolved by binding and must not be written inside `.workflow/`.
  - The split preserves page order and page-local XML content while avoiding broader normalization or semantic rewriting.
  - Page ids must be stable within the source revision; ambiguous or duplicated ids require deterministic disambiguation and a manifest warning.
  - Page-role hints are lightweight routing hints only; PCB/MDD/material context must not be overclaimed in this workflow.
  - Downstream normalization belongs to `page_xml_normalize_spec_v0`; XML-first asset registration and material collection remain separate later workflows.
  - Public canon must not include raw XML bodies, fixture-derived page payloads, host-specific runtime paths, project-local output payloads, credentials, cookies, or secret material.


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: whole_xml_page_split_v0
kind: step_graph
status: active
steps:
  - step_id: prepare_page_split_binding
    title: Prepare Page Split Binding
    actor_slot: workflow_runner
    action:
      kind: local_workspace_setup
      requires:
        - whole_xml_source
        - page_split_output_root
        - split_policy
      validates:
        - whole_xml_source_exists
        - whole_xml_source_is_read_only_input
        - page_split_output_root_is_project_local
        - page_split_output_root_is_not_workflow_package
      creates:
        - page_split_output_root
        - page_xml_asset_dir
        - run_log_root
    summary: Resolve the project binding, confirm the whole XML source will not be modified, and create only project-local output folders for derived page assets.
    next:
      on_success: inspect_xml_page_boundaries
      on_fail: stop
  - step_id: inspect_xml_page_boundaries
    title: Inspect XML Page Boundaries
    actor_slot: xml_boundary_inspector
    action:
      kind: xml_shape_and_page_boundary_probe
      artifact_in: whole_xml_source
      artifact_out: page_boundary_summary
      records:
        - parser_mode
        - root_element
        - schema_marker
        - page_boundary_node_family
        - page_count_candidate
        - source_revision_identity
        - parser_warnings
      source_policy:
        preserve_source_xml: true
        copy_raw_xml_to_public_package: false
        manifest_raw_xml_body: false
    summary: Read or stream the XML enough to identify page-like boundaries and parser risk without copying real XML text into reusable workflow files.
    next:
      on_success: choose_page_identity_and_order
      on_fail: stop
  - step_id: choose_page_identity_and_order
    title: Choose Page Identity And Order
    actor_slot: page_split_planner
    action:
      kind: deterministic_page_split_plan
      artifacts_in:
        - whole_xml_source
        - page_boundary_summary
      artifact_out: page_split_plan
      planning_rules:
        preserve_source_page_order: true
        stable_page_id_required: true
        derive_id_from_source_id_or_label_or_ordinal: true
        duplicate_id_policy: append_stable_ordinal_suffix
        missing_boundary_policy: stop_unless_single_page_fallback_is_explicitly_allowed
      not_allowed:
        - normalize_xml_schema
        - rewrite_refdes_or_net_names
        - infer_connectivity
        - collect_component_materials
    summary: Produce an ordered split plan with stable page ids and warnings for ambiguous labels while leaving all normalization and design interpretation for later workflows.
    next:
      on_success: write_page_xml_assets
      on_fail: stop
  - step_id: write_page_xml_assets
    title: Write Page XML Assets
    actor_slot: page_asset_writer
    action:
      kind: page_xml_asset_write
      artifacts_in:
        - whole_xml_source
        - page_split_plan
      artifact_out: page_xml_assets
      output_location_policy:
        project_local_only: true
        never_under_workflow_package: true
        overwrite_policy: require_explicit_binding_or_empty_output_root
      content_policy:
        write_page_local_xml_payload: true
        preserve_page_xml_without_normalization: true
        source_xml_mutation_allowed: false
    summary: Materialize one project-local XML file per page according to the split plan, preserving page-local XML content without modifying the original source.
    next:
      on_success: write_manifest_index_and_provenance
      on_fail: stop
  - step_id: write_manifest_index_and_provenance
    title: Write Manifest Index And Provenance
    actor_slot: provenance_writer
    action:
      kind: manifest_write
      artifacts_in:
        - whole_xml_source
        - page_boundary_summary
        - page_split_plan
        - page_xml_assets
      artifacts_out:
        - page_manifest
        - page_index
        - source_provenance
      output_files:
        page_manifest: page_manifest.yaml
        page_index: page_index.yaml
        source_provenance: source_provenance.yaml
      provenance_records:
        - source_file_identity
        - source_file_sha256
        - source_revision_identity
        - parser_mode
        - split_method
        - page_count
        - page_order
        - page_id_map
        - created_at
        - tool_version_or_script_identity
        - source_mutation_check
      manifest_policy:
        include_page_asset_refs: true
        include_page_order_and_ids: true
        include_raw_page_xml_body: false
    summary: Write compact project-local manifest and provenance records that describe page files, order, ids, checksums, and split warnings without duplicating XML bodies.
    next:
      on_success: flag_page_role_hints
      on_fail: stop
  - step_id: flag_page_role_hints
    title: Flag Page Role Hints
    actor_slot: page_role_hint_reviewer
    action:
      kind: lightweight_page_role_hinting
      artifacts_in:
        - page_manifest
        - page_index
      artifact_out: page_role_hints
      hint_categories:
        - schematic
        - hardware_or_material_context
        - possible_pcb_or_mdd_context
        - mixed
        - unknown
      confidence_policy:
        hints_are_non_authoritative: true
        ambiguous_pages_to_review_required: true
        no_deep_materials_or_pcb_analysis: true
    summary: Add optional routing hints for later review while avoiding normalization, asset registration, material collection, or PCB/MDD pairing claims.
    next:
      on_success: boundary_and_handoff_review
      on_fail: stop
  - step_id: boundary_and_handoff_review
    title: Boundary And Handoff Review
    actor_slot: boundary_reviewer
    action:
      kind: boundary_and_readiness_review
      artifacts_in:
        - page_xml_assets
        - page_manifest
        - page_index
        - source_provenance
        - page_role_hints
      artifact_out: split_readiness
      checks:
        - source_xml_unchanged
        - page_assets_are_project_local
        - no_page_assets_under_workflow_package
        - page_order_and_stable_ids_recorded
        - no_normalization_performed
        - no_materials_collection_performed
        - no_pcb_mdd_pairing_overclaim
        - ready_for_page_xml_normalize_spec_v0
    summary: Confirm the split is contained, source-safe, manifest-backed, and ready for downstream page normalization.
    next:
      on_success: complete
      on_fail: stop


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "workflow_id": "whole_xml_page_split_v0",
  "calibration_id": "20260514-171147_staged_cli_real_sample_structural",
  "fixture_type": "public_safe_real_sample_derived_structural_metadata",
  "real_sample_used": true,
  "real_sample_path_archived": false,
  "source_binding_identity": "project_binding.whole_xml_source.sample_exp_capture_big_xml",
  "source_sha256_prefix": "74195c6c62bdcf3f",
  "source_size_bytes": 12670307,
  "raw_xml_body_included": false,
  "runtime_absolute_path_included": false,
  "root_element": "Design",
  "schema_family_marker": "Cadence/OrCAD Capture Design EXP-like XML; host path redacted",
  "parser_mode": "streaming_elementtree_boundary_probe",
  "max_depth": 8,
  "total_element_count": 186608,
  "schematic_count": 1,
  "page_boundary_node_family": "Page",
  "page_count_candidate": 11,
  "titleblock_page_count_signal": {
    "reported_count_values": [
      "8"
    ],
    "observed_on_page_nodes": 6,
    "conflicts_with_actual_page_nodes": true
  },
  "page_number_signal_summary": {
    "present_values": [
      "1",
      "2",
      "5",
      "6",
      "7",
      "8"
    ],
    "missing_or_ambiguous_page_nodes": 5,
    "non_contiguous": true
  },
  "global_tag_counts": {
    "Package": 107,
    "PartInst": 1067,
    "NetScalar": 1153,
    "WireScalar": 4378,
    "OffPageConnector": 538,
    "PartInstUserProp": 7644,
    "IsNoConnect": 3494
  },
  "stable_page_id_policy": "derive page_001..page_011 from source order; do not trust titleblock Page Count/Number as complete identity",
  "split_policy": {
    "preserve_source_page_order": true,
    "preserve_page_xml_without_normalization": true,
    "duplicate_or_missing_label_policy": "ordinal_suffix_and_manifest_warning",
    "single_page_fallback_allowed": false
  },
  "expected_output_location_policy": {
    "project_local_only": true,
    "never_under_workflow_package": true,
    "archive_page_payloads_in_public_canon": false
  },
  "pages": [
    {
      "stable_id": "page_001",
      "source_ordinal": 1,
      "element_count": 29892,
      "part_inst_count": 211,
      "net_scalar_count": 296,
      "wire_scalar_count": 856,
      "off_page_connector_count": 156,
      "port_inst_scalar_count": 621,
      "no_connect_marker_count": 621,
      "part_user_prop_count": 1460,
      "page_number_signals": [
        "1"
      ],
      "page_count_signals": [
        "8"
      ],
      "title_signal": "present_redacted",
      "material_property_signal_count": 0,
      "pcb_footprint_signal_count": 211,
      "datasheet_link_signal_count": 0,
      "role_hint_signals": [
        "schematic_content",
        "offpage_connector_context",
        "possible_pcb_context"
      ]
    },
    {
      "stable_id": "page_002",
      "source_ordinal": 2,
      "element_count": 29974,
      "part_inst_count": 211,
      "net_scalar_count": 296,
      "wire_scalar_count": 851,
      "off_page_connector_count": 155,
      "port_inst_scalar_count": 621,
      "no_connect_marker_count": 621,
      "part_user_prop_count": 1460,
      "page_number_signals": [
        "2"
      ],
      "page_count_signals": [
        "8"
      ],
      "title_signal": "present_redacted",
      "material_property_signal_count": 0,
      "pcb_footprint_signal_count": 211,
      "datasheet_link_signal_count": 0,
      "role_hint_signals": [
        "schematic_content",
        "offpage_connector_context",
        "possible_pcb_context"
      ]
    },
    {
      "stable_id": "page_003",
      "source_ordinal": 3,
      "element_count": 57198,
      "part_inst_count": 464,
      "net_scalar_count": 260,
      "wire_scalar_count": 1689,
      "off_page_connector_count": 36,
      "port_inst_scalar_count": 1120,
      "no_connect_marker_count": 1120,
      "part_user_prop_count": 3360,
      "page_number_signals": [
        "missing_or_not_public"
      ],
      "page_count_signals": [
        "missing_or_not_public"
      ],
      "title_signal": "present_redacted",
      "material_property_signal_count": 0,
      "pcb_footprint_signal_count": 464,
      "datasheet_link_signal_count": 0,
      "role_hint_signals": [
        "schematic_content",
        "offpage_connector_context",
        "possible_pcb_context"
      ]
    },
    {
      "stable_id": "page_004",
      "source_ordinal": 4,
      "element_count": 3210,
      "part_inst_count": 11,
      "net_scalar_count": 58,
      "wire_scalar_count": 99,
      "off_page_connector_count": 81,
      "port_inst_scalar_count": 11,
      "no_connect_marker_count": 11,
      "part_user_prop_count": 33,
      "page_number_signals": [
        "5"
      ],
      "page_count_signals": [
        "8"
      ],
      "title_signal": "present_redacted",
      "material_property_signal_count": 0,
      "pcb_footprint_signal_count": 11,
      "datasheet_link_signal_count": 0,
      "role_hint_signals": [
        "schematic_content",
        "offpage_connector_context",
        "possible_pcb_context"
      ]
    },
    {
      "stable_id": "page_005",
      "source_ordinal": 5,
      "element_count": 4190,
      "part_inst_count": 24,
      "net_scalar_count": 51,
      "wire_scalar_count": 132,
      "off_page_connector_count": 45,
      "port_inst_scalar_count": 64,
      "no_connect_marker_count": 64,
      "part_user_prop_count": 132,
      "page_number_signals": [
        "6"
      ],
      "page_count_signals": [
        "8"
      ],
      "title_signal": "present_redacted",
      "material_property_signal_count": 0,
      "pcb_footprint_signal_count": 24,
      "datasheet_link_signal_count": 0,
      "role_hint_signals": [
        "schematic_content",
        "offpage_connector_context",
        "possible_pcb_context"
      ]
    },
    {
      "stable_id": "page_006",
      "source_ordinal": 6,
      "element_count": 1434,
      "part_inst_count": 11,
      "net_scalar_count": 10,
      "wire_scalar_count": 50,
      "off_page_connector_count": 0,
      "port_inst_scalar_count": 33,
      "no_connect_marker_count": 33,
      "part_user_prop_count": 63,
      "page_number_signals": [
        "missing_or_not_public"
      ],
      "page_count_signals": [
        "missing_or_not_public"
      ],
      "title_signal": "missing_or_not_public",
      "material_property_signal_count": 3,
      "pcb_footprint_signal_count": 11,
      "datasheet_link_signal_count": 0,
      "role_hint_signals": [
        "schematic_content",
        "hardware_or_material_context",
        "possible_pcb_context"
      ]
    },
    {
      "stable_id": "page_007",
      "source_ordinal": 7,
      "element_count": 1536,
      "part_inst_count": 12,
      "net_scalar_count": 10,
      "wire_scalar_count": 56,
      "off_page_connector_count": 0,
      "port_inst_scalar_count": 35,
      "no_connect_marker_count": 35,
      "part_user_prop_count": 69,
      "page_number_signals": [
        "missing_or_not_public"
      ],
      "page_count_signals": [
        "missing_or_not_public"
      ],
      "title_signal": "missing_or_not_public",
      "material_property_signal_count": 3,
      "pcb_footprint_signal_count": 12,
      "datasheet_link_signal_count": 0,
      "role_hint_signals": [
        "schematic_content",
        "hardware_or_material_context",
        "possible_pcb_context"
      ]
    },
    {
      "stable_id": "page_008",
      "source_ordinal": 8,
      "element_count": 4404,
      "part_inst_count": 39,
      "net_scalar_count": 19,
      "wire_scalar_count": 123,
      "off_page_connector_count": 0,
      "port_inst_scalar_count": 96,
      "no_connect_marker_count": 96,
      "part_user_prop_count": 540,
      "page_number_signals": [
        "missing_or_not_public"
      ],
      "page_count_signals": [
        "missing_or_not_public"
      ],
      "title_signal": "missing_or_not_public",
      "material_property_signal_count": 39,
      "pcb_footprint_signal_count": 39,
      "datasheet_link_signal_count": 0,
      "role_hint_signals": [
        "schematic_content",
        "hardware_or_material_context",
        "possible_pcb_context"
      ]
    },
    {
      "stable_id": "page_009",
      "source_ordinal": 9,
      "element_count": 7200,
      "part_inst_count": 58,
      "net_scalar_count": 39,
      "wire_scalar_count": 220,
      "off_page_connector_count": 23,
      "port_inst_scalar_count": 138,
      "no_connect_marker_count": 138,
      "part_user_prop_count": 358,
      "page_number_signals": [
        "7"
      ],
      "page_count_signals": [
        "8"
      ],
      "title_signal": "present_redacted",
      "material_property_signal_count": 0,
      "pcb_footprint_signal_count": 58,
      "datasheet_link_signal_count": 0,
      "role_hint_signals": [
        "schematic_content",
        "offpage_connector_context",
        "possible_pcb_context"
      ]
    },
    {
      "stable_id": "page_010",
      "source_ordinal": 10,
      "element_count": 5808,
      "part_inst_count": 10,
      "net_scalar_count": 102,
      "wire_scalar_count": 237,
      "off_page_connector_count": 42,
      "port_inst_scalar_count": 154,
      "no_connect_marker_count": 154,
      "part_user_prop_count": 52,
      "page_number_signals": [
        "8"
      ],
      "page_count_signals": [
        "8"
      ],
      "title_signal": "present_redacted",
      "material_property_signal_count": 0,
      "pcb_footprint_signal_count": 10,
      "datasheet_link_signal_count": 0,
      "role_hint_signals": [
        "schematic_content",
        "offpage_connector_context",
        "possible_pcb_context"
      ]
    },
    {
      "stable_id": "page_011",
      "source_ordinal": 11,
      "element_count": 2096,
      "part_inst_count": 16,
      "net_scalar_count": 12,
      "wire_scalar_count": 65,
      "off_page_connector_count": 0,
      "port_inst_scalar_count": 43,
      "no_connect_marker_count": 43,
      "part_user_prop_count": 117,
      "page_number_signals": [
        "missing_or_not_public"
      ],
      "page_count_signals": [
        "missing_or_not_public"
      ],
      "title_signal": "missing_or_not_public",
      "material_property_signal_count": 3,
      "pcb_footprint_signal_count": 16,
      "datasheet_link_signal_count": 0,
      "role_hint_signals": [
        "schematic_content",
        "hardware_or_material_context",
        "possible_pcb_context"
      ]
    }
  ]
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
