# LLM wiki bookshelf example

This directory is a public-safe example package for a manual/offline LLM wiki
bookshelf flow. The path keeps the historical "bookshelf" name for
compatibility, but the model is now split: Google Drive is the source warehouse,
and NotebookLM notebooks are query bookshelves assembled from approved source
handles. The example stores no source payloads, live Drive IDs, NotebookLM
account state, or runtime absolute paths.

## Files

- `canonical_source_intake_checklist.md` is the manual intake checklist for
  deciding whether a source can move from candidate to warehouse-backed
  NotebookLM bookshelf use.
- `metadata_source_ledger.template.yaml` is a metadata-only ledger template for
  source refs, approval notes, claim ceilings, and lifecycle state.
- `notebooklm_packet_map.template.yaml` is a metadata-only packet map template
  for grouping approved source handles into NotebookLM-ready topic packets.

## Manual offline flow

1. Place or identify candidate source material in the owner-held Drive
   warehouse surface. Keep drafts, raw mail, local-only working files, and
   uncertain versions out of active NotebookLM source sets.
2. Run the intake checklist by hand. If source ownership, approval basis,
   version state, or payload boundary is unclear, leave the item as candidate,
   rejected, or unclear.
3. Record only metadata in the source ledger template. Use stable source handles
   and public-safe labels, not source text, live file IDs, account URLs, or local
   file paths.
4. Build a NotebookLM packet map from approved source handles. Treat the packet
   as a planned advisory query set, not as validation or canon authority.
5. If NotebookLM is used, record query/use events through the metadata-only
   knowledge access path or a private/local `_workmeta` evidence surface. Do not
   copy NotebookLM answers or source excerpts into this public example.
6. Review superseded, rejected, or unclear sources manually before re-use. A
   folder move or packet entry is not owner approval by itself.

## Boundary contract

- Google Drive is the owner-held source warehouse surface.
- NotebookLM is an advisory question and synthesis bookshelf over selected
  approved warehouse sources.
- Soulforge public docs own portable rules, templates, and examples only.
- `_workmeta` owns project-local approval evidence, use records, and review
  packets.
- Claim ceilings stay at `observed` or `source_supported` unless a separate
  owner/review route raises them.
