**Diagram Input**
```yaml
workflow_id: device_system_diagram_generation
fixture_id: public_compact_wearable_gateway_v1
public_safe: true
source_of_truth: editable_drawio_master
pages:
  - id: system_overview
    name: system_overview
    layout: LR
    title: Compact Wearable Gateway System
    grouping_hints:
      - id: edge_devices
        label: Edge Devices
        members: [WearableSensor, BLEGateway, LocalDisplay, USBC]
      - id: connectivity
        label: Connectivity
        members: [LTEModem, CloudBroker]
      - id: power_security
        label: Power and Security
        members: [PowerBlock, SecureElement]
nodes:
  - id: WearableSensor
    label: "Wearable Sensor\nBLE"
    kind: device
  - id: BLEGateway
    label: "BLE Gateway\nESP32-S3"
    kind: gateway
  - id: LocalDisplay
    label: "Local OLED Display"
    kind: peripheral
  - id: LTEModem
    label: "LTE-M Modem"
    kind: modem
  - id: CloudBroker
    label: "Cloud MQTT Broker"
    kind: cloud
  - id: PowerBlock
    label: "PMIC + LiPo Battery"
    kind: power
  - id: USBC
    label: "USB-C Service Port"
    kind: service
  - id: SecureElement
    label: "ATECC608 Secure Element"
    kind: security
edges:
  - id: WearableSensor->BLEGateway
    source: WearableSensor
    target: BLEGateway
    direction: "->"
  - id: BLEGateway->LocalDisplay
    source: BLEGateway
    target: LocalDisplay
    direction: "->"
  - id: BLEGateway->LTEModem
    source: BLEGateway
    target: LTEModem
    direction: "->"
  - id: LTEModem->CloudBroker
    source: LTEModem
    target: CloudBroker
    direction: "->"
  - id: BLEGateway->PowerBlock
    source: BLEGateway
    target: PowerBlock
    direction: "->"
  - id: USBC->BLEGateway
    source: USBC
    target: BLEGateway
    direction: "->"
  - id: BLEGateway->SecureElement
    source: BLEGateway
    target: SecureElement
    direction: "->"
export_metadata:
  required_outputs:
    - diagram_input.yaml
    - editable.drawio
    - editable.svg
    - editable.pptx
    - preview.png
  svg_must_come_from_drawio: true
  pptx_must_embed_svg: true
  png_must_come_from_pptx: true
validation_notes_required: true
boundary: "Public synthetic fixture only; no REF packets, private workspaces, secrets, or project raw input."
```

**Draw.io Master Plan**

Create one editable `.drawio` master with exactly one page named `system_overview`. Use a left-to-right layout matching the Mermaid flow. Put `BLEGateway` at the center. Place `WearableSensor` and `USBC` on the left, `LocalDisplay`, `LTEModem`, `PowerBlock`, and `SecureElement` around the gateway, and `CloudBroker` to the far right after `LTEModem`.

Use stable object IDs or metadata matching the node IDs above so downstream validation can compare the master against `diagram_input.yaml`. Keep connectors directional and preserve these exact edge directions:
`WearableSensor->BLEGateway`, `BLEGateway->LocalDisplay`, `BLEGateway->LTEModem`, `LTEModem->CloudBroker`, `BLEGateway->PowerBlock`, `USBC->BLEGateway`, `BLEGateway->SecureElement`.

**Derived Artifact Export Chain**

Planned chain:

1. Parse Markdown Mermaid content into `diagram_input.yaml`.
2. Build the editable `.drawio` master from that structured input.
3. Export SVG from draw.io CLI or equivalent draw.io export path. This must be a real draw.io export, not a handwritten SVG substitute.
4. Insert the SVG into a PPTX slide.
5. Export PNG from the PPTX slide.

The draw.io master remains the source of truth. SVG, PPTX, and PNG are derived only.

**Boundary And Validation Checks**

Planned validation:
- Confirm `diagram_input.yaml` exists and contains page `system_overview`.
- Confirm all required node IDs are present exactly once.
- Confirm all required directed edges are present with correct source and target.
- Confirm the `.drawio` file contains one page named `system_overview`.
- Confirm the SVG was exported from draw.io.
- Confirm the PPTX contains the SVG on a slide.
- Confirm the PNG was exported from the PPTX.
- Confirm validation notes explicitly record existence checks and any local-tool blockers.

Actually completed here:
- No files were created.
- No tools were run.
- No artifact existence or export validation was completed.

**Known Blockers / Limits**

- Missing Mermaid source is a stop condition. In this fixture, Mermaid source is present, so that blocker is not active.
- Missing draw.io CLI or a usable draw.io export path blocks SVG generation.
- PowerPoint COM issues, unavailable PowerPoint, or bad local path handling block PPTX and PNG generation.
- Since this response is prompt-only, artifact generation, file inspection, and runtime validation remain unexecuted.