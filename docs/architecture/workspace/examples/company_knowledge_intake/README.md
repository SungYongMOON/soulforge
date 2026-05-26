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
- Every machine-readable path ref must be relative to the Soulforge project
  root, such as `_workspaces/knowledge/...`; never store machine-local mount
  paths, home-directory paths, or `file://` URLs.
- Raw questions are ephemeral input only. Stored packet/review artifacts use a
  question label, query fingerprint, and token fingerprints.
- Default outputs stay metadata-only. Private proof payloads are allowed only
  under owner-approved `_workspaces/knowledge/**` commands/source cards.

## Files

- `company_knowledge_intake_packet.template.json`: placeholder-only JSON packet
  template for parallel company PC handoff.

## Validation

Validate the template shape with:

```bash
npm run guild-hall:rag -- validate-company-knowledge-intake-packet --packet-ref docs/architecture/workspace/examples/company_knowledge_intake/company_knowledge_intake_packet.template.json
```

The command checks that the packet is metadata-only, keeps stronger permissions
false by default, and excludes raw material, account state, local host paths, and
secret-like values.
