# 04. Compiler and Profile applicability

The compiler implements the existing Core Domain Adapter contract. It starts from eight
fixed rules and supports one Profile operation:

```text
{ op: "set_category_applicability", category: "data_protocol", applicable: false }
```

The supported category must be one of the eight fixed rules. The operation may only
tailor applicability; it cannot add rules, alter source metadata, redefine vocabulary,
or inject project facts. Ordered Organization/Project Profile provenance remains in the
Core compilation trace. A later profile may replace an earlier category setting, with
the latest binding retained as local provenance.

If a Profile setting and explicit typed scope contradict, the evaluator reports a
conflict rather than silently choosing one.

Applicability precedence is fixed. The top-level interface state is the outer scope:
`not_applicable` always yields `not_applicable`, and `unknown` always yields
`gap_unknown`, before any category or Profile decision. Only for an applicable interface
does an explicit comparison-category scope interact with a Profile setting. A missing
comparison-category scope remains `gap_unknown` even when a Profile says true or false,
because the source scope itself is absent. The three global rules (`IC-REG-01`,
`IC-REV-01`, and `IC-BILAT-01`) have no category scope: there, Profile false means
`not_applicable`, while true or null evaluates supplied facts.

For an explicit category scope whose applicability is `unknown`, Profile null preserves
`gap_unknown`; Profile true elects the explicit category for comparison; and Profile false
marks that category `not_applicable`. These Profile decisions never outrank the outer
interface applicability state.
