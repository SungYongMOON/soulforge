# E06 Reliability and Maintainability — Shared Integration Request v0

Status: `pending_factory_integration`. This is a request, not a shared-surface change.

## Candidate package delivered

`guild_hall/engineering_engine/engines/reliability_maintainability/**` provides a
source-supported, deterministic R&M candidate package with a descriptor, source packet,
schema, vocabulary/rules, Core-compatible compiler/evaluator Adapters, synthetic fixture,
hostile/replay/zero-write tests, manual, and local topology/manifest factory.

## No Core Interface dependency

The package uses the current `domain_engine_adapter.mjs` Core seam unchanged:

- compiler: `compile(profileBindings, options)`;
- evaluator: `evaluate(effectiveRuleSet, typedProjectFacts, authority, cutoffs)`;
- Profile Binding: existing Core provenance/digest contract;
- Typed Project Facts: `{ request }` envelope carrying the exact R&M input contract.

No Core code, Profile schema, root script, whole-engine manifest/topology/release, or Watchtower
file was changed or needs an E06-specific semantic change.

## Factory-manager-owned proposed integration steps

1. Review the package and independently validate its source/claim boundary.
2. Add the descriptor to the manager-owned whole-engine package discovery/release surface only
   if the factory’s sequential integration policy permits it.
3. Add a root focused validator alias only in the shared integration lane; the proposed command
   is the five local commands listed in the package README.
4. Regenerate and verify the manager-owned whole-engine manifest, topology, and release
   artifacts after all parallel domain packages are integrated.
5. Extend shared multi-domain conformance only through the manager lane, using a fixture that
   proves the R&M adapter identity without promoting a project fact or Profile-added rule.

## Integration guards

- Preserve `source_supported` ceiling and `candidate` status.
- Do not treat a package test as NASA/GSFC applicability, compliance, Quality acceptance,
  closure acceptance, product release, or project activation.
- Do not introduce a Quality-to-R&M token alias or collapse the two domains’ evidence semantics.
- Do not merge raw source bodies, project/customer facts, paid standards, credentials, or
  private workspace material into public or `_workmeta` surfaces.
- If exact Opus review, source lock, or package validator evidence is unavailable, retain
  `HOLD` rather than integrating.
