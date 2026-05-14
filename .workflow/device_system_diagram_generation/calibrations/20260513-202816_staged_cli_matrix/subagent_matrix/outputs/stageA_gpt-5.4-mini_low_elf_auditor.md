**Structured Input YAML**

```yaml
workflow_id: device_system_diagram_generation
fixture_id: public_compact_wearable_gateway_v1
source: markdown_description
public_safe: true

pages:
  - id: system_overview
    title: Compact Wearable Gateway System

nodes:
  - id: WearableSensor
    label: "Wearable Sensor\nBLE"
    kind: device
  - id: BLEGateway
    label: "BLE Gateway\nESP32-S3"
    kind: gateway
  - id: LocalDisplay
    label: "Local OLED Display"
    kind: display
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
    kind: service_port
  - id: SecureElement
    label: "ATECC608 Secure Element"
    kind: security

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
  - group_id: edge_devices
    members: [WearableSensor, BLEGateway, LocalDisplay, SecureElement]
  - group_id: connectivity
    members: [LTEModem, CloudBroker, USBC]
  - group_id: power
    members: [PowerBlock]

export_metadata:
  master_source_of_truth: drawio
  derived_artifacts: [svg, pptx, png]
  page_name: system_overview
  validation_target: required_output_existence
```

**draw.io Master Construction Plan**

1. Create one-page editable draw.io diagram named `system_overview`.
2. Place `WearableSensor` on the left, feeding into `BLEGateway` as the central hub.
3. Fan out from `BLEGateway` to `LocalDisplay`, `LTEModem`, `PowerBlock`, and `SecureElement`.
4. Draw `LTEModem -> CloudBroker` as the upstream network path.
5. Draw `USBC -> BLEGateway` as the service ingress path.
6. Keep labels exactly as provided in the YAML, preserving device IDs separately from display text.
7. Use swimlane-like visual grouping only as hints, not as a source of truth, since the diagram remains editable and flat enough to maintain.

**Derived Artifact Export Chain**

1. Authoritative master: `.drawio`
2. Draw.io export: `.svg`
3. PPTX slide embedding the exported SVG
4. PNG preview exported from the PPTX

Planned export order is important: the SVG must come from draw.io, and the PNG must come from the PPTX-derived slide rendering, not from a hand-made image.

**Boundary and Validation Checks**

Planned validation:
- Confirm the package includes `diagram_input.yaml`, `.drawio`, `.svg`, `.pptx`, and `.png`.
- Confirm the draw.io master contains exactly one page named `system_overview`.
- Confirm all required nodes are present: `WearableSensor`, `BLEGateway`, `LocalDisplay`, `LTEModem`, `CloudBroker`, `PowerBlock`, `USBC`, `SecureElement`.
- Confirm all required directed edges are present:
  - `WearableSensor->BLEGateway`
  - `BLEGateway->LocalDisplay`
  - `BLEGateway->LTEModem`
  - `LTEModem->CloudBroker`
  - `BLEGateway->PowerBlock`
  - `USBC->BLEGateway`
  - `BLEGateway->SecureElement`
- Confirm the draw.io file remains the editable source of truth.

Boundary checks:
- No REF packets.
- No private workspaces.
- No raw run evidence in workflow canon.
- No secrets, credentials, or project-local hidden data.
- Public synthetic fixture only.

**Known Blockers / Limits**

Declared blockers or stop conditions from the workflow summary:
- Missing Mermaid source.
- Missing draw.io CLI.
- PowerPoint COM or path problems.

Validation status in this response:
- Planned validation only.
- No artifacts were actually generated or verified here.
- No local tool availability was checked.