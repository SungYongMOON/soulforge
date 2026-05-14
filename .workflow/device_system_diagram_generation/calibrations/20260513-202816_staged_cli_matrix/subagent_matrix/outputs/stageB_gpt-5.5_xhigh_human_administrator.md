No files read, tools run, or artifacts generated. This is a prompt-only candidate package plan.

**Structured Input**
```yaml
diagram:
  workflow_id: device_system_diagram_generation
  fixture_id: public_compact_wearable_gateway_v1
  source_of_truth: drawio
  pages:
    - id: system_overview
      name: system_overview
      layout: left_to_right
      nodes:
        - id: WearableSensor
          label: "Wearable Sensor\nBLE"
          group: field_device
        - id: BLEGateway
          label: "BLE Gateway\nESP32-S3"
          group: gateway_core
        - id: LocalDisplay
          label: "Local OLED Display"
          group: local_io
        - id: LTEModem
          label: "LTE-M Modem"
          group: network_uplink
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
  grouping_hints:
    gateway_core: center
    field_device: left
    local_io: upper_right
    network_uplink: right
    cloud: far_right
    power: lower_right
    service: lower_left
    security: lower_right
  exports:
    drawio_master: system_overview.drawio
    svg: system_overview.svg
    pptx: system_overview.pptx
    png_preview: system_overview.png
```

**Draw.io Master Construction Plan**

Create one editable `.drawio` master with exactly one page named `system_overview`. Convert the YAML nodes into draw.io cells with stable IDs matching the device IDs. Place `BLEGateway` centrally, route inbound links from `WearableSensor` and `USBC`, and route outbound links to display, modem, power, and secure element. Preserve all edge directions exactly as specified.

The `.drawio` file remains the authoritative editable artifact. SVG, PPTX, and PNG must be treated as derived outputs only.

**Derived Export Chain**

1. Generate `diagram_input.yaml` from the Markdown Mermaid source.
2. Generate `system_overview.drawio` from `diagram_input.yaml`.
3. Export `system_overview.svg` using draw.io CLI from the `.drawio` master.
4. Create `system_overview.pptx` with the SVG placed on one slide.
5. Export `system_overview.png` preview from the PPTX.

**Boundary And Validation Checks**

Planned validation:
- Confirm all required nodes exist: `WearableSensor`, `BLEGateway`, `LocalDisplay`, `LTEModem`, `CloudBroker`, `PowerBlock`, `USBC`, `SecureElement`.
- Confirm all required directed edges exist:
  `WearableSensor->BLEGateway`,
  `BLEGateway->LocalDisplay`,
  `BLEGateway->LTEModem`,
  `LTEModem->CloudBroker`,
  `BLEGateway->PowerBlock`,
  `USBC->BLEGateway`,
  `BLEGateway->SecureElement`.
- Confirm `.drawio` contains one page named `system_overview`.
- Confirm SVG was exported from draw.io, not manually substituted.
- Confirm PPTX embeds or places the SVG.
- Confirm PNG preview was exported from the PPTX.
- Confirm no REF packets, private workspaces, secrets, raw run evidence, or runtime candidate paths are included in workflow canon.

Actually completed validation:
- Prompt-only semantic check: the proposed YAML preserves the provided device IDs and edge directions.
- No filesystem existence checks, CLI export checks, PPTX inspection, or PNG verification were performed.

**Known Blockers/Limits**

- Missing Mermaid source is a blocker.
- Missing draw.io CLI is a blocker for compliant SVG export.
- PowerPoint COM availability, path handling, or slide export failure is a blocker for PPTX-to-PNG preview generation.
- This response is not an artifact package; it is only the candidate construction and validation plan.