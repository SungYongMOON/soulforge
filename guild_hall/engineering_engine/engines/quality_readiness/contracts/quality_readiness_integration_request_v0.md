# Quality Readiness E01 Deepening — Shared Integration Request v0

Status: `HOLD / owner-and-integration-review required`.

This package now contains local, deterministic, public-synthetic seams for source derivation,
advisory retrieval, Core-compatible Typed Facts evaluation, observation, guidance, and an
unregistered read-only MCP-shaped dispatcher. This request does **not** authorize any shared
change, release, global registration, Watchtower node, writer, runtime route, source adoption,
rule acceptance, or project execution.

## Local package outcome

- Local topology: `topology/quality_readiness_deepening_topology.mjs`
- Public-synthetic runner: `tools/quality_readiness_runner.mjs --deepening`
- Global registration: `false`; writer enabled: `false`
- Source/RAG ceiling: the 56-row corpus aggregate is observed while any row is observed/HOLD.
  Only the exact three packet-bound proof-subset corpus rows can remain source-supported; newly
  admitted official-public and public-synthetic direct records remain observed. Profile-level
  source-supported promotion is HOLD pending an Owner-accepted package-owned binding contract.
  RAG has no verdict or rule authority.

## Exact shared surfaces that require a separate owner-approved integration slice

| Later concern | Exact shared owner surface | Required future decision/change | Current local posture |
| --- | --- | --- | --- |
| Root validation entrypoint | `package.json` | Add an opt-in `validate:quality-readiness-deepening` script that checks the seven local modules and runs `tests/quality_readiness_deepening.test.mjs`; do not alter existing root validation semantics without owner review. | Direct focused command only; root package untouched. |
| Architecture/ownership/roadmap record | `docs/architecture/foundation/DOCUMENT_OWNERSHIP.md`, `docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.md` | Decide whether E01 local candidate surfaces become a tracked active slice and which owner accepts the source-direct corpus/RAG boundary. | No docs, roadmap, or ownership edit. |
| Public change record | `CHANGELOG.md` | Add only after the owner accepts a public-facing state transition; record the actual validator receipt and the continued non-activation boundary. | No CHANGELOG edit. |
| Engineering Engine topology | `guild_hall/engineering_engine/topology/engine_topology.json`, `guild_hall/engineering_engine/tools/emit_topology.mjs` | Decide whether the six local E01 nodes are globally declared, and extend the topology generator/tests only after Core and release owners approve the edges. | Local topology declaration only. |
| Engine manifest/release | `guild_hall/engineering_engine/tools/emit_manifest.mjs`, `guild_hall/engineering_engine/tools/emit_release_manifest.mjs`, `guild_hall/engineering_engine/topology/engine_manifest.sha256`, `guild_hall/engineering_engine/topology/engine_release.json` | Regenerate exact allowlists/hashes/release evidence only in a release-owned slice; decide whether the optional deepening runner is part of a release artifact. | No global manifest, hash, or release change. |
| Shared Core/MCP contract | `guild_hall/engineering_engine/core/validators/mcp_contract.mjs`, Core adapter interfaces, and any global MCP registry selected by the owner | Decide whether the local read-tool schema can become a Core compatibility contract. Preserve no writer capability and no RAG verdict authority. | No Core or global MCP edit. |
| Watchtower federation | `guild_hall/watchtower/topology_provider_adapters.mjs`, `guild_hall/watchtower/topology/federated_topology.v1.json`, `guild_hall/watchtower/tools/emit_federated_topology.mjs` | Decide whether a health-only E01 candidate node is useful; define a producer-owned sanitized receipt and update the federation generator/tests together. | No Watchtower node, heartbeat, provider, or topology edit. |

## Required integration gates

1. Fresh independent review validates public/private exclusion, no raw/paid/controlled body,
   and all 56 source records' `observed`/`HOLD` ceiling.
2. A global entrypoint reruns the domain focused suite and validates generated topology/manifest
   only if its owner elects registration.
3. Any actual source or Profile rule promotion re-resolves official status, exact metadata/body
   refs, access class, applicability, source modality, and explicit Owner rule acceptance.
4. Any MCP or Watchtower activation remains read-only and feature-off until a separate explicit
   authority decision; no runner in this package can mutate project, filesystem, network, model,
   ERP, task, approval, or source state.
