**Structured Input**
```yaml
workflow_id: device_system_diagram_generation
fixture_id: public_compact_wearable_gateway_v1
public_safe: true
source_of_truth: editable_drawio_master
pages:
  - id: system_overview
    title: Compact Wearable Gateway System
    layout:
      direction: LR
    nodes:
      - { id: WearableSensor, label: "Wearable Sensor\nBLE", group: sensing }
      - { id: BLEGateway, label: "BLE Gateway\nESP32-S3", group: gateway }
      - { id: LocalDisplay, label: "Local OLED Display", group: ui }
      - { id: LTEModem, label: "LTE-M Modem", group: connectivity }
      - { id: CloudBroker, label: "Cloud MQTT Broker", group: cloud }
      - { id: PowerBlock, label: "PMIC + LiPo Battery", group: power }
      - { id: USBC, label: "USB-C Service Port", group: service }
      - { id: SecureElement, label: "ATECC608 Secure Element", group: security }
    edges:
      - { id: "WearableSensor->BLEGateway", source: WearableSensor, target: BLEGateway, label: "" }
      - { id: "BLEGateway->LocalDisplay", source: BLEGateway, target: LocalDisplay, label: "" }
      - { id: "BLEGateway->LTEModem", source: BLEGateway, target: LTEModem, label: "" }
      - { id: "LTEModem->CloudBroker", source: LTEModem, target: CloudBroker, label: "" }
      - { id: "BLEGateway->PowerBlock", source: BLEGateway, target: PowerBlock, label: "" }
      - { id: "USBC->BLEGateway", source: USBC, target: BLEGateway, label: "" }
      - { id: "BLEGateway->SecureElement", source: BLEGateway, target: SecureElement, label: "" }
    grouping_hints:
      - { id: sensing, label: "Sensor Input", members: [WearableSensor] }
      - { id: gateway, label: "Gateway Core", members: [BLEGateway] }
      - { id: connectivity, label: "Backhaul", members: [LTEModem, CloudBroker] }
      - { id: ui, label: "Local UI", members: [LocalDisplay] }
      - { id: power, label: "Power", members: [PowerBlock] }
      - { id: service, label: "Service", members: [USBC] }
      - { id: security, label: "Security", members: [SecureElement] }
export_metadata:
  required_outputs:
    - diagram_input.yaml
    - system_overview.drawio
    - system_overview.svg
    - system_overview.pptx
    - system_overview.png
  rules:
    - editable .drawio master is the source of truth
    - exactly one page named system_overview
    - SVG must be exported from draw.io
    - PPTX must contain the exported SVG
    - PNG must be exported from the PPTX
```

**Draw.io Master Construction Plan**

Use one draw.io page named `system_overview`, with `BLEGateway` centered as the hub. Place `WearableSensor` and `USBC` on the left, `LocalDisplay`, `LTEModem`, `PowerBlock`, and `SecureElement` around the gateway, and `CloudBroker` to the far right after `LTEModem`. Keep only the seven specified directed edges and preserve the exact IDs and source/target directions above. The `.drawio` file remains the editable master; no SVG-first reconstruction is acceptable.

**Derived Artifact Export Chain**

Build the `.drawio` master from the structured input, then export `system_overview.svg` directly from draw.io. Place that SVG onto a single PPTX slide, then export the PNG preview from the PPTX. Validation notes should be a separate text record covering output existence checks and any local tool failures encountered during export.

**Boundary And Validation Checks**

Boundary checks:
- Use only the public synthetic fixture content.
- Do not introduce REF packets, runtime project paths, private workspaces, secrets, or raw run evidence.
- Do not infer extra nodes, edges, or labels beyond the prompt.

Planned validation:
- Confirm page name is exactly `system_overview`.
- Confirm all required node IDs exist exactly once.
- Confirm all required directed edges match exactly.
- Confirm `.drawio`, `.svg`, `.pptx`, and `.png` exist.
- Confirm SVG provenance is draw.io export, and PNG provenance is PPTX export.

Actually completed in this response:
- Prompt-level consistency check only.
- No file creation, tool execution, or artifact validation performed.

**Known Blockers / Limits**

- Missing Mermaid source is a blocker; in this fixture, Mermaid is present, so that blocker is not active at the spec level.
- Missing draw.io CLI or equivalent export capability blocks actual SVG generation.
- PowerPoint COM failure, missing PowerPoint, or path/export issues block PPTX and PNG derivation.
- This response cannot prove layout fidelity or artifact existence because no tools or files were used.