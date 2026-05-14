# EXP XML Component Materials Collection

Collects circuit-design reference materials from a project-provided `EXP.xml`.

## Contract

- Input: one read-only `EXP.xml` path supplied by a project binding. This may be a whole Capture export or a bounded page-fragment XML asset.
- Scope result: page-fragment inputs support bounded page-level materials preparation only; they may produce a strong per-page source packet but do not prove full-design material coverage.
- Optional context: a `downstream_handoff` packet from `capture_xml_intake_library_v0`.
- Project-local output root: supplied by binding, normally under `_workspaces/<project_code>/`.
- Per-component output folders: `DATA Sheet/` and `EVAL/`.
- Required manifests: `component_inventory`, `source_index`, `download_manifest`, downloaded-file checksums, and `circuit_design_review_queue`.

The optional intake handoff is context only. It can help prioritize likely connector/interface refs, power-sensitive refs, and unresolved topology questions, but it never replaces the `EXP.xml` parse and never confirms component identity, manufacturer part number, or connectivity by itself.

## Output Tree

```text
<materials_root>/
  component_inventory.yaml
  download_manifest.yaml
  circuit_design_review_queue.yaml
  parts/
    <normalized_component_key>/
      source_index.yaml
      DATA Sheet/
      EVAL/
```

`DATA Sheet/` stores approved datasheets and product briefs. `EVAL/` stores official evaluation-board or reference-design materials such as user guides, schematics, PCB layout archives, Gerbers, BOMs, CAD/EDA projects, and application notes.

URL shortcuts or source links are not completion evidence. A download step passes only when the actual file is saved under `DATA Sheet/` or `EVAL/` and the manifest records source URL, byte size, content type or file magic, and SHA256. PDF and ZIP downloads should be magic-byte checked before they are counted as complete.

## Boundary

The workflow package is public-safe procedure only. It must not contain real `EXP.xml` contents, downloaded PDFs, PCB archives, credentials, vendor-account cookies, or project-local run truth.

Official manufacturer sources are preferred. Account-gated or license-gated material is recorded as owner-manual-download-required unless the owner handles the download outside the agent.

Owner-approved local copies of official collateral may be reused instead of re-downloaded when provenance is preserved. The manifests must retain the original official source identity when known, local reuse status, byte size or file-magic evidence when available, and SHA256 checksums for files counted as completed materials.

## Cadence EXP Notes

For Cadence Capture EXP.xml, treat `PartInst` as the placed component source. `Package` nodes can include library/cache definitions that are not actual placed BOM lines. Instance-level properties such as manufacturer, MPN, and footprint may appear under `PartInstUserProp`.

Large Capture exports can fail a normal XML DOM load even when enough structured data is present for material collection. In that case, use a bounded `PartInst` block parser and record the fallback in run evidence. If a placed instance has a placeholder value such as `Value`, recover identity only from the matching package definition's `SymbolUserProp` fields, and mark that confidence source in the inventory.

Generic passives, test points, and symbolic power entries without MPN/manufacturer evidence belong in the review queue. The workflow should not guess a vendor datasheet for them.

When the input is a page fragment, missing cross-page context, incomplete page-local topology, and full-design coverage limits must stay visible in `source_discovery_packet`, `download_manifest`, and `circuit_design_review_queue`. A page-level packet can be useful and source-backed without being a complete design-level material library.

## Optional Intake Handoff

`capture_xml_intake_library_v0` may run before this workflow and produce `downstream_handoff.yaml`. A project binding may pass that packet into this workflow as optional context.

Safe/useful handoff fields include `handoff_status`, `pass_to_downstream`, `block_summary`, `connectors`, `power_summary`, `open_questions`, `provenance`, and `do_not_pass_as_confirmed`. These fields are used only to:

- Prioritize EXP-confirmed connector or interface refs during source discovery and review.
- Flag EXP-confirmed power-sensitive refs for EVAL/reference-design source priority.
- Carry unresolved topology, schema, or pin-state questions into `circuit_design_review_queue`.
- Warn the runner not to treat connector candidates, power/control pin candidates, or pin-name-only connectivity as confirmed truth.

If the handoff is absent, this workflow still runs from `EXP.xml` alone. If the handoff conflicts with the parsed component inventory, the EXP.xml-derived inventory remains authoritative and the conflict becomes a review item.

## Project Binding

Use `templates/project_binding.template.yaml` to provide:

- EXP.xml input path.
- Optional downstream handoff path from `capture_xml_intake_library_v0`.
- Materials output root.
- Download size and source-approval policy.
- Optional official-domain allowlist.
- Folder names, including the requested `DATA Sheet` and `EVAL` directories.

This workflow has binary-download pilots. The first pilot parsed a concrete EXP.xml, extracted an identifiable regulator, and saved official datasheet, demo manual, schematic PDF, evaluation design ZIP, and simulation file into project-local material folders with checksums. A later larger-fixture evolution run exercised multi-hundred-instance parsing, package-property identity fallback, official PDF/ZIP validation, and unavailable-material review notes.
