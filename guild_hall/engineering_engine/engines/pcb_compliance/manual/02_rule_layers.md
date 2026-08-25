# 02. Rule layers

Shared chassis: [rule layers](../../../manual/02_rule_layers.md).

Base rules are public-source candidates. A Core-validated Organization or Project Profile may
add a typed, source-bound rule, but cannot replace the base rule pack, create an authority, or
raise the `source_supported` claim ceiling. Controlled standard bodies remain a binding gate.

Every derived rule set repeats and pins the complete immutable base pack. Its content identifier
covers the full rules list and exact profile-rule provenance, so adding a profile rule cannot hide
a changed or deleted base rule.
