# 02. Rule layers

Shared chassis: [Engineering Engine manual](../../../manual/README.md).

Base rules are public-source candidates with `claim_ceiling: source_supported`. A Core-validated
Organization or Project Profile may add a typed, source-bound rule, but cannot replace the base rule pack,
create an authority, or mint a `source_supported` ceiling. Because no package-owned accepted Profile source
registry exists in this slice, all Profile-added rules are strictly `claim_ceiling: observed` (or HOLD where
controlled). Aggregate domain results clamp to `observed` whenever any evaluated rule is `observed`.

Every derived rule set repeats and pins the complete immutable base pack. Its content identifier covers the
full rules list and exact 6-field profile-rule provenance (`operation_index`, `operation_item_digest`,
`profile_id`, `profile_kind`, `profile_order`, `source_ref`). Derived rulesets require a complete Core compilation
envelope; bare input is permitted solely for the immutable base ruleset. Reconstructed operations are strictly
rebuilt and verified in `operation_index` order against the Core compilation trace digest.
