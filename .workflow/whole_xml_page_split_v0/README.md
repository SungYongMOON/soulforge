# Whole XML Page Split v0

Public-safe upstream workflow for splitting one project-bound large multi-page XML source into page-level XML assets and page manifests before page normalization.

## Contract

- Input: one project-bound whole XML source binding supplied by local project configuration.
- Source policy: the whole XML source is read-only. This workflow must not rewrite, normalize, rename, or save over the source file.
- Output policy: page XML files and manifests are derived project-local outputs supplied by binding. They do not live inside `.workflow/`.
- Required outputs: `page_xml_assets`, `page_manifest`, `page_index`, `source_provenance`, `page_role_hints`, and `split_readiness`.
- Public workflow canon must not include raw XML bodies, fixture-derived page payloads, host-specific absolute paths, project-local output payloads, credentials, cookies, or secret material.

## Output Tree

```text
<page_split_output_root>/
  pages/
    <stable_page_id>.xml
  page_manifest.yaml
  page_index.yaml
  source_provenance.yaml
  page_role_hints.yaml
  split_readiness.yaml
```

The XML files under `pages/` are project-local derived artifacts. The manifest and index record page order, stable page ids, source identity, split method, and review status without copying page XML bodies into public canon.

## Stage Order

1. Resolve the project binding and confirm the whole XML source is read-only.
2. Inspect the XML shape with the safest available parser or streaming probe.
3. Identify page or schematic boundaries and choose stable page ids.
4. Write one page XML asset per page into the project-local output root.
5. Write page manifest, page index, and source provenance records.
6. Add lightweight page-role hints such as schematic, hardware/material, possible PCB/MDD context, or unknown.
7. Run a boundary and handoff review before `page_xml_normalize_spec_v0`.

## Downstream Handoff

This workflow sits before `page_xml_normalize_spec_v0`. It gives the downstream workflow page-level XML files plus a manifest and provenance packet. It does not normalize page XML, register assets, download materials, attach MDD files, or infer PCB pairing truth.

Pages with possible PCB, MDD, material, or hardware context should be flagged as review hints only. Deeper semantic interpretation belongs to later page normalization, XML-first intake registration, material collection, or owner-supplied patch workflows.

## Boundary

The package is reusable procedure only. Real whole XML inputs, generated page XML files, manifests from a concrete project, parser logs, and run evidence remain project-local or private. Public `.workflow` files only describe the steps, output shape, and safety rules.
