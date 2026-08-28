# 08. Error contract and hostile inputs

The compiler uses stable `IC_PROFILE_*` error codes for malformed bindings, unsupported
operations, unknown categories, and domain mismatch. The evaluator uses `IC_INPUT_INVALID`,
`IC_UNSAFE_VALUE`, `IC_EFFECTIVE_RULESET_INVALID`, and `IC_TYPED_FACTS_INVALID`.

The input boundary refuses accessors, proxies, cycles, sparse arrays, hidden fields,
symbols, prototype-sensitive value keys, unsafe local paths, file URIs, and common
secret-shaped strings. The Typed Facts wrapper is admitted through an exact-key,
non-proxy descriptor pass before its `facts` array or any fact entry is read. Ruleset
provenance, source-packet reference, rule count/order, and category applicability closure
are rechecked before evaluation.

Compiler provenance fields are bounded and sentinel-checked before entering the effective
ruleset. Absolute/private-path, secret-shaped, and exponent-like revision strings are
rejected with `IC_PROFILE_*` codes rather than being delegated to a lower-level serializer.

For the standard Core paths, E02 also validates the complete Core assembly wrapper and
compilation trace, recomputes the effective-ruleset digest, cross-checks every ordered
Organization/Project trace row against the retained Core Profile package, replays
Profile-derived category indexes, and recomputes the Core observations digest for Typed
Facts. Stale wrapper, trace, provenance, or facts-digest material fails closed before a
consistency verdict is emitted.

Compiler and evaluator share `rules/interface_consistency_safety_policy.mjs` as the one
local forbidden-string policy owner, preventing their path/secret sentinel sets from
silently drifting. Credential, secret, PEM, file-URI, and local-path markers are checked
as embedded fragments rather than only as whole words, so public identifiers cannot echo a
prefixed or suffixed sensitive marker.

The evaluator rejects JSON floats, exponent-form decimal strings, and malformed
instant-shaped strings before comparison so they cannot later escape as Core canonical
errors. These are E02 closed `IC_UNSAFE_VALUE` outcomes.

These guards protect deterministic handling; they do not prove the factual correctness
of values supplied by a Project Binding.
