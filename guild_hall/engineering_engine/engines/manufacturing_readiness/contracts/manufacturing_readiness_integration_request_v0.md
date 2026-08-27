# Manufacturing Readiness integration request v0

## Request

The factory integration lane may consider the isolated
`engines/manufacturing_readiness/**` package only after the manager or factory
independently re-runs the deterministic package validators, verifies the current
package receipt, and obtains a fresh independent Opus review with an `ACCEPT`
verdict. Until those gates pass and the manager authorizes the next step, the
E05 worker must not commit, push, register, or integrate this package.

## Shared surfaces intentionally not changed by E05

This worker does not modify:

- `guild_hall/engineering_engine/core/**`;
- `.registry/engineering_profiles/schemas/**`;
- root `package.json`;
- whole-engine topology, manifest, release manifest, or Watchtower federation;
- root ownership, roadmap, or changelog documents.

## Proposed sequential integration work

1. Add a root validation alias for the exact package-owned checks only after
   confirming no conflict with the factory's other domain lanes.
2. Update the explicit shared topology root roster from its existing three
   domain packages to four only through the factory's canonical commands. The
   tracked-engine byte manifest already discovers package paths and must not be
   treated as a separate E05 registration authority.
3. Extend shared Core conformance from its existing three domains to four only
   in the integration lane; retain Core as the interface owner.
4. Hold any release-manifest inclusion for an integration-owner decision because
   the current release emitter is not a generic domain-package registry.
5. Update shared documentation, owner maps, and changelog only when the
   integration owner determines the package has a public-safe landing surface.

## Preconditions and non-goals

- The worker remains uncommitted and unpushed until manager revalidation and a
  fresh independent Opus `ACCEPT` review both pass.
- Passing package validation or review does not authorize a worker to modify
  Core, root, registry, topology, release, or other shared surfaces.
- Registration does not promote source candidates to standards compliance,
  production, live project acceptance, product acceptance, ERP truth, or
  build-start authority.
- Profile-derived rules remain evaluator `HOLD` until a separately source-bound
  evaluator revision is accepted.
- Any shared interface incompatibility is a return-to-E05 repair request, not
  authority for a Core change in this worker lane.
