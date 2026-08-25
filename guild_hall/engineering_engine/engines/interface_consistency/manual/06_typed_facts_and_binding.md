# 06. Typed Facts and Project Binding seam

E02's standard Typed Facts input is the exact output of Core
`adaptProjectEvidence`: one `interface_consistency_register` observation inside the
existing `soulforge.typed_project_facts.v0` envelope, with Core's bare 64-hex
`facts_digest`, `project_binding_ref`, and canonical cutoffs. The register entry contains
the same domain input under `register`.

The minimal `{ schema_version, facts }` envelope remains only a compatibility/direct-test
surface; it is not presented as the standard Core producer shape.

The Project Binding/adapter remains responsible for reading source snapshots, resolving
authority and cutoffs, and producing this typed fact. E02 neither reads project source
nor accepts free-form documents, RAG results, file paths, or untyped rows as evidence.

Because the standard producer hashes observations through the Core canonical domain, E02
uses the same public/runtime value restrictions: safe integers, fixed decimal strings for
fractions, insertion-ordered arrays, bounded ordinary objects, and exact `.mmmZ` instants.

The adapter accepts Core `authority` and `cutoffs` arguments explicitly but intentionally
does not interpret them in deterministic domain evaluation. When the standard Typed Facts
envelope already supplies valid/known cutoff strings, their safe projection is retained in
the receipt provenance instead.

Real Project Profile, Binding, Typed Facts, compiled rulesets, and run outputs remain
in the project worksite. This public package includes only synthetic fixture material.
