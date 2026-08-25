# Safety and Hazard package topology v0

```text
engine.yaml
contracts/  source packet, source inventory, derivation, integration request
schemas/    public descriptor schema
vocabulary/ closed severity, probability, risk, lifecycle, and evidence tokens
rules/      source-bound candidate metadata and ruleset ref
compiler/   Core Profile-aware compiler adapter
evaluator/  deterministic evidence evaluator and registered Core adapter
fixtures/   public-synthetic request only
tests/      hostile, replay, Core-conformance, and zero-write checks
tools/      stdout-only public-synthetic runner
manual/     owner-local domain manual delta
topology/   candidate manifest factory and this topology
```

No path in this package owns Core code, Profile schemas, whole-engine manifests, releases,
Watchtower federation, a project binding payload, a source body, or risk acceptance authority.
