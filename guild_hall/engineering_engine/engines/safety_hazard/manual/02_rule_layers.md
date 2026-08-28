# 02. Rule layers

Base candidate rules live in `rules/safety_hazard_rules.mjs`. They are source-bound metadata,
not default project obligations. Each evaluation binding must name every base rule with an exact
stage ref and `human_rule_acceptance_ref`.

The existing Core Profile contract preserves ordered organization/project provenance. E07 supports
only bounded `{ op: "add", rule: <closed safety-hazard rule> }` operations. A Profile-added rule
must cite one of that Profile's exact source refs. It can compile into a derived ruleset, but its
evaluation fails closed until an owner accepts its separate evaluation semantics.
