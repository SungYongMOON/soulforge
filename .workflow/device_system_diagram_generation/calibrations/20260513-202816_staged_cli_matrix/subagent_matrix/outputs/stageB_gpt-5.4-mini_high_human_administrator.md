**Structured Diagram Input**
```yaml
workflow_id: device_system_diagram_generation
fixture_id: public_compact_wearable_gateway_v1
source_of_truth: drawio
pages:
  - page_id: system_overview
    title: system_overview
    layout: left_to_right
    grouping_hints:
      - group_id: gateway_core
        label: Gateway Core
        members: [BLEGateway, SecureElement]
      - group_id: peripherals
        label: Peripherals
        members: [WearableSensor, LocalDisplay, USBC]
      - group_id: connectivity
        label: Connectivity
        members: [LTEModem, CloudBroker]
      - group_id: power
        label: Power
        members: [PowerBlock]
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
  master_file: "<fixture>.drawio"
  derived_files:
    - "<fixture>.svg"
    - "<fixture>.pptx"
    - "<fixture>.png"
  page_name: system_overview
```

**Draw.io Master Construction Plan**
- Create one editable `.drawio` diagram with a single page named `system_overview`.
- Place `BLEGateway` as the central hub.
- Position inputs on the left: `WearableSensor`, `USBC`.
- Position outputs on the right: `LocalDisplay`, `LTEModem`, `CloudBroker`, `PowerBlock`, `SecureElement`.
- Preserve the exact node IDs above so the diagram remains machine-addressable.
- Use visible grouping or swimlane-style hints only if they do not obscure the node IDs.
- Keep labels readable and match the Mermaid intent:
  - `Wearable Sensor\nBLE`
  - `BLE Gateway\nESP32-S3`
  - `Local OLED Display`
  - `LTE-M Modem`
  - `Cloud MQTT Broker`
  - `PMIC + LiPo Battery`
  - `USB-C Service Port`
  - `ATECC608 Secure Element`

**Derived Artifact Export Chain**
1. Authoritative master: `.drawio`
2. Export from draw.io to `.svg`
3. Embed the SVG into a PowerPoint slide to produce `.pptx`
4. Render or export the PPTX to `.png` preview
5. Record export metadata and file existence checks in validation notes

**Boundary and Validation Checks**
- Confirm the package is built from the Markdown description only.
- Keep the draw.io file as the source of truth; do not replace it with hand-drawn SVG.
- Verify all required nodes exist:
  - `WearableSensor`, `BLEGateway`, `LocalDisplay`, `LTEModem`, `CloudBroker`, `PowerBlock`, `USBC`, `SecureElement`
- Verify all required directed edges exist exactly as specified:
  - `WearableSensor->BLEGateway`
  - `BLEGateway->LocalDisplay`
  - `BLEGateway->LTEModem`
  - `LTEModem->CloudBroker`
  - `BLEGateway->PowerBlock`
  - `USBC->BLEGateway`
  - `BLEGateway->SecureElement`
- Planned validation only in this response:
  - file existence for `.drawio`, `.svg`, `.pptx`, `.png`
  - page name equals `system_overview`
  - SVG came from draw.io export
  - PPTX contains the SVG
  - PNG was exported from the PPTX
- Not completed here:
  - no artifact generation
  - no local execution
  - no file-system validation

**Known Blockers / Limits**
- Missing Mermaid source is a blocker for source reconstruction if the diagram input cannot be derived from the provided Markdown.
- Missing draw.io CLI is a stop condition for SVG export.
- PowerPoint COM or path issues are stop conditions for PPTX embedding/export and PNG preview generation.
- Runtime project paths, REF packets, candidates, and raw run evidence stay out of workflow canon.
- This response is a structured candidate plan only; it does not claim completed validation or generated files.