# 01. Purpose and shape

Shared chassis: [Engineering Engine manual](../../../manual/README.md).

The single deep entry point, `assessPcbCompliance`, evaluates public-safe evidence readiness
for a precompiled PCB rule set. The Core supplies Profile ordering, compilation trace, and typed
facts. This domain owns only PCB rule semantics and refuses to make a product verdict.
