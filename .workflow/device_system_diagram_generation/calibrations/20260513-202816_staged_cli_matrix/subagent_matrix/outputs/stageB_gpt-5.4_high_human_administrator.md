**Structured Input**
```yaml
diagram_input:
  workflow_id: device_system_diagram_generation
  fixture_id: public_compact_wearable_gateway_v1
  source_of_truth: drawio
  pages:
    - id: system_overview
      name: system_overview
      layout: left_to_right
      grouping_hints:
        - id: edge_devices
          label: Edge Devices
          members: [WearableSensor, USBC]
        - id: gateway_core
          label: Gateway Core
          members: [BLEGateway, LocalDisplay, PowerBlock, SecureElement]
        - id: uplink
          label: Uplink
          members: [LTEModem, CloudBroker]
      nodes:
        - id: WearableSensor
          label: "Wearable Sensor\nBLE"
          kind: device
        - id: BLEGateway
          label: "BLE Gateway\nESP32-S3"
          kind: gateway
        - id: LocalDisplay
          label: "Local OLED Display"
          kind: peripheral
        - id: LTEModem
          label: "LTE-M Modem"
          kind: modem
        - id: CloudBroker
          label: "Cloud MQTT Broker"
          kind: cloud
        - id: PowerBlock
          label: "PMIC + LiPo Battery"
          kind: power
        - id: USBC
          label: "USB-C Service Port"
          kind: interface
        - id: SecureElement
          label: "ATECC608 Secure Element"
          kind: security
      edges:
        - id: WearableSensor->BLEGateway
          source: WearableSensor
          target: BLEGateway
        - id: BLEGateway->LocalDisplay
          source: BLEGateway
          target: LocalDisplay
        - id: BLEGateway->LTEModem
          source: BLEGateway
          target: LTEModem
        - id: LTEModem->CloudBroker
          source: LTEModem
          target: CloudBroker
        - id: BLEGateway->PowerBlock
          source: BLEGateway
          target: PowerBlock
        - id: USBC->BLEGateway
          source: USBC
          target: BLEGateway
        - id: BLEGateway->SecureElement
          source: BLEGateway
          target: SecureElement
  export_metadata:
    required_outputs:
      - diagram_input.yaml
      - editable.drawio
      - system_overview.svg
      - system_overview.pptx
      - system_overview.png
    svg_must_be_exported_from_drawio: true
    pptx_contains_svg: true
    png_exported_from_pptx: true
```

**Draw.io Master Construction Plan**

Create one editable `.drawio` master with a single page named `system_overview`. Use the YAML above as the canonical input for page name, node IDs, labels, and directed edges.

Recommended visual arrangement:
- Left: `WearableSensor`, `USBC`
- Center: `BLEGateway`
- Around gateway: `LocalDisplay`, `PowerBlock`, `SecureElement`
- Right: `LTEModem`
- Far right: `CloudBroker`

Construction rules:
- Keep device IDs stable in element metadata or labels so validation can map back to required nodes.
- Preserve edge directions exactly as listed.
- Treat the `.drawio` file as the source of truth; do not hand-edit SVG as a substitute.
- Keep layout simple and editable rather than over-styled.

**Derived Artifact Export Chain**

Planned chain only, not completed here:
1. Generate `diagram_input.yaml`.
2. Build editable `.drawio` master with page `system_overview`.
3. Export SVG from the `.drawio` master using draw.io export tooling.
4. Create a PPTX slide that places the exported SVG on the slide.
5. Export a PNG preview from the PPTX.

Expected validation notes should distinguish:
- Output existence checks for YAML, `.drawio`, SVG, PPTX, PNG.
- Provenance checks:
  - SVG came from draw.io export.
  - PPTX contains the SVG.
  - PNG came from PPTX export.

**Boundary And Validation Checks**

Boundary checks:
- Public synthetic fixture only.
- No REF packets, private workspaces, secrets, runtime candidate paths, or raw run evidence in workflow canon output.
- No canonization of local tool logs, temporary export traces, or environment-specific paths.

Planned validation:
- Confirm all required nodes exist:
  `WearableSensor`, `BLEGateway`, `LocalDisplay`, `LTEModem`, `CloudBroker`, `PowerBlock`, `USBC`, `SecureElement`
- Confirm all required directed edges exist:
  `WearableSensor->BLEGateway`
  `BLEGateway->LocalDisplay`
  `BLEGateway->LTEModem`
  `LTEModem->CloudBroker`
  `BLEGateway->PowerBlock`
  `USBC->BLEGateway`
  `BLEGateway->SecureElement`
- Confirm exactly one page named `system_overview`.
- Confirm `.drawio` is the editable master and source of truth.
- Confirm validation notes report blockers instead of masking them.

Not completed here:
- No file generation
- No export execution
- No existence checks
- No tool-based validation

**Known Blockers / Limits**

Blockers or stop conditions:
- Missing Mermaid source in the input markdown.
- Missing draw.io CLI or equivalent export path for SVG generation.
- PowerPoint COM automation unavailable, broken, or path-dependent when creating PPTX or exporting PNG.
- Any workflow path that replaces exported SVG with hand-written SVG is invalid.
- Any attempt to place runtime project paths or raw evidence into workflow canon is out of bounds.