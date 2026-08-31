# MCP material receive and result submit — Owner-PC one-seat candidate

- Artifact ref: `artifact.manual.mcp_material_receive_result_submit.v0_1_0`
- Compatibility: `>=0.1.0 <1.0.0`
- Catalog state: `candidate` / `current`; no verified release or user-exercise acceptance is recorded.

## Purpose

Handle an approved Work Brief or material bundle by exact revision, produce a local result or Evidence candidate, and obtain a custody/readback reference where the separately approved MCP service supports it. This procedure never converts a candidate into task acceptance.

## Prerequisites

- The caller has an explicit approved project scope, actor binding, and exact bundle or Work Brief reference.
- The requested revision and compatibility are known; `latest` or fallback resolution is not permitted.
- Any service, upload, or review authority is already approved outside this manual.

## Allowed and forbidden actions

- Allowed: read an exact manifest, verify the supplied revision/digest, prepare a candidate result, and retain an opaque receipt/reference.
- Forbidden: raw source export, cross-project lookup, fallback to a newest revision, external automatic send, automatic Official Done, or treating a local outbox state as server acceptance.

## Exact repo-relative commands and interfaces

```powershell
npm.cmd run validate:engineering-mcp
npm.cmd run validate:dev-erp-mcp
```

- `guild_hall/engineering_mcp/src/contract.mjs` defines `bundle.get_manifest`, `bundle.prepare_download`, `submission.prepare_upload`, `submission.finalize`, and `submission.get_custody_receipt`.
- `guild_hall/engineering_mcp/src/facade.mjs` exposes `createEngineeringMcpReadFacade`; its callable facade is read-only and must not be mistaken for submit authority.
- `ui-workspace/apps/dev-erp-mcp/schema/ingress_mcp_submission.v1.schema.json` and `ui-workspace/apps/dev-erp-mcp/src/ingress_mcp_service.mjs` are the bounded submission contract references.

## Expected readback and evidence

- Exact bundle/Work Brief reference, revision, manifest digest, and scope confirmation.
- A candidate submission or custody receipt reference only when the approved provider returns one.
- A visible pending review/HOLD state until the independent reviewer accepts it.

## HOLD / stop

Stop when the exact revision, scope, provider availability, receipt, or review authority is absent; also stop on a denied, expired, revoked, duplicate, or mismatched request. Retain the candidate and report the typed denial—never reinterpret it as completed work.

## Rollback and escalation

Do not overwrite or delete a candidate. Stop local submission attempts, preserve the safe reference, and escalate to the project reviewer or MCP service owner with the bundle/submission/custody references and the observed hold code.

## Known issues

- The Engineering MCP read facade is deliberately disabled by default and does not expose mutation authority.
- Production provider, authenticated binary plane, and one-seat user exercise remain gated.
- This candidate has no `last_verified_release` and no exercise receipt, so it cannot release a submission workflow.
