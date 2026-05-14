**Diagram Input YAML**
```yaml
workflow_id: device_system_diagram_generation
fixture_id: public_compact_wearable_gateway_v1
public_safe: true
master_source: system_overview.drawio
pages:
  - name: system_overview
    type: device_system
    grouping_hints:
      - core_gateway
      - edge_peripherals
      - power_and_security
      - external_network
nodes:
  - id: WearableSensor
    label: "Wearable Sensor\nBLE"
    group: edge_peripherals
  - id: BLEGateway
    label: "BLE Gateway\nESP32-S3"
    group: core_gateway
  - id: LocalDisplay
    label: "Local OLED Display"
    group: edge_peripherals
  - id: LTEModem
    label: "LTE-M Modem"
    group: external_network
  - id: CloudBroker
    label: "Cloud MQTT Broker"
    group: external_network
  - id: PowerBlock
    label: "PMIC + LiPo Battery"
    group: power_and_security
  - id: USBC
    label: "USB-C Service Port"
    group: edge_peripherals
  - id: SecureElement
    label: "ATECC608 Secure Element"
    group: power_and_security
edges:
  - from: WearableSensor
    to: BLEGateway
    label: BLE
  - from: BLEGateway
    to: LocalDisplay
    label: UI
  - from: BLEGateway
    to: LTEModem
    label: WAN
  - from: LTEModem
    to: CloudBroker
    label: MQTT
  - from: BLEGateway
    to: PowerBlock
    label: Power
  - from: USBC
    to: BLEGateway
    label: Service
  - from: BLEGateway
    to: SecureElement
    label: Security
export_metadata:
  source_of_truth: drawio
  derived_exports:
    - svg
    - pptx
    - png
  validation_focus:
    - required_output_existence
    - edge_direction_integrity
    - page_name_system_overview
```

**Draw.io Master Construction Plan**
- Create one editable `.drawio` master as the authoritative artifact.
- Use a single page named `system_overview`.
- Place the required nodes exactly with these IDs and labels:
  - `WearableSensor`
  - `BLEGateway`
  - `LocalDisplay`
  - `LTEModem`
  - `CloudBroker`
  - `PowerBlock`
  - `USBC`
  - `SecureElement`
- Preserve edge directions exactly:
  - `WearableSensor -> BLEGateway`
  - `BLEGateway -> LocalDisplay`
  - `BLEGateway -> LTEModem`
  - `LTEModem -> CloudBroker`
  - `BLEGateway -> PowerBlock`
  - `USBC -> BLEGateway`
  - `BLEGateway -> SecureElement`
- Use grouping hints only as layout guidance, not as semantic changes.
- Keep the draw.io file editable; do not substitute SVG or raster as the master.

**Derived Artifact Export Chain**
- `diagram_input.yaml` is the structured input and validation reference.
- `.drawio` is the source of truth and edit target.
- Export SVG from draw.io, not by hand.
- Insert the SVG into a PPTX slide.
- Export PNG preview from the PPTX.
- Keep derived artifacts traceable back to the same draw.io master.

**Boundary and Validation Checks**
- Public fixture only; no REF packets, private workspaces, secrets, or raw run evidence.
- Required-node coverage check:
  - confirm all 8 node IDs are present.
- Required-edge coverage check:
  - confirm all 7 directed edges are present and not reversed.
- Page check:
  - confirm exactly one page named `system_overview`.
- Artifact existence check:
  - confirm `diagram_input.yaml`, `.drawio`, `.svg`, `.pptx`, and `.png` exist in the package.
- Planned validation only:
  - this response does not claim actual file creation or export verification.

**Known Blockers / Limits**
- Missing Mermaid source is a blocker if the workflow expects it as an input bridge.
- Missing draw.io CLI is a blocker for automated SVG export.
- PowerPoint COM or path issues are blockers for PPTX generation and PNG preview export.
- I did not run tools, inspect files, or complete validation in this response.
- No artifact was generated here; this is a candidate package description only.