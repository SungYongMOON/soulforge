Calibration replay metadata: candidate_id=MIG_gpt56_sol_low_shape_r2; model=gpt-5.6-sol; reasoning_effort=low.
Only candidate/profile metadata was transformed in the frozen public-safe candidate prompt below; task content and fixture remain unchanged.
--- TRANSFORMED FROZEN PUBLIC-SAFE CANDIDATE PROMPT ---
You are calibrating the Soulforge workflow "device_system_diagram_generation".

Use only the public-safe synthetic workflow contract below.
Do not claim tool use, file edits, runtime paths, hidden refs, or private/raw evidence.
Do not mutate upstream artifacts.
Return JSON only with no code fences and no leading or trailing commentary.

Required JSON shape:
{
  "workflow_id": "device_system_diagram_generation",
  "candidate_label": "gpt-5.6-sol|low|human|administrator",
  "profile": { "model": "gpt-5.6-sol", "reasoning_effort": "low", "species": "human", "class": "administrator" },
  "outputs": {
  "diagram_input_yaml": "...",
  "drawio_master": "...",
  "svg_exports": "...",
  "powerpoint_deck": "...",
  "preview_png": "..."
  },
  "provenance": ["...", "..."],
  "gaps": ["...", "..."],
  "downstream_handoff": ["...", "..."],
  "boundary_review_note": ["...", "..."],
  "no_claims": ["...", "..."]
}

Workflow contract:
- title: Device System Diagram Generation
- summary: Generate an editable draw.io device system diagram package from one Markdown description, then derive SVG, PPTX, and preview PNG outputs.
- current public readiness label: canon-ready
- execution mode: local_tool_sequence
- inputs:
- device_description_markdown
- expected output groups:
  - diagram_input_yaml
  - drawio_master
  - svg_exports
  - powerpoint_deck
  - preview_png
- must preserve:
- drawio
- source of truth
- derived
- boundary
- workflow notes:
- The editable draw.io file is the source of truth.
- SVG, PPTX, and PNG outputs are derived artifacts.
- Runtime project paths, REF packets, candidates, and raw run evidence do not belong in this workflow canon.
- Current registration is owner-accepted usable, not strict REF canon-ready.
- Project-local bindings provide actual input/output paths and tool locations.

Synthetic scenario facts:
- one markdown device description names a power block, controller, sensor, and external connector
- drawio master remains the source of truth
- svg, pptx, and png are derived outputs only

Boundary policy:
- Do not claim tool use, file edits, runtime paths, or hidden private evidence.
- Do not mutate upstream artifacts or promote stronger source/canon authority than the contract supports.
- Keep public-safe synthetic boundaries explicit.

The output should be concrete enough for calibration comparison, but it must stay strictly within the synthetic contract above.
