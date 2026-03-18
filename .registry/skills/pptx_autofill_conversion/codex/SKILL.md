---
name: soulforge-pptx-autofill-conversion
description: Use when a Soulforge task must preserve a PPTX template's slide structure and change only the bounded text content for a new topic.
---

# Soulforge PPTX Autofill Conversion

Use this skill when the user provides a `.pptx` template and asks to keep the same structure while changing the content.

## Core rules

- Treat the provided PPTX as the source of truth for slide count, layout, tables, grouped shapes, media, and relationships.
- Prefer XML-first inspection: extract slide text, analyze tables and shapes, then replace only bounded text runs.
- Keep edits narrow: do not add or remove slides, reshape tables, or move geometry unless the user explicitly widens scope.
- Use the bundled scripts to unpack, inspect, replace, repack, and validate the PPTX instead of improvising the OOXML flow.

## Load on demand

- For Soulforge mapping, resource map, output shape, and upstream linkage, read [`references/mapping.md`](references/mapping.md).
- For OOXML guardrails on tables, shapes, and text replacement boundaries, read [`references/pptx_xml_guardrails.md`](references/pptx_xml_guardrails.md).
- For the upstream Claude-skill workflow summary, read [`references/upstream_claude_skill.md`](references/upstream_claude_skill.md).
