# 2026-05-13 Owner-Accepted Usable Registration

`component_pcb_layout_guide_extraction` is registered as an owner-accepted usable workflow.

Public-safe acceptance basis:

- The workflow is listed in `.workflow/index.yaml`.
- The workflow follows `exp_xml_component_materials` outputs and uses portable project bindings for component material folders.
- The pilot produced per-component `Layout Guide` outputs with `layout_guide.md`, `source_map.json`, `extraction_manifest.json`, cache manifests, and cited full-page figure PNG references.
- Current figure policy stores cited full-page PNG outputs directly under `Layout Guide/figures/`, deduplicated by source file checksum and page number.
- Vendor PDFs, copied vendor text, extracted figures, runtime caches, and concrete run paths remain project-local and are not part of the public workflow canon.

Validation note:

- Canon validation passed for the workflow package.
- Full root validation remains blocked by an unrelated role-boundary gate on a protected public contract file outside this workflow package.
