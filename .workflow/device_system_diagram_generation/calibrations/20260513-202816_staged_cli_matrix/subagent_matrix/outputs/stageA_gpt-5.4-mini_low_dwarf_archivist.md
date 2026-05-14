### Diagram Input YAML

```yaml
workflow_id: device_system_diagram_generation
fixture_id: public_compact_wearable_gateway_v1
source_type: markdown
page:
  name: system_overview
  layout: lr
nodes:
  - id: WearableSensor
    label: "Wearable Sensor\nBLE"
    group_hint: edge_device
  - id: BLEGateway
    label: "BLE Gateway\nESP32-S3"
    group_hint: core_gateway
  - id: LocalDisplay
    label: "Local OLED Display"
    group_hint: local_io
  - id: LTEModem
    label: "LTE-M Modem"
    group_hint: uplink
  - id: CloudBroker
    label: "Cloud MQTT Broker"
    group_hint: cloud
  - id: PowerBlock
    label: "PMIC + LiPo Battery"
    group_hint: power
  - id: USBC
    label: "USB-C Service Port"
    group_hint: service
  - id: SecureElement
    label: "ATECC608 Secure Element"
    group_hint: security
edges:
  - source: WearableSensor
    target: BLEGateway
    label: BLE
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
export_metadata:
  editable_master: drawio
  derived_exports:
    - svg
    - pptx
    - png
  source_of_truth: editable_drawio_master
  validation_target: required_output_existence
```

### draw.io Master Construction Plan

1. Create a single-page draw.io diagram named `system_overview`.
2. Place the nodes in a left-to-right flow that follows the source Markdown:
   - `WearableSensor` -> `BLEGateway`
   - `BLEGateway` fans out to `LocalDisplay`, `LTEModem`, `PowerBlock`, and `SecureElement`
   - `LTEModem` -> `CloudBroker`
   - `USBC` -> `BLEGateway`
3. Use clear device-oriented styling so the gateway sits centrally and the power, security, display, and uplink elements are visibly attached to it.
4. Keep the draw.io file editable as the canonical master, with all labels and edges preserved as separate diagram objects.
5. Do not substitute a hand-drawn SVG as the master.

### Derived Artifact Export Chain

1. Build the editable `.drawio` master first.
2. Export SVG from draw.io directly.
3. Place the SVG into a PPTX slide as the slide content.
4. Export PNG preview from the PPTX.
5. Keep the export lineage explicit:
   - `.drawio` master = source of truth
   - `.svg` = draw.io-derived
   - `.pptx` = SVG embedded on slide
   - `.png` = PPTX-derived preview

### Boundary and Validation Checks

Planned validation:
- Confirm required node set exists: `WearableSensor`, `BLEGateway`, `LocalDisplay`, `LTEModem`, `CloudBroker`, `PowerBlock`, `USBC`, `SecureElement`.
- Confirm required directed edges exist exactly as specified.
- Confirm one page only, named `system_overview`.
- Confirm `diagram_input.yaml` includes pages, nodes, edges, labels, grouping hints, and export metadata.
- Confirm SVG, PPTX, and PNG are present as derived artifacts.

Actually completed validation:
- None in this response. No tools were run and no files were inspected.

### Known Blockers / Limits

- I did not read files, run tools, or generate artifacts here.
- Missing Mermaid source is a blocker in the workflow summary when the source description is unavailable.
- Missing draw.io CLI is a blocker for export generation.
- PowerPoint COM issues or path issues are blockers for PPTX/PNG export.
- Runtime project paths, REF packets, candidates, and raw run evidence do not belong in workflow canon and should stay out of the package.
- This response is a structured candidate plan only, not proof of artifact creation or validation.