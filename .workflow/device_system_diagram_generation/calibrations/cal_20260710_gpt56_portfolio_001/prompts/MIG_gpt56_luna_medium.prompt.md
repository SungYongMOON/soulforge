You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-luna; reasoning_effort=medium; species=human; class=administrator.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: device_system_diagram_generation
kind: workflow
status: active
title: Device System Diagram Generation
summary: Generate an editable draw.io device system diagram package from one Markdown description, then derive SVG, PPTX, and preview PNG outputs.
entrypoint: run
execution_mode: local_tool_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
inputs:
  - device_description_markdown
outputs:
  - diagram_input_yaml
  - drawio_master
  - svg_exports
  - powerpoint_deck
  - preview_png
validation_level: owner_accepted_usable
notes:
  - The editable draw.io file is the source of truth.
  - SVG, PPTX, and PNG outputs are derived artifacts.
  - Runtime project paths, REF packets, candidates, and raw run evidence do not belong in this workflow canon.
  - Current registration is owner-accepted usable, not strict REF canon-ready.
  - Project-local bindings provide actual input/output paths and tool locations.


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: device_system_diagram_generation
kind: step_graph
status: active
steps:
  - step_id: prepare_runtime_workspace
    title: Prepare Runtime Workspace
    actor_slot: workflow_runner
    next:
      - parse_markdown_to_intermediate
  - step_id: parse_markdown_to_intermediate
    title: Parse Markdown To Intermediate
    actor_slot: diagram_builder
    action:
      artifact_in: device_description_markdown
      artifact_out: diagram_input_yaml
    next:
      - build_drawio_master
  - step_id: build_drawio_master
    title: Build Drawio Master
    actor_slot: diagram_builder
    action:
      artifact_in: diagram_input_yaml
      artifact_out: drawio_master
    next:
      - export_svg_from_drawio
  - step_id: export_svg_from_drawio
    title: Export SVG From Drawio
    actor_slot: tool_operator
    action:
      tool: drawio_cli
      artifact_in: drawio_master
      artifact_out: svg_exports
    next:
      - build_powerpoint_from_svg
  - step_id: build_powerpoint_from_svg
    title: Build PowerPoint From SVG
    actor_slot: tool_operator
    action:
      tool: powerpoint_com
      artifact_in: svg_exports
      artifact_out: powerpoint_deck
    next:
      - export_preview_png
  - step_id: export_preview_png
    title: Export Preview PNG
    actor_slot: tool_operator
    action:
      tool: powerpoint_com
      artifact_in: powerpoint_deck
      artifact_out: preview_png
    next:
      - boundary_and_output_check
  - step_id: boundary_and_output_check
    title: Boundary And Output Check
    actor_slot: boundary_reviewer
    next: []


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "workflow_id": "device_system_diagram_generation",
  "fixture_id": "PUBLIC_SYNTH_DEVICE_SYSTEM_DIAGRAM_GENERATION",
  "source_kind": "synthetic_from_workflow_contract",
  "public_safe": true,
  "workflow_title": "Device System Diagram Generation",
  "workflow_summary": "Generate an editable draw.io device system diagram package from one Markdown description, then derive SVG, PPTX, and preview PNG outputs.",
  "workflow_readiness_label": "canon-ready",
  "input_refs": [
    "device_description_markdown"
  ],
  "expected_output_groups": [
    "diagram_input_yaml",
    "drawio_master",
    "svg_exports",
    "powerpoint_deck",
    "preview_png"
  ],
  "must_preserve": [
    "drawio",
    "source of truth",
    "derived",
    "boundary"
  ],
  "scenario_facts": [
    "one markdown device description names a power block, controller, sensor, and external connector",
    "drawio master remains the source of truth",
    "svg, pptx, and png are derived outputs only"
  ],
  "boundary_policy": [
    "Do not claim tool use, file edits, runtime paths, or hidden private evidence.",
    "Do not mutate upstream artifacts or promote stronger source/canon authority than the contract supports.",
    "Keep public-safe synthetic boundaries explicit."
  ]
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
