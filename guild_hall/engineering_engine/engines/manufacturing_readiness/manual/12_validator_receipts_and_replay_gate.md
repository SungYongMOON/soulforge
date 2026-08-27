# Validator receipts and replay gate

Package validation checks the bounded compiler, evaluator, and adapter seams
with public-synthetic fixtures. Its receipt records only package references,
digests, result states, error codes, and effect counters; it excludes raw source
bodies, private paths, credentials, and hidden reasoning.

Replay and digest checks establish that the same bounded input yields the same
receipt without writes. A clean receipt proves package behavior under those
fixtures only; it does not establish source applicability, a live project state,
standards compliance, production use, or build-start authority.

Before a manager permits a commit, push, or integration request, the manager or
factory re-runs deterministic validation and obtains a fresh independent
`ACCEPT` review. That review gate does not expand this package's authority over
Core, root surfaces, or human Owner decisions.
