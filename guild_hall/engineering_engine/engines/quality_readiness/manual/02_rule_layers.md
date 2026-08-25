# 02. Rule layers

Common chassis: [../02_rule_layers.md](../02_rule_layers.md).

E01 rule candidates live in `rules/quality_readiness_rules.mjs`. They remain data unless the binding names each rule in its explicit, sorted `accepted_rule_bindings` with an exact stage ref and Owner-acceptance ref. No candidate is selected by default.

Profile bindings support bounded `{ op: "add", rule: <closed_rule_row> }` operations to compile derived rulesets with explicit per-rule provenance, leaving base candidate authority unchanged.

`allowed_artifact_tokens` treats `null` as a value: `[null]` accepts source-native evidence and `[]` accepts no artifact at all. Both the base candidate rows and Profile-added rows rely on that distinction, so the compiler normalises and re-verifies `operation_digest` through the single Core helper `normalizeProfileOperations` in `core/interfaces/profile_operation_canon.mjs`, which preserves every `null`. The compiler holds no second copy of that formula, and a binding whose digest was taken over null-stripped operations fails closed with `QR_PROFILE_BINDINGS_INVALID`.

Claim boundary: preserving `null` keeps the two rule statements distinguishable through the binding, the derived ruleset ref, and the Core assembly digest. It does not decide sufficiency, and it does not extend E01 evaluation, which stays bound to the base ruleset.
