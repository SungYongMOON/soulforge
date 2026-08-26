# Material Procurement Closed Error Model v0

All public seams fail closed with a stable code; callers must not infer a missing fact, source,
authority, or action from a generic exception.

| code family | boundary |
| --- | --- |
| `MPR_PROJECT_EVIDENCE_INPUT_INVALID` | malformed injected adapter input or snapshot row shape |
| `MPR_PROJECT_BINDING_INVALID` | wrong project/domain/revision/authority/reference shape, including floating reference |
| `MPR_PROJECT_SOURCE_NOT_MEMBER` | material source or net-open proof is not a declared binding source |
| `MPR_PROJECT_SNAPSHOT_MISMATCH` | binding, typed facts, and injected snapshot do not name the same exact snapshot |
| `MPR_PROJECT_MATERIAL_COVERAGE_INVALID` | duplicate/missing/extra material-need binding coverage |
| `MPR_PROJECT_NET_OPEN_PROOF_REQUIRED` | non-null open supply lacks same-need/snapshot proof |
| `MPR_PROJECT_CUTOFF_INVALID` | cutoff shape/order/date or evaluator-cutoff equality fails |
| `MPR_TYPED_FACTS_INVALID` / `MPR_TYPED_FACTS_DIGEST_INVALID` | complete typed envelope or its digest fails ingress validation |
| `MPR_AUTHORITY_REFUSED` | non-empty/action authority was supplied to the evaluator |
| `MPR_RULESET_INVALID` | ruleset shape, source packet, or derived binding is invalid |

No error path may fall back to a live ERP lookup, RAG answer, default source, or procurement action.
All caller tokens and reference entity/revision strings reject local/absolute paths, file URIs,
credential/secret/bearer/private-key sentinel shapes, and known synthetic credential prefixes.
