**diagram_input.yaml**
```yaml
workflow_id: device_system_diagram_generation
fixture_id: public_compact_wearable_gateway_v1
page:
  id: system_overview
  name: system_overview
layout:
  direction: LR
  style_hint: compact_device_system
nodes:
  - id: WearableSensor
    label: "Wearable Sensor\nBLE"
    role: endpoint
    group: edge_devices
  - id: BLEGateway
    label: "BLE Gateway\nESP32-S3"
    role: central_gateway
    group: gateway_core
  - id: LocalDisplay
    label: "Local OLED Display"
    role: local_ui
    group: local_interfaces
  - id: LTEModem
    label: "LTE-M Modem"
    role: backhaul
    group: connectivity
  - id: CloudBroker
    label: "Cloud MQTT Broker"
    role: cloud_service
    group: cloud
  - id: PowerBlock
    label: "PMIC + LiPo Battery"
    role: power
    group: power
  - id: USBC
    label: "USB-C Service Port"
    role: service_interface
    group: local_interfaces
  - id: SecureElement
    label: "ATECC608 Secure Element"
    role: security
    group: security
edges:
  - id: WearableSensor->BLEGateway
    source: WearableSensor
    target: BLEGateway
    label: ""
  - id: BLEGateway->LocalDisplay
    source: BLEGateway
    target: LocalDisplay
    label: ""
  - id: BLEGateway->LTEModem
    source: BLEGateway
    target: LTEModem
    label: ""
  - id: LTEModem->CloudBroker
    source: LTEModem
    target: CloudBroker
    label: ""
  - id: BLEGateway->PowerBlock
    source: BLEGateway
    target: PowerBlock
    label: ""
  - id: USBC->BLEGateway
    source: USBC
    target: BLEGateway
    label: ""
  - id: BLEGateway->SecureElement
    source: BLEGateway
    target: SecureElement
    label: ""
grouping_hints:
  - group: edge_devices
    members: [WearableSensor]
  - group: gateway_core
    members: [BLEGateway]
  - group: local_interfaces
    members: [LocalDisplay, USBC]
  - group: connectivity
    members: [LTEModem]
  - group: cloud
    members: [CloudBroker]
  - group: power
    members: [PowerBlock]
  - group: security
    members: [SecureElement]
export_metadata:
  source_of_truth: drawio_master
  required_outputs:
    - drawio
    - svg
    - pptx
    - png
  svg_policy: "Export from draw.io only"
  pptx_policy: "Place exported SVG on slide"
  png_policy: "Export from PPTX preview/render"
```

**draw.io Master Construction Plan**

Create one editable `.drawio` file with a single page named `system_overview`. Use the YAML above as the canonical input for node IDs, labels, and edge directions.

Recommended placement for a left-to-right layout:
- Left: `WearableSensor`, `USBC`
- Center: `BLEGateway`
- Right-upper: `LocalDisplay`, `LTEModem`, `SecureElement`
- Far right: `CloudBroker`
- Lower-right or lower-center: `PowerBlock`

Construction rules:
- Preserve exact node IDs: `WearableSensor`, `BLEGateway`, `LocalDisplay`, `LTEModem`, `CloudBroker`, `PowerBlock`, `USBC`, `SecureElement`.
- Preserve exact edge directions from source to target.
- Use editable text labels matching the Mermaid content.
- Keep connector routing simple and orthogonal where possible.
- Treat `BLEGateway` as the visual hub.
- Keep the page name exactly `system_overview`.

**Derived Artifact Export Chain**

Planned chain only, not claimed as completed:
1. Build `diagram_input.yaml`.
2. Construct editable `.drawio` master from the YAML/Mermaid structure.
3. Export SVG from the `.drawio` master using draw.io export capability.
4. Create a PPTX with one slide containing the exported SVG.
5. Export or render a PNG preview from the PPTX.
6. Write validation notes covering presence checks and any tool-related blockers.

This preserves the required ownership rule:
- `.drawio` is the source of truth.
- `SVG`, `PPTX`, and `PNG` are derived artifacts only.

**Boundary And Validation Checks**

Boundary checks:
- Public synthetic fixture only.
- No REF packets.
- No private workspace or runtime project paths.
- No secrets or hidden inputs.
- No raw run evidence included in the workflow canon response.

Planned validation:
- Confirm all required nodes exist in YAML and draw.io page.
- Confirm all required edges exist with matching directions:
  - `WearableSensor->BLEGateway`
  - `BLEGateway->LocalDisplay`
  - `BLEGateway->LTEModem`
  - `LTEModem->CloudBroker`
  - `BLEGateway->PowerBlock`
  - `USBC->BLEGateway`
  - `BLEGateway->SecureElement`
- Confirm `.drawio` contains exactly one page named `system_overview`.
- Confirm SVG is exported from draw.io, not manually recreated.
- Confirm PPTX contains the SVG.
- Confirm PNG is derived from the PPTX.
- Record any blocked steps separately from successful validations.

Actual completed validation:
- Only prompt-level consistency review is possible here.
- Artifact existence, tool execution, file integrity, and export success were not validated in reality.

**Known Blockers / Limits**

Stop conditions or blockers:
- Missing Mermaid source would block faithful reconstruction, but this fixture includes Mermaid.
- Missing draw.io CLI or unavailable draw.io export path blocks SVG generation.
- PowerPoint COM automation issues or missing PowerPoint block PPTX placement and PNG export.
- Broken local file paths or unavailable export dependencies block downstream artifact creation.
- Since no files or tools are used in this response, no artifact generation or execution-side validation is claimed.