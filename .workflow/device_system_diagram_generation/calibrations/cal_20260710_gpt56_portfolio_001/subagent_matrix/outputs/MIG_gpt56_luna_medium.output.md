```yaml
workflow_id: device_system_diagram_generation
fixture_id: PUBLIC_SYNTH_DEVICE_SYSTEM_DIAGRAM_GENERATION
kind: workflow
status: active
public_safe: true

title: Device System Diagram Generation
summary: >
  Generate an editable draw.io device system diagram package from one Markdown
  description, then derive SVG, PPTX, and preview PNG outputs.

authority:
  source_of_truth: drawio_master
  input_owner: workflow_owner
  acceptance_owner: owner
  derived_artifacts:
    - svg_exports
    - powerpoint_deck
    - preview_png
  runtime_bindings: project_local_only
  hidden_evidence: excluded
  ref_packets: excluded

inputs:
  - id: device_description_markdown
    required: true
    source: workflow_owner
    expected_content:
      - power_block
      - controller
      - sensor
      - external_connector

outputs:
  - id: diagram_input_yaml
    role: intermediate
  - id: drawio_master
    role: editable_source_of_truth
  - id: svg_exports
    role: derived
    source: drawio_master
  - id: powerpoint_deck
    role: derived
    source: svg_exports
  - id: preview_png
    role: derived
    source: powerpoint_deck

steps:
  - step_id: prepare_runtime_workspace
    actor_slot: workflow_runner
    input: project_local_bindings
    output: prepared_runtime_workspace
    next: parse_markdown_to_intermediate

  - step_id: parse_markdown_to_intermediate
    actor_slot: diagram_builder
    input: device_description_markdown
    output: diagram_input_yaml
    next: build_drawio_master

  - step_id: build_drawio_master
    actor_slot: diagram_builder
    input: diagram_input_yaml
    output: drawio_master
    source_of_truth: true
    next: export_svg_from_drawio

  - step_id: export_svg_from_drawio
    actor_slot: tool_operator
    tool_binding: drawio_cli
    input: drawio_master
    output: svg_exports
    derived: true
    next: build_powerpoint_from_svg

  - step_id: build_powerpoint_from_svg
    actor_slot: tool_operator
    tool_binding: powerpoint_com
    input: svg_exports
    output: powerpoint_deck
    derived: true
    next: export_preview_png

  - step_id: export_preview_png
    actor_slot: tool_operator
    tool_binding: powerpoint_com
    input: powerpoint_deck
    output: preview_png
    derived: true
    next: boundary_and_output_check

  - step_id: boundary_and_output_check
    actor_slot: boundary_reviewer
    input:
      - diagram_input_yaml
      - drawio_master
      - svg_exports
      - powerpoint_deck
      - preview_png
    next: []

acceptance:
  validation_level: owner_accepted_usable
  required:
    - all_declared_output_groups_are_present
    - drawio_master_is_editable
    - drawio_master_remains_source_of_truth
    - derived_outputs_trace_to_drawio_master
    - public_safe_boundary_is_preserved
  owner_decision_required: true
  fixture_readiness_label: canon-ready
  contract_registration_note: >
    The supplied contract identifies current registration as
    owner-accepted usable and not strict REF canon-ready.

stop_conditions:
  - required_input_is_missing
  - project_local_binding_is_missing_or_ambiguous
  - drawio_master_cannot_be_established_as_editable_source_of_truth
  - derived_output_cannot_be_traced_to_drawio_master
  - any_output_requires_hidden_private_evidence
  - any_step_would_mutate_upstream_artifacts
  - boundary_reviewer_cannot_complete_public_safe_output_check
  - owner_acceptance_is_pending

non_claims:
  - No tool execution is asserted by this deliverable.
  - No file edit, runtime path, service contact, or verification result is asserted.
  - No hidden candidate, REF packet, raw run evidence, or private artifact is included.
  - No stronger source or canon authority is inferred beyond the supplied contract.
```
