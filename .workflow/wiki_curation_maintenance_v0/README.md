# Wiki Curation Maintenance v0

`wiki_curation_maintenance_v0` keeps project wiki state reusable after bounded
knowledge work.

It updates the maintenance-facing metadata packets that describe how the project
source ledger, NotebookLM packet map, NotebookLM binding notes, lifecycle
states, and residual source gaps should change after a bounded task. It is the
executable counterpart to the operator runbook in
`docs/architecture/workspace/WIKI_CURATION_MAINTENANCE_V0.md`.

## Outputs

- `source_ledger_curation_packet`
- `packet_map_update_note`
- `notebook_binding_update_note`
- `lifecycle_state_delta`
- `residual_gap_register`
- `review_handoff`
- `boundary_review_note`

## Boundary

- Metadata-only and owner-boundary aware.
- It does not copy source payloads, NotebookLM answer text, auth/session
  material, or private runtime paths into public workflow canon.
- It does not itself approve source truth, owner approval, ontology, canon
  promotion, graph mutation, archive, or retire actions.

## Current Maturity

`validation_level: pilot_executed_private_evidence`

This package now has one bounded private practice run proving that reusable wiki
maintenance can be expressed as metadata-only curation packets and residual-gap
notes. It is still not production-ready.
