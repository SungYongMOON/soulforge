# Material and Procurement Readiness Domain Engine

Status: candidate implementation, `source_supported` at most.

This package evaluates public-safe, pinned, read-only ERP fact snapshots for material
coverage and schedule readiness. It reports deterministic gaps; it does not create or
change purchase orders, inventory records, supplier commitments, acceptance decisions,
or ERP data.

## Package map

- `contracts/` — source authority, derivation, RAG boundary, and integration request.
- `schemas/` — public-safe descriptor schema.
- `rules/` — fixed domain vocabulary and source-linked rule metadata.
- `compiler/` and `evaluator/` — adapters behind the existing Engineering Engine Core.
- `fixtures/` and `tests/` — public-synthetic replay, hostile, and zero-write coverage.
- `tools/` — stdout-only public-synthetic runner.
- `manual/` — input, output, boundary, and adoption guidance.
- `topology/` — pre-release module-manifest factory and shared-surface request.

The package is deliberately not statically wired into the shared global topology, release
manifest, or root validation scripts. Importing its evaluator adapter follows the existing
in-memory Core self-registration idiom; static/global integration changes remain owned by the
sequential factory integration lane described in
[`topology/integration_request_v0.md`](topology/integration_request_v0.md).

Read the [domain manual](manual/README.md) before binding this candidate to any
organization or project profile.
