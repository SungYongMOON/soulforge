**Structured Diagram Input YAML**
```yaml
workflow_id: device_system_diagram_generation
fixture_id: public_compact_wearable_gateway_v1
source_of_truth: drawio_master
pages:
  - name: system_overview
    layout: left_to_right
    grouping_hints:
      - wearable_input
      - gateway_core
      - local_output
      - uplink
      - power_and_security
    nodes:
      - id: WearableSensor
        label: "Wearable Sensor\nBLE"
        group: wearable_input
      - id: BLEGateway
        label: "BLE Gateway\nESP32-S3"
        group: gateway_core
      - id: LocalDisplay
        label: "Local OLED Display"
        group: local_output
      - id: LTEModem
        label: "LTE-M Modem"
        group: uplink
      - id: CloudBroker
        label: "Cloud MQTT Broker"
        group: uplink
      - id: PowerBlock
        label: "PMIC + LiPo Battery"
        group: power_and_security
      - id: USBC
        label: "USB-C Service Port"
        group: power_and_security
      - id: SecureElement
        label: "ATECC608 Secure Element"
        group: power_and_security
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
  drawio_page_name: system_overview
  derived_outputs:
    - svg
    - pptx
    - png
validation:
  required_nodes:
    - WearableSensor
    - BLEGateway
    - LocalDisplay
    - LTEModem
    - CloudBroker
    - PowerBlock
    - USBC
    - SecureElement
  required_edges:
    - WearableSensor->BLEGateway
    - BLEGateway->LocalDisplay
    - BLEGateway->LTEModem
    - LTEModem->CloudBroker
    - BLEGateway->PowerBlock
    - USBC->BLEGateway
    - BLEGateway->SecureElement
```

**Draw.io Master Construction Plan**
- Build a single-page editable `.drawio` master named `system_overview`.
- Place `BLEGateway` as the central hub.
- Arrange `WearableSensor` on the left feeding into `BLEGateway`.
- Place `LocalDisplay`, `LTEModem`, `PowerBlock`, and `SecureElement` around the gateway to reflect local peripherals, uplink, power, and security.
- Place `USBC` as a service ingress into `BLEGateway`.
- Place `CloudBroker` on the far right as the external destination from `LTEModem`.
- Keep labels exactly as specified, including line breaks in multi-line labels.
- Preserve edge directions exactly as listed in the fixture.

**Derived Artifact Export Chain**
1. Author the editable `.drawio` master first.
2. Export SVG from draw.io directly from the editable master.
3. Insert the SVG into a PPTX slide as the diagram payload.
4. Export PNG preview from the PPTX.
5. Keep the `.drawio` master as the source of truth; do not treat SVG, PPTX, or PNG as canonical.

**Boundary and Validation Checks**
- Public-safe fixture only: no REF packets, private workspaces, secrets, or raw run evidence.
- Validate required nodes are present exactly once.
- Validate required directed edges preserve source and target order.
- Validate the draw.io page name is `system_overview`.
- Validate the SVG is produced by draw.io, not hand-written.
- Validate the PPTX contains the SVG-derived slide content.
- Validate the PNG is exported from the PPTX, not independently redrawn.
- Planned validation only here; no actual validation was performed in this response.

**Known Blockers / Limits**
- Missing Mermaid source is a blocker if the workflow expects Mermaid as an input intermediate.
- Missing draw.io CLI is a stop condition for automated export.
- PowerPoint COM availability or path issues are a blocker for PPTX/PNG export.
- I did not run tools, read files, or generate artifacts in this response.
- I did not complete runtime validation; only described the checks that should be performed.