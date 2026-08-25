# 05. Evaluator and states

For each interface, the evaluator emits one finding for each fixed rule:
`IC-REG-01`, `IC-ELEC-01`, `IC-SIG-01`, `IC-DATA-01`, `IC-MECH-01`, `IC-TIME-01`,
`IC-REV-01`, and `IC-BILAT-01`.

Each required category attribute is compared pair by pair using E02's bounded local stable
encoding over the existing Core-compatible value domain. Fractional values use fixed decimal
strings, arrays remain insertion-ordered, and instant-shaped strings must be canonical
`.mmmZ` instants; there is no unit conversion or implicit time/version interpretation.
Every finding carries ordered `pair_results`, so a three-end interface can show an
`A<->B` match independently from `A<->C` and `B<->C` conflicts. The rule state is an
aggregate of those pair states. The result omits actual values and carries only IDs,
states, pair keys, and detail codes.

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

The overall interface state uses the highest observed risk: conflict, missing, unknown,
then satisfied/not-applicable. It is an assessment of supplied typed facts only.
Counts intentionally aggregate both data-value conflicts and governance/applicability
conflicts under `gap_conflict`; E02 does not invent a separate terminal enum for them.
