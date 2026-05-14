**Diagram Input YAML**
```yaml
workflow_id: device_system_diagram_generation
fixture_id: public_compact_wearable_gateway_v1
public_safe: true

pages:
  - name: system_overview
    purpose: compact wearable gateway architecture overview
    grouping_hints:
      - WearableSensor and USBC are external/service ingress sources
      - BLEGateway is the central controller
      - LocalDisplay, LTEModem, PowerBlock, and SecureElement are attached subsystems
      - CloudBroker is the remote destination

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
  validation_targets:
    - required node presence
    - required edge direction preservation
    - one-page draw.io master named system_overview
    - derived artifact existence
```

**Draw.io Master Construction Plan**
1. Create a single-page editable `.drawio` master named `system_overview`.
2. Place `BLEGateway` as the central hub.
3. Position `WearableSensor` and `USBC` on the left as ingress/service inputs.
4. Place `LocalDisplay`, `LTEModem`, `PowerBlock`, and `SecureElement` around `BLEGateway` as attached subsystems.
5. Place `CloudBroker` to the right as the remote endpoint.
6. Preserve all node IDs exactly as given and keep edge directions unchanged.
7. Use editable shapes and connectors only, so the draw.io file remains the source of truth.

**Derived Artifact Export Chain**
1. Author the `.drawio` master first.
2. Export SVG directly from draw.io, not by hand-writing SVG.
3. Insert the exported SVG into a PPTX slide.
4. Export a PNG preview from the PPTX.
5. Keep the draw.io master authoritative if any derived artifact differs.

**Boundary and Validation Checks**
- Public-safe fixture only; no REF packets, private workspaces, secrets, or raw run evidence.
- Validate that all required nodes exist:
  - `WearableSensor`, `BLEGateway`, `LocalDisplay`, `LTEModem`, `CloudBroker`, `PowerBlock`, `USBC`, `SecureElement`
- Validate that all required directed edges exist:
  - `WearableSensor->BLEGateway`
  - `BLEGateway->LocalDisplay`
  - `BLEGateway->LTEModem`
  - `LTEModem->CloudBroker`
  - `BLEGateway->PowerBlock`
  - `USBC->BLEGateway`
  - `BLEGateway->SecureElement`
- Validate that the draw.io master contains exactly one page named `system_overview`.
- Planned validation only: confirm output existence and edge direction integrity.
- Not claimed as completed here: file creation, export execution, or artifact verification.

**Known Blockers / Limits**
- Missing Mermaid source is a blocker if the pipeline expects it as an intermediate input.
- Missing draw.io CLI is a blocker for automated SVG export.
- PowerPoint COM or path issues are blockers for PPTX insertion/export to PNG.
- This response does not execute tools or generate artifacts; it only specifies the expected package structure and validation intent.
