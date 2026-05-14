# Capture XML Intake Library v0

Public-safe upstream workflow for turning a project-bound Cadence Capture `EXP.xml` into an XML-first asset registration packet before downstream material collection.

## Contract

- Input: one project-bound `EXP.xml` path supplied by a local binding. This may be a whole Capture export or a bounded page-fragment XML asset.
- Scope result: whole-export inputs may produce design-level intake candidates; page-fragment inputs produce page-level intake only and must not be reported as full-library or full-design completion.
- Optional initial attachment: one owner-supplied MDD path may be present at first intake.
- Optional normalize context: a page normalization sidecar or handoff may be acknowledged as context-only review metadata when supplied by the binding.
- Source policy: the original XML is read-only. The workflow must not rename refdes, nets, pins, symbols, coordinates, IDs, or XML structure.
- Project-local output root: supplied by binding, normally under `_workspaces/<project_code>/`.
- Required outputs: `asset_identity`, `block_summary`, `extracted_nets`, `connectors`, `power_summary`, `open_questions`, `pcb_pairing_placeholder`, and `provenance`.
- Public workflow canon must not include raw XML, fixture-derived values, host-specific absolute paths, project-local run truth, credentials, cookies, or secret material.

## Output Tree

```text
<intake_library_root>/
  asset_identity.yaml
  block_summary.yaml
  extracted_nets.yaml
  connectors.yaml
  power_summary.yaml
  open_questions.yaml
  pcb_pairing_placeholder.yaml
  provenance.yaml
  downstream_handoff.yaml
```

`asset_identity.yaml` is the XML-first asset-set anchor. It records source XML identity, asset version, and whether an MDD is already attached or still missing. `block_summary.yaml` captures sheet/page/cache/package and placed-instance structure. `extracted_nets.yaml` records explicit net records when present, plus port, pin, global symbol, and no-connect observations that require review. `connectors.yaml` separates confirmed connector/interface components from candidates. `power_summary.yaml` separates confirmed power/ground nets from pin-name or symbol-name candidates. `open_questions.yaml` carries unresolved topology, schema, or review issues instead of allowing guesses to become design truth. `pcb_pairing_placeholder.yaml` records whether PCB/MDD assets are missing, attached at intake by owner assertion, or expected to arrive later through a patch workflow.

## XML-First Asset Registration

This workflow is the asset-set entrypoint. The XML arrives first, so the workflow must create a stable asset-set identity even if PCB/MDD assets do not exist yet.

- If XML arrives alone, the workflow creates `asset_identity.yaml` plus `pcb_pairing_placeholder.yaml` with `mdd_status: missing` or `expected_later`.
- If XML and MDD arrive together, the workflow records the MDD path as an `owner_supplied` initial attachment in metadata only.
- The workflow does not independently prove that XML and MDD are the same design. It records owner-supplied attachment state and leaves later patch history to a follow-on workflow.
- If the XML is a split page fragment, the asset identity and intake outputs must be labeled page-level. Missing whole-export context such as full design hierarchy, complete cache/library coverage, complete occurrence paths, or cross-page nets becomes `open_questions` or review-required provenance rather than inferred completion.

## Page Fragment And Normalize Context

Page-fragment XML inputs are valid when the project binding identifies the input scope. A page-fragment run still preserves the source XML as the authoritative artifact, but it can only prepare a bounded page-level intake packet for downstream review.

When a `page_xml_normalize_spec_v0` sidecar or handoff is available, this workflow may use it to carry page labels, module-scope hints, channelization hints, classification rationale, and prior review warnings into the intake outputs. That normalize context is never authoritative: it must not override the XML, confirm topology, close open questions, or turn a page fragment into a whole-design/library result.

## Stage Order

1. Resolve the project binding and confirm the XML input is read-only.
2. Inspect the Capture XML shape and record parser mode.
3. Extract blocks, pages, cache packages, placed instances, ports, pins, globals, and occurrence records that are present in the input scope.
4. Build a conservative net/connectivity view from explicit net tables when available, otherwise record review-required pin/port observations.
5. Classify connectors and external interfaces only when source evidence is strong enough.
6. Summarize power, ground, no-connect, and unresolved pin state separately.
7. Register asset identity, optional initial MDD attachment state, and later-attachment placeholder metadata.
8. Write intake library artifacts and a downstream handoff packet for `exp_xml_component_materials`.
9. Run boundary and readiness review before downstream workflow execution.

## Downstream Handoff

This workflow runs before `exp_xml_component_materials`. It gives that workflow a compact, reviewed design-intake packet so component material collection can distinguish placed components, connector/interface candidates, power-sensitive parts, and unresolved topology questions.

The handoff does not replace the original `EXP.xml`; downstream workflows may still read the XML through their own project binding. The intake library only adds public-safe structure, review status, and provenance for project-local use.

For page-fragment runs, the downstream handoff must carry a page-level scope marker and unresolved whole-design caveats. It may help the materials workflow prioritize page-local components and review questions, but it does not confirm full-design coverage, final harness boundaries, or cross-page connectivity.

## MDD Attachment Model

The workflow supports two valid MDD states:

- **initial attachment present**
  - owner provides XML and MDD together
  - intake records the MDD path and marks it as `owner_supplied`
- **attachment deferred**
  - XML arrives first
  - intake writes placeholder metadata so the asset set can later be updated by `asset_patch_attach_mdd_v0`

Later MDD or PCB-asset registration should not rewrite the XML-first intake package from scratch. It should patch the existing asset-set metadata and bump version history.

## Boundary

The package is reusable procedure only. Real XML content, extracted project values, raw MDD payloads, local runtime paths, private run logs, and project outputs remain outside `.workflow`. A bounded private system-lab pilot was used to shape this package; only the generic lessons are promoted here.
