# 09. Topology and factory integration

`topology/interface_consistency_topology.json` declares the E02-owned package surface.
`topology/interface_consistency_module_manifest.mjs` creates a bounded candidate manifest
from explicit public-safe caller values; it does not publish a release.

Global registration, the root validation script, whole-engine topology/manifest/release
regeneration, and Core conformance-import inventory are shared surfaces. They are outside
this branch's write boundary and are listed in the
[integration request](../contracts/interface_consistency_integration_request_v0.md).
