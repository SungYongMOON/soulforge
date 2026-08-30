// Declared-dependency validator (module-operability gate, leaf 2).
//
// Cross-checks a SET of module manifests: every required capability must be
// provided by exactly one module in the set, every required dependency must
// name a module in the set, and module ids must be unique. This makes
// dependencies like Board→Watch EXPLICIT data instead of an implicit import.

export function checkDeclaredDependencies(manifests) {
  const problems = [];
  if (!Array.isArray(manifests) || manifests.length === 0) {
    return { ok: false, problems: ["manifest_set_empty"] };
  }
  const moduleIds = new Map();
  const providers = new Map(); // capability -> [module_id]
  for (const manifest of manifests) {
    const id = manifest?.module_id;
    if (typeof id !== "string" || id.length === 0) {
      problems.push("module_id_missing_in_set");
      continue;
    }
    if (moduleIds.has(id)) problems.push(`module_id_duplicate:${id}`);
    moduleIds.set(id, manifest);
    for (const capability of manifest.capabilities_provided ?? []) {
      const list = providers.get(capability) ?? [];
      list.push(id);
      providers.set(capability, list);
    }
  }
  for (const [capability, list] of providers) {
    if (list.length > 1) problems.push(`capability_provider_ambiguous:${capability}:${list.sort().join("+")}`);
  }
  for (const manifest of manifests) {
    const id = manifest?.module_id ?? "(unknown)";
    for (const capability of manifest.capabilities_required ?? []) {
      // `port:*` entries declare CALLER-INJECTED ports: nothing in the module
      // set provides them by design, so they are exempt from provider
      // resolution (their adapters' authority ceilings live in each module's
      // authority_notes). Everything else must resolve.
      if (capability.startsWith("port:")) continue;
      if (!providers.has(capability)) problems.push(`capability_unprovided:${id}:${capability}`);
    }
    for (const dependency of manifest.required_dependencies ?? []) {
      if (!moduleIds.has(dependency)) problems.push(`required_dependency_unknown:${id}:${dependency}`);
    }
  }
  return { ok: problems.length === 0, problems };
}
