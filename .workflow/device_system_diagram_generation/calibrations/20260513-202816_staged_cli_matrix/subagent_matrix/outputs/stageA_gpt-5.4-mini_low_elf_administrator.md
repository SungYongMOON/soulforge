**Structured Diagram Input YAML**

```yaml
workflow_id: device_system_diagram_generation
fixture_id: public_compact_wearable_gateway_v1
public_safe: true
pages:
  - id: system_overview
    name: system_overview
nodes:
  - id: WearableSensor
    label: "Wearable Sensor\nBLE"
    group: input
  - id: BLEGateway
    label: "BLE Gateway\nESP32-S3"
    group: core
  - id: LocalDisplay
    label: "Local OLED Display"
    group: output
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
  - source: WearableSensor
    target: BLEGateway
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
labels:
  title: Compact Wearable Gateway System
  subtitle: Editable draw.io master is source of truth
grouping_hints:
  - core: BLEGateway
  - input: WearableSensor
  - output: LocalDisplay
  - uplink: LTEModem
  - cloud: CloudBroker
  - power: PowerBlock
  - service: USBC
  - security: SecureElement
export_metadata:
  master_format: drawio
  master_page: system_overview
  derived_formats: [svg, pptx, png]
  source_of_truth: editable_drawio_master
```

**Draw.io Master Construction Plan**

1. Create one-page editable draw.io master named `system_overview`.
2. Lay out `BLEGateway` as the central hub.
3. Place `WearableSensor` to the left feeding into `BLEGateway`.
4. Place `LocalDisplay`, `LTEModem`, `PowerBlock`, `SecureElement` around the gateway as downstream/support nodes.
5. Place `USBC` as a service ingress feeding into `BLEGateway`.
6. Place `CloudBroker` to the far right as the LTE-M destination.
7. Preserve all node IDs and edge directions exactly as specified.
8. Keep the draw.io file editable, with nodes and connectors rather than flattened artwork.

**Derived Artifact Export Chain**

1. `diagram_input.yaml` feeds the draw.io master construction.
2. Editable `.drawio` master is the canonical source.
3. Export SVG from draw.io, not by hand.
4. Embed the exported SVG into a PPTX slide.
5. Export PNG preview from the PPTX.

**Boundary and Validation Checks**

Planned validation:
- Confirm required nodes exist: `WearableSensor`, `BLEGateway`, `LocalDisplay`, `LTEModem`, `CloudBroker`, `PowerBlock`, `USBC`, `SecureElement`.
- Confirm required edges exist and preserve direction:
  - `WearableSensor->BLEGateway`
  - `BLEGateway->LocalDisplay`
  - `BLEGateway->LTEModem`
  - `LTEModem->CloudBroker`
  - `BLEGateway->PowerBlock`
  - `USBC->BLEGateway`
  - `BLEGateway->SecureElement`
- Confirm the draw.io master has exactly one page named `system_overview`.
- Confirm SVG, PPTX, and PNG exist as derived outputs.
- Confirm validation notes explicitly separate planned checks from completed checks.

Not completed here:
- No file generation was performed.
- No export validation was executed.

**Known Blockers / Limits**

- Missing Mermaid source is a blocker if the workflow expects Mermaid-to-diagram conversion inputs beyond the provided Markdown snippet.
- Missing draw.io CLI is a blocker for export automation.
- PowerPoint COM or path problems are blockers for PPTX embedding/export.
- This candidate response does not claim artifact creation, file existence, or tool-based validation.
- Public-safe boundary only: no REF packets, private workspaces, secrets, or raw run evidence are included.