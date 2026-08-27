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

At the public Core evaluation seam, the package snapshots the whole caller-owned effective-ruleset and evidence graph through descriptors before it reads `.request`, a Core trace, a requirement, a provenance row, or a receipt. The base lane accepts exactly one raw CMV domain request or one complete adapted Typed Facts v1 envelope; a wrapper, hybrid, accessor, Proxy, symbol, custom prototype, alias, cycle, sparse array, stale receipt, bad cutoff, or forged authority is a declared CMV error. A Core assembly is checked as an exact outer/trace/Profile shape and against the existing Core canonical null-stripped digest. Direct base-ruleset compatibility remains separate; derived rulesets always require the complete Core assembly and revalidated Typed Facts path.
