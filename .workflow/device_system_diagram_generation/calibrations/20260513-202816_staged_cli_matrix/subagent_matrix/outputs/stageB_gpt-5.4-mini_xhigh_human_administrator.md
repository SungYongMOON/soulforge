## Structured Diagram Input

```yaml
workflow_id: device_system_diagram_generation
fixture_id: public_compact_wearable_gateway_v1
public_safe: true

pages:
  - name: system_overview
    layout: left_to_right
    grouping_hints:
      - data_path
      - service_ports
      - power_and_security

nodes:
  WearableSensor:
    label: "Wearable Sensor\nBLE"
    group: data_path
  BLEGateway:
    label: "BLE Gateway\nESP32-S3"
    group: core_gateway
  LocalDisplay:
    label: "Local OLED Display"
    group: peripherals
  LTEModem:
    label: "LTE-M Modem"
    group: connectivity
  CloudBroker:
    label: "Cloud MQTT Broker"
    group: cloud
  PowerBlock:
    label: "PMIC + LiPo Battery"
    group: power_and_security
  USBC:
    label: "USB-C Service Port"
    group: service_ports
  SecureElement:
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

labels:
  title: "Compact Wearable Gateway System"
  note: "Editable draw.io master is source of truth; SVG, PPTX, and PNG are derived artifacts."

export_metadata:
  master_format: drawio
  master_pages:
    - system_overview
  derived_formats:
    - svg
    - pptx
    - png
```

## Draw.io Master Plan

- Build a single-page editable `.drawio` master named `system_overview`.
- Place `WearableSensor` at the far left, `BLEGateway` as the central hub, and `CloudBroker` at the far right to preserve the main flow.
- Keep `LTEModem` between `BLEGateway` and `CloudBroker`.
- Place `LocalDisplay`, `PowerBlock`, `USBC`, and `SecureElement` around `BLEGateway` so the gateway remains the functional center.
- Use directional arrows exactly as specified:
  - `WearableSensor -> BLEGateway`
  - `BLEGateway -> LocalDisplay`
  - `BLEGateway -> LTEModem`
  - `LTEModem -> CloudBroker`
  - `BLEGateway -> PowerBlock`
  - `USBC -> BLEGateway`
  - `BLEGateway -> SecureElement`
- Preserve device IDs in the diagram data model even if visible labels are human-friendly text.

## Derived Export Chain

1. Author the editable `.drawio` master.
2. Export SVG from draw.io, not from a hand-written substitute.
3. Insert the SVG into a PPTX slide.
4. Export a PNG preview from the PPTX.
5. Keep the draw.io master as the source of truth; treat SVG, PPTX, and PNG as derived outputs.

## Boundary And Validation

- Boundary checks:
  - Public synthetic fixture only.
  - No REF packets, private workspaces, secrets, or raw run evidence.
  - No runtime project paths in workflow canon.
- Planned validation:
  - Verify `diagram_input.yaml` contains all required nodes and edges.
  - Verify the `.drawio` master has exactly one page named `system_overview`.
  - Verify SVG, PPTX, and PNG are all present and linked to the same master.
  - Verify export metadata matches the actual artifact chain.
- Completed validation:
  - None in this response; no files were read or generated here.

## Known Blockers / Limits

- Missing Mermaid source is a blocker when the diagram must be reconstructed from Markdown alone, but this fixture includes Mermaid content in the input.
- Missing draw.io CLI is a blocker for SVG export.
- PowerPoint COM/path problems are a blocker for PPTX insertion and PNG preview export.
- I did not verify tool availability or artifact existence in this isolated context.