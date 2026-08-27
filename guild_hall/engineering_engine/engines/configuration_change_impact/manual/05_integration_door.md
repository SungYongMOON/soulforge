# 05. Integration door

This package is intentionally domain-local. It does not edit the shared Core, profile schemas,
global manifest/topology/release, root scripts, or a runtime loader. The exact shared work is
listed in the [integration request](../integration/configuration_change_impact_integration_request_v0.md).

Before any shared integration, the integration lane must review the frozen Core Interface,
the package's existing-Core Project Binding/Typed Facts proof, domain-local tests, source boundary,
and independent review evidence. It must then regenerate the shared surfaces through their
existing owner tools. No integration step creates a default project binding or an action-capable
route.
