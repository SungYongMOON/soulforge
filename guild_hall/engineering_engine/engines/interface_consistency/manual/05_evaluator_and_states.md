# 05. Evaluator and states

The evaluator emits an `assessments` object keyed by canonical interface ID. Each value
contains one finding in each fixed rule slot, in this fixed order:
`IC-REG-01`, `IC-ELEC-01`, `IC-SIG-01`, `IC-DATA-01`, `IC-MECH-01`, `IC-TIME-01`,
`IC-REV-01`, and `IC-BILAT-01`.

Each required category attribute is compared pair by pair using E02's bounded local stable
encoding over the existing Core-compatible value domain. Fractional values use fixed decimal
strings, arrays remain insertion-ordered, and instant-shaped strings must be canonical
`.mmmZ` instants; there is no unit conversion or implicit time/version interpretation.
Each assessment carries a canonical `pairs` object keyed by the canonical pair key. Each
pair contains the eight fixed rule outcomes in the documented order, so pair identity is
owned once rather than repeated under every rule. A JSON object has one value per pair key,
so duplicate pair identities cannot be projected. Consumers derive finding, interface,
overall, and count summaries from those pair-owned outcomes instead of trusting redundant
projections. The result omits actual values and carries only rule/category IDs, pair-keyed
states, and detail codes.

The assessment JSON Schema owns structural closure only. The exported
`verifyInterfaceConsistencyAssessment` verifier is the sole dynamic cross-document
authority: it re-admits the input and result, derives the exact interface and canonical
pair sets, checks all fixed pair rule slots, and binds the assessment and receipt digests.
Its third `effectiveRuleSet` argument is mandatory and re-admitted inside verification so
reclosed same-key outcomes are compared to deterministic replay. The evaluator runs that
verifier before returning; raw AJV alone is not claimed to prove input-identity equality.

`IC-REG-01` confirms that an admitted typed register has the required bounded structural
shape and end pairs. It does not verify that an external interface register is complete,
authoritative, approved, or role-policy compliant.

| state | meaning |
| --- | --- |
| `satisfied` | All in-scope required facts are present and pairwise identical. |
| `gap_missing` | At least one required fact is explicitly `known_absent`. |
| `gap_unknown` | Scope, required attribute, or an observation is not known. |
| `gap_conflict` | Supplied ends, revisions, agreement state, units, or values conflict. |
| `not_applicable` | Typed facts explicitly mark the interface/category outside scope. |

Derived interface state uses the highest observed risk: conflict, missing, unknown,
then satisfied/not-applicable. It is an assessment of supplied typed facts only. A derived
count treats both data-value conflicts and governance/applicability conflicts as
`gap_conflict`; E02 does not invent a separate terminal enum for them.
