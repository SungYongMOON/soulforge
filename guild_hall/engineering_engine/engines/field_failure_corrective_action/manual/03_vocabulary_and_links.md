# 03 — Vocabulary and links

Case kinds are intentionally small: `field_failure`, `ncr`, and `car`. Every row has a case ID,
one candidate rule ID, applicability state, observation state, and a public-safe evidence object.
The rule determines which evidence keys are allowed.

Every row retains five exact sorted link groups:

- configuration references;
- test references;
- affected lot references;
- affected asset references; and
- evidence-receipt references.

At least one lot or asset and one evidence receipt are required. The engine does not dereference
these references, turn them into raw data, or infer that an empty category means no impact.
Duplicate/unsorted lists, local paths, secrets, and unknown keys are refused.
