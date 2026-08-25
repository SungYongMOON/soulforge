# E11 local topology

```text
calibration_measurement_validity/
├── engine.yaml                         descriptor and public claim ceiling
├── contracts/                          source boundary and build contract
├── schemas/                            public schema vocabulary
├── rules/                              base rule set and immutable refs
├── compiler/                           base-rule compiler Adapter
├── evaluator/                          pure evaluator and Core Adapter
├── source/                              direct/RAG/controlled source classification
├── derivation/                          source-ref and claim-ceiling derivation rows
├── profile/                             source-bound Core Profile requirements
├── typed_facts/                         exact provenance and cutoff binding
├── observation/                         candidate-only source-bound observations
├── guidance/                            deterministic non-authoritative next steps
├── mcp/                                 unregistered read-only pure tool adapter
├── shared/                              canonical receipt and derived-ruleset digest helper
├── fixtures/                           public-synthetic inputs only
├── tests/                              hostile, replay, Core, source-bound, and zero-write proof
├── tools/                              base runner and Q1 public-synthetic zero-write pilot
├── topology/                           local manifest factory and this topology
└── manual/                             implementation and boundary guide
```

Owned implementation authority ends at this directory. The package receives Core Adapter calls but does not own the Core registry, profile-schema catalog, global topology, release manifest, or production binding.

The manifest factory emits only the existing common module-manifest shape from caller-supplied exact values. It does not create a release, publish a module, or claim an actual build artifact.
