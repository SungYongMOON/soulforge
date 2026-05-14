**Diagram Input**
```yaml
workflow_id: device_system_diagram_generation
fixture_id: public_compact_wearable_gateway_v1
public_safe: true
pages:
  - id: system_overview
    name: system_overview
    purpose: compact wearable gateway overview

nodes:
  - id: WearableSensor
    label: "Wearable Sensor\nBLE"
    page: system_overview
    kind: device
  - id: BLEGateway
    label: "BLE Gateway\nESP32-S3"
    page: system_overview
    kind: gateway
  - id: LocalDisplay
    label: "Local OLED Display"
    page: system_overview
    kind: peripheral
  - id: LTEModem
    label: "LTE-M Modem"
    page: system_overview
    kind: comms
  - id: CloudBroker
    label: "Cloud MQTT Broker"
    page: system_overview
    kind: cloud
  - id: PowerBlock
    label: "PMIC + LiPo Battery"
    page: system_overview
    kind: power
  - id: USBC
    label: "USB-C Service Port"
    page: system_overview
    kind: service
  - id: SecureElement
    label: "ATECC608 Secure Element"
    page: system_overview
    kind: security

edges:
  - source: WearableSensor
    target: BLEGateway
  - source: BLEGateway
    target: LocalDisplay
  - source: BLEGateway
    target: LTEModem
  - source: LTEModem
    target: CloudBroker
  - source: BLEGateway
    target: PowerBlock
  - source: USBC
    target: BLEGateway
  - source: BLEGateway
    target: SecureElement

grouping_hints:
  - name: on_device
    members: [WearableSensor, BLEGateway, LocalDisplay, LTEModem, PowerBlock, USBC, SecureElement]
  - name: cloud_side
    members: [CloudBroker]

export_metadata:
  master_format: draw.io
  source_of_truth: editable_drawio_master
  derived_outputs: [svg, pptx, png]
  validation_targets:
    - diagram_input_yaml_exists
    - drawio_master_exists
    - svg_export_exists
    - pptx_with_svg_exists
    - png_preview_exists
```

**Draw.io Master Plan**
- Create one editable draw.io page named `system_overview`.
- Place `BLEGateway` as the central hub.
- Route `WearableSensor -> BLEGateway` as the primary inbound BLE path.
- Place `LocalDisplay`, `LTEModem`, `PowerBlock`, `USBC`, and `SecureElement` around the gateway as direct attachments.
- Place `CloudBroker` on the far right to emphasize the uplink path `LTEModem -> CloudBroker`.
- Keep node labels exactly aligned to the provided Mermaid semantics.
- Ensure the draw.io file is the canonical source, with all exports derived from it.

**Derived Export Chain**
1. Author `diagram_input.yaml`.
2. Build editable `.drawio` master from that YAML.
3. Export SVG from draw.io, not by hand.
4. Insert the SVG into a PPTX slide.
5. Export PNG preview from the PPTX.
6. Record validation notes after checking output presence and tool constraints.

**Boundary And Validation**
- Public fixture only.
- No REF packets, private workspace paths, secrets, or raw run evidence.
- Preserve required node IDs exactly:
  `WearableSensor`, `BLEGateway`, `LocalDisplay`, `LTEModem`, `CloudBroker`, `PowerBlock`, `USBC`, `SecureElement`.
- Preserve required edge directions exactly:
  `WearableSensor->BLEGateway`
  `BLEGateway->LocalDisplay`
  `BLEGateway->LTEModem`
  `LTEModem->CloudBroker`
  `BLEGateway->PowerBlock`
  `USBC->BLEGateway`
  `BLEGateway->SecureElement`
- Planned validation:
  - confirm the YAML includes pages, nodes, edges, labels, grouping hints, and export metadata
  - confirm the draw.io master has exactly one page named `system_overview`
  - confirm exported SVG, PPTX, and PNG exist and are linked in the expected chain
- Completed validation:
  - not performed here

**Known Blockers / Limits**
- I did not run tools, inspect files, or generate artifacts in this response.
- Missing Mermaid source would block reconstruction in a real run.
- Missing draw.io CLI would block SVG export from the master.
- PowerPoint COM/path issues would block PPTX insertion or PNG preview export.
- This response is a candidate package specification only, not an executed artifact set.