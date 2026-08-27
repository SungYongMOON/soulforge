# Shared integration request — Calibration and Measurement Validity E11

Status: request only; no shared surface was modified by this domain worker.

## Requested sequential integration

1. Add the E11 focused validator to root `package.json`, following the existing `validate:quality-readiness` pattern without altering unrelated scripts.
2. Add `engines/calibration_measurement_validity/**` (including its Q1 source/Profile/Typed Facts/observation/guidance/MCP/pilot modules) to the shared Engineering Engine topology, manifest, and release generation allowlists; regenerate those shared artifacts in the factory integration worktree.
3. Decide and implement the shared descriptor/adapter discovery registration path. The package self-registers only when its evaluator adapter is imported; it does not alter Core global loading behavior.
4. Run existing Core-domain conformance and the new focused validator after all generated shared surfaces are refreshed.
5. Decide separately whether Core should publish its current recursive plain-JSON admission helper. Core `71e84074` pre-admits the outer adapter/effective-ruleset envelope, but does not export that helper for domain-owned Typed Facts, provenance, observation, guidance, or MCP contracts. Until a shared API is deliberately designed and tested, E11 retains its package-local exact ingress check and does not modify Core.

## Required validation shape

```text
node --check <each E11 .mjs source>
node --test guild_hall/engineering_engine/engines/calibration_measurement_validity/tests/calibration_measurement_validity.test.mjs guild_hall/engineering_engine/engines/calibration_measurement_validity/tests/calibration_measurement_validity_q1.test.mjs
node --test guild_hall/engineering_engine/core/tests/core_domain_conformance.test.mjs guild_hall/engineering_engine/core/tests/project_binding_hostile.test.mjs
npm.cmd run validate:engineering-engine-core-domain
<regenerated shared manifest/topology checks>
```

## Non-requests

- No Core Interface, `.registry/engineering_profiles/schemas/**`, root document, release-authority, MCP, Watchtower, or production-binding change is requested.
- No shared Profile schema change, raw certificate ingestion, interval-selection policy, unit conversion, uncertainty calculation, or live project pilot is proposed. E11 now supports only a package-local source-bound Profile operation that preserves existing Core bindings and fails closed otherwise.

## Compatibility evidence

The focused tests assemble both a zero-profile base and a source-bound non-empty Profile through `assembleEffectiveRuleSet`, then evaluate through the existing Core `evaluate` function. They additionally prove zero-read rejection for hostile outer/nested wrappers, exact raw-versus-Typed-Facts lane closure, rehashed Core/derived provenance refusal, exact observation/guidance/MCP envelopes, and schema/output parity for base, derived, MCP, and public-synthetic pilot outputs. Against a no-Git-metadata external archive view of Core `71e84074`, E11 focused tests passed 33/33, current Core admission/conformance passed 14/14, and no-duplicate authority passed.
