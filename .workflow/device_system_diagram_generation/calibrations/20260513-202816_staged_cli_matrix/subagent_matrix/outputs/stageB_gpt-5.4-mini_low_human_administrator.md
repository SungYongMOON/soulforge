**Diagram Input**
```yaml
workflow_id: device_system_diagram_generation
fixture_id: public_compact_wearable_gateway_v1
public_safe: true

pages:
  - name: system_overview
    layout: left-to-right
    grouping_hints:
      - wearable input
      - gateway core
      - local output
      - wide-area uplink
      - power and security

nodes:
  - id: WearableSensor
    label: "Wearable Sensor\nBLE"
    group: wearable input
  - id: BLEGateway
    label: "BLE Gateway\nESP32-S3"
    group: gateway core
  - id: LocalDisplay
    label: "Local OLED Display"
    group: local output
  - id: LTEModem
    label: "LTE-M Modem"
    group: wide-area uplink
  - id: CloudBroker
    label: "Cloud MQTT Broker"
    group: cloud endpoint
  - id: PowerBlock
    label: "PMIC + LiPo Battery"
    group: power and security
  - id: USBC
    label: "USB-C Service Port"
    group: service access
  - id: SecureElement
    label: "ATECC608 Secure Element"
    group: power and security

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
  source_of_truth: editable_drawio_master
  derived_outputs:
    - svg
    - pptx
    - png
  page_name: system_overview
```

**Draw.io Master Plan**
- Build one-page editable `.drawio` master named `system_overview`.
- Place `BLEGateway` as the hub in the center.
- Arrange `WearableSensor` on the left, `LocalDisplay` and `LTEModem` to the right, `CloudBroker` further right, `USBC` below-left or bottom, and `PowerBlock` plus `SecureElement` grouped near the gateway.
- Keep all node labels editable text in draw.io.
- Use explicit directed connectors preserving these edge directions:
  - `WearableSensor -> BLEGateway`
  - `BLEGateway -> LocalDisplay`
  - `BLEGateway -> LTEModem`
  - `LTEModem -> CloudBroker`
  - `BLEGateway -> PowerBlock`
  - `USBC -> BLEGateway`
  - `BLEGateway -> SecureElement`

**Derived Export Chain**
1. Author the `.drawio` master first.
2. Export SVG from draw.io directly from that master.
3. Place the SVG into a PPTX slide.
4. Export a PNG preview from the PPTX.
5. Keep the draw.io file as the source of truth; do not reverse-generate it from SVG or PPTX.

**Boundary And Validation**
- Public-safe fixture only.
- No REF packets, private workspaces, secrets, or raw run evidence.
- Validation should cover:
  - required nodes exist
  - required edges exist with the same directions
  - one page exists and is named `system_overview`
  - `diagram_input.yaml` is present
  - editable `.drawio` master is present
  - SVG export exists and is draw.io-derived
  - PPTX contains the SVG
  - PNG preview exists
- Planned validation only: I am not claiming any actual file checks or exports were completed here.

**Known Blockers / Limits**
- Missing Mermaid source is a blocker if the diagram must be reconstructed from source.
- Missing draw.io CLI is a blocker for direct export automation.
- PowerPoint COM or path issues are blockers for PPTX-to-PNG export.
- I did not inspect the local environment, so tool availability and artifact existence remain unverified.