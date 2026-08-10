# Artifact Reproducibility Gate v0

This candidate workflow prevents a worker's self-authored `PASS` from masking a different
builder, independently invented content, package drift, blank-page risk, or missing visual
review.

## What is compared

1. **Semantic authoring identity** — the publisher must consume one immutable content packet;
   prompts and hard-coded requirement arrays are not substitutes.
2. **Build identity** — template, builder, toolchain, prompt contract, and declared comparison
   mode are hash-bound before execution.
3. **Native package structure** — ZIP/XML structure is inspected per format. HWPX additionally
   checks mimetype placement and page-break risk; PPTX/XLSX component counts are recorded.
4. **Rendered visuals** — a separate receipt must cover every page, slide, or sheet when the
   artifact will be shared visually.
5. **Independent acceptance** — worker self-checks are retained only as evidence.

## Correct architecture

`source evidence -> approved semantic packet -> fixed native publisher -> common validator -> independent visual review`

The LLM may help author the semantic packet. It must not independently rewrite the packet inside
each publishing run. Deterministic publication and validation should be script or adapter backed.

## Runtime use

Copy `templates/fixture_manifest.template.json` into a private run root, replace placeholders with
runtime paths, and run:

`python .workflow/artifact_reproducibility_gate_v0/tools/validate_artifact_reproducibility.py --manifest <private-manifest.json> --output <private-receipt.json>`

Use `--self-test` for a public-safe synthetic smoke check. Runtime absolute paths and document
payloads belong only in private run evidence, never in this package.

## Claim boundary

This package is pilot-executed and unregistered. Current evidence includes a private invalid-pair
failure fixture, a deterministic synthetic self-test, and a private controlled cold pair in which
two fresh executors consumed the same Markdown, HWPX template, and fixed publisher and produced
byte-identical HWPX packages. A separate static verifier passed identity, semantic, deterministic,
and package-structure gates while leaving rendered visual review explicitly outside that cold gate.
It has no complete visual acceptance reviewer, default-route, production-ready, or owner-approval
claim.
