# Manufacturing Readiness Domain Engine

Status: public deterministic implementation candidate.  The engine assesses
revision-pinned, supplied facts for a bounded build-start review.  It does not
authorize a build start, accept quality, approve design, or assert ERP truth.

## Package map

- [`engine.yaml`](engine.yaml) — descriptor and seam references.
- [`contracts/`](contracts/) — public-safe source inventory, derivation boundary,
  and integration request.
- [`schemas/`](schemas/) — closed public request/result vocabulary.
- [`rules/`](rules/) — base facets and deterministic ruleset identity.
- [`validators/`](validators/) — Proxy-safe public-data admission shared only inside E05.
- [`compiler/`](compiler/) and [`evaluator/`](evaluator/) — Domain Adapter
  implementation behind the existing Engineering Engine Core Interface.
- [`fixtures/`](fixtures/) and [`tests/`](tests/) — public-synthetic and hostile
  evidence only.
- [`tools/`](tools/) — zero-write synthetic runner.
- [`manual/`](manual/) and [`topology/`](topology/) — operating boundary and
  local manifest factory.

## Decision boundary

The only positive terminal state is
`build_start_evidence_ready_for_owner_review`.  It means the engine observed
under one exact Project Binding that every applicable facet is present and
`criteria_met`, any non-applicable facet has a bounded basis reference, at least
one facet is applicable, and no missing, unknown, or conflict gaps exist in the
supplied facts. Not every declared facet need be applicable or evidenced for
this state. A human Owner remains responsible for any real build-start decision.

Source, contract, application, authority, project binding, design, quality,
inventory, inspection, supplier, or material uncertainty stays `UNKNOWN/HOLD`.
