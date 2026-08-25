# Synthetic runs, replay, and zero-write

The public fixture has one row for every base rule. It proves one `satisfied`, one
`gap_missing`, three distinct `gap_unknown` reasons, one retained `gap_conflict`, and one
`not_applicable` result. It contains synthetic exact refs only.

The tests additionally prove source-packet hashing, base-rule source/vocabulary locks,
input immutability, deep-frozen output, stable ordering under row permutation, Profile compile
provenance, null-vs-empty evidence distinction, hostile plain-data rejection, source/binding
pinning, R&M-vs-Quality vocabulary separation, and a runner that leaves its caller directory
unchanged.

The zero-write runner reads no file and emits one deterministic JSON result to stdout. Its
receipt effect counters are all zero; a command success says only that the deterministic command
ran, not that the R&M state is ready or approved.
