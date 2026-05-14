# Component PCB Layout Guide Extraction

Owner-accepted usable follow-on workflow for `exp_xml_component_materials`. It reads component folders that already contain `DATA Sheet/` and `EVAL/` material, then writes a sibling `Layout Guide/` folder for AI-readable PCB-layout guidance.

## Contract

- Input: project binding to a component `parts/` root.
- Expected component folders: `<component_key>/DATA Sheet/` and/or `<component_key>/EVAL/`.
- Output per component: `Layout Guide/layout_guide.md`, `source_map.json`, `extraction_manifest.json`, and cache/source subfolders.
- Public workflow canon must not include absolute paths, concrete run ids, downloaded files, copied PDF text, or project-local source material.

If official layout guidance cannot be acquired, the workflow must still write a bounded `Layout Guide/` packet that clearly says so. In that degraded case:

- `layout_guide.md` becomes a source-gap report with only source-backed observations plus explicit missing-guidance sections.
- `source_map.json` records attempted or available source anchors without inventing unsupported layout claims.
- `extraction_manifest.json` records attempted official sources, download or access blockers, unresolved gaps, and the exact owner follow-up needed.
- The workflow must not silently stop and must not fabricate layout recommendations to fill the gap.

## Output Tree

```text
<parts_root>/
  <component_key>/
    DATA Sheet/
    EVAL/
    Layout Guide/
      layout_guide.md
      source_map.json
      extraction_manifest.json
      source_docs/
      figures/
        page_<n>_<source>_p<page>_<hash>.png
        context_pages/
      tables/
        camelot_quality/
        layout_only/
        raw_candidates/
      cache/
        pdf_text_index.json
        layout_candidate_spans.json
        processed_docs.json
```

## Token Control

The workflow must not repeatedly load whole PDFs into AI context. It first computes source-file SHA256 values, builds or reuses page-level text indexes, selects layout-relevant candidate spans, and gives AI synthesis only those spans.

## Layout Topics

Search and synthesize only PCB layout material, including layout guidelines, grounding, decoupling, bypass capacitor placement, routing, planes, vias, thermal layout, exposed pads, evaluation board layout, reference layout, and related figures/tables.

## Figure And Table Extraction

Use separate tools for separate document signals. Prefer PyMuPDF for rendering full PDF pages referenced by `layout_guide.md` directly into `Layout Guide/figures/`, with one PNG per unique source file checksum and page number. Prefer Camelot for strict quality-filtered table Markdown under `Layout Guide/tables/camelot_quality/`, using its accuracy/whitespace metrics and rejecting two-column prose unless it is explicitly table-like. pdfplumber may be used as a raw fallback candidate extractor, but raw candidates must stay distinguishable from quality-filtered tables.

`source_map.json` entries for figures and tables must include source file identity, page number, extraction method, output file, output checksum, and quality/filter notes. `extraction_manifest.json` records figure counts, raw table candidate counts, strict quality table counts, tool versions, and extraction errors or warnings.

Figure capture must be anchored to the final `layout_guide.md`, not merely to pages that contained earlier layout keywords. The workflow builds `Layout Guide/cache/layout_guide_citation_map.json` from the actual Markdown evidence lines and source map, deduplicates by source file checksum plus page number, then uses PyMuPDF to render the complete cited page directly under `figures/`. Older cited-region crops, if present from a previous run, are retained only as `figures/context_pages/legacy_cited_evidence_crops/` evidence.

## Layout-Only Promotion

After raw/context extraction, promote only layout-guide-cited unique full-page renders into `Layout Guide/figures/` and PCB-layout-relevant tables into `Layout Guide/tables/layout_only/`. Promotion requires source-bound evidence such as PCB layout captions, board layout guidance, routing, grounding, decoupling, power placement, thermal/exposed-pad, schematic, reference layout, connector/link, or board setup context. Reject software installation, PC driver/setup, marketing, ordering-only pages, non-cited page renders, duplicate cited-page renders, and two-column prose detected as a table. Rejections remain in cache evidence with reasons instead of being silently discarded.

## Supplemental Sources

When `DATA Sheet/` and `EVAL/` do not contain enough layout guidance, the workflow may search official manufacturer sources for supplemental layout guides, application notes, EVAL user guides, or reference design archives. Supplemental files are downloaded into `Layout Guide/source_docs/` with source URL, byte size, retrieval date, and SHA256.

If official supplemental sources remain unavailable, blocked, or non-downloadable, the workflow must downgrade gracefully:

- keep the component in a `layout guidance missing or incomplete` state,
- record attempted sources and blocker reasons,
- tell the owner exactly what source packet would unblock the next run,
- preserve source-bound local evidence already available,
- and continue by writing a bounded source-gap `Layout Guide/` packet instead of pretending the component is layout-ready.

## Boundary

This workflow package is public-safe procedure only. Real PDFs, copied vendor text, extracted figures, runtime caches, source maps, and downloaded supplemental files remain project-local. Public commits should include the workflow rules, not the extracted vendor content.

## Registration

Status: owner-accepted usable. The current registration is based on a pilot that generated source-bound layout guides, checksum manifests, cited full-page figure PNGs directly under `Layout Guide/figures/`, and table outputs under project-local component folders. Runtime outputs and vendor content remain outside this public workflow package.
