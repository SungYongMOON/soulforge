# 03. Source derivation

Common chassis: [../03_how_items_were_derived.md](../03_how_items_were_derived.md).

E01 binds the accepted `quality_readiness_source_packet_v0.md` revision and SHA-256 exactly. Rules retain only bounded source IDs, locators, modality, and declared artifact-token state; official/project bodies are neither copied nor read by the evaluator.

The local source-direct projection lives at
`../source/quality_readiness_source_derivation.mjs`. It deterministically pairs the checked-in
56-row public inventory with its family matrix, retains exact public URL/publisher metadata, and
emits authority, revision/status, access, applicability, and claim-ceiling fields for every row.
It does not fetch, copy, or parse a body.

Only the existing three-source packet-bound proof subset reaches `source_supported`; all other
rows remain `observed`, direct-confirmation-required, or `HOLD`. The vendor overlay row is
explicitly excluded. `paid_or_controlled`, HWP/HWP-like, metadata-only, stale, and unresolved
rows cannot become a direct record or an executable rule.

Because the 56-row corpus contains observed/HOLD rows, its aggregate claim ceiling is
`observed`. The three exact proof-subset rows retain their individual source-supported ceiling;
they do not raise the whole corpus. A newly admitted direct record, including one labeled
`official_public`, remains observed until it is matched to that exact accepted proof subset.

Proof-subset treatment is bound to the package-owned inventory and family-matrix identity, not
to a source ID alone. An injected row with a proof-subset ID but a different URL, publisher, or
matrix metadata is held at `observed`; public locators reject workspace, private, absolute, and
file-path forms before they can enter a direct record or advisory packet.

That row-level proof support is not a Profile-evaluation promotion contract. Profile bindings
remain observed until a separate package-owned exact metadata/body/status/locator binding is
accepted by the Owner.

An explicitly `public_synthetic` direct record is also `observed`, never `source_supported`.
It exists only to exercise the zero-write pilot contract and cannot represent an official source
or real-project authority.

Deepening policy remains owned by the source/RAG/derivation strengthening contract
[appendix_a_source_rag_derivation_strengthening_v0.md](appendix_a_source_rag_derivation_strengthening_v0.md):
RAG can propose a locator but cannot establish source status, applicability, acceptance, or a
verdict.
