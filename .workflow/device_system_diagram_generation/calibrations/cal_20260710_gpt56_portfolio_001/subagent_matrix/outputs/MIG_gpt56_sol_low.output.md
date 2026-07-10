package_id: synthetic_device_system_diagram_package
workflow_id: device_system_diagram_generation
fixture_id: PUBLIC_SYNTH_DEVICE_SYSTEM_DIAGRAM_GENERATION
public_safe: true
acceptance_level: owner_accepted_usable
authority:
  source_of_truth: drawio_master
  derived_artifacts:
    - svg_exports
    - powerpoint_deck
    - preview_png
  non_claims:
    - No runtime execution or tool availability is asserted.
    - No output file existence, visual fidelity, or owner acceptance is asserted.
    - The fixture readiness label does not promote this package to strict REF canon authority.

diagram_input_yaml:
  diagram_id: synthetic_device_system_overview
  title: Synthetic Device System Overview
  direction: left_to_right
  blocks:
    - id: external_connector
      label: External Connector
      type: interface
    - id: power_block
      label: Power Block
      type: power
    - id: controller
      label: Controller
      type: control
    - id: sensor
      label: Sensor
      type: sensing
  connections:
    - id: connector_to_power
      from: external_connector
      to: power_block
      label: external power
    - id: power_to_controller
      from: power_block
      to: controller
      label: regulated power
    - id: power_to_sensor
      from: power_block
      to: sensor
      label: regulated power
    - id: controller_to_sensor
      from: controller
      to: sensor
      label: control
    - id: sensor_to_controller
      from: sensor
      to: controller
      label: sensor data
    - id: connector_to_controller
      from: external_connector
      to: controller
      label: external interface
  uncertainties:
    - Signal protocols, voltage levels, connector pin assignments, and directionality beyond the stated labels are unspecified.
    - Connections express a synthetic logical architecture, not verified electrical connectivity.

drawio_master:
  artifact_id: synthetic_device_system_overview_drawio
  role: editable_source_of_truth
  required_layout:
    columns:
      - external_connector
      - power_block
      - controller
      - sensor
    routing:
      - Keep power paths visually distinct from control, data, and external-interface paths.
      - Use labeled connectors for every relationship.
      - Avoid implying undocumented electrical pin-level connectivity.
  style:
    external_connector: gray
    power_block: orange
    controller: blue
    sensor: green
    power_paths: solid_orange
    control_paths: dashed_blue
    data_paths: solid_green
    external_interface_paths: dotted_gray
  required_annotations:
    - "Editable draw.io master — source of truth"
    - "SVG, PPTX, and PNG are derived outputs"
    - "Synthetic public-safe architecture; electrical details unspecified"

svg_exports:
  role: derived
  source: synthetic_device_system_overview_drawio
  expected_views:
    - id: synthetic_device_system_overview_svg
      content: complete_system_overview
  authority_limit: Must not become an independently edited source.

powerpoint_deck:
  role: derived
  source: synthetic_device_system_overview_svg
  expected_slides:
    - slide: 1
      title: Synthetic Device System Overview
      content: complete_system_overview_svg
      footer: "Derived from editable draw.io source of truth"
  authority_limit: Slide edits do not supersede the draw.io master.

preview_png:
  role: derived
  source: powerpoint_deck
  expected_frames:
    - id: synthetic_device_system_overview_preview
      source_slide: 1
  authority_limit: Preview only; not an editable or authoritative artifact.

boundary_and_output_check:
  required_groups:
    - diagram_input_yaml
    - drawio_master
    - svg_exports
    - powerpoint_deck
    - preview_png
  acceptance_conditions:
    - The draw.io master remains editable and authoritative.
    - Every derived artifact identifies its upstream source.
    - All four named blocks appear in the overview.
    - Connections remain labeled and do not add unsupported technical facts.
    - Public-safe synthetic identifiers are retained.
    - Runtime paths, private evidence, REF material, and hidden bindings are absent.
  stop_conditions:
    - Stop if the Markdown source does not identify the required blocks.
    - Stop if a tool or project-local binding needed for derivation is unavailable or unspecified.
    - Stop if derivation would require inventing protocols, ratings, pins, or verified connectivity.
    - Stop if a derived artifact diverges materially from the draw.io master.
    - Stop before acceptance until an owner confirms usability.
