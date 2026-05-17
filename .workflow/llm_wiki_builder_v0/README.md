# LLM Wiki Builder v0

`llm_wiki_builder_v0` is the end-to-end orchestration workflow for bounded
wiki-backed project research.

It ties together project wiki preflight, candidate triage, optional sourcebound
deepening, curation planning, usage-capture handoff, and governance routing so
an agent can answer a knowledge-heavy monster without restarting from raw
sources every time.

## Outputs

- `builder_scope_packet`
- `preflight_result_ref`
- `candidate_triage_ref`
- `sourcebound_route_ref`
- `curation_result_ref`
- `usage_capture_note`
- `final_builder_handoff`
- `boundary_review_note`

## Boundary

- This workflow coordinates the stack; it does not collapse all authority into
  itself.
- NotebookLM remains advisory.
- Source truth remains with approved sources.
- Owner decisions and final claim upgrades remain outside the builder.

## Current Maturity

`validation_level: pilot_executed_private_evidence`

This package now has one bounded private practice run showing that preflight,
candidate triage, known-gap stop, curation, and builder handoff can be run as
one coherent route. It is still not production-ready.
