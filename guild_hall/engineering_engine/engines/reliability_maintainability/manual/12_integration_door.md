# Integration door

This worktree owns only the E06 package. It intentionally does not edit Core, the Profile schema
catalog, root validator scripts, whole-engine manifest/topology/release, Watchtower, roadmap,
or changelog.

The factory manager receives the compact
[integration request](../contracts/reliability_maintainability_integration_request_v0.md). It
must review the package, add any shared registration/validator surface sequentially, regenerate
manager-owned derived artifacts, and preserve all source/claim boundaries. No package-level
green test authorizes main merge, public canon promotion, a live project binding, or production
activation.
