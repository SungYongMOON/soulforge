```yaml
workflow_id: device_system_diagram_generation
fixture_id: public_compact_wearable_gateway_v1
public_safe: true

pages:
  - name: system_overview
    layout: left_to_right
    purpose: compact wearable gateway system overview

nodes:
  - id: WearableSensor
    label: "Wearable Sensor\nBLE"
    group: edge_device
  - id: BLEGateway
    label: "BLE Gateway\nESP32-S3"
    group: core_gateway
  - id: LocalDisplay
    label: "Local OLED Display"
    group: local_output
  - id: LTEModem
    label: "LTE-M Modem"
    group: uplink
  - id: CloudBroker
    label: "Cloud MQTT Broker"
    group: cloud
  - id: PowerBlock
    label: "PMIC + LiPo Battery"
    group: power
  - id: USBC
    label: "USB-C Service Port"
    group: service
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
  core_gateway:
    contains: [BLEGateway, SecureElement, PowerBlock, LTEModem, LocalDisplay]
  external:
    contains: [WearableSensor, USBC, CloudBroker]

export_metadata:
  source_of_truth: drawio
  derived_exports:
    - svg
    - pptx
    - png
  page_name: system_overview
```

**Draw.io master construction plan**
- Build one editable `.drawio` master as the canonical source.
- Create a single page named `system_overview`.
- Place the gateway in the center, with inbound device and service links on the left and local/cloud/power/security dependencies around it.
- Preserve these directed relations exactly:
  - `WearableSensor -> BLEGateway`
  - `BLEGateway -> LocalDisplay`
  - `BLEGateway -> LTEModem`
  - `LTEModem -> CloudBroker`
  - `BLEGateway -> PowerBlock`
  - `USBC -> BLEGateway`
  - `BLEGateway -> SecureElement`
- Keep labels aligned with the input markdown and use the editable diagram as the only source of truth.

**Derived artifact export chain**
1. Author `diagram_input.yaml` from the markdown and Mermaid source.
2. Construct the editable `.drawio` master from that input.
3. Export SVG from draw.io only.
4. Place the SVG on a PPTX slide.
5. Export PNG preview from the PPTX.
6. Record validation notes alongside the package.

**Boundary and validation checks**
- Planned validation:
  - confirm `diagram_input.yaml` includes all required nodes and edges.
  - confirm the `.drawio` file has exactly one page named `system_overview`.
  - confirm SVG, PPTX, and PNG are present as derived outputs.
  - confirm edge directions match the required node pairings exactly.
- Not completed here:
  - no file inspection performed
  - no export execution performed
  - no artifact existence verification performed

**Known blockers / limits**
- Missing Mermaid source is a blocker if the markdown source cannot be parsed directly.
- Missing draw.io CLI is a blocker for automated SVG export.
- PowerPoint COM or path issues are blockers for PPTX-to-PNG preview generation.
- Runtime project paths, REF packets, candidates, and raw run evidence do not belong in workflow canon.
- This response is a planning candidate only; it does not claim generated files or completed validation.