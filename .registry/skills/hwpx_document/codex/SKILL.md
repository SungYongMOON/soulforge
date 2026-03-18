---
name: soulforge-hwpx-document
description: Use when a Soulforge task must create, inspect, edit, or validate HWPX documents with XML-first control and reference-preserving reconstruction.
---

# Soulforge HWPX Document

Use this skill when the task involves `.hwpx`, Hancom Office HWPX, or OWPML XML.

## Core rules

- Prefer reference-preserving reconstruction when the user provides an existing HWPX file.
- Keep structural edits bounded: preserve style IDs, table geometry, section/page structure, and only change requested content.
- Use the bundled scripts for analyze, build, extract, validate, and page-drift checks instead of rewriting the workflow ad hoc.
- When a reference HWPX exists, do not stop at validation alone; run the page guard before treating the result as complete.

## Load on demand

- For Soulforge mapping, bundled resource map, upstream linkage, and output expectations, read [`references/mapping.md`](references/mapping.md).
- For OWPML element details, read [`references/hwpx-format.md`](references/hwpx-format.md).
