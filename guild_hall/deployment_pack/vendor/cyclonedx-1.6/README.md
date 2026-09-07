# Pinned CycloneDX 1.6 schemas

Unmodified official files from [CycloneDX/specification](https://github.com/CycloneDX/specification/tree/595d98f16159bdf7463adc140509ded479130b8b/schema), commit `595d98f16159bdf7463adc140509ded479130b8b`:

- `bom-1.6.schema.json` with its `jsf-0.82.schema.json` and `spdx.schema.json` references.
- `LICENSE`, Apache License 2.0. Original schema copyright/license comments are preserved.

`src/pack_sbom_schema.mjs` pins all four SHA-256 values and registers only this local schema closure. Validation performs no network retrieval. The inventory profile separately requires `specVersion: 1.6`; unsupported exercised string formats fail closed. Schema conformance does not verify signature cryptography, runtime dependencies, vulnerabilities, license approval or release acceptance.
