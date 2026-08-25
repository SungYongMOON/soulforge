# Calibration and Measurement Validity source/RAG/Profile contract v1

Status: implementation candidate
Claim ceiling: `source_supported` at most

## Direct-source classification

The package recognizes only the public authority rows already named in the E11 source inventory:

- NIST Metrological Traceability FAQ / Technical Note 2156;
- NIST Technical Note 1297 (1994 Edition);
- NIST Recommended Calibration Interval page;
- ILAC-G24:2022 publication index; and
- ISO/IEC 17025:2017 as controlled citation-only metadata.

An evaluator-eligible source classification is reconstructed only from one closed, source-specific accepted binding: source ID plus an exact pinned revision/content reference. The binding itself fixes the known authority, official-public access class, direct-access flag, retrieval path, applicability, ceiling, and hold state. Official public bindings and explicitly pinned synthetic-direct bindings are distinct; synthetic bindings exist only for public-synthetic tests. Unknown authority, arbitrary references, unverified bindings, RAG bindings, and controlled citation-only bindings cannot become direct merely because a caller changes labels or flags.

Every consumer reruns the package-local canonical consumed-envelope validator. A caller cannot make a RAG, controlled, unknown, mismatched, extra-field, malformed, or contradictory envelope appear direct by editing its output fields. Typed Facts reject it, Profile evaluation holds, derivation cannot support it, and observation/guidance refuse it.

## RAG boundary

`rag_retrieval_only` is a locator/navigation class. It may identify a candidate source for a later direct verification, but it cannot produce a typed fact, satisfy a source-bound Profile requirement, raise a derivation claim ceiling, or change the E11 assessment.

No chunk, OCR, source body, private index, prompt, or raw retrieval answer is stored in this package.

## Source-bound Profiles

The existing Core Profile binding is preserved unchanged. E11 accepts only this normalized operation shape:

```json
{
  "op": "source_bound_requirements",
  "requirement_id": "cmv-...",
  "required_source_ids": ["KNOWN-SOURCE-ID"],
  "required_classification": "official_public_direct"
}
```

Every referenced source ID must also appear as `source:<source_id>` in the Core-bound Profile `source_refs`. The compiler preserves the Core operation digest, profile identity, revision/hash, base pin, source refs, and order in derived provenance. No rule text is invented or replaced. Unsupported operations fail closed.

At evaluation, unmet source-bound Profile requirements yield `unknown` / `hold`; they never upgrade a measurement result. A base ruleset without a Profile remains byte-compatible with v0 behavior.

The legacy bare v0 domain-input compatibility path is retained only for a base ruleset with no source-bound Profile. If the effective ruleset contains a source-bound Profile and no source classifications accompany the input, E11 returns an explicit Profile `hold`; it does not silently treat the bare input as direct source-bound evidence.

## Typed Facts, observation, guidance, and MCP

The typed-fact adapter requires exact source provenance for instrument identity, calibration status, measurement suitability, traceability, environment, and exception. Its `tested_at` / `known_at` cutoffs must be canonical UTC instants, with `known_at` not preceding `tested_at`.

Observation emits only source-bound candidates, never a confirmed fact. Guidance creates deterministic non-authoritative next-action cards and never changes an assessment. The local MCP adapter exposes only pure declared read-only package calls; it registers no server, reads no project filesystem, and provides no write tool.

## Public-synthetic pilot

The Q1 runner compiles a synthetic source-bound Profile, adapts public synthetic facts, evaluates through Core, emits observation/guidance receipts, and writes only stable JSON to stdout. It has no filesystem, network, or external mutation authority.

All Q1 receipt and derived-ruleset identity digests use one package-local canonical serializer. When a source-bound Profile is evaluated, the evaluator recomputes the derived ruleset reference from the exact presented requirements and refuses any mismatch before it can bind the returned receipt.
