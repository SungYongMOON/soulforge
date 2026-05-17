# Knowledge Candidate Triage v0

`knowledge_candidate_triage_v0` is the explicit filter between raw knowledge
candidates and reusable wiki state.

It receives candidate source refs, reusable notes, concept registers, or
knowledge-access maintenance signals and decides the next safe route: inbox,
CANON bookshelf placement, packet eligibility, owner review, hold private, or
reject.

## Outputs

- `candidate_triage_register`
- `bookshelf_placement_decision`
- `notebooklm_packet_eligibility_note`
- `owner_review_queue`
- `downstream_route_map`
- `boundary_review_note`

## Boundary

- Candidate labels only.
- No source truth, owner approval, NotebookLM verdict, ontology acceptance, or
  canon promotion is created here.
- Public package files remain payload-free and metadata-only.

## Current Maturity

`validation_level: pilot_executed_private_evidence`

This package now has one bounded private practice classification proving that a
project operating packet can be kept out of active technical evidence queries
without needing owner re-approval. It is still not a production-ready runner.
