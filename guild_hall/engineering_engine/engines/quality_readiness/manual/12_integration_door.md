# 12. Integration door

Common chassis: [../12_mcp_door.md](../12_mcp_door.md).

Integration remains closed until an owner supplies truthful pre-release manifest values and an
independent verifier accepts the required receipts. The package now has a local MCP-shaped
read-tool dispatcher at `../mcp/quality_readiness_read_tools.mjs` with five tools:
engine/source/RAG/observation/guidance status. All five are `write: false`, consume supplied
bounded output only, and are not registered with a global server.

The local dispatcher rejects null, inherited/custom-prototype, accessor, and any own or inherited
`write`/`mutation`/`writer` input before dispatch. This remains a read-only boundary, not a
writer preflight.

No registry, ledger, writer, global MCP server, adapter extraction, external route, Watchtower
node, or production activation is created by E01. The owner-gated path is
[the integration request](../contracts/quality_readiness_integration_request_v0.md).
