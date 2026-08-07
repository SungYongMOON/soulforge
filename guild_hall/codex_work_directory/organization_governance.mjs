import { BRANCH_IDS } from "./directory.mjs";

export const ORGANIZATION_GOVERNANCE_OVERLAY_SCHEMA = "soulforge.organization_governance_overlay.v1";

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u;
const ORGANIZATION_KIND_PATTERN = /^[a-z][a-z0-9_]{0,63}$/u;
const MAX_DISPLAY_LABEL_LENGTH = 120;
const ROOT_KEYS = new Set([
  "schema_version",
  "catalog_revision",
  "effective_at",
  "updated_at",
  "authority_state",
  "disabled",
  "root_display_label",
  "organizations",
  "role_bindings",
  "metadata_only"
]);
const ORGANIZATION_KEYS = new Set([
  "organization_id",
  "parent_organization_id",
  "organization_kind",
  "display_label",
  "display_order",
  "lifecycle",
  "member_branch_ids",
  "owner_authority_ref",
  "identity_state",
  "mapping_authority",
  "legacy_projection_ref"
]);
const ROLE_BINDING_KEYS = new Set([
  "role_binding_id",
  "organization_id",
  "role_code",
  "position_code",
  "rank",
  "display_order",
  "stable_route_id",
  "display_label",
  "lifecycle"
]);
const AUTHORITY_STATES = new Set(["candidate", "validated_private"]);
const LIFECYCLES = new Set(["active", "retired"]);
const IDENTITY_STATES = new Set(["canonical", "legacy_projection"]);
const MAPPING_AUTHORITIES = new Set(["not_applicable", "owner_seeded"]);
const FORBIDDEN_FIELD_KEY = /(?:secret|token|password|cookie|credential|raw|thread|session|turn|message|reasoning|tool|cwd)/iu;

function customError(instancePath, keyword, message, params = {}) {
  return { instancePath, schemaPath: "", keyword, params, message };
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function checkExactKeys(value, path, keys, errors, optionalKeys = new Set()) {
  if (!isRecord(value)) {
    errors.push(customError(path, "type", "must be an object"));
    return false;
  }
  for (const key of keys) {
    if (!optionalKeys.has(key) && !Object.hasOwn(value, key)) {
      errors.push(customError(path, "required", `must have required property '${key}'`));
    }
  }
  for (const key of Object.keys(value)) {
    if (!keys.has(key)) {
      errors.push(customError(`${path}/${key}`, "additionalProperties", "must not have additional properties"));
    }
    if (FORBIDDEN_FIELD_KEY.test(key)) {
      errors.push(customError(`${path}/${key}`, "forbiddenField", "raw, secret, session, and thread fields are forbidden"));
    }
  }
  return true;
}

function safeIdentifier(value) {
  if (typeof value !== "string") return null;
  const identifier = value.trim();
  return IDENTIFIER_PATTERN.test(identifier) ? identifier : null;
}

function safeNullableIdentifier(value) {
  return value === null ? null : safeIdentifier(value);
}

function safeDisplayLabel(value) {
  if (typeof value !== "string") return null;
  const label = value.normalize("NFKC").trim();
  if (!label || Array.from(label).length > MAX_DISPLAY_LABEL_LENGTH) return null;
  if (/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(label)) return null;
  if (/^(?:[A-Za-z]:|[\\/]{1,2}|(?:\.{1,2}|~)[\\/]|(?:https?|ftp|ssh|s3|file|data|javascript):|[A-Za-z][A-Za-z0-9+.-]*:\/\/|www\.)/iu.test(label)) {
    return null;
  }
  return label;
}

function safeIsoTimestamp(value) {
  if (typeof value !== "string" || value.length > 40 || !/^[0-9T:+.-]+Z?$/u.test(value)) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

function safeNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000 ? value : null;
}

function validateOrganizationShape(organization, index, errors) {
  const path = `/organizations/${index}`;
  if (!checkExactKeys(organization, path, ORGANIZATION_KEYS, errors)) return;

  const organizationId = safeIdentifier(organization.organization_id);
  if (!organizationId) errors.push(customError(`${path}/organization_id`, "pattern", "must be a safe organization identifier"));
  const parentOrganizationId = safeNullableIdentifier(organization.parent_organization_id);
  if (parentOrganizationId === null && organization.parent_organization_id !== null) {
    errors.push(customError(`${path}/parent_organization_id`, "pattern", "must be a safe organization identifier or null"));
  }
  if (typeof organization.organization_kind !== "string" || !ORGANIZATION_KIND_PATTERN.test(organization.organization_kind)) {
    errors.push(customError(`${path}/organization_kind`, "pattern", "must be a supported organization kind identifier"));
  }
  if (!safeDisplayLabel(organization.display_label)) {
    errors.push(customError(`${path}/display_label`, "format", "must be a safe display label"));
  }
  if (safeNonNegativeInteger(organization.display_order) === null) {
    errors.push(customError(`${path}/display_order`, "minimum", "must be a non-negative integer"));
  }
  if (!LIFECYCLES.has(organization.lifecycle)) {
    errors.push(customError(`${path}/lifecycle`, "enum", "must be active or retired"));
  }
  if (!Array.isArray(organization.member_branch_ids) || organization.member_branch_ids.length === 0) {
    errors.push(customError(`${path}/member_branch_ids`, "minItems", "must contain at least one known branch id"));
  } else {
    const seenBranches = new Set();
    for (const [branchIndex, branchId] of organization.member_branch_ids.entries()) {
      if (!BRANCH_IDS.includes(branchId)) {
        errors.push(customError(`${path}/member_branch_ids/${branchIndex}`, "enum", "must be a known branch id"));
      }
      if (seenBranches.has(branchId)) {
        errors.push(customError(`${path}/member_branch_ids/${branchIndex}`, "uniqueItems", "must be unique"));
      }
      seenBranches.add(branchId);
    }
  }
  if (!safeIdentifier(organization.owner_authority_ref)) {
    errors.push(customError(`${path}/owner_authority_ref`, "pattern", "must be a safe authority reference"));
  }
  if (!IDENTITY_STATES.has(organization.identity_state)) {
    errors.push(customError(`${path}/identity_state`, "enum", "must be canonical or legacy_projection"));
  }
  if (!MAPPING_AUTHORITIES.has(organization.mapping_authority)) {
    errors.push(customError(`${path}/mapping_authority`, "enum", "must be not_applicable or owner_seeded"));
  }
  const legacyProjectionRef = safeNullableIdentifier(organization.legacy_projection_ref);
  if (legacyProjectionRef === null && organization.legacy_projection_ref !== null) {
    errors.push(customError(`${path}/legacy_projection_ref`, "pattern", "must be a safe mapping reference or null"));
  }
  if (
    organization.identity_state === "legacy_projection" &&
    (organization.mapping_authority !== "owner_seeded" || legacyProjectionRef === null)
  ) {
    errors.push(customError(`${path}/legacy_projection_ref`, "ownerSeededMapping", "legacy projections require an owner-seeded mapping reference"));
  }
  if (
    organization.identity_state === "canonical" &&
    (organization.mapping_authority !== "not_applicable" || legacyProjectionRef !== null)
  ) {
    errors.push(customError(`${path}/identity_state`, "canonicalMapping", "canonical identities cannot carry a legacy projection mapping"));
  }
}

function validateRoleBindingShape(binding, index, errors) {
  const path = `/role_bindings/${index}`;
  if (!checkExactKeys(binding, path, ROLE_BINDING_KEYS, errors, new Set(["display_label"]))) return;

  for (const field of ["role_binding_id", "organization_id"]) {
    if (!safeIdentifier(binding[field])) {
      errors.push(customError(`${path}/${field}`, "pattern", "must be a safe identifier"));
    }
  }
  const roleCode = safeNullableIdentifier(binding.role_code);
  const positionCode = safeNullableIdentifier(binding.position_code);
  if (roleCode === null && binding.role_code !== null) {
    errors.push(customError(`${path}/role_code`, "pattern", "must be a safe role code or null"));
  }
  if (positionCode === null && binding.position_code !== null) {
    errors.push(customError(`${path}/position_code`, "pattern", "must be a safe position code or null"));
  }
  if (roleCode === null && positionCode === null) {
    errors.push(customError(path, "roleIdentity", "requires a role_code or position_code"));
  }
  for (const field of ["rank", "display_order"]) {
    if (safeNonNegativeInteger(binding[field]) === null) {
      errors.push(customError(`${path}/${field}`, "minimum", "must be a non-negative integer"));
    }
  }
  const stableRouteId = safeNullableIdentifier(binding.stable_route_id);
  if (stableRouteId === null && binding.stable_route_id !== null) {
    errors.push(customError(`${path}/stable_route_id`, "pattern", "must be a safe stable route id or null"));
  }
  if (binding.display_label !== undefined && !safeDisplayLabel(binding.display_label)) {
    errors.push(customError(`${path}/display_label`, "format", "must be a safe role display label when present"));
  }
  if (!LIFECYCLES.has(binding.lifecycle)) {
    errors.push(customError(`${path}/lifecycle`, "enum", "must be active or retired"));
  }
}

function validateInvariants(document, errors) {
  const organizations = Array.isArray(document?.organizations) ? document.organizations : [];
  const roleBindings = Array.isArray(document?.role_bindings) ? document.role_bindings : [];
  const organizationsById = new Map();
  const roleBindingsById = new Set();

  for (const [index, organization] of organizations.entries()) {
    const organizationId = safeIdentifier(organization?.organization_id);
    if (!organizationId) continue;
    if (organizationsById.has(organizationId)) {
      errors.push(customError(`/organizations/${index}/organization_id`, "uniqueOrganizationId", "must be unique"));
    } else {
      organizationsById.set(organizationId, organization);
    }
  }

  if (organizationsById.size === 0) {
    errors.push(customError("/organizations", "minItems", "must contain at least one organization"));
  }

  for (const [index, organization] of organizations.entries()) {
    const organizationId = safeIdentifier(organization?.organization_id);
    const parentId = safeNullableIdentifier(organization?.parent_organization_id);
    if (!organizationId || (parentId === null && organization?.parent_organization_id !== null)) continue;
    if (parentId === null) {
      if (organization.organization_kind !== "company") {
        errors.push(customError(`/organizations/${index}/organization_kind`, "rootOrganizationKind", "root organizations must be company"));
      }
      continue;
    }
    const parent = organizationsById.get(parentId);
    if (!parent) {
      errors.push(customError(`/organizations/${index}/parent_organization_id`, "knownParent", "must reference an organization in this source"));
      continue;
    }
    if (parentId === organizationId) {
      errors.push(customError(`/organizations/${index}/parent_organization_id`, "selfParent", "must not reference itself"));
    }
    if (organization.lifecycle === "active" && parent.lifecycle !== "active") {
      errors.push(customError(`/organizations/${index}/lifecycle`, "activeParent", "active organizations require an active parent"));
    }
    const parentBranches = new Set(parent.member_branch_ids ?? []);
    for (const branchId of organization.member_branch_ids ?? []) {
      if (!parentBranches.has(branchId)) {
        errors.push(customError(`/organizations/${index}/member_branch_ids`, "parentBranchMembership", "must be a subset of the parent organization branches"));
        break;
      }
    }
  }

  for (const [index, organization] of organizations.entries()) {
    const organizationId = safeIdentifier(organization?.organization_id);
    if (!organizationId) continue;
    const visited = new Set([organizationId]);
    let current = organization;
    while (current?.parent_organization_id !== null) {
      const parentId = safeNullableIdentifier(current.parent_organization_id);
      if (!parentId || !organizationsById.has(parentId)) break;
      if (visited.has(parentId)) {
        errors.push(customError(`/organizations/${index}/parent_organization_id`, "cycle", "organization hierarchy must be acyclic"));
        break;
      }
      visited.add(parentId);
      current = organizationsById.get(parentId);
    }
    if (
      organization.lifecycle === "active" &&
      current?.parent_organization_id === null &&
      (current.lifecycle !== "active" || current.organization_kind !== "company")
    ) {
      errors.push(customError(`/organizations/${index}`, "activeCompanyRoot", "active organizations must resolve to an active company root"));
    }
  }

  for (const [index, binding] of roleBindings.entries()) {
    const bindingId = safeIdentifier(binding?.role_binding_id);
    if (bindingId) {
      if (roleBindingsById.has(bindingId)) {
        errors.push(customError(`/role_bindings/${index}/role_binding_id`, "uniqueRoleBindingId", "must be unique"));
      }
      roleBindingsById.add(bindingId);
    }
    const organization = organizationsById.get(safeIdentifier(binding?.organization_id));
    if (!organization) {
      errors.push(customError(`/role_bindings/${index}/organization_id`, "knownOrganization", "must reference an organization in this source"));
    } else if (binding?.lifecycle === "active" && organization.lifecycle !== "active") {
      errors.push(customError(`/role_bindings/${index}/lifecycle`, "activeOrganization", "active role bindings require an active organization"));
    }
  }

  for (const [index, organization] of organizations.entries()) {
    if (organization?.parent_organization_id !== null || organization?.lifecycle !== "active") continue;
    const activeCeoBindings = roleBindings.filter((binding) => (
      binding?.organization_id === organization.organization_id
      && binding?.role_code === "company_ceo"
      && binding?.lifecycle === "active"
    ));
    if (activeCeoBindings.length !== 1) {
      errors.push(customError(`/organizations/${index}`, "companyCeoBinding", "active company organizations require exactly one active company_ceo role binding"));
    }
  }
}

function normalizeOrganization(organization) {
  return {
    organization_id: safeIdentifier(organization.organization_id),
    parent_organization_id: safeNullableIdentifier(organization.parent_organization_id),
    organization_kind: organization.organization_kind,
    display_label: safeDisplayLabel(organization.display_label),
    display_order: organization.display_order,
    lifecycle: organization.lifecycle,
    member_branch_ids: [...organization.member_branch_ids].sort((left, right) => BRANCH_IDS.indexOf(left) - BRANCH_IDS.indexOf(right)),
    owner_authority_ref: safeIdentifier(organization.owner_authority_ref),
    identity_state: organization.identity_state,
    mapping_authority: organization.mapping_authority,
    legacy_projection_ref: safeNullableIdentifier(organization.legacy_projection_ref)
  };
}

function normalizeRoleBinding(binding) {
  return {
    role_binding_id: safeIdentifier(binding.role_binding_id),
    organization_id: safeIdentifier(binding.organization_id),
    role_code: safeNullableIdentifier(binding.role_code),
    position_code: safeNullableIdentifier(binding.position_code),
    rank: binding.rank,
    display_order: binding.display_order,
    stable_route_id: safeNullableIdentifier(binding.stable_route_id),
    display_label: binding.display_label === undefined ? null : safeDisplayLabel(binding.display_label),
    lifecycle: binding.lifecycle
  };
}

function sortByOrder(left, right, idKey) {
  return left.display_order - right.display_order || left[idKey].localeCompare(right[idKey]);
}

export function validateOrganizationGovernanceOverlay(document) {
  const errors = [];
  if (!checkExactKeys(document, "", ROOT_KEYS, errors)) {
    return { valid: false, errors, governance: null, claim: "hold", side_effect_performed: false };
  }
  if (document.schema_version !== ORGANIZATION_GOVERNANCE_OVERLAY_SCHEMA) {
    errors.push(customError("/schema_version", "const", "must equal the v1 governance overlay schema version"));
  }
  if (safeNonNegativeInteger(document.catalog_revision) === null) {
    errors.push(customError("/catalog_revision", "minimum", "must be a non-negative integer"));
  }
  const effectiveAt = safeIsoTimestamp(document.effective_at);
  const updatedAt = safeIsoTimestamp(document.updated_at);
  if (!effectiveAt) errors.push(customError("/effective_at", "format", "must be an ISO timestamp"));
  if (!updatedAt) errors.push(customError("/updated_at", "format", "must be an ISO timestamp"));
  if (effectiveAt && updatedAt && Date.parse(effectiveAt) > Date.parse(updatedAt)) {
    errors.push(customError("/effective_at", "effectiveAt", "must not be later than updated_at"));
  }
  if (!AUTHORITY_STATES.has(document.authority_state)) {
    errors.push(customError("/authority_state", "enum", "must be candidate or validated_private"));
  }
  if (typeof document.disabled !== "boolean") {
    errors.push(customError("/disabled", "type", "must be boolean"));
  }
  if (!safeDisplayLabel(document.root_display_label)) {
    errors.push(customError("/root_display_label", "format", "must be a safe display label"));
  }
  if (document.metadata_only !== true) {
    errors.push(customError("/metadata_only", "const", "must be true"));
  }
  if (!Array.isArray(document.organizations)) {
    errors.push(customError("/organizations", "type", "must be an array"));
  } else {
    document.organizations.forEach((organization, index) => validateOrganizationShape(organization, index, errors));
  }
  if (!Array.isArray(document.role_bindings)) {
    errors.push(customError("/role_bindings", "type", "must be an array"));
  } else {
    document.role_bindings.forEach((binding, index) => validateRoleBindingShape(binding, index, errors));
  }
  if (errors.length === 0) validateInvariants(document, errors);
  if (errors.length > 0) {
    return { valid: false, errors, governance: null, claim: "hold", side_effect_performed: false };
  }
  const governance = {
    schema_version: ORGANIZATION_GOVERNANCE_OVERLAY_SCHEMA,
    catalog_revision: document.catalog_revision,
    effective_at: effectiveAt,
    updated_at: updatedAt,
    authority_state: document.authority_state,
    disabled: document.disabled,
    root_display_label: safeDisplayLabel(document.root_display_label),
    organizations: document.organizations.map(normalizeOrganization).sort((left, right) => sortByOrder(left, right, "organization_id")),
    role_bindings: document.role_bindings.map(normalizeRoleBinding).sort((left, right) => (
      left.rank - right.rank || sortByOrder(left, right, "role_binding_id")
    )),
    metadata_only: true
  };
  return {
    valid: true,
    errors: [],
    governance,
    claim: governance.disabled ? "disabled" : governance.authority_state,
    side_effect_performed: false
  };
}

export function normalizeOrganizationGovernanceOverlay(document) {
  return validateOrganizationGovernanceOverlay(document).governance;
}

function boardPresentationRole(organizationKind) {
  if (organizationKind.endsWith("_portfolio")) return "manager_peers";
  return "group_node";
}

function resolveCompanyOrganizationId(organization, organizationsById) {
  let current = organization;
  const visited = new Set();
  while (current?.parent_organization_id !== null) {
    if (visited.has(current.organization_id)) return null;
    visited.add(current.organization_id);
    current = organizationsById.get(current.parent_organization_id);
  }
  return current?.organization_kind === "company" ? current.organization_id : null;
}

export function projectOrganizationGovernanceForBoard(document) {
  const validation = validateOrganizationGovernanceOverlay(document);
  if (!validation.valid || validation.governance.disabled) return null;
  const governance = validation.governance;
  const organizationsById = new Map(governance.organizations.map((organization) => [organization.organization_id, organization]));
  const activeCeoRoleByOrganizationId = new Map(
    governance.role_bindings
      .filter((binding) => binding.lifecycle === "active" && binding.role_code === "company_ceo")
      .map((binding) => [binding.organization_id, binding])
  );
  const organizations = governance.organizations.map((organization) => ({
    organization_id: organization.organization_id,
    company_organization_id: resolveCompanyOrganizationId(organization, organizationsById),
    display_label: organization.organization_kind === "company"
      ? (activeCeoRoleByOrganizationId.get(organization.organization_id)?.display_label ?? organization.display_label)
      : organization.display_label,
    parent_organization_id: organization.parent_organization_id,
    presentation_role: organization.organization_kind === "company" ? "ceo" : boardPresentationRole(organization.organization_kind),
    display_order: organization.display_order,
    lifecycle: organization.lifecycle
  }));
  if (organizations.some((organization) => organization.company_organization_id === null)) return null;
  return {
    source_schema_version: governance.schema_version,
    catalog_revision: governance.catalog_revision,
    effective_at: governance.effective_at,
    updated_at: governance.updated_at,
    authority_state: governance.authority_state,
    root_display_label: governance.root_display_label,
    companies: organizations
      .filter((organization) => organization.organization_id === organization.company_organization_id)
      .map((organization) => ({
        organization_id: organization.organization_id,
        display_label: organizationsById.get(organization.organization_id)?.display_label ?? organization.display_label,
        ceo_organization_id: organization.organization_id,
        display_order: organization.display_order,
        lifecycle: organization.lifecycle
      }))
      .sort((left, right) => sortByOrder(left, right, "organization_id")),
    organizations: organizations.sort((left, right) => sortByOrder(left, right, "organization_id")),
    role_bindings: governance.role_bindings.map((binding) => ({ ...binding })),
    metadata_only: true
  };
}
