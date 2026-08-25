# Database Engineering Project Binding and Typed Facts contract v0

`adaptDatabaseProjectEvidence(binding, evidence, cutoffs)` is the package-owned
Project Binding seam. It accepts only plain, acyclic data and returns frozen
closed Typed Database Facts plus a digest receipt. A binding must declare one
project, `database_engineering`, an exact revision hash, and one supported
platform/version. Evidence contains only public-synthetic or project-local
opaque references and structured observations; absolute paths, credential-like
tokens, source bodies, and cross-project references are refused.

Per-rule evidence has a `rule_id`, a `status` (`supported`, `contradicted`, or
`unknown`), an opaque evidence reference, and `machine_observable`. Requirement
bindings explicitly identify the applicable rule. The evaluator never infers a
requirement from generic documentation.
