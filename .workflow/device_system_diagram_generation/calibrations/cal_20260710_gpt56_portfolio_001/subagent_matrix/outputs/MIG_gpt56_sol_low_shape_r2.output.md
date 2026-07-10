{
  "workflow_id": "device_system_diagram_generation",
  "candidate_label": "gpt-5.6-sol|low|human|administrator",
  "profile": {
    "model": "gpt-5.6-sol",
    "reasoning_effort": "low",
    "species": "human",
    "class": "administrator"
  },
  "outputs": {
    "diagram_input_yaml": "A proposed structured representation of the supplied Markdown containing four named elements: power block, controller, sensor, and external connector; includes their described relationships and marks the draw.io master as the source of truth.",
    "drawio_master": "The intended editable master diagram, organized around the power block, controller, sensor, and external connector. This artifact retains source-of-truth status for all subsequent diagram revisions.",
    "svg_exports": "Proposed derived SVG export set reflecting the draw.io master. SVG content must not independently redefine topology or source authority.",
    "powerpoint_deck": "Proposed derived presentation deck containing the device system diagram for briefing use. The deck remains subordinate to the editable draw.io master.",
    "preview_png": "Proposed derived raster preview of the draw.io master for quick inspection. The PNG is not editable source material and carries no independent authority."
  },
  "provenance": [
    "The synthetic device-description Markdown is the sole stated scenario input.",
    "The diagram input representation is based only on the named power block, controller, sensor, external connector, and relationships expressed by that input; draw.io is the source of truth and SVG, PPTX, and PNG are derived."
  ],
  "gaps": [
    "The synthetic facts do not specify exact connectivity, signal direction, labels, grouping, layout, styling, slide structure, or export dimensions.",
    "The readiness notes conflict: the public label says canon-ready, while registration is described as owner-accepted usable rather than strict REF canon-ready; no stronger readiness conclusion is promoted."
  ],
  "downstream_handoff": [
    "Project-local bindings must supply the actual input and output locations and the required tool locations.",
    "A bounded execution stage should construct the editable draw.io master first, review its topology against the Markdown, and derive SVG, PPTX, and PNG outputs only from that approved master."
  ],
  "boundary_review_note": [
    "This package description remains public-safe and synthetic; it contains no runtime project paths, REF packets, candidate artifacts, or raw run evidence.",
    "Source authority is preserved: the Markdown supplies the description, the draw.io master governs the diagram, and all export formats remain derived artifacts."
  ],
  "no_claims": [
    "No claim is made that any tool was invoked, file was created or edited, export was generated, or validation was executed.",
    "No claim is made about hidden references, private evidence, actual runtime bindings, exact topology beyond the scenario facts, or strict REF canon-ready status."
  ]
}
