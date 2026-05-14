```yaml
workflow_id: device_system_diagram_generation
fixture_id: public_compact_wearable_gateway_v1
public_safe: true

pages:
  - id: system_overview
    title: system_overview
    layout: left_to_right
    grouping_hints:
      - wearable_input: [WearableSensor]
      - core_gateway: [BLEGateway, SecureElement]
      - local_hmi: [LocalDisplay]
      - uplink: [LTEModem, CloudBroker]
      - power_service: [PowerBlock, USBC]

nodes:
  - id: WearableSensor
    label: "Wearable Sensor\nBLE"
  - id: BLEGateway
    label: "BLE Gateway\nESP32-S3"
  - id: LocalDisplay
    label: "Local OLED Display"
  - id: LTEModem
    label: "LTE-M Modem"
  - id: CloudBroker
    label: "Cloud MQTT Broker"
  - id: PowerBlock
    label: "PMIC + LiPo Battery"
  - id: USBC
    label: "USB-C Service Port"
  - id: SecureElement
    label: "ATECC608 Secure Element"

edges:
  - id: e1
    from: WearableSensor
    to: BLEGateway
  - id: e2
    from: BLEGateway
    to: LocalDisplay
  - id: e3
    from: BLEGateway
    to: LTEModem
  - id: e4
    from: LTEModem
    to: CloudBroker
  - id: e5
    from: BLEGateway
    to: PowerBlock
  - id: e6
    from: USBC
    to: BLEGateway
  - id: e7
    from: BLEGateway
    to: SecureElement

export_metadata:
  source_of_truth: editable_drawio_master
  derived_artifacts:
    - svg
    - pptx
    - png
  page_name: system_overview
  validation_targets:
    - diagram_input.yaml exists
    - drawio master exists
    - svg export exists
    - pptx export exists
    - png preview exists
```

Draw.io master construction plan:
- Build one-page editable `.drawio` file with the page named `system_overview`.
- Place `BLEGateway` as the central hub.
- Position `WearableSensor` and `USBC` on the left as ingress sources.
- Place `LocalDisplay`, `LTEModem`, `PowerBlock`, and `SecureElement` around the gateway to reflect functional adjacency.
- Route `LTEModem -> CloudBroker` toward the rightmost external/cloud endpoint.
- Keep node IDs stable and preserve the required directions exactly:
  - `WearableSensor -> BLEGateway`
  - `BLEGateway -> LocalDisplay`
  - `BLEGateway -> LTEModem`
  - `LTEModem -> CloudBroker`
  - `BLEGateway -> PowerBlock`
  - `USBC -> BLEGateway`
  - `BLEGateway -> SecureElement`

Derived artifact export chain:
1. `diagram_input.yaml` is the structured input contract.
2. Editable `.drawio` master is the source of truth.
3. Export SVG from draw.io directly, not via manual redraw.
4. Embed the exported SVG into a PPTX slide.
5. Export PNG preview from the PPTX.
6. Keep all derived outputs traceable back to the draw.io master.

Boundary and validation checks:
- Public-safe fixture only; no REF packets, private workspaces, secrets, or raw run evidence.
- Preserve all required node IDs and edge directions exactly as provided.
- Validate presence of all required nodes and edges in the structured input.
- Validate the draw.io page name is exactly `system_overview`.
- Validate the export chain produces SVG, PPTX, and PNG in that order.

Known blockers/limits:
- I am not claiming execution or artifact creation here.
- Planned validation is only specified, not completed.
- Missing Mermaid source would block generation in a real run.
- Missing draw.io CLI would block SVG export from the editable master.
- PowerPoint COM or path issues would block PPTX/PNG export.
- This response provides the candidate structure only, not completed runtime evidence.