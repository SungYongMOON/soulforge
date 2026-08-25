# 05 — Compiler

The compiler accepts normalized Core Profile Bindings and closed `add` or
`disable` operations. It produces a deterministic effective ruleset and keeps
per-added-rule profile provenance. Derived rules are evaluated, not merely
compiled.

Worked public-synthetic compile:

```text
resolveProfileBindings(orgProfile, null)
  -> one provenance-preserving binding
assembleEffectiveRuleSet(databaseEngineeringAdapter, bindings, { purpose })
  -> effective rules + compilation trace + assembly digest
```

An inventory-anchored base rule may be `hard_technical` only when its own
platform/evidence contract closes. A Profile-added rule must declare
`source_authority: profile_declared`, remains `observed`, and is advisory; its
source refs are checked against that Profile Binding rather than silently
treated as public inventory authority.
