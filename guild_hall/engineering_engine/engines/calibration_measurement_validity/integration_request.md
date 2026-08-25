# Shared integration request — Calibration and Measurement Validity E11

Status: request only; no shared surface was modified by this domain worker.

## Requested sequential integration

1. Add the E11 focused validator to root `package.json`, following the existing `validate:quality-readiness` pattern without altering unrelated scripts.
2. Add `engines/calibration_measurement_validity/**` to the shared Engineering Engine topology, manifest, and release generation allowlists; regenerate those shared artifacts in the factory integration worktree.
3. Decide and implement the shared descriptor/adapter discovery registration path. The package self-registers only when its evaluator adapter is imported; it does not alter Core global loading behavior.
4. Run existing Core-domain conformance and the new focused validator after all generated shared surfaces are refreshed.

## Required validation shape

```text
node --check <each E11 .mjs source>
node --test guild_hall/engineering_engine/engines/calibration_measurement_validity/tests/calibration_measurement_validity.test.mjs
npm.cmd run validate:engineering-engine-core-domain
<regenerated shared manifest/topology checks>
```

## Non-requests

- No Core Interface, `.registry/engineering_profiles/schemas/**`, root document, release-authority, MCP, Watchtower, or production-binding change is requested.
- No profile delta, raw certificate ingestion, interval-selection policy, unit conversion, uncertainty calculation, or live project pilot is proposed.

## Compatibility evidence

The focused test assembles the zero-profile base ruleset through `assembleEffectiveRuleSet` and evaluates it through the existing Core `evaluate` function. Non-empty profile deltas return `CMV_PROFILE_UNSUPPORTED` until a separately accepted shared/Profile integration exists.
