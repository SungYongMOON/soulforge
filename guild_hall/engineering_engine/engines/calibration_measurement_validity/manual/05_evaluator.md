# 05 — Evaluator

The evaluator first rejects unsafe structures, accessors, proxies, prototype-sensitive keys, path/secret-like strings, malformed immutable references, invalid time shapes, and unlike-unit comparisons. It then derives each criterion from typed facts only.

Aggregation is deliberately fail-closed:

1. `exception_held` yields `held` / `hold`.
2. `expired`, `out_of_range`, or `not_suitable` yields `invalid` / `invalidate`.
3. `missing` or `unknown` yields `unknown` / `hold`.
4. Only otherwise complete valid/not-applicable evidence yields `valid` / `none`.

The priority makes a formally held exception visible rather than allowing another apparent pass to conceal it.

When a Q1 source-bound Profile is present, Core evaluates its compiled requirement set before the final package result is returned. Unmet direct-source evidence appends a source-bound Profile hold and returns `unknown` / `hold`; a Profile cannot turn an invalid or unknown base result into valid.

The old bare v0 input remains compatible only for a base, zero-Profile ruleset. A derived source-bound ruleset requires the complete revalidated Typed Facts v1 envelope; missing or malformed input fails closed. Only a complete envelope whose accepted source set does not satisfy the Profile requirement returns a visible `hold` / `observed` result.
