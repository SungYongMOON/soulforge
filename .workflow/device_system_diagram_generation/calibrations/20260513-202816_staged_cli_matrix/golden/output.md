## 1. diagram_input_yaml

```yaml
workflow_id: device_system_diagram_generation
fixture_id: public_compact_wearable_gateway_v1
source_type: markdown_with_mermaid
pages:
  - id: system_overview
    title: system_overview
    diagram_type: device_system_flow
    layout: left_to_right
    nodes:
      - id: WearableSensor
        label: "Wearable Sensor\nBLE"
        group: edge_device
      - id: BLEGateway
        label: "BLE Gateway\nESP32-S3"
        group: gateway_core
      - id: LocalDisplay
        label: "Local OLED Display"
        group: local_io
      - id: LTEModem
        label: "LTE-M Modem"
        group: wide_area_network
      - id: CloudBroker
        label: "Cloud MQTT Broker"
        group: cloud_service
      - id: PowerBlock
        label: "PMIC + LiPo Battery"
        group: power
      - id: USBC
        label: "USB-C Service Port"
        group: service_interface
      - id: SecureElement
        label: "ATECC608 Secure Element"
        group: security
    edges:
      - from: WearableSensor
        to: BLEGateway
      - from: BLEGateway
        to: LocalDisplay
      - from: BLEGateway
        to: LTEModem
      - from: LTEModem
        to: CloudBroker
      - from: BLEGateway
        to: PowerBlock
      - from: USBC
        to: BLEGateway
      - from: BLEGateway
        to: SecureElement
    grouping_hints:
      gateway_core: primary central node
      edge_device: left of gateway
      local_io: near gateway output
      wide_area_network: between gateway and cloud
      cloud_service: far right
      power: below gateway
      service_interface: service input into gateway
      security: adjacent to gateway
export_metadata:
  editable_source_of_truth: drawio_master
  drawio_page_name: system_overview
  derived_artifacts:
    - svg_from_drawio_cli
    - pptx_with_svg_slide
    - png_preview_from_pptx
```

## 2. drawio_master_plan

Create one editable draw.io master with a single page named `system_overview`.

The master diagram should preserve the Mermaid topology exactly:

- `WearableSensor -> BLEGateway`
- `BLEGateway -> LocalDisplay`
- `BLEGateway -> LTEModem`
- `LTEModem -> CloudBroker`
- `BLEGateway -> PowerBlock`
- `USBC -> BLEGateway`
- `BLEGateway -> SecureElement`

The draw.io file is the source of truth. Labels should remain editable text objects, not flattened image text.

## 3. derived_artifact_plan

Generate derived artifacts only after the editable draw.io master exists.

1. Export SVG using draw.io CLI from the draw.io master.
2. Create a PPTX slide containing the exported SVG.
3. Export a PNG preview from the PPTX slide.

The SVG must come from draw.io export, not from hand-written SVG. The PNG must reflect the PPTX slide, not a separate replacement render.

## 4. boundary_and_validation_check

This fixture is public synthetic input only. The package must not include REF packets, candidate histories, raw run evidence, secrets, private workspace data, or runtime project paths in workflow canon.

Validation should confirm:

- Markdown contains a Mermaid diagram.
- `diagram_input.yaml` exists and includes all required nodes, edges, labels, grouping hints, and export metadata.
- The editable draw.io master exists and has one page named `system_overview`.
- SVG exists and was exported from draw.io.
- PPTX exists and contains the SVG.
- PNG preview exists and was exported from the PPTX.
- Validation notes record successful checks and any local tool blockers.

## 5. known_limits

If no Mermaid diagram is present, stop with a source blocker.

If draw.io CLI is unavailable, stop with a tool blocker and do not fake SVG/PPTX/PNG exports.

If PowerPoint COM path length limits appear during PPTX or PNG generation, rerun through a short runtime path or subst alias and record the workaround in validation notes.