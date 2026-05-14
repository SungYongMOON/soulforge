**Structured Diagram Input**

```yaml
workflow_id: device_system_diagram_generation
fixture_id: public_compact_wearable_gateway_v1
public_safe: true

pages:
  - id: system_overview
    name: system_overview
    layout: left_to_right
    title: Compact Wearable Gateway System

nodes:
  - id: WearableSensor
    label: "Wearable Sensor\nBLE"
    type: external_device
    group: sensing
  - id: BLEGateway
    label: "BLE Gateway\nESP32-S3"
    type: gateway_controller
    group: core
  - id: LocalDisplay
    label: "Local OLED Display"
    type: local_interface
    group: user_io
  - id: LTEModem
    label: "LTE-M Modem"
    type: communication_module
    group: cellular_uplink
  - id: CloudBroker
    label: "Cloud MQTT Broker"
    type: cloud_service
    group: cloud
  - id: PowerBlock
    label: "PMIC + LiPo Battery"
    type: power_subsystem
    group: power
  - id: USBC
    label: "USB-C Service Port"
    type: service_interface
    group: maintenance
  - id: SecureElement
    label: "ATECC608 Secure Element"
    type: security_module
    group: security

edges:
  - id: WearableSensor-to-BLEGateway
    source: WearableSensor
    target: BLEGateway
    direction: WearableSensor->BLEGateway
  - id: BLEGateway-to-LocalDisplay
    source: BLEGateway
    target: LocalDisplay
    direction: BLEGateway->LocalDisplay
  - id: BLEGateway-to-LTEModem
    source: BLEGateway
    target: LTEModem
    direction: BLEGateway->LTEModem
  - id: LTEModem-to-CloudBroker
    source: LTEModem
    target: CloudBroker
    direction: LTEModem->CloudBroker
  - id: BLEGateway-to-PowerBlock
    source: BLEGateway
    target: PowerBlock
    direction: BLEGateway->PowerBlock
  - id: USBC-to-BLEGateway
    source: USBC
    target: BLEGateway
    direction: USBC->BLEGateway
  - id: BLEGateway-to-SecureElement
    source: BLEGateway
    target: SecureElement
    direction: BLEGateway->SecureElement

grouping_hints:
  core_node: BLEGateway
  left_inputs:
    - WearableSensor
    - USBC
  right_outputs:
    - LocalDisplay
    - LTEModem
    - PowerBlock
    - SecureElement
  cloud_chain:
    - LTEModem
    - CloudBroker

export_metadata:
  drawio_master: system_overview.drawio
  svg_export: system_overview.svg
  pptx_export: system_overview.pptx
  png_preview: system_overview.png
```

**Draw.io Master Construction Plan**

Create one editable draw.io master file named `system_overview.drawio` with exactly one page named `system_overview`. The page should represent `BLEGateway` as the central gateway/controller node. Place `WearableSensor` and `USBC` to the left as ingress/service inputs. Place `LocalDisplay`, `LTEModem`, `PowerBlock`, and `SecureElement` to the right or lower-right as connected subsystems. Place `CloudBroker` beyond `LTEModem` to preserve the cellular-to-cloud chain.

All node IDs should be preserved as diagram object identifiers or metadata where possible. Labels should preserve line breaks, especially `Wearable Sensor\nBLE` and `BLE Gateway\nESP32-S3`. Directed connectors must preserve the required source and target direction.

**Derived Artifact Export Chain**

The editable `.drawio` master is the source of truth.

Planned export chain:

1. Generate `diagram_input.yaml` from the Markdown Mermaid source and fixture metadata.
2. Generate `system_overview.drawio` from `diagram_input.yaml`.
3. Export `system_overview.svg` from the draw.io master using draw.io CLI or equivalent draw.io-backed export.
4. Create `system_overview.pptx` containing the exported SVG on a slide.
5. Export `system_overview.png` as a preview from the PPTX.

The SVG must be derived from draw.io, not hand-written as a replacement.

**Boundary And Validation Checks**

Planned validation:

- Confirm all required outputs are present:
  - `diagram_input.yaml`
  - `system_overview.drawio`
  - `system_overview.svg`
  - `system_overview.pptx`
  - `system_overview.png`
  - validation notes
- Confirm the draw.io file has one page named `system_overview`.
- Confirm all required node IDs are represented:
  - `WearableSensor`, `BLEGateway`, `LocalDisplay`, `LTEModem`, `CloudBroker`, `PowerBlock`, `USBC`, `SecureElement`
- Confirm all required directed edges are represented exactly:
  - `WearableSensor->BLEGateway`
  - `BLEGateway->LocalDisplay`
  - `BLEGateway->LTEModem`
  - `LTEModem->CloudBroker`
  - `BLEGateway->PowerBlock`
  - `USBC->BLEGateway`
  - `BLEGateway->SecureElement`
- Confirm artifacts are public-safe and based only on the synthetic public fixture.
- Confirm no REF packets, runtime project paths, private workspaces, secrets, or raw run evidence are included in workflow canon.

Actually completed validation: none. This response is a candidate plan only and does not claim files were created, inspected, or exported.

**Known Blockers And Limits**

- Missing Mermaid source is a blocker because the device graph must come from the Markdown source.
- Missing draw.io CLI or unavailable draw.io export path blocks trustworthy SVG generation.
- A hand-written SVG is not acceptable as the canonical derived SVG.
- PowerPoint COM failures, unavailable PowerPoint installation, or path/permission issues can block PPTX creation or PNG preview export.
- The package should stop with clear validation notes if any required artifact cannot be generated from the proper source chain.