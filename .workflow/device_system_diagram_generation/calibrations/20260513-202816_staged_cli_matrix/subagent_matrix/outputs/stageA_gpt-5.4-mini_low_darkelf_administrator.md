**Structured Diagram Input YAML**

```yaml
workflow_id: device_system_diagram_generation
fixture_id: public_compact_wearable_gateway_v1
source_type: markdown_mermaid
pages:
  - id: system_overview
    title: system_overview
    layout: left_to_right
    grouping_hints:
      - wearable_edge:
          includes: [WearableSensor, BLEGateway, LocalDisplay, LTEModem, PowerBlock, USBC, SecureElement, CloudBroker]
      - gateway_core:
          includes: [BLEGateway, SecureElement, LocalDisplay, LTEModem, PowerBlock]
nodes:
  - id: WearableSensor
    label: Wearable Sensor
    detail: BLE
  - id: BLEGateway
    label: BLE Gateway
    detail: ESP32-S3
  - id: LocalDisplay
    label: Local OLED Display
  - id: LTEModem
    label: LTE-M Modem
  - id: CloudBroker
    label: Cloud MQTT Broker
  - id: PowerBlock
    label: PMIC + LiPo Battery
  - id: USBC
    label: USB-C Service Port
  - id: SecureElement
    label: ATECC608 Secure Element
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
  derived_outputs: [svg, pptx, png]
  page_name: system_overview
  diagram_direction: LR
  notes:
    - keep node IDs stable
    - preserve arrow direction exactly as authored
```

**Draw.io Master Construction Plan**

- Build a single-page editable `.drawio` master named `system_overview`.
- Place `BLEGateway` as the central hub.
- Position inputs on the left where practical:
  - `WearableSensor` feeding into `BLEGateway`
  - `USBC` feeding into `BLEGateway`
- Position dependent/internal blocks around the gateway:
  - `LocalDisplay` and `SecureElement` as gateway peripherals
  - `PowerBlock` close to the gateway with a power relationship
  - `LTEModem` as the uplink path from gateway
- Position `CloudBroker` to the far right as the external network endpoint.
- Keep the editability intact:
  - use native draw.io shapes and connectors
  - avoid flattening into a raster-only diagram
  - preserve node IDs and edge directions from the source

**Derived Artifact Export Chain**

1. Author `diagram_input.yaml`.
2. Generate or update the editable `.drawio` master from that structured input.
3. Export SVG from draw.io, using the draw.io master as the source.
4. Insert the SVG into a PPTX slide.
5. Export PNG preview from the PPTX.
6. Keep the `.drawio` file as the canonical source of truth for the package.

**Boundary and Validation Checks**

Planned validation:
- Confirm required nodes exist:
  - `WearableSensor`, `BLEGateway`, `LocalDisplay`, `LTEModem`, `CloudBroker`, `PowerBlock`, `USBC`, `SecureElement`
- Confirm required edges exist with exact direction:
  - `WearableSensor->BLEGateway`
  - `BLEGateway->LocalDisplay`
  - `BLEGateway->LTEModem`
  - `LTEModem->CloudBroker`
  - `BLEGateway->PowerBlock`
  - `USBC->BLEGateway`
  - `BLEGateway->SecureElement`
- Confirm one page named `system_overview`.
- Confirm exported artifacts exist in the intended chain: `.drawio`, `.svg`, `.pptx`, `.png`.
- Record validation notes that distinguish source-of-truth versus derived outputs.

Boundary checks:
- Treat this as a public synthetic fixture only.
- Do not rely on REF packets, private workspaces, secrets, or raw run evidence.
- Do not promote runtime project paths into workflow canon.
- Preserve the editable master as the authoritative artifact.

**Known Blockers / Limits**

- Missing Mermaid source is a blocker if the system cannot reconstruct the diagram input from the prompt.
- Missing draw.io CLI is a blocker for automated editable-master generation or SVG export.
- PowerPoint COM or path issues are a blocker for PPTX embedding and PNG export.
- I have not actually executed validation or generated files here; the validation above is planned, not completed.