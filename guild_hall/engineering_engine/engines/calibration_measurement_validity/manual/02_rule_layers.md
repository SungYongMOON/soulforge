# 02 — Rule layers

The v0 compiler accepts exactly the base public rule set. It accepts the Core compiler call with zero profiles, preserves the Core assembly receipt, and rejects a non-empty Organization or Project Profile delta with `CMV_PROFILE_UNSUPPORTED`.

This is intentional: no organization interval policy, customer procedure, or project exception policy has been approved for this package. A future profile layer must preserve the existing Core provenance fields and have a separately accepted evaluator policy before it can alter any E11 rule.

The base rules are identity, calibration timing, range, accuracy, uncertainty, traceability, environment, exception, and aggregate result impact.
