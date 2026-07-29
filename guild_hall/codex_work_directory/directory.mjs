import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const ROUTE_SCHEMA_URL = new URL("./schema/route_catalog.v1.schema.json", import.meta.url);
const BINDING_SCHEMA_URL = new URL("./schema/live_bindings.v1.schema.json", import.meta.url);

export const RESOLUTION_STATES = Object.freeze([
  "EXACT",
  "AMBIGUOUS",
  "STALE",
  "UNKNOWN",
  "RETIRED",
  "ROLLOVER_PENDING"
]);

export const BRANCH_IDS = Object.freeze([
  "common",
  "projects",
  "ax_development",
  "erp_development",
  "system_development"
]);

export const BRANCH_LABELS = Object.freeze([
  "COMMON",
  "PROJECTS",
  "AX DEVELOPMENT",
  "ERP DEVELOPMENT",
  "SYSTEM DEVELOPMENT"
]);

function normalize(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/\s+/gu, " ");
}

function customError(instancePath, keyword, message, params = {}) {
  return { instancePath, schemaPath: "", keyword, params, message };
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function checkObjectKeys(value, path, required, allowed, errors) {
  if (!isRecord(value)) {
    errors.push(customError(path, "type", "must be an object"));
    return false;
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) {
      errors.push(customError(path, "required", `must have required property '${key}'`));
    }
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      errors.push(customError(`${path}/${key}`, "additionalProperties", "must not have additional properties"));
    }
  }
  return true;
}

function checkString(value, path, errors, pattern = undefined) {
  if (typeof value !== "string" || value.length < 1) {
    errors.push(customError(path, "type", "must be a non-empty string"));
    return;
  }
  if (pattern && !pattern.test(value)) {
    errors.push(customError(path, "pattern", "must match the required identifier pattern"));
  }
}

function checkStringArray(value, path, errors, pattern = undefined) {
  if (!Array.isArray(value)) {
    errors.push(customError(path, "type", "must be an array"));
    return;
  }
  const seen = new Set();
  value.forEach((item, index) => {
    checkString(item, `${path}/${index}`, errors, pattern);
    const key = normalize(item);
    if (seen.has(key)) {
      errors.push(customError(`${path}/${index}`, "uniqueItems", "must be unique after normalization"));
    }
    seen.add(key);
  });
}

const ROUTE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const CAPABILITY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/u;
const FORBIDDEN_LOCAL_KEY = /secret|token|password|cookie|credential/iu;

function validateCatalogShape(catalog) {
  const errors = [];
  const rootKeys = [
    "schema_version",
    "catalog_revision",
    "navigation_authority",
    "branches",
    "routes"
  ];
  if (!checkObjectKeys(catalog, "", rootKeys, rootKeys, errors)) {
    return errors;
  }
  if (catalog.schema_version !== "soulforge.codex_work_route_catalog.v1") {
    errors.push(customError("/schema_version", "const", "must equal the v1 catalog schema version"));
  }
  checkString(catalog.catalog_revision, "/catalog_revision", errors);
  if (catalog.navigation_authority !== "none") {
    errors.push(customError("/navigation_authority", "const", "must be none"));
  }

  if (!Array.isArray(catalog.branches) || catalog.branches.length !== BRANCH_IDS.length) {
    errors.push(customError("/branches", "shape", "must contain the exact five sibling branches"));
  } else {
    catalog.branches.forEach((branch, index) => {
      const keys = ["branch_id", "display_name", "parent_branch_id", "navigation_authority"];
      if (!checkObjectKeys(branch, `/branches/${index}`, keys, keys, errors)) {
        return;
      }
      if (branch.branch_id !== BRANCH_IDS[index]) {
        errors.push(customError(`/branches/${index}/branch_id`, "const", `must equal ${BRANCH_IDS[index]}`));
      }
      if (branch.display_name !== BRANCH_LABELS[index]) {
        errors.push(customError(`/branches/${index}/display_name`, "const", `must equal ${BRANCH_LABELS[index]}`));
      }
      if (branch.parent_branch_id !== null || branch.navigation_authority !== "none") {
        errors.push(customError(`/branches/${index}`, "siblingRoot", "must be a root sibling with navigation authority none"));
      }
    });
  }

  if (!Array.isArray(catalog.routes)) {
    errors.push(customError("/routes", "type", "must be an array"));
    return errors;
  }
  const routeKeys = [
    "route_id",
    "branch_id",
    "display_name",
    "scope",
    "aliases",
    "project_code",
    "owner_role",
    "manager_route_id",
    "escalation_route_id",
    "request_examples",
    "do_not_route",
    "lifecycle",
    "capability_classes"
  ];
  catalog.routes.forEach((route, index) => {
    const path = `/routes/${index}`;
    if (!checkObjectKeys(route, path, routeKeys, routeKeys, errors)) {
      return;
    }
    checkString(route.route_id, `${path}/route_id`, errors, ROUTE_ID_PATTERN);
    if (!BRANCH_IDS.includes(route.branch_id)) {
      errors.push(customError(`${path}/branch_id`, "enum", "must be a known branch id"));
    }
    checkString(route.display_name, `${path}/display_name`, errors);
    checkString(route.owner_role, `${path}/owner_role`, errors);
    checkStringArray(route.aliases, `${path}/aliases`, errors);
    checkStringArray(route.request_examples, `${path}/request_examples`, errors);
    checkStringArray(route.capability_classes, `${path}/capability_classes`, errors, CAPABILITY_PATTERN);
    if (Array.isArray(route.capability_classes) && route.capability_classes.length === 0) {
      errors.push(customError(`${path}/capability_classes`, "minItems", "must not be empty"));
    }
    for (const field of ["project_code", "manager_route_id", "escalation_route_id"]) {
      if (route[field] !== null) {
        checkString(route[field], `${path}/${field}`, errors, ROUTE_ID_PATTERN);
      }
    }

    const scopeKeys = ["kind", "responsibility_terms"];
    if (checkObjectKeys(route.scope, `${path}/scope`, scopeKeys, scopeKeys, errors)) {
      if (!["global", "project", "function"].includes(route.scope.kind)) {
        errors.push(customError(`${path}/scope/kind`, "enum", "must be global, project, or function"));
      }
      checkStringArray(route.scope.responsibility_terms, `${path}/scope/responsibility_terms`, errors);
    }

    if (!Array.isArray(route.do_not_route)) {
      errors.push(customError(`${path}/do_not_route`, "type", "must be an array"));
    } else {
      route.do_not_route.forEach((item, itemIndex) => {
        const itemPath = `${path}/do_not_route/${itemIndex}`;
        const keys = ["term", "reason"];
        if (checkObjectKeys(item, itemPath, keys, keys, errors)) {
          checkString(item.term, `${itemPath}/term`, errors);
          checkString(item.reason, `${itemPath}/reason`, errors);
        }
      });
    }

    const lifecycleKeys = ["state", "successor_route_id"];
    if (checkObjectKeys(route.lifecycle, `${path}/lifecycle`, ["state"], lifecycleKeys, errors)) {
      if (!["active", "stale", "retired", "rollover_pending"].includes(route.lifecycle.state)) {
        errors.push(customError(`${path}/lifecycle/state`, "enum", "must be a supported lifecycle state"));
      }
      if (route.lifecycle.successor_route_id !== undefined) {
        checkString(route.lifecycle.successor_route_id, `${path}/lifecycle/successor_route_id`, errors, ROUTE_ID_PATTERN);
      }
      if (route.lifecycle.state === "rollover_pending" && !route.lifecycle.successor_route_id) {
        errors.push(customError(`${path}/lifecycle`, "required", "rollover_pending requires successor_route_id"));
      }
    }
  });
  return errors;
}

function validateBindingRef(value, path, errors) {
  const keys = [
    "binding_id",
    "capability_class",
    "provider_identifier",
    "resource_identifier",
    "resource_title",
    "host_identifier",
    "thread_identifier"
  ];
  if (!checkObjectKeys(value, path, ["binding_id", "capability_class"], keys, errors)) {
    return;
  }
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_LOCAL_KEY.test(key)) {
      errors.push(customError(`${path}/${key}`, "forbiddenLocalKey", "secret-bearing field names are forbidden"));
    }
  }
  checkString(value.binding_id, `${path}/binding_id`, errors);
  checkString(value.capability_class, `${path}/capability_class`, errors, CAPABILITY_PATTERN);
  for (const field of [
    "provider_identifier",
    "resource_identifier",
    "resource_title",
    "host_identifier",
    "thread_identifier"
  ]) {
    if (value[field] !== undefined) {
      checkString(value[field], `${path}/${field}`, errors);
    }
  }
}

function validateBindingsShape(document) {
  const errors = [];
  const rootKeys = ["schema_version", "catalog_schema_version", "catalog_revision", "bindings"];
  if (!checkObjectKeys(document, "", rootKeys, rootKeys, errors)) {
    return errors;
  }
  if (document.schema_version !== "soulforge.codex_work_live_bindings.v1") {
    errors.push(customError("/schema_version", "const", "must equal the v1 binding schema version"));
  }
  if (document.catalog_schema_version !== "soulforge.codex_work_route_catalog.v1") {
    errors.push(customError("/catalog_schema_version", "const", "must target the v1 catalog schema"));
  }
  checkString(document.catalog_revision, "/catalog_revision", errors);
  if (!Array.isArray(document.bindings)) {
    errors.push(customError("/bindings", "type", "must be an array"));
    return errors;
  }
  const bindingKeys = [
    "route_id",
    "durable_coordination_binding",
    "preferred_execution_surface",
    "runtime_agent",
    "runtime_session",
    "worktree_binding",
    "fallback_bindings",
    "validator_bindings",
    "observed_status",
    "verified_at_kst",
    "source_kind",
    "binding_state",
    "prior_resource_history_pointer",
    "prior_thread_history_pointer",
    "bridge_state",
    "execution_ready"
  ];
  const required = [
    "route_id",
    "durable_coordination_binding",
    "preferred_execution_surface",
    "runtime_agent",
    "fallback_bindings",
    "validator_bindings",
    "observed_status",
    "verified_at_kst",
    "source_kind",
    "binding_state",
    "prior_resource_history_pointer",
    "prior_thread_history_pointer",
    "bridge_state",
    "execution_ready"
  ];
  document.bindings.forEach((binding, index) => {
    const path = `/bindings/${index}`;
    if (!checkObjectKeys(binding, path, required, bindingKeys, errors)) {
      return;
    }
    for (const key of Object.keys(binding)) {
      if (FORBIDDEN_LOCAL_KEY.test(key)) {
        errors.push(customError(`${path}/${key}`, "forbiddenLocalKey", "secret-bearing field names are forbidden"));
      }
    }
    checkString(binding.route_id, `${path}/route_id`, errors);
    for (const field of [
      "durable_coordination_binding",
      "preferred_execution_surface",
      "runtime_agent",
      "runtime_session",
      "worktree_binding"
    ]) {
      if (binding[field] !== undefined) {
        validateBindingRef(binding[field], `${path}/${field}`, errors);
      }
    }
    for (const field of ["fallback_bindings", "validator_bindings"]) {
      if (!Array.isArray(binding[field])) {
        errors.push(customError(`${path}/${field}`, "type", "must be an array"));
      } else {
        binding[field].forEach((item, itemIndex) =>
          validateBindingRef(item, `${path}/${field}/${itemIndex}`, errors)
        );
      }
    }
    checkString(binding.observed_status, `${path}/observed_status`, errors);
    checkString(binding.source_kind, `${path}/source_kind`, errors, CAPABILITY_PATTERN);
    if (
      typeof binding.verified_at_kst !== "string" ||
      !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,9})?\+09:00$/u.test(binding.verified_at_kst)
    ) {
      errors.push(customError(`${path}/verified_at_kst`, "kstTimestamp", "must be an explicit +09:00 KST timestamp"));
    }
    if (!["active", "stale", "rollover_pending", "retired", "unknown"].includes(binding.binding_state)) {
      errors.push(customError(`${path}/binding_state`, "enum", "must be a supported binding state"));
    }
    for (const field of [
      "prior_resource_history_pointer",
      "prior_thread_history_pointer"
    ]) {
      if (binding[field] !== null) {
        checkString(binding[field], `${path}/${field}`, errors);
      }
    }
    if (!["planned", "pilot", "active", "blocked", "retired"].includes(binding.bridge_state)) {
      errors.push(customError(`${path}/bridge_state`, "enum", "must be a supported bridge state"));
    }
    if (typeof binding.execution_ready !== "boolean") {
      errors.push(customError(`${path}/execution_ready`, "type", "must be boolean"));
    }
    if (["planned", "pilot", "blocked", "retired"].includes(binding.bridge_state) && binding.execution_ready !== false) {
      errors.push(customError(`${path}/execution_ready`, "bridgeSafety", "non-active bridge states require execution_ready false"));
    }
    if (binding.binding_state !== "active" && binding.execution_ready !== false) {
      errors.push(customError(`${path}/execution_ready`, "bindingSafety", "non-active binding states require execution_ready false"));
    }
    if (
      binding.binding_state === "rollover_pending" &&
      binding.prior_resource_history_pointer === null &&
      binding.prior_thread_history_pointer === null
    ) {
      errors.push(customError(`${path}/binding_state`, "rolloverHistory", "rollover_pending requires a prior resource or thread history pointer"));
    }
  });
  return errors;
}

function validateCatalogInvariants(catalog) {
  const errors = [];
  const routes = Array.isArray(catalog?.routes) ? catalog.routes : [];
  const routeById = new Map();

  for (const [index, route] of routes.entries()) {
    const key = normalize(route?.route_id);
    if (routeById.has(key)) {
      errors.push(customError(
        `/routes/${index}/route_id`,
        "uniqueRouteId",
        "must be unique after NFKC/case normalization"
      ));
    } else {
      routeById.set(key, route);
    }
  }

  for (const [index, route] of routes.entries()) {
    if (route?.branch_id === "projects") {
      if (route.manager_route_id !== null) {
        errors.push(customError(
          `/routes/${index}/manager_route_id`,
          "projectSiblingLeaf",
          "project routes must be sibling leaves with manager_route_id null"
        ));
      }
      if (route?.scope?.kind !== "project") {
        errors.push(customError(
          `/routes/${index}`,
          "projectIdentity",
          "project routes require project scope; unresolved project_code may remain null"
        ));
      }
    } else if (route?.project_code !== null) {
      errors.push(customError(
        `/routes/${index}/project_code`,
        "projectIdentity",
        "only project sibling routes may carry project_code"
      ));
    }

    for (const field of ["manager_route_id", "escalation_route_id"]) {
      const reference = route?.[field];
      if (reference !== null && !routeById.has(normalize(reference))) {
        errors.push(customError(
          `/routes/${index}/${field}`,
          "knownRouteReference",
          "must reference a route in the same catalog"
        ));
      }
    }
    if (route?.manager_route_id !== null) {
      const manager = routeById.get(normalize(route.manager_route_id));
      if (manager && manager.branch_id !== route.branch_id) {
        errors.push(customError(
          `/routes/${index}/manager_route_id`,
          "sameBranchManager",
          "manager relations must remain within one branch"
        ));
      }
      if (manager?.branch_id === "projects") {
        errors.push(customError(
          `/routes/${index}/manager_route_id`,
          "projectSiblingLeaf",
          "project sibling leaves cannot acquire child routes"
        ));
      }
    }
    if (route?.escalation_route_id !== null) {
      const escalation = routeById.get(normalize(route.escalation_route_id));
      if (
        escalation &&
        escalation.branch_id !== route.branch_id &&
        escalation.branch_id !== "common"
      ) {
        errors.push(customError(
          `/routes/${index}/escalation_route_id`,
          "commonReclassification",
          "cross-branch escalation may target only COMMON reclassification"
        ));
      }
    }
    const successor = route?.lifecycle?.successor_route_id;
    if (successor && !routeById.has(normalize(successor))) {
      errors.push(customError(
        `/routes/${index}/lifecycle/successor_route_id`,
        "knownRouteReference",
        "must reference a route in the same catalog"
      ));
    }
  }

  const axRoutes = routes.filter((route) => route?.branch_id === "ax_development");
  if (axRoutes.length !== 6) {
    errors.push(customError(
      "/routes",
      "axShape",
      "AX detail must contain exactly one AX root and five AX owner routes"
    ));
  } else {
    const roots = axRoutes.filter((route) => route.manager_route_id === null);
    if (roots.length !== 1) {
      errors.push(customError(
        "/routes",
        "axShape",
        "AX detail must contain exactly one root route"
      ));
    } else {
      const rootId = normalize(roots[0].route_id);
      const invalidOwner = axRoutes.some((route) =>
        route !== roots[0] && normalize(route.manager_route_id) !== rootId
      );
      if (invalidOwner) {
        errors.push(customError(
          "/routes",
          "axShape",
          "the five AX owner routes must report directly to the AX root"
        ));
      }
    }
  }

  return errors;
}

export async function validateCatalog(catalog) {
  const errors = validateCatalogShape(catalog);
  if (errors.length === 0) {
    errors.push(...validateCatalogInvariants(catalog));
  }
  return {
    valid: errors.length === 0,
    errors,
    side_effect_performed: false,
    dispatch_performed: false
  };
}

function bindingIdentity(binding) {
  const parts = [
    normalize(binding?.provider_identifier),
    normalize(binding?.host_identifier),
    normalize(binding?.resource_identifier),
    normalize(binding?.thread_identifier)
  ];
  return parts.some(Boolean) ? parts.join("\u0000") : null;
}

function validateBindingInvariants(bindingsDocument, catalog) {
  const errors = [];
  const bindings = Array.isArray(bindingsDocument?.bindings)
    ? bindingsDocument.bindings
    : [];
  const seenRoutes = new Set();
  const catalogRoutes = new Set(
    (catalog?.routes ?? []).map((route) => normalize(route.route_id))
  );

  if (catalog && bindingsDocument?.catalog_revision !== catalog.catalog_revision) {
    errors.push(customError(
      "/catalog_revision",
      "catalogRevision",
      "must equal the catalog revision"
    ));
  }

  for (const [index, binding] of bindings.entries()) {
    const routeKey = normalize(binding?.route_id);
    if (seenRoutes.has(routeKey)) {
      errors.push(customError(
        `/bindings/${index}/route_id`,
        "uniqueRouteBinding",
        "must have at most one live binding record per route"
      ));
    }
    seenRoutes.add(routeKey);

    if (catalog && !catalogRoutes.has(routeKey)) {
      errors.push(customError(
        `/bindings/${index}/route_id`,
        "knownRouteReference",
        "must reference a route in the supplied catalog"
      ));
    }

    const primary = [
      binding?.durable_coordination_binding,
      binding?.preferred_execution_surface,
      binding?.runtime_agent,
      binding?.runtime_session,
      binding?.worktree_binding,
      ...(binding?.fallback_bindings ?? [])
    ].filter(Boolean);
    const primaryIds = new Set(primary.map((item) => normalize(item.binding_id)));
    const primaryResources = new Set(primary.map(bindingIdentity).filter(Boolean));

    for (const [validatorIndex, validator] of (binding?.validator_bindings ?? []).entries()) {
      const validatorResource = bindingIdentity(validator);
      if (
        primaryIds.has(normalize(validator.binding_id)) ||
        (validatorResource !== null && primaryResources.has(validatorResource))
      ) {
        errors.push(customError(
          `/bindings/${index}/validator_bindings/${validatorIndex}`,
          "validatorIndependence",
          "validator binding must be independent from primary and fallback bindings"
        ));
      }
    }
  }

  return errors;
}

export async function validateBindings(bindingsDocument, catalog = undefined) {
  const errors = validateBindingsShape(bindingsDocument);
  if (errors.length === 0) {
    errors.push(...validateBindingInvariants(bindingsDocument, catalog));
  }
  return {
    valid: errors.length === 0,
    errors,
    side_effect_performed: false,
    dispatch_performed: false
  };
}

function publicRoute(route) {
  return {
    route_id: route.route_id,
    branch_id: route.branch_id,
    display_name: route.display_name,
    scope: route.scope,
    project_code: route.project_code,
    owner_role: route.owner_role,
    manager_route_id: route.manager_route_id,
    escalation_route_id: route.escalation_route_id,
    lifecycle: route.lifecycle,
    capability_classes: route.capability_classes
  };
}

function result(state, extra = {}) {
  return {
    state,
    route: null,
    runtime_binding: null,
    execution_ready: false,
    runtime_binding_confers_authority: false,
    side_effect_performed: false,
    dispatch_performed: false,
    ...extra
  };
}

function lifecycleState(route) {
  switch (route.lifecycle.state) {
    case "stale":
      return "STALE";
    case "retired":
      return "RETIRED";
    case "rollover_pending":
      return "ROLLOVER_PENDING";
    default:
      return "EXACT";
  }
}

function finishUnique(route, catalog, bindingsDocument, matched_by) {
  const state = lifecycleState(route);
  if (state !== "EXACT") {
    return result(state, {
      route: publicRoute(route),
      matched_by,
      reason: `route lifecycle is ${route.lifecycle.state}`
    });
  }

  if (
    bindingsDocument &&
    bindingsDocument.catalog_revision !== catalog.catalog_revision
  ) {
    return result("STALE", {
      route: publicRoute(route),
      matched_by,
      reason: "local binding catalog revision does not match"
    });
  }

  const matches = (bindingsDocument?.bindings ?? []).filter(
    (binding) => normalize(binding.route_id) === normalize(route.route_id)
  );
  if (matches.length > 1) {
    return result("AMBIGUOUS", {
      candidates: [publicRoute(route)],
      matched_by,
      reason: "duplicate local binding records"
    });
  }

  const runtimeBinding = matches[0] ?? null;
  const bindingStateMap = {
    stale: "STALE",
    rollover_pending: "ROLLOVER_PENDING",
    retired: "RETIRED",
    unknown: "UNKNOWN"
  };
  if (runtimeBinding && bindingStateMap[runtimeBinding.binding_state]) {
    return result(bindingStateMap[runtimeBinding.binding_state], {
      route: publicRoute(route),
      matched_by,
      reason: `local binding state is ${runtimeBinding.binding_state}`
    });
  }
  return result("EXACT", {
    route: publicRoute(route),
    runtime_binding: runtimeBinding,
    execution_ready: runtimeBinding?.execution_ready === true,
    matched_by,
    reason: runtimeBinding
      ? "stable route resolved; local runtime joined without granting authority"
      : "stable route resolved; no local runtime binding"
  });
}

function finishCandidates(candidates, catalog, bindingsDocument, matched_by) {
  if (candidates.length === 0) {
    return result("UNKNOWN", { matched_by, reason: "no route matched" });
  }
  if (candidates.length > 1) {
    return result("AMBIGUOUS", {
      candidates: candidates.map(publicRoute),
      matched_by,
      reason: "more than one route matched at the same precedence"
    });
  }
  return finishUnique(candidates[0], catalog, bindingsDocument, matched_by);
}

export function resolveRoute({
  catalog,
  bindings: bindingsDocument = undefined,
  query = "",
  route_id = undefined,
  project_code = undefined,
  canon_confirmed = false
}) {
  const routes = catalog?.routes ?? [];

  if (route_id !== undefined) {
    const key = normalize(route_id);
    const candidates = routes.filter((route) => normalize(route.route_id) === key);
    return finishCandidates(candidates, catalog, bindingsDocument, "route_id");
  }

  if (project_code !== undefined) {
    if (canon_confirmed !== true) {
      return result("UNKNOWN", {
        matched_by: "project_code",
        reason: "project_code requires canon_confirmed=true"
      });
    }
    const key = normalize(project_code);
    const candidates = routes.filter(
      (route) => route.project_code !== null && normalize(route.project_code) === key
    );
    return finishCandidates(candidates, catalog, bindingsDocument, "project_code");
  }

  const key = normalize(query);
  if (!key) {
    return result("UNKNOWN", { matched_by: "query", reason: "query is empty" });
  }

  const excluded = [];
  const eligible = routes.filter((route) => {
    const prohibition = route.do_not_route.find((item) => normalize(item.term) === key);
    if (prohibition) {
      excluded.push({
        route_id: route.route_id,
        reason: prohibition.reason
      });
      return false;
    }
    return true;
  });

  const exact = eligible.filter((route) =>
    [route.display_name, ...route.aliases].some((term) => normalize(term) === key)
  );
  if (exact.length > 0) {
    return finishCandidates(exact, catalog, bindingsDocument, "display_or_alias");
  }

  const responsibility = eligible.filter((route) =>
    route.scope.responsibility_terms.some((term) => normalize(term) === key)
  );
  if (responsibility.length > 0) {
    return finishCandidates(
      responsibility,
      catalog,
      bindingsDocument,
      "responsibility_term"
    );
  }

  return result("UNKNOWN", {
    matched_by: "query",
    reason: excluded.length > 0
      ? "matching routes explicitly prohibit this request"
      : "no route matched",
    excluded
  });
}

function markdown(value) {
  return String(value).replace(/[\\`*_[\]<>|]/gu, "\\$&");
}

function routeLine(route, indent = "") {
  const project = route.project_code ? ` · project \`${markdown(route.project_code)}\`` : "";
  return `${indent}- ${markdown(route.display_name)} (\`${markdown(route.route_id)}\`)${project}`;
}

function renderOverview(catalog) {
  const lines = [
    "## Organization overview",
    "",
    "Navigation authority: `none`",
    ""
  ];
  for (const branch of catalog.branches) {
    lines.push(`- ${markdown(branch.display_name)} (\`${branch.branch_id}\`)`);
  }
  return lines.join("\n");
}

function renderProjects(catalog) {
  const commonRoutes = catalog.routes.filter((route) => route.branch_id === "common");
  const projectRoutes = catalog.routes.filter((route) => route.branch_id === "projects");
  return [
    "## COMMON and projects",
    "",
    "### COMMON",
    "",
    ...(commonRoutes.length ? commonRoutes.map((route) => routeLine(route)) : ["- None"]),
    "",
    "### PROJECTS (flat sibling leaves)",
    "",
    ...(projectRoutes.length ? projectRoutes.map((route) => routeLine(route)) : ["- None"])
  ].join("\n");
}

function renderAx(catalog) {
  const axRoutes = catalog.routes.filter((route) => route.branch_id === "ax_development");
  const roots = axRoutes.filter((route) => route.manager_route_id === null);
  const lines = ["## AX detail", ""];
  for (const root of roots) {
    lines.push(routeLine(root));
    for (const child of axRoutes.filter(
      (route) => normalize(route.manager_route_id) === normalize(root.route_id)
    )) {
      lines.push(routeLine(child, "  "));
    }
  }
  return lines.join("\n");
}

export function renderDirectory(catalog, view = "all") {
  const renderers = {
    overview: renderOverview,
    projects: renderProjects,
    ax: renderAx
  };
  if (view === "all") {
    return [
      "# Codex work organization projections",
      "",
      "These organization views are read-only projections of one route catalog.",
      "",
      renderOverview(catalog),
      "",
      renderProjects(catalog),
      "",
      renderAx(catalog)
    ].join("\n");
  }
  if (!renderers[view]) {
    throw new Error(`unsupported view: ${view}`);
  }
  return renderers[view](catalog);
}

export async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export const schemaPaths = Object.freeze({
  route_catalog: fileURLToPath(ROUTE_SCHEMA_URL),
  live_bindings: fileURLToPath(BINDING_SCHEMA_URL)
});
