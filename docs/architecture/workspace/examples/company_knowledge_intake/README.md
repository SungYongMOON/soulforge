# company_knowledge_intake

## Purpose

This directory contains public-safe templates for company knowledge intake
handoff packets.

Use these templates only to describe metadata shape. They are not source
packets, source truth, owner approval, NotebookLM answer records, or public
canon entries.

## Boundary

- Do not store real company source text, chunks, excerpts, document bodies, mail
  bodies, NotebookLM answers, account IDs, conversation IDs, secrets, or local
  host paths here.
- Use labels, placeholders, hash/version fingerprints, source-card refs, and
  approval-status labels.
- `version_label` is owner-facing version or revision metadata only; it is not
  source truth, owner approval, a latest claim, or canon promotion.
- Every machine-readable path ref must be relative to the Soulforge project
  root, such as `_workspaces/knowledge/...`; never store machine-local mount
  paths, home-directory paths, or `file://` URLs.
- Raw questions are ephemeral input only. Stored packet/review artifacts use a
  question label, query fingerprint, and token fingerprints.
- Default outputs stay metadata-only. Private proof payloads are allowed only
  under owner-approved `_workspaces/knowledge/**` commands/source cards.
- For OneDrive or other cloud-synced handoff, use a source sync ready manifest
  as the final marker. The ready manifest lists the source card and derived
  text with Soulforge-root-relative refs, byte sizes, and SHA-256 hashes, but it
  still does not copy the source payload.
- The intake packet may point at that ready manifest with `source_sync_ready_ref`
  so the receiving PC knows which readiness file to validate before indexing.

## Files

- `company_knowledge_intake_packet.template.json`: placeholder-only JSON packet
  template for parallel company PC handoff.
- `source_sync_ready_manifest.template.json`: placeholder-only ready manifest
  for cross-PC source-card/source-text arrival checks before indexing.

## Validation

Validate the template shape with:

```bash
npm run guild-hall:rag -- validate-company-knowledge-intake-packet --packet-ref docs/architecture/workspace/examples/company_knowledge_intake/company_knowledge_intake_packet.template.json
```

The command checks that the packet is metadata-only, keeps stronger permissions
false by default, and excludes raw material, account state, local host paths, and
secret-like values.

Validate a ready manifest shape without checking local files:

```bash
npm run guild-hall:rag -- validate-source-sync-ready --ready-ref docs/architecture/workspace/examples/company_knowledge_intake/source_sync_ready_manifest.template.json --metadata-only
```

Validate a real OneDrive handoff before indexing:

```bash
npm run guild-hall:rag -- validate-source-sync-ready --ready-ref _workspaces/knowledge/common/<source_id>/source_sync_ready_manifest.json --source-card-ref _workspaces/knowledge/source_cards/<source_id>.source_card.json --source-text-ref _workspaces/knowledge/common/<source_id>/derived_text/<source_id>.md --stable-ms 2000
```

Then pass the same ready file into indexing:

```bash
npm run guild-hall:rag -- source-text-index --write --source-card-ref _workspaces/knowledge/source_cards/<source_id>.source_card.json --ready-ref _workspaces/knowledge/common/<source_id>/source_sync_ready_manifest.json --stable-ms 2000 --index-id <source_id>_source_text_index
```
