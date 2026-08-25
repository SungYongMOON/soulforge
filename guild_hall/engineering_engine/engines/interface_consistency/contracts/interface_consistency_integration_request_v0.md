# E02 Interface Consistency integration request v0

Status: request only. No shared surface is modified by the E02 domain lane.

## Request

| shared owner | requested follow-up | reason | E02 result |
| --- | --- | --- | --- |
| Factory integration lane | Add the E02 adapter import to the shared Core conformance registration test, then verify all registered adapters together. | The E02 adapter is intentionally self-registering only when imported; Core tests own their import inventory. | No Core interface change requested. |
| Factory integration lane | Add a root `validate:interface-consistency` command only if the factory accepts a root script addition. | The package has a direct, deterministic local validator but cannot edit root `package.json`. | Proposed command is documented in package README. |
| Factory integration lane | Regenerate and verify whole-engine topology, manifest, and release artifacts after accepted branch integration. | Those artifacts are shared and must reflect a sequentially integrated tree. | Domain-local topology/manifest is ready; global regeneration is not performed here. |
| Profile/catalog owner | Confirm whether a public-safe generic Interface Consistency Profile example is wanted. | The compiler supports bounded `set_category_applicability`; no organization/project payload is supplied in E02. | No registry schema or catalog change requested. |

## Interface impact

- Existing Core Interface: sufficient. E02 uses `compile`, `evaluate`,
  `assembleEffectiveRuleSet`, and the standard Typed Project Facts envelope.
- New Core fields: none.
- New shared validators: none required before integration.
- Public/private boundary: Project Binding, source snapshots, real interface rows,
  revisions, approval records, and outputs remain project-local; this package carries
  synthetic identifiers only.

## Factory acceptance checks

1. Import `evaluator/interface_consistency_evaluator_adapter.mjs` in the integration
   branch's Core-domain adapter conformance test and assert loadability without changing
   the Core API.
2. Run the focused E02 test command from `README.md` and the relevant existing Core
   domain conformance command.
3. Regenerate shared manifest/topology/release material only in the factory lane, then
   run its canonical integrity checks.
4. Confirm no source body, project payload, `_workmeta` payload, secret, private path,
   or protected-standard text appears in the integrated diff.
5. Run the E02 AJV-backed schema tests with the root-owned dependency set available. A
   worktree-local ignored `node_modules` junction may be used as a machine-local test
   convenience, but it is never a tracked package surface or dependency declaration.

## Non-requested work

This request does not authorize an engine-wide rule, a source-body acquisition, a
profile catalog entry, a live Project Binding, a production route, a main merge, or
a release claim.
