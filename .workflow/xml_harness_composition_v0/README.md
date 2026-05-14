# XML Harness Composition v0

`xml_harness_composition_v0` creates a derived harness-layer packet from page-level XML preparation outputs. It reads page module sidecars and optional intake, materials, and layout-guide packets, then classifies possible cross-page joins without mutating any source/library asset.

This is not final circuit synthesis. A `candidate_safe` connection is only structurally plausible for owner review; it is not an approved schematic/netlist connection.

## Inputs

- Page-level asset identities from upstream split/intake flows.
- `page_module_spec_v0` sidecars from `page_xml_normalize_spec_v0`, including `system_contract` fields.
- Optional intake packets from `capture_xml_intake_library_v0`.
- Optional materials packets from `exp_xml_component_materials`.
- Optional layout-guide packets from `component_pcb_layout_guide_extraction`.
- Optional owner connection hints, treated as review context unless source-supported.

## Outputs

- `harness_identity`
- `connection_candidates`
- `blocked_connections`
- `review_required_connections`
- `candidate_safe_connections`
- `source_supported_connections`
- `owner_followup_needed`
- `harness_open_questions`
- `composition_readiness`

## Classification Contract

- `blocked`: known blocker, missing required source, source-gap packet, local/internal misuse, no-connect conflict, or incompatible connection kind.
- `review_required`: plausible but incomplete; examples include missing quantitative constraints, ambiguous direction/role, weak source coverage, or owner hints without source support.
- `candidate_safe`: structurally plausible with no known blocker and required quantitative fields present or source-declared not applicable, but still not final design approval.
- `source_supported`: later-stage classification for cited source support plus quantitative compatibility and no unresolved blockers.

## Boundary Rules

- Never rewrite source XML, normalized sidecars, intake packets, materials packets, layout guides, source packets, or owner-supplied library assets.
- Keep all harness outputs in a project-local derived packet.
- Do not promote `local_internal_candidates` to external harness interfaces without later source-backed evidence.
- Missing source and missing quantitative data remain blockers or review gates.
- Public canon contains only portable workflow rules, not raw project payloads, vendor text, runtime paths, `_workspaces` outputs, credentials, cookies, or private run truth.

## Current Maturity

`validation_level: pilot_executed_private_fixture`

A first private pilot has been executed against representative prepared page assets:

- `lt8624s` (power page)
- `ext_io_conn` (interface-heavy page)
- `02_4ch_vga_ch5_8` (ambiguous/channelized page)

The resulting harness packet confirmed the intended conservative behavior:

- multiple joins were explicitly `blocked`
- a few structurally plausible joins remained `review_required`
- no `candidate_safe` joins were promoted
- no `source_supported` joins were claimed

This means the package is no longer only contract-ready; it has private execution evidence showing that blocked/review separation works. It is still **not** a claim of production-ready composition or final circuit synthesis.
