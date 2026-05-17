# Monster Knowledge Preflight v0

`monster_knowledge_preflight_v0` is the query-first front gate for
knowledge-heavy monsters.

It checks project wiki state, NotebookLM bindings, source ledgers, approved
common references, and known source gaps before the main workflow begins. The
result is a bounded preflight packet that tells the main workflow what can be
answered from existing wiki state, what still requires approved-source
deepening, and which claim ceiling is currently safe.

## Outputs

- `knowledge_preflight_packet`
- `wiki_first_query_plan`
- `source_scope_recommendation`
- `claim_ceiling_seed`
- `main_workflow_handoff`
- `boundary_review_note`

## Boundary

- Metadata-first and query-first.
- It may point at NotebookLM bindings and source ledgers, but it does not
  require NotebookLM execution by itself.
- It does not copy raw source payloads, NotebookLM answers, auth/session
  material, or owner-private files into public workflow canon.
- It does not approve source truth, owner decisions, ontology, canon promotion,
  or the final monster result.

## Current Maturity

`validation_level: pilot_executed_private_evidence`

This package now has one bounded private practice run proving that a
knowledge-heavy project question can be stopped safely at the project wiki and
known-gap layer before unnecessary raw-source rereads. It is still not
production-ready.
