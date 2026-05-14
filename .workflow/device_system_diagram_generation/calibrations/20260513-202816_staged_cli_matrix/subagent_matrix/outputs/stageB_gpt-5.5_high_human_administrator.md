**Structured Input**

```yaml
workflow_id: device_system_diagram_generation
fixture_id: public_compact_wearable_gateway_v1
public_safe: true

pages:
  - id: system_overview
    title: system_overview
    layout: left_to_right
    nodes:
      - id: WearableSensor
        label: "Wearable Sensor\nBLE"
        group: edge_device
      - id: BLEGateway
        label: "BLE Gateway\nESP32-S3"
        group: gateway_core
      - id: LocalDisplay
        label: "Local OLED Display"
        group: local_io
      - id: LTEModem
        label: "LTE-M Modem"
        group: cellular_backhaul
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
      - id: WearableSensor->BLEGateway
        from: WearableSensor
        to: BLEGateway
      - id: BLEGateway->LocalDisplay
        from: BLEGateway
        to: LocalDisplay
      - id: BLEGateway->LTEModem
        from: BLEGateway
        to: LTEModem
      - id: LTEModem->CloudBroker
        from: LTEModem
        to: CloudBroker
      - id: BLEGateway->PowerBlock
        from: BLEGateway
        to: PowerBlock
      - id: USBC->BLEGateway
        from: USBC
        to: BLEGateway
      - id: BLEGateway->SecureElement
        from: BLEGateway
        to: SecureElement

export_metadata:
  source_of_truth: editable_drawio
  drawio_page: system_overview
  derived_artifacts:
    - svg_from_drawio
    - pptx_with_svg
    - png_from_pptx
```

**draw.io Master Construction Plan**

Create one editable `.drawio` master with exactly one page named `system_overview`. Use the YAML as the canonical intermediate input. Place `BLEGateway` centrally, with `WearableSensor` and `USBC` feeding into it from the left, `LocalDisplay`, `PowerBlock`, and `SecureElement` adjacent to the gateway, and `LTEModem -> CloudBroker` extending to the right. Preserve all node IDs in draw.io object metadata or labels where supported, and preserve all edge directions exactly.

**Derived Artifact Export Chain**

Planned chain:

1. Generate `diagram_input.yaml` from the Markdown Mermaid block.
2. Construct editable `system_overview.drawio` as the master artifact.
3. Export SVG using draw.io CLI from the `.drawio` file.
4. Create PPTX slide containing the exported SVG.
5. Export PNG preview from the PPTX.

The SVG must be derived from draw.io, not hand-written. The PNG must be derived from the PPTX, not directly from SVG unless explicitly marked as fallback.

**Boundary And Validation Checks**

Planned validation only; no validation has been executed in this isolated response.

Checks to perform:

- Confirm `diagram_input.yaml` exists and includes all required nodes.
- Confirm all required edge IDs exist with exact direction:
  `WearableSensor->BLEGateway`, `BLEGateway->LocalDisplay`, `BLEGateway->LTEModem`, `LTEModem->CloudBroker`, `BLEGateway->PowerBlock`, `USBC->BLEGateway`, `BLEGateway->SecureElement`.
- Confirm `.drawio` has one page named `system_overview`.
- Confirm SVG exists and was exported from draw.io.
- Confirm PPTX exists and contains the SVG.
- Confirm PNG preview exists and was exported from PPTX.
- Confirm no REF packets, private workspace paths, secrets, raw run evidence, or runtime project paths are included in workflow canon.

**Known Blockers/Limits**

This response does not read files, run tools, or generate artifacts. Actual completion depends on local availability of Mermaid parsing, draw.io CLI, PowerPoint/PPTX tooling, and path-safe export support. Missing Mermaid source, unavailable draw.io CLI, or PowerPoint COM/path failures are stop conditions that must be reported in validation notes rather than silently bypassed.