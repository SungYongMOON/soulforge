# Manufacturing Readiness build mission v0

## Bounded output

The module deterministically compares supplied facts against the eight closed
manufacturing-readiness facets and returns one of:

- `build_start_evidence_ready_for_owner_review`;
- `hold`; or
- `not_applicable`.

The first state is evidence completeness for a human Owner review. It is not a
build release, manufacturing authorization, design approval, quality
acceptance, ERP transaction, or inspection conclusion.

## Required facts

Each run carries one exact Project Binding and exactly one public-safe fact row
for each of these facets:

1. drawings;
2. BOM;
3. processes;
4. tooling;
5. work instructions;
6. personnel and equipment prerequisites;
7. inspections; and
8. materials.

Each row states only `applicability`, `evidence_state`, and
`evaluation_state`, with an opaque basis reference when it is explicitly not
applicable. The project-specific source, authority, exact revision, and
evidence remain the responsibility of Project Binding and Typed Project Facts;
they are not stored in this public package.

## Stop conditions

Return or preserve `hold` if any applicable facet is unknown, has confirmed
absence, or has a criteria conflict. Refuse malformed, duplicate, incomplete,
payload-bearing, private-path-bearing, or source-body-bearing input. Do not
fall back to RAG, inferred inventory, generic source text, or an LLM verdict.

## Effects

The evaluator and runner are read-only. Their receipt fixes filesystem,
network, model, RAG, Wiki, ERP, Task, and approval effects at `0`.
