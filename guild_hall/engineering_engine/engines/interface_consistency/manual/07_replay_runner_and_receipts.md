# 07. Replay, runner, and receipts

The public runner takes no arguments, reads no files, writes no files, makes no network
calls, and prints one JSON assessment for the synthetic fixture. The assessment contains a
bounded deterministic receipt with input, domain-ruleset, and assessment SHA-256 digests.
When a full Typed Facts envelope is supplied, the receipt carries only envelope kind,
digest provenance, and a domain-separated cutoff-pair digest—never compared values,
project payload, or duplicate cutoff timestamps. External-effect counters remain zero.

The envelope's bare Core `facts_digest` is exposed as `asserted_facts_digest` to preserve
the producer's field format. E02 recomputes and verifies that value against the exact Core
project-observations digest before evaluation; it is distinct from E02's independently
calculated `input_digest` integrity evidence. `provenance_digest` binds the safe provenance
projection without echoing its project payload.

The receipt calls its ruleset digest `domain_ruleset_digest` to distinguish it from the
Core compilation trace's `effective_ruleset_digest`. `assessment_digest` is calculated by
`digestInterfaceConsistencyAssessmentBody` over the complete assessment body **before** the
receipt is inserted, with domain separator
`soulforge.interface_consistency.assessment_body.v0`. It is intentionally not a hash of
final stdout containing its own receipt.

`input_digest` is calculated over normalized semantic input, so interface/end ordering
differences that normalize to the same facts intentionally produce the same digest. The
admitted valid/known cutoff strings use real, fixed-width Core `.mmmZ` instants; variable
precision, impossible instants, and inverted chronology are refused before the cutoff-pair
digest is constructed.

The focused tests verify terminal-state coverage, Core seam use, input non-mutation,
three-end mixed pair outcomes and ordering replay, Typed Facts hostile-envelope admission,
tamper rejection, source-packet digest, Profile replay, hostile input rejection, and
zero-write execution from an empty temporary directory.

Actual project run receipts are not package artifacts. They are owned by the project
worksite and must preserve the Project Binding/source authority boundary.
