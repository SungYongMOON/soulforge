# Safety and Hazard E07 — shared integration request v0

Status: proposed integration request; no shared surface was modified by this domain task.

## Candidate package

- `domain_engine_id`: `safety_hazard`
- descriptor: `engines/safety_hazard/engine.yaml`
- package root: `engines/safety_hazard/`
- candidate claim ceiling: `source_supported`
- execution mode: `deterministic_only`
- runtime effect: zero read/write/network/model/RAG/ERP/task/acceptance effects

## Requested factory-owned work

1. Add this package to the whole-engine topology/manifest and release-generation input after
   validating its descriptor and package-local tests.
2. Extend the shared two-domain/generated conformance surface to a third adapter only in the
   sequential integration lane.
3. Decide whether the package-focused commands should gain a root script; do not change the root
   package surface from this leaf.
4. Regenerate shared artifacts only after the prior items are accepted and preserve the existing
   Core ABI.

## No Core Interface request

The package implements the existing `compile(profileBindings, compilationScope)` and
`evaluate(effectiveRuleSet, typedProjectFacts, authority, cutoffs)` adapter surface. This
candidate deliberately keeps `compilationScope`, `authority`, and `cutoffs` semantically inert
at the adapter boundary because its typed request pins the applicable evidence; it does not use
free-form parameters to choose authority. Base rules evaluate through a
`typedProjectFacts.request` compatibility envelope, following the existing Quality domain
pattern. Profile-added rules compile with provenance but deliberately fail closed for evaluation
until a separate owner-approved evaluation contract exists.

## Required integration evidence

- package-focused tests and runner exit zero;
- generated topology/manifest validation exit zero;
- base adapter registration, Profile provenance, and Core Typed Facts seam still pass;
- no public/private/secret boundary regression;
- no claim that synthetic evidence accepts a residual risk, closes a hazard, or activates a live
  project/module.

## Explicitly deferred

- global manifest/topology/release bytes;
- Core, Profile-schema, root script, Watchtower, registry, writer, MCP, and production binding
  changes;
- real project applicability, contract interpretation, actual human authority validation,
  acceptance/closure actions, and protected-standard use.
