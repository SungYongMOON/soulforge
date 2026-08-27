# Rule layers and applicability

The seven base candidates cover reliability allocation, FMECA, metrics, maintainability
demonstration, support/spares, availability, and closure-trace gaps. Every candidate holds its
own source ID, locator, modality, evidence vocabulary, required authority family, and exact
context-reference fields.

Applicability has five required components: project binding, jurisdiction, time window,
document revision, and approval scope. All must be true before the evaluator can return
`satisfied` or `gap_missing`. Any unknown component remains `gap_unknown`; any false component
requires an exact not-applicable basis and returns `not_applicable`.

No rule is self-applying. NASA/GSFC public access and a passing synthetic test do not establish
any customer or project obligation.
