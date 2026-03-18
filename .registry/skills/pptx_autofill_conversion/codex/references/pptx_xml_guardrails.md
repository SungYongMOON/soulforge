# PPTX XML Guardrails

## Core boundary

- Default to replacing only `<a:t>` text nodes inside slide XML.
- Preserve slide count, slide order, relationships, media files, and theme parts unless the user explicitly widens scope.
- Keep image placeholders and embedded media untouched unless the task explicitly targets them.

## Table guardrails

Do not change these by default:

- `<a:tblGrid>` and `<a:gridCol w="...">`
- `<a:tr h="...">`
- `<a:tcPr>` border definitions such as `<a:lnL>`, `<a:lnR>`, `<a:lnT>`, `<a:lnB>`
- table style IDs and fill definitions
- text run size and bold attributes unless the request explicitly requires formatting changes

## Shape guardrails

Do not change these by default:

- shape IDs and non-visual properties
- `<a:xfrm>` geometry such as offsets and extents
- line and fill properties
- group shape structure and order

## Replacement strategy

- Prefer exact-text replacement first.
- If the template contains repeated placeholders like `텍스트를 입력하세요`, call out whether the replacement is global across the deck or needs slide-specific branching.
- When a replacement would need paragraph splitting, line wrapping control, or table row growth, stop at the boundary and ask to widen scope.
