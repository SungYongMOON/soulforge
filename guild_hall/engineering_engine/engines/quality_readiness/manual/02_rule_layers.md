# 02. Rule layers

Common chassis: [../02_rule_layers.md](../02_rule_layers.md).

E01 rule candidates live in `rules/quality_readiness_rules.mjs`. They remain data unless the binding names each rule in its explicit, sorted `accepted_rule_bindings` with an exact stage ref and Owner-acceptance ref. No candidate is selected by default.

Profile bindings support bounded `{ op: "add", rule: <closed_rule_row> }` operations to compile derived rulesets with explicit per-rule provenance, leaving base candidate authority unchanged.
