# Compiler and Profiles

The compiler emits the locked base ruleset when no Profile operations are
supplied. It accepts a narrowly typed `add` Profile operation only when the
rule has an `MR-` id, targets an existing facet, and is bound to the Profile's
source references.

Before it reads a Profile field, the compiler snapshots only bounded ordinary
data. Proxy, accessor, symbol, hidden, sparse, cyclic, custom-prototype, or
undeclared binding material is refused. Each successful compilation returns an
independent, deeply frozen ruleset envelope.

E05 evaluator v0 deliberately refuses a derived Profile ruleset. That is a
fail-closed boundary: compilation/provenance conformance is available now,
while semantics for a new Profile rule are not assumed. A later evaluator
revision needs independent source and test review.
