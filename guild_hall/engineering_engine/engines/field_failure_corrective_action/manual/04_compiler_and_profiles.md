# 04 — Compiler and Profiles

The compiler implements the existing Core adapter method `compile(profileBindings,
compilationScope)`. It emits the exact public FFCA base ruleset plus Core-visible profile
provenance. Core remains responsible for Profile binding identity, order, source references, and
compilation trace.

FFCA v0 allows only identity-only profile bindings: `operations` must be empty. This is
deliberate. A domain-specific add/alias/condition operation would need source, applicability,
and ownership review before it could affect evidence semantics. Refusing it is safer than
pretending that a profile name creates a valid FFCA requirement.

The evaluator also verifies the exact base source packet and ruleset. A derived or substituted
ruleset receives a closed error instead of a partial result.
