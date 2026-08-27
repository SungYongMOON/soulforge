# 03. Source derivation

The package uses direct public NASA guidance for the generic change-control lifecycle,
requirements and interface impact traceability, and software-change closure evidence. Exact
authority, revision/access state, source locator, and applicability limits are recorded in the
[source packet](../contracts/configuration_change_impact_source_packet_v0.md).

The primary handbook is a guidance document, not an automatic directive. No source creates a
project's change board, authorizes a baseline, or supplies contract applicability. The package
therefore retains a `source_supported` ceiling and requires explicit caller facts.

RAG, search, and language-model output are outside the runtime. They can help a human locate a
source but cannot add a rule, fill an impact category, or change an evaluator result.
