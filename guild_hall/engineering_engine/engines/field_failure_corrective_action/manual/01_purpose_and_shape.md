# 01 — Purpose and shape

FFCA answers one constrained question: whether supplied references show evidence readiness for
a failure, NCR, or CAR lifecycle. It exposes eight candidate checks: intake, containment, root
cause, action ownership, effectiveness, recurrence, related change, and closure readiness.

The package is a Domain Engine behind the existing Engineering Engine Core. It owns domain
vocabulary, source-limited rules, compiler/evaluator adapters, fixtures, tests, and a local
manifest/topology. It does not own Organization Profile authoring, Project Binding source bodies,
Typed Facts persistence, shared registries, or runtime effects.

The result has five row states: `satisfied`, `missing`, `unknown`, `conflict`, and
`not_applicable`. These are evidence states, not legal, safety, quality, disposition, or release
states. A case may become `ready_for_human_decision`; it never becomes closed through FFCA.
