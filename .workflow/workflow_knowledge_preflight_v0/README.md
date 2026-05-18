# Workflow Knowledge Preflight v0

`workflow_knowledge_preflight_v0` is the generic knowledge investigation
workflow that runs before a target workflow starts.

It checks reusable knowledge surfaces in a fixed order:

1. `.registry/knowledge`
2. canon-backed Obsidian export or wiki index
3. NotebookLM bindings and notebook/source maps
4. `_workmeta` evidence, source packets, and prior claim-ceiling routes
5. Drive or canon-package refs when the earlier surfaces are not enough

The result is a bounded metadata-only handoff that tells the target workflow:

- what can already be answered from existing knowledge surfaces,
- what still requires source deepening,
- which claim ceiling is currently safe,
- and whether the task should route into sourcebound deepening or wikiization.

## Outputs

- `knowledge_preflight_packet`
- `query_first_plan`
- `source_scope_recommendation`
- `claim_ceiling_seed`
- `target_workflow_handoff`
- `boundary_review_note`

## Boundary

- Registry and Obsidian view are checked first as canon-backed reusable surfaces.
- NotebookLM is advisory only.
- `_workmeta` and source packets can support deeper context, but they do not
  turn the preflight itself into source truth or owner approval.
- Drive is checked last as storage/package support, not canon authority.

## Current Maturity

`validation_level: draft`

This package is a generalized successor over the older
`monster_knowledge_preflight_v0` concept. It is not yet pilot-executed.
