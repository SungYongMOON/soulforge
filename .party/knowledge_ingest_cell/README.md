# Knowledge Ingest Cell

`knowledge_ingest_cell` is the registered, owner-gated party for knowledge
ingest work that needs a bounded chain rather than a single wiki stage.

The default entry is `knowledge_ingest_pipeline_v0`. That composite coordinates:

1. optional `project_password_unlock_copy_only_v0` preprocessing,
2. `knowledge_source_audit_v0`,
3. `knowledge_wiki_pipeline_v0`,
4. `owner_decision_packet_v0` gates,
5. `post_development_review_gate_v0`.

The party is deliberately not default-route-safe. It is selected when the owner
asks for a knowledge ingest chain and the request has enough scope information
to stay public/private safe.

## Boundary

- No password guessing, brute force, or secret exposure.
- No original source mutation.
- No Drive or NotebookLM upload/query without an applicable owner decision or
  standing policy ref and downstream tool authority. The 2026-07-15 ontology
  canon policy permits bounded public-safe package registration and approved
  bookshelf queries; it does not make the party default-route-safe.
- No public canon promotion.
- No source-text extraction or index build.
- No replacement, migration, or source-of-record authority.
- No controlled/internal source handling without owner-approved policy.

Those actions require `owner_decision_packet_v0` and a downstream workflow or
tool that owns the actual authority.

Each real stage should run through a fresh subagent and record runtime evidence
in the appropriate private `_workmeta` run surface.
