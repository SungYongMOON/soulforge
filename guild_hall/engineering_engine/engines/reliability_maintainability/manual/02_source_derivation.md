# Source derivation and RAG boundary

The package derives bounded questions from two direct official public sources:

- `NASA-STD-8729.1A` for R&M objectives, modeling/allocation, FMECA, R&M terms,
  maintainability demonstration, availability, logistics support, and problem/failure reporting;
- `GSFC-HDBK-8004` for FMECA as a living risk assessment and change/update linkage.

The [source packet](../contracts/reliability_maintainability_source_packet_v0.md) locks the
observed authority, revision, access, applicability, source locators, paraphrases, and known
gaps. It intentionally does not reproduce either body.

RAG/search may find a possible locator, but cannot bind a revision, establish project
applicability, select a threshold, add a rule, calculate a metric, or emit a verdict. A later
source status/body drift means a new candidate source binding, never an implicit package update.
