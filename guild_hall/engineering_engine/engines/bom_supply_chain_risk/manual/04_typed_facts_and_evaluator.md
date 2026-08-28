# Typed facts and evaluator

The evaluator accepts Core `soulforge.typed_project_facts.v0` only. It finds one
`bom_supply_chain_risk_snapshot_v0` observation, validates a closed public-safe
item schema, sorts item identities deterministically, and evaluates all nine
base rules per item.

Evidence references are opaque tokens such as `evidence:item-lifecycle`; paths,
URLs, source bodies, credentials, and raw supplier/ERP payloads are not valid
typed facts for this package. The evaluator preserves explicit fact conflicts and
does not select a preferred source. It issues only these states:

The evaluator consumes all four Core arguments. `authority` is the closed empty
no-action object. `cutoffs` is either closed empty or exactly the canonical
millisecond `valid_at`/`known_at` pair already in typed facts; `known_at` cannot
precede `valid_at`. It does not accept raw observations or hybrid fact envelopes.

All values that can be echoed into the public result/receipt are checked as
public-safe opaque material. Credential-shaped values and local/UNC/file paths
are refused before evaluation; the package neither redacts nor republishes them.

For S2 / DFARS 252.246-7007, the typed snapshot carries two independent gates:
exact clause incorporation and Cost Accounting Standards applicability. Both
must be affirmative and each basis ref must match a digest-bound
`project_typed_fact` evidence member for S2 and its specific gate. Any unknown,
negative, missing, or mismatched gate keeps BOM-SCR-06 `unknown`; this is neither
a compliance conclusion nor `not_applicable`.

| State | Result |
| --- | --- |
| `evidence_sufficient` | bounded fact/evidence supports this risk projection |
| `risk_detected` | bounded fact meets the risk condition |
| `unknown` | a needed fact, evidence, threshold, or applicability fact is unresolved |
| `conflict` | a declared typed-fact conflict is retained |
| `not_applicable` | only an explicitly basis-pinned alternate requirement can be not applicable |
