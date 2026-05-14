**diagram_input.yaml equivalent**
```yaml
workflow_id: device_system_diagram_generation
fixture_id: public_compact_wearable_gateway_v1
public_safe: true
page:
  name: system_overview
  layout: left_to_right
nodes:
  - id: WearableSensor
    label: "Wearable Sensor\nBLE"
    group: edge_device
  - id: BLEGateway
    label: "BLE Gateway\nESP32-S3"
    group: gateway
  - id: LocalDisplay
    label: "Local OLED Display"
    group: local_peripheral
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
    label: BLE
  - from: BLEGateway
    to: LocalDisplay
    label: display
  - from: BLEGateway
    to: LTEModem
    label: uplink
  - from: LTEModem
    to: CloudBroker
    label: mqtt
  - from: BLEGateway
    to: PowerBlock
    label: power
  - from: USBC
    to: BLEGateway
    label: service
  - from: BLEGateway
    to: SecureElement
    label: secure link
export:
  master_source: drawio
  svg: derived_from_drawio
  pptx: derived_from_svg
  png: derived_from_pptx
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

**draw.io master construction plan**
1. Create one-page editable `.drawio` master named `system_overview`.
2. Place `BLEGateway` centrally as the hub.
3. Arrange `WearableSensor` on the left feeding into `BLEGateway`.
4. Place `LocalDisplay`, `LTEModem`, `PowerBlock`, and `SecureElement` around the gateway to show functional branches.
5. Place `USBC` as a left/bottom service entry into `BLEGateway`.
6. Place `CloudBroker` to the far right, reached through `LTEModem`.
7. Keep labels readable and preserve exact node IDs for downstream validation.
8. Use the draw.io file as the source of truth; do not hand-author SVG as a substitute.

**Derived artifact export chain**
1. Author/edit the `.drawio` master first.
2. Export SVG from draw.io directly.
3. Insert the SVG into a PPTX slide as the diagram payload.
4. Export PNG preview from the PPTX.
5. Package all artifacts together with `diagram_input.yaml` and validation notes.

**Boundary and validation checks**
- Planned checks:
  - Confirm one page exists and is named `system_overview`.
  - Confirm all 8 required nodes exist with exact IDs.
  - Confirm all 7 required directed edges exist with preserved directions.
  - Confirm the SVG was exported from draw.io, not recreated manually.
  - Confirm the PPTX contains the SVG-derived slide.
  - Confirm the PNG preview was generated from the PPTX.
  - Confirm validation notes distinguish completed checks from blocked or unrun checks.
- Boundary checks:
  - Do not include REF packets, private workspace paths, raw run evidence, or secret material.
  - Keep the package public-safe and fixture-scoped only.

**Known blockers / limits**
- This response does not claim artifact creation or validation execution.
- Missing Mermaid source is a blocker for source reconstruction if the diagram must be regenerated from Markdown alone.
- Missing draw.io CLI is a blocker for deterministic export automation.
- PowerPoint COM or path issues are blockers for PPTX-to-PNG preview generation.
- Any failure in those local tools should be recorded as a stop condition in validation notes, not hidden.