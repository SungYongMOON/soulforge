# 08 — Decisions

| Decision | Reason |
| --- | --- |
| Do not calculate/recommend intervals | NIST public guidance says no universal interval applies; interval policy is upstream. |
| Compare only like units | Conversion introduces unapproved semantics and data dependencies. |
| Treat missing facts as distinct from invalid facts | A lack of evidence must not become a failure claim or a pass claim. |
| Hold approved exceptions | Exception approval is not validity; it is a reason not to silently pass the result. |
| Reject unsupported profile deltas | Only the Q1 source-bound requirement operation is admitted; no profile can alter domain rules. |
| Use no RAG in the evaluator | Retrieval is not a source of verdict authority. |

Q1 narrows rather than reverses the Profile decision: one `source_bound_requirements` operation is accepted only after the existing Core normalizes and pins it. It changes no domain rule and can only hold an evaluation when direct source evidence is absent. RAG remains locator-only.
