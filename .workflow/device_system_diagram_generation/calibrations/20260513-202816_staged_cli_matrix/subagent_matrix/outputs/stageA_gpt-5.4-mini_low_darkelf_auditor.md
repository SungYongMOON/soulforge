**Structured Diagram Input YAML**
```yaml
workflow_id: device_system_diagram_generation
fixture_id: public_compact_wearable_gateway_v1
source_type: markdown_with_mermaid
source_of_truth: drawio_master
pages:
  - id: system_overview
    name: system_overview
    layout: left_to_right
nodes:
  WearableSensor:
    label: "Wearable Sensor\nBLE"
    group_hint: edge_device
  BLEGateway:
    label: "BLE Gateway\nESP32-S3"
    group_hint: gateway_core
  LocalDisplay:
    label: "Local OLED Display"
    group_hint: local_ui
  LTEModem:
    label: "LTE-M Modem"
    group_hint: uplink
  CloudBroker:
    label: "Cloud MQTT Broker"
    group_hint: cloud
  PowerBlock:
    label: "PMIC + LiPo Battery"
    group_hint: power
  USBC:
    label: "USB-C Service Port"
    group_hint: service
  SecureElement:
    label: "ATECC608 Secure Element"
    group_hint: security
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
export_metadata:
  editable_master: system_overview.drawio
  derived_svg: system_overview.svg
  derived_pptx: system_overview.pptx
  derived_png: system_overview.png
  notes: validate existence of all outputs and record local-tool blockers
```

**Draw.io Master Construction Plan**
- Build a single-page editable draw.io diagram named `system_overview`.
- Use the Mermaid flow as the semantic source, but reconstruct it as native editable draw.io objects.
- Place the gateway as the central node, with peripherals arranged around it:
  - left: `WearableSensor`, `USBC`
  - right: `LocalDisplay`, `LTEModem`, `SecureElement`
  - far right or upper-right: `CloudBroker`
  - lower area: `PowerBlock`
- Preserve all required node IDs and edge directions exactly as specified.
- Apply grouping hints only as layout guidance, not as hard containment unless the draw.io layout benefits from it.
- Keep the diagram legible for export to SVG and downstream PowerPoint embedding.

**Derived Artifact Export Chain**
1. Author `diagram_input.yaml` as the canonical structured description.
2. Generate the editable `system_overview.drawio` master from that input.
3. Export SVG from draw.io directly, not by hand.
4. Insert the SVG into a PPTX slide as a derived artifact.
5. Export a PNG preview from the PPTX.
6. Record the export metadata and validation notes alongside the package.

**Boundary and Validation Checks**
- Public-safe fixture only.
- Do not include REF packets, private workspaces, secrets, or raw run evidence.
- Do not treat runtime project paths or candidate artifacts as workflow canon.
- Planned validation:
  - confirm `diagram_input.yaml` includes all required nodes and edges
  - confirm the draw.io master has exactly one page named `system_overview`
  - confirm SVG, PPTX, and PNG outputs are present
  - confirm edge directions match the fixture
- Not completed validation:
  - I have not actually inspected files, generated artifacts, or verified outputs in this response.

**Known Blockers / Limits**
- Missing Mermaid source is a blocker if the source description is unavailable.
- Missing draw.io CLI is a blocker for editable-master-to-SVG export.
- PowerPoint COM issues or path problems are stop conditions for PPTX and PNG generation.
- This response only defines the expected structure and validation gates; it does not claim artifact creation or execution success.