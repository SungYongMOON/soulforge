# Typed facts and evaluator

The evaluator accepts Core `soulforge.typed_project_facts.v0` only. It finds one
`bom_supply_chain_risk_snapshot_v0` observation, validates a closed public-safe
item schema, sorts item identities deterministically, and evaluates all nine
base rules per item.

Evidence references are opaque tokens such as `evidence:item-lifecycle`; paths,
URLs, source bodies, credentials, and raw supplier/ERP payloads are not valid
typed facts for this package. The evaluator preserves explicit fact conflicts and
does not select a preferred source. It issues only these states:

| State | Result |
| --- | --- |
| `evidence_sufficient` | bounded fact/evidence supports this risk projection |
| `risk_detected` | bounded fact meets the risk condition |
| `unknown` | a needed fact, evidence, threshold, or applicability fact is unresolved |
| `conflict` | a declared typed-fact conflict is retained |
| `not_applicable` | only an explicitly basis-pinned alternate requirement can be not applicable |
