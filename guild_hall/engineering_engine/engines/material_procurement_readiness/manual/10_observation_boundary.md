# Observation boundary

There is no observation collector in this package. The Project Evidence Adapter receives an
already injected, pinned ERP snapshot and public-safe metadata; it never discovers or reads ERP,
files, project workspaces, mail, RAG, or a network.

The adapter's observation/evidence receipt contains lineage and counts only. It deliberately
excludes rows and source bodies, so receipt storage cannot become a second ERP or evidence store.
