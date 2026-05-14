## Diagram Input YAML

```yaml
workflow_id: device_system_diagram_generation
fixture_id: public_compact_wearable_gateway_v1
public_safe: true

pages:
  - name: system_overview
    type: system_overview
    grouping_hints:
      - wearable_inputs
      - gateway_core
      - local_outputs
      - connectivity
      - power_and_security

nodes:
  - id: WearableSensor
    label: Wearable Sensor
    subtitle: BLE
    group: wearable_inputs
  - id: BLEGateway
    label: BLE Gateway
    subtitle: ESP32-S3
    group: gateway_core
  - id: LocalDisplay
    label: Local OLED Display
    group: local_outputs
  - id: LTEModem
    label: LTE-M Modem
    group: connectivity
  - id: CloudBroker
    label: Cloud MQTT Broker
    group: connectivity
  - id: PowerBlock
    label: PMIC + LiPo Battery
    group: power_and_security
  - id: USBC
    label: USB-C Service Port
    group: gateway_core
  - id: SecureElement
    label: ATECC608 Secure Element
    group: power_and_security

edges:
  - source: WearableSensor
    target: BLEGateway
    label: BLE
  - source: BLEGateway
    target: LocalDisplay
    label: status
  - source: BLEGateway
    target: LTEModem
    label: uplink
  - source: LTEModem
    target: CloudBroker
    label: mqtt
  - source: BLEGateway
    target: PowerBlock
    label: power
  - source: USBC
    target: BLEGateway
    label: service
  - source: BLEGateway
    target: SecureElement
    label: security

export_metadata:
  master_format: drawio
  derived_formats:
    - svg
    - pptx
    - png
  source_of_truth: editable_drawio_master
```

## Draw.io Master Construction Plan

- Build one-page editable draw.io diagram named `system_overview`.
- Lay out the flow left-to-right to match the source Mermaid direction.
- Place `WearableSensor` on the left, `BLEGateway` centered, and downstream devices to the right.
- Keep `LocalDisplay`, `LTEModem`, `PowerBlock`, `USBC`, and `SecureElement` visually grouped around the gateway.
- Place `CloudBroker` furthest right as the external cloud endpoint.
- Use labeled connectors to preserve all required edge directions exactly:
  - `WearableSensor -> BLEGateway`
  - `BLEGateway -> LocalDisplay`
  - `BLEGateway -> LTEModem`
  - `LTEModem -> CloudBroker`
  - `BLEGateway -> PowerBlock`
  - `USBC -> BLEGateway`
  - `BLEGateway -> SecureElement`
- Make the file editable, with nodes as native diagram objects rather than flattened artwork.

## Derived Artifact Export Chain

1. Author the editable `.drawio` master.
2. Export SVG directly from draw.io. Do not replace this with a hand-written SVG.
3. Insert the SVG into a PPTX slide as the visual payload.
4. Export a PNG preview from the PPTX.
5. Keep the draw.io master as the source of truth; SVG, PPTX, and PNG remain derived.

## Boundary and Validation Checks

Planned validation:
- Confirm `diagram_input.yaml` includes all required nodes and all required edges.
- Confirm the draw.io master has exactly one page named `system_overview`.
- Confirm the SVG export originates from draw.io.
- Confirm the PPTX contains the SVG on a slide.
- Confirm a PNG preview is produced from the PPTX.
- Confirm validation notes mention both successful existence checks and any local-tool blockers.

Boundary checks:
- Public synthetic fixture only.
- No REF packets.
- No private workspace material.
- No raw run evidence in workflow canon.
- Preserve device IDs and directed edge semantics exactly.

## Known Blockers / Limits

- Missing Mermaid source is a blocker if the source description cannot be recovered.
- Missing draw.io CLI is a blocker for native SVG export.
- PowerPoint COM or path issues are blockers for PPTX insertion and PNG preview export.
- I have not actually run validation here, so the above is a planned validation set, not completed evidence.