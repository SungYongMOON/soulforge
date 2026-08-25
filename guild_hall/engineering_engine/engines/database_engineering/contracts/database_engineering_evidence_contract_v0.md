# Database Engineering Project Binding and Typed Facts contract v0

`adaptDatabaseProjectEvidence(binding, evidence, cutoffs)` is the package-owned
Project Binding seam. It accepts only plain, acyclic data and returns frozen
closed Typed Database Facts plus an `observation_receipt` conforming to
`soulforge.database_engineering.evidence_receipt.v0`. That receipt binds the
project token, binding revision, source-manifest ref, facts digest, platform
support flag, and zero effects. A binding must declare one
project, `database_engineering`, an exact revision hash, source-manifest ref,
per-rule authority/evidence bindings, and one supported platform/version.
Requirement and observation rows carry the exact project ID; their refs must
exactly match the relevant binding row, not merely contain a project-looking
substring. Evidence contains only public-synthetic or project-local opaque
references; absolute paths, credential-like tokens, source bodies, and
cross-project references are refused.

Per-rule evidence has a `rule_id`, a `status` (`supported`, `contradicted`,
`unknown`, or `conflict`), an opaque evidence reference, and
`machine_observable`. Requirement
bindings explicitly identify the applicable rule. The evaluator revalidates the
complete facts envelope and its domain-separated digest at ingress; it never
infers a requirement from generic documentation.
