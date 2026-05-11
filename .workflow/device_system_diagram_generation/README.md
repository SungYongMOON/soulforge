# Device System Diagram Generation

Generates a device system diagram package from one Markdown description.

## Contract

- Input: one `device_description.md`.
- Canonical output: `system_diagram_master.drawio`.
- Derived outputs: `exports/svg/*.svg`, `system_diagram_deck.pptx`, `preview.png`.
- Intermediate output: `diagram_input.yaml`.

## Boundary

REF packets and accepted outputs are verifier-only material. They are not construction inputs.

This workflow is registered as owner-accepted usable. The discovery run produced an acceptable visual result, but strict REF verification still failed on reference-level semantic/intermediate contract matching. Treat this as usable for project execution and timing checks, not as proof that every future fixture will match a hidden REF packet.

## Project Binding

Use project-local binding files or a run prompt to provide:

- Markdown input path.
- Output directory, preferably short.
- draw.io CLI path.
- PowerPoint COM availability.
- Whether REF comparison is requested for that run.

Do not store local project paths, raw candidates, REF packets, or run dumps in this canon package.
