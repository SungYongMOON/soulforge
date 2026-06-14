# RAG Work Card Router v0

`rag_work_card_router_v0` is a registered pilot-executed workflow for routing a free-form work
request into a deterministic work-card packet using only a public-safe label,
fingerprint, approved source card refs, approved index refs, and a page quality
review packet.

It also writes a human-readable boundary text so a person can see what the work
card may use, what it must not claim, and which pages or refs remain blocked or
manual-review only.

## Outputs

- `request_fingerprint_binding`
- `approved_context_inventory`
- `quality_review_intake`
- `work_card_packet`
- `text_boundary`
- `boundary_review_note`

## Boundary

This workflow does not persist the raw question, source payloads, copied
excerpts, NotebookLM answers, secrets, credentials, or runtime absolute paths.
It does not claim owner approval, canon readiness, source truth, answer truth,
project execution authority, or default-route safety.

## Current Maturity

`output_state: pilot-executed`

The package is registered in `.workflow/index.yaml` for routing discovery and
remains not default-route-safe, canon-ready, production-ready,
owner-approved, or project-execution authority.

A controlled DAPA fixture produced:

- `_workspaces/knowledge/rag/source_text_work_cards/dapa_test_eval_requirements_verification_work_card_20260527/source_text_work_card.json`

The `validate-work-card` validator passed, and
`node --test guild_hall/rag/rag.test.mjs` passed after the CLI/test
implementation. The pilot status is `manual_review`, with
`citation_status: source_supported_with_manual_review`,
`claim_ceiling: source_supported`, and evidence pages 39, 66, and 120. Page 39
keeps a table warning, so the work card remains a scoped request packet rather
than an approval or canon claim.

History entry:

- `history/pilot_execution_20260527.yaml`
