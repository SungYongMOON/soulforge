# Factory integration request — BOM and Supply-Chain Risk E08

## No requested Core change

The package conforms to the existing `domain_engine_adapter` interface,
`resolveProfileBindings`, `assembleEffectiveRuleSet`, `adaptProjectEvidence`,
and `evaluate` seams. It requests no modification to Core, profile schemas, root
package scripts, or Watchtower.

## Sequential factory-owned changes proposed

1. Add `engines/bom_supply_chain_risk/engine.yaml` to the shared engine
   descriptor/topology/manifest/release generation inputs.
2. Extend the shared multi-domain adapter conformance surface with the new
   package only after the factory regenerates and validates its global outputs.
3. Preserve the package's status as `candidate` and claim ceiling as
   `source_supported`; do not label it production-ready, contract-compliant, or
   project-accepted.

## Preconditions

- This package's focused tests, zero-write runner, source/public-private scan,
  and fresh independent review have accepted the actual commit.
- The factory re-runs all shared topology/manifest/release validators after
  integration. A regeneration drift, Core interface change, or shared-validator
  failure is a HOLD for the integration lane, not a reason to modify this
  package's risk rules silently.
