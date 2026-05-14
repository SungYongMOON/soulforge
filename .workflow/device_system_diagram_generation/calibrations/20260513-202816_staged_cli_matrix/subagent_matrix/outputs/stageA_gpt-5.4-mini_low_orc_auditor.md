**Diagram Input**
```yaml
workflow_id: device_system_diagram_generation
fixture_id: public_compact_wearable_gateway_v1
public_safe: true

pages:
  - name: system_overview
    layout: left_to_right
    title: Compact Wearable Gateway System

nodes:
  - id: WearableSensor
    label: "Wearable Sensor\nBLE"
    group: edge_device
  - id: BLEGateway
    label: "BLE Gateway\nESP32-S3"
    group: gateway
  - id: LocalDisplay
    label: "Local OLED Display"
    group: local_io
  - id: LTEModem
    label: "LTE-M Modem"
    group: backhaul
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
  edge_device: [WearableSensor]
  gateway: [BLEGateway]
  local_io: [LocalDisplay]
  backhaul: [LTEModem]
  cloud: [CloudBroker]
  power: [PowerBlock]
  service: [USBC]
  security: [SecureElement]

export_metadata:
  source_of_truth: drawio
  derived_formats: [svg, pptx, png]
  page_name: system_overview
```

**Draw.io Master Plan**
- Build one editable `.drawio` file as the canonical source.
- Create a single page named `system_overview`.
- Place `BLEGateway` at center as the hub.
- Left-side inputs:
  - `WearableSensor -> BLEGateway`
  - `USBC -> BLEGateway`
- Right-side outputs:
  - `BLEGateway -> LocalDisplay`
  - `BLEGateway -> LTEModem`
  - `BLEGateway -> PowerBlock`
  - `BLEGateway -> SecureElement`
- Far-right network path:
  - `LTEModem -> CloudBroker`
- Keep node labels exactly aligned with the supplied IDs and edge directions.
- Preserve editability in draw.io shapes and connectors; do not flatten into a static image.

**Export Chain**
1. Author the draw.io master.
2. Export SVG from draw.io, using the editable master as the source.
3. Insert the SVG into a PPTX slide.
4. Export a PNG preview from the PPTX.
5. Package `diagram_input.yaml`, `.drawio`, SVG, PPTX, PNG, and validation notes together.

**Boundary And Validation Checks**
- Planned validation:
  - Confirm all required nodes exist: `WearableSensor`, `BLEGateway`, `LocalDisplay`, `LTEModem`, `CloudBroker`, `PowerBlock`, `USBC`, `SecureElement`.
  - Confirm all required directed edges exist exactly as specified.
  - Confirm one page only, named `system_overview`.
  - Confirm SVG is exported from draw.io, not hand-written.
  - Confirm PPTX contains the SVG.
  - Confirm PNG preview is derived from the PPTX.
- Not completed here:
  - No file generation was performed.
  - No artifact existence checks were executed.

**Known Blockers / Limits**
- Missing Mermaid source is a blocker if the workflow depends on it as an input source.
- Missing draw.io CLI is a blocker for automated export.
- PowerPoint COM automation or path issues are blockers for PPTX-to-PNG preview generation.
- Runtime project paths, REF packets, candidates, and raw run evidence are out of scope for workflow canon.
- This response is a candidate plan only; it does not claim artifact creation or validation completion.