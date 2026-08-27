# Project Binding and Typed Facts

Project Binding owns the link from an actual project source revision to the
engine vocabulary. Typed Project Facts own what was observed. The compiler
does not read documents, ERP, RAG, or a project workspace; the evaluator does
not alter a Binding or manufacture a fact.

The direct public seam requires one exact Project Binding. Through Core, the
adapter accepts only the unmodified canonical Typed Project Facts envelope:
`schema_version`, `project_binding_ref`, `facts`, `facts_digest`, `valid_at`,
and `known_at`. The Project Binding requires Core's five fields:
`schema_version`, `project_id`, `domain_engine_id`, `binding_revision_hash`,
and `source_manifest_ref`; it accepts only Core's defined optional authority,
time, and document-reference fields. The adapter verifies real UTC calendar
components and chronology (fixed to Core's canonical three-digit millisecond precision),
the facts digest, and eight closed facet rows before projecting them into the direct E05
request shape. There is no ad hoc `request` or
`manufacturing_readiness_request` field.

The package's Core conformance test uses `assembleEffectiveRuleSet` and
`evaluate` with an adapter-produced Typed Project Facts envelope. It makes no
Core change and carries only public-synthetic data.
