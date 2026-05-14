**Diagram Input YAML**

```yaml
workflow_id: device_system_diagram_generation
fixture_id: public_compact_wearable_gateway_v1
page:
  name: system_overview
  layout: left_to_right
  grouping_hints:
    - wearable_edge
    - gateway_core
    - power_and_security
    - cloud_edge
nodes:
  - id: WearableSensor
    label: "Wearable Sensor\nBLE"
    group: wearable_edge
  - id: BLEGateway
    label: "BLE Gateway\nESP32-S3"
    group: gateway_core
  - id: LocalDisplay
    label: "Local OLED Display"
    group: gateway_core
  - id: LTEModem
    label: "LTE-M Modem"
    group: cloud_edge
  - id: CloudBroker
    label: "Cloud MQTT Broker"
    group: cloud_edge
  - id: PowerBlock
    label: "PMIC + LiPo Battery"
    group: power_and_security
  - id: USBC
    label: "USB-C Service Port"
    group: gateway_core
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
  source_of_truth: editable_drawio_master
  derived_formats:
    - svg
    - pptx
    - png
  page_name: system_overview
```

**Draw.io Master Construction Plan**

- Create one-page editable draw.io master named `system_overview`.
- Place `WearableSensor` on the left as the external input source.
- Place `BLEGateway` centrally as the hub node.
- Place `LocalDisplay`, `LTEModem`, `PowerBlock`, `USBC`, and `SecureElement` around the gateway by function.
- Place `CloudBroker` on the far right as the external cloud endpoint.
- Preserve all directed edges exactly as specified:
  - `WearableSensor -> BLEGateway`
  - `BLEGateway -> LocalDisplay`
  - `BLEGateway -> LTEModem`
  - `LTEModem -> CloudBroker`
  - `BLEGateway -> PowerBlock`
  - `USBC -> BLEGateway`
  - `BLEGateway -> SecureElement`
- Keep the draw.io file editable and treat it as the source of truth.
- Use the Markdown/Mermaid description only as input guidance, not as the final artifact.

**Derived Artifact Export Chain**

1. Build editable `.drawio` master.
2. Export SVG from draw.io directly.
3. Insert the exported SVG into a PPTX slide.
4. Export PNG preview from the PPTX.
5. Package `diagram_input.yaml`, `.drawio`, SVG, PPTX, PNG, and validation notes together.

**Boundary and Validation Checks**

Planned validation:
- Confirm `diagram_input.yaml` exists and includes pages, nodes, edges, labels, grouping hints, and export metadata.
- Confirm the draw.io master has exactly one page named `system_overview`.
- Confirm all required nodes are present:
  - `WearableSensor`, `BLEGateway`, `LocalDisplay`, `LTEModem`, `CloudBroker`, `PowerBlock`, `USBC`, `SecureElement`
- Confirm all required directed edges are present with correct direction.
- Confirm SVG, PPTX, and PNG are exported artifacts, not hand-written substitutes.
- Confirm validation notes explicitly mention required outputs and local-tool blockers.

Not completed here:
- No file inspection was performed.
- No diagram was generated.
- No export or validation was executed.

**Known Blockers / Limits**

- Missing Mermaid source is a blocker or stop condition.
- Missing draw.io CLI is a blocker or stop condition.
- PowerPoint COM or path problems are blockers or stop conditions.
- Runtime project paths, REF packets, candidates, and raw run evidence do not belong in workflow canon.
- This response is a planning/candidate artifact only; it does not claim completed generation or validation.