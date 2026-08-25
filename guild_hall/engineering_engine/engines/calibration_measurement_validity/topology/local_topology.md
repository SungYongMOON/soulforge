# E11 local topology

```text
calibration_measurement_validity/
├── engine.yaml                         descriptor and public claim ceiling
├── contracts/                          source boundary and build contract
├── schemas/                            public schema vocabulary
├── rules/                              base rule set and immutable refs
├── compiler/                           base-rule compiler Adapter
├── evaluator/                          pure evaluator and Core Adapter
├── fixtures/                           public-synthetic inputs only
├── tests/                              hostile, replay, Core, and zero-write proof
├── tools/                              one public-synthetic zero-write runner
├── topology/                           local manifest factory and this topology
└── manual/                             implementation and boundary guide
```

Owned implementation authority ends at this directory. The package receives Core Adapter calls but does not own the Core registry, profile-schema catalog, global topology, release manifest, or production binding.

The manifest factory emits only the existing common module-manifest shape from caller-supplied exact values. It does not create a release, publish a module, or claim an actual build artifact.
