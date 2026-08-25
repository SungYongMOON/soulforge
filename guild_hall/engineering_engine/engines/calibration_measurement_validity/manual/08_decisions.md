# 08 — Decisions

| Decision | Reason |
| --- | --- |
| Do not calculate/recommend intervals | NIST public guidance says no universal interval applies; interval policy is upstream. |
| Compare only like units | Conversion introduces unapproved semantics and data dependencies. |
| Treat missing facts as distinct from invalid facts | A lack of evidence must not become a failure claim or a pass claim. |
| Hold approved exceptions | Exception approval is not validity; it is a reason not to silently pass the result. |
| Reject profile deltas in v0 | No profile semantics or source-supported policy has been integrated. |
| Use no RAG in the evaluator | Retrieval is not a source of verdict authority. |
