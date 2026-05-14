**Diagram Input**
```yaml
workflow_id: device_system_diagram_generation
fixture_id: public_compact_wearable_gateway_v1
public_safe: true

pages:
  - id: system_overview
    name: system_overview
    layout: left_to_right
    grouping_hints:
      - wearable_edge_inputs
      - gateway_core
      - connectivity_and_cloud
      - power_and_security

nodes:
  WearableSensor:
    label: "Wearable Sensor\nBLE"
    group: wearable_edge_inputs
  BLEGateway:
    label: "BLE Gateway\nESP32-S3"
    group: gateway_core
  LocalDisplay:
    label: "Local OLED Display"
    group: gateway_core
  LTEModem:
    label: "LTE-M Modem"
    group: connectivity_and_cloud
  CloudBroker:
    label: "Cloud MQTT Broker"
    group: connectivity_and_cloud
  PowerBlock:
    label: "PMIC + LiPo Battery"
    group: power_and_security
  USBC:
    label: "USB-C Service Port"
    group: gateway_core
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

export_metadata:
  source_of_truth: editable_drawio_master
  derived_outputs:
    - svg
    - pptx
    - png
  required_page_name: system_overview
```

**Draw.io Master Plan**
- Build one editable `.drawio` file as the canonical master.
- Create a single page named `system_overview`.
- Place the nodes as separate editable shapes, not flattened artwork.
- Keep the directionality consistent with the source edges:
  - `WearableSensor -> BLEGateway`
  - `BLEGateway -> LocalDisplay`
  - `BLEGateway -> LTEModem`
  - `LTEModem -> CloudBroker`
  - `BLEGateway -> PowerBlock`
  - `USBC -> BLEGateway`
  - `BLEGateway -> SecureElement`
- Use simple grouping to clarify structure:
  - wearable input
  - gateway core
  - connectivity/cloud
  - power/security
- Preserve node IDs exactly as provided so downstream validation can match them.

**Derived Artifact Export Chain**
1. Editable `.drawio` master
2. SVG export produced from draw.io
3. PPTX slide containing the SVG
4. PNG preview exported from the PPTX

This keeps the draw.io master as source of truth and treats SVG, PPTX, and PNG as derived artifacts only.

**Boundary and Validation Checks**
- Public-safe fixture only.
- No REF packets, private workspaces, secrets, or project raw input.
- Validation to plan for:
  - confirm `diagram_input.yaml` exists and includes all required nodes and edges
  - confirm `.drawio` contains exactly one page named `system_overview`
  - confirm SVG export comes from draw.io, not a hand-written replacement
  - confirm PPTX contains the SVG content
  - confirm PNG preview exists and matches the PPTX export path
  - confirm all required nodes are present:
    - `WearableSensor`
    - `BLEGateway`
    - `LocalDisplay`
    - `LTEModem`
    - `CloudBroker`
    - `PowerBlock`
    - `USBC`
    - `SecureElement`
  - confirm all required edges are preserved with direction intact

**Known Blockers / Limits**
- Missing Mermaid source is a blocker if the workflow requires it for generation.
- Missing draw.io CLI is a blocker for creating the SVG export from the master.
- PowerPoint COM or path issues are blockers for PPTX generation or embedding the SVG.
- I have not completed tool-backed validation here; the checks above are planned validation criteria, not executed results.