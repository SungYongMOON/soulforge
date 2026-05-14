**Structured Diagram Input**
```yaml
workflow_id: device_system_diagram_generation
fixture_id: public_compact_wearable_gateway_v1
public_safe: true

pages:
  - id: system_overview
    title: system_overview
    layout: left_to_right
    source_of_truth: drawio_master

nodes:
  - id: WearableSensor
    label: "Wearable Sensor\nBLE"
    group: edge_device
  - id: BLEGateway
    label: "BLE Gateway\nESP32-S3"
    group: gateway_core
  - id: LocalDisplay
    label: "Local OLED Display"
    group: local_io
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
  gateway_center: BLEGateway
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
  drawio_master: compact_wearable_gateway.drawio
  svg_export: compact_wearable_gateway.svg
  pptx_export: compact_wearable_gateway.pptx
  png_preview: compact_wearable_gateway.png
  required_page: system_overview
```

**Draw.io Master Construction Plan**

Create one editable `.drawio` file as the source of truth, with exactly one page named `system_overview`.

Place `BLEGateway` centrally as the gateway controller. Place `WearableSensor` and `USBC` on the left as inbound/service sources. Place `LocalDisplay`, `LTEModem`, `PowerBlock`, and `SecureElement` to the right or lower-right around the gateway. Place `CloudBroker` farther right of `LTEModem` to preserve the uplink chain.

Use normal draw.io node shapes with editable text labels, not flattened images. Use directed connectors matching the fixture exactly:

```text
WearableSensor->BLEGateway
BLEGateway->LocalDisplay
BLEGateway->LTEModem
LTEModem->CloudBroker
BLEGateway->PowerBlock
USBC->BLEGateway
BLEGateway->SecureElement
```

**Derived Artifact Export Chain**

Planned artifact chain:

1. Generate `diagram_input.yaml` from the Markdown Mermaid source.
2. Generate editable `compact_wearable_gateway.drawio`.
3. Export `compact_wearable_gateway.svg` from the draw.io master using draw.io CLI.
4. Create `compact_wearable_gateway.pptx` with the SVG placed on a slide.
5. Export `compact_wearable_gateway.png` preview from the PPTX.

The SVG must be derived from draw.io, not hand-written as a substitute. The PPTX and PNG are derived outputs and must not replace the `.drawio` master as the source of truth.

**Boundary And Validation Checks**

Planned validation only; no artifact generation is claimed here.

Checks to perform after generation:

```yaml
validation_plan:
  required_files:
    - diagram_input.yaml
    - compact_wearable_gateway.drawio
    - compact_wearable_gateway.svg
    - compact_wearable_gateway.pptx
    - compact_wearable_gateway.png
  drawio_checks:
    - one page exists
    - page name is system_overview
    - all required node IDs are represented
    - all required edge directions are preserved
  export_checks:
    - SVG was exported from draw.io master
    - PPTX contains the SVG-derived diagram
    - PNG preview was exported from the PPTX
  boundary_checks:
    - public synthetic fixture only
    - no REF packets
    - no private workspace paths
    - no secrets
    - no raw runtime evidence in workflow canon
```

**Known Blockers / Limits**

This response is a calibration plan, not an execution report.

Known stop conditions:

- Missing Mermaid source blocks generation.
- Missing draw.io CLI blocks valid SVG export.
- Hand-written SVG is not acceptable as a replacement for draw.io export.
- PowerPoint COM failure or invalid local PPTX path blocks PPTX-to-PNG preview export.
- Runtime project paths, REF packets, raw candidate evidence, and private inputs must stay out of workflow canon.