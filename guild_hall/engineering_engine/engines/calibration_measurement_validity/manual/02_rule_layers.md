# 02 — Rule layers

The base public rule set remains unchanged. Q1 adds one narrow, source-bound Profile operation: `source_bound_requirements`. It may require an exact set of known public sources to be classified as `official_public_direct`; it cannot add, remove, relax, or rewrite an E11 rule.

The compiler preserves the Core Profile identity, revision/hash, base pin, source refs, order, and Core operation digest in the derived effective ruleset. A missing source requirement yields an evaluation hold. Any other operation, empty non-base Profile, organization interval policy, customer procedure, or project exception policy fails closed.

The base rules are identity, calibration timing, range, accuracy, uncertainty, traceability, environment, exception, and aggregate result impact.
