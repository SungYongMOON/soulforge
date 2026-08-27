# Configuration Change Impact Integration Request v0

- `status`: `proposed`
- `domain_engine_id`: `configuration_change_impact`
- `handoff_state`: `final-recovery package candidate; branch, commit, and SHA pending explicit manager authorization`
- `claim_ceiling`: `source_supported`
- `requested_shared_write`: integration lane only

## This package intentionally does not change

- `guild_hall/engineering_engine/core/**`;
- `.registry/engineering_profiles/schemas/**`;
- root package scripts, release/manifest/topology, Roadmap, ownership, or CHANGELOG; or
- any Watchtower or live runtime binding.

## Requested integration-lane actions

1. Review this domain package against the frozen Core Adapter contract and add it to the
   shared engine manifest/topology only after all domain-local tests and independent review
   evidence are accepted.
2. Register or import the adapter only through the existing centralized domain-loader owner;
   do not create a default project binding or live action route.
3. Regenerate shared manifest, topology, and release surfaces in the sequential integration
   worktree and run their existing global validators.
4. Keep the package `candidate` and `source_supported`; integration does not grant project
   applicability, approval, release, baseline mutation, compliance, or production status.

## Interface analysis

No Core Interface change is requested. The package uses the current `compile`/`evaluate` adapter
seam and proves the existing `createProjectBindingAdapter(...).adaptEvidence(...)` Typed Facts
path with public-synthetic data. It descriptor-snapshots package input before Core sees it, then
binds the returned Core facts to the exact project binding, pinned empty Profile provenance,
controlled-change pre/post revision identity, and identity digest. Its domain-local graph module
deterministically traverses only those typed dependency facts and never reads a project source
itself. A non-empty Profile operation is rejected with `CCI_PROFILE_OPERATION_UNSUPPORTED`; a
future semantic operation requires separate source and Core/Profile review before shared adoption.
