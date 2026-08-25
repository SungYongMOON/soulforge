# 04 — Vocabulary

| Term | E11 meaning |
| --- | --- |
| `instrument_id` / `identity_ref` | Upstream identity facts for the particular instrument under evaluation. |
| `tested_at` | Canonical UTC instant at which calibration validity is checked. |
| `due_at` | Upstream calibration-program due time. E11 compares it; E11 does not create it. |
| `range` | Requested or calibrated minimum, maximum, and unit. No conversion occurs. |
| `accuracy_limit` | Supplied non-negative limit compared like-for-like. |
| `expanded uncertainty` | Supplied maximum uncertainty / capability values. E11 does not calculate uncertainty. |
| `chain_ref` | Typed reference showing that traceability evidence was supplied; it is not itself a traceability assertion. |
| `exception_held` | An approved exception requires a hold; it is never converted into valid evidence. |

Evidence states are `valid`, `missing`, `unknown`, `expired`, `out_of_range`, `not_suitable`, `exception_held`, and `not_applicable`. Aggregate result states are `valid`, `unknown`, `held`, and `invalid`.

Source classes are `official_public_direct`, `rag_retrieval_only`, `controlled_citation_only`, or explicit hold classes. Only the first class can enter source-bound Typed Facts or satisfy a Q1 Profile requirement.
