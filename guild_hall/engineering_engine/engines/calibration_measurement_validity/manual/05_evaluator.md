# 05 — Evaluator

The evaluator first rejects unsafe structures, accessors, proxies, prototype-sensitive keys, path/secret-like strings, malformed immutable references, invalid time shapes, and unlike-unit comparisons. It then derives each criterion from typed facts only.

Aggregation is deliberately fail-closed:

1. `exception_held` yields `held` / `hold`.
2. `expired`, `out_of_range`, or `not_suitable` yields `invalid` / `invalidate`.
3. `missing` or `unknown` yields `unknown` / `hold`.
4. Only otherwise complete valid/not-applicable evidence yields `valid` / `none`.

The priority makes a formally held exception visible rather than allowing another apparent pass to conceal it.
