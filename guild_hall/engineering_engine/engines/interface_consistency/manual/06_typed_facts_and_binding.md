# 06. Typed Facts and Project Binding seam

E02's standard Typed Facts input is the exact output of Core
`adaptProjectEvidence`: one `interface_consistency_register` observation inside the
existing six-field `soulforge.typed_project_facts.v0` envelope, with Core's bare 64-hex
`facts_digest`, `project_binding_ref`, and canonical `valid_at`/`known_at` cutoffs. The
register entry contains the same domain input under `register`; exactly one such register
fact is required.

For the full Core envelope, `project_binding_ref` is also re-admitted as the exact Core
Project Binding shape: schema, project token, E02 domain, 64-hex binding revision, and
safe source-manifest reference. E02 retains only its digest in the public receipt, never
the binding payload itself.

Before E02 reads the register, it recomputes the exact Core
`soulforge.project_observations.v0` digest over the envelope facts and rejects a stale or
mismatched `facts_digest` with a closed E02 contract error. This validates envelope
integrity; it does not elevate the supplied facts into an external authority verdict.

The minimal `{ schema_version, facts }` envelope remains only a compatibility/direct-test
surface for the base direct evaluator; it cannot evaluate a Core assembly. It does not admit
nonempty cutoffs.

The Project Binding/adapter remains responsible for reading source snapshots, resolving
authority and cutoffs, and producing this typed fact. E02 neither reads project source
nor accepts free-form documents, RAG results, file paths, or untyped rows as evidence.

Because the standard producer hashes observations through the Core canonical domain, E02
uses the same public/runtime value restrictions: safe integers, fixed decimal strings for
fractions, insertion-ordered arrays, bounded ordinary objects, and real exact `.mmmZ`
instants with `known_at` not earlier than `valid_at`.

The adapter admits only an exact empty plain-object `authority`. `cutoffs` must be either
empty or the exact canonical `valid_at`/`known_at` pair already admitted in a full Core
Typed Facts envelope. Their safe projection is retained in receipt provenance instead of
the Project Binding object.

Real Project Profile, Binding, Typed Facts, compiled rulesets, and run outputs remain
in the project worksite. This public package includes only synthetic fixture material.
