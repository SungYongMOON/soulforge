**Structured Diagram Input YAML**

```yaml
workflow_id: device_system_diagram_generation
fixture_id: public_compact_wearable_gateway_v1
source_type: markdown_mermaid
page_name: system_overview
export_targets:
  - drawio_master
  - svg
  - pptx
  - png
nodes:
  - id: WearableSensor
    label: Wearable Sensor
    subtitle: BLE
    group: edge_device
  - id: BLEGateway
    label: BLE Gateway
    subtitle: ESP32-S3
    group: gateway
  - id: LocalDisplay
    label: Local OLED Display
    group: local_io
  - id: LTEModem
    label: LTE-M Modem
    group: uplink
  - id: CloudBroker
    label: Cloud MQTT Broker
    group: cloud
  - id: PowerBlock
    label: PMIC + LiPo Battery
    group: power
  - id: USBC
    label: USB-C Service Port
    group: service
  - id: SecureElement
    label: ATECC608 Secure Element
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
labels:
  title: Compact Wearable Gateway System
  notes:
    - Editable draw.io master is the source of truth.
    - Derived artifacts must be exported from the master, not redrawn.
grouping_hints:
  - edge_device: WearableSensor
  - gateway: BLEGateway
  - local_io: LocalDisplay
  - uplink: LTEModem
  - cloud: CloudBroker
  - power: PowerBlock
  - service: USBC
  - security: SecureElement
```

**Draw.io Master Construction Plan**

- Create one editable `.drawio` page named `system_overview`.
- Place `BLEGateway` centrally as the hub.
- Arrange `WearableSensor` to the left, feeding `WearableSensor -> BLEGateway`.
- Place `LocalDisplay`, `LTEModem`, `PowerBlock`, and `SecureElement` around the gateway to show functional adjacency.
- Place `USBC` as a service ingress to the gateway.
- Place `CloudBroker` to the far right as the downstream network endpoint from `LTEModem -> CloudBroker`.
- Use consistent box styling per grouping hint:
  - Edge device
  - Gateway
  - Local I/O
  - Uplink
  - Cloud
  - Power
  - Service
  - Security
- Keep node IDs stable and visible in the editable structure, even if the display labels are shortened or wrapped.

**Derived Artifact Export Chain**

1. Author the editable draw.io master.
2. Export SVG from draw.io directly from the master.
3. Insert the exported SVG into a PPTX slide.
4. Export PNG preview from the PPTX.
5. Keep the draw.io file as the source of truth; all other outputs are derivative.

**Boundary and Validation Checks**

Planned validation:
- Confirm all required nodes exist:
  - `WearableSensor`
  - `BLEGateway`
  - `LocalDisplay`
  - `LTEModem`
  - `CloudBroker`
  - `PowerBlock`
  - `USBC`
  - `SecureElement`
- Confirm all required directed edges exist:
  - `WearableSensor -> BLEGateway`
  - `BLEGateway -> LocalDisplay`
  - `BLEGateway -> LTEModem`
  - `LTEModem -> CloudBroker`
  - `BLEGateway -> PowerBlock`
  - `USBC -> BLEGateway`
  - `BLEGateway -> SecureElement`
- Confirm the draw.io page name is exactly `system_overview`.
- Confirm export outputs exist in the expected chain: draw.io, SVG, PPTX, PNG.
- Confirm validation notes explicitly separate observed outputs from blockers.

Not completed here:
- No file creation was performed.
- No export or render validation was executed.
- No artifact existence was actually verified.

**Known Blockers / Limits**

- Missing Mermaid source is a blocker in this workflow class when source extraction is required.
- Missing draw.io CLI is a blocker for automated master/export generation.
- PowerPoint COM or path issues are blockers for PPTX insertion and PNG preview export.
- Runtime project paths, REF packets, private workspaces, and raw run evidence are out of scope for this public fixture.
- This response is a candidate plan only; it does not claim artifact generation or validation completion.