export const ORGANIZATION_CATALOG_SCHEMA = "soulforge.team_ops_board.organization_catalog.v1";

const RAW_FLAG_KEYS = ["raw_preview", "raw_turns", "raw_messages", "raw_reasoning", "raw_tool_io", "raw_cwd"];
const CATALOG_ROOT_KEYS = new Set([
  "schema_version",
  "catalog_revision",
  "updated_at",
  "disabled",
  "root_display_label",
  "companies",
  "groups",
  "metadata_only",
  ...RAW_FLAG_KEYS
]);
const COMPANY_KEYS = new Set(["company_id", "display_label", "ceo_group_id", "sort_order", "lifecycle"]);
const GROUP_KEYS = new Set([
  "organization_group_id",
  "company_id",
  "display_label",
  "parent_group_id",
  "presentation_role",
  "sort_order",
  "lifecycle"
]);
const COMPANY_LIFECYCLES = new Set(["active", "retired"]);
const GROUP_LIFECYCLES = new Set(["active", "retired"]);
const PRESENTATION_ROLES = new Set(["ceo", "manager_peers", "group_node"]);
const DISPLAY_LABEL_MAX_LENGTH = 120;
const GOVERNANCE_PROJECTION_ROOT_KEYS = new Set([
  "source_schema_version",
  "catalog_revision",
  "effective_at",
  "updated_at",
  "authority_state",
  "root_display_label",
  "companies",
  "organizations",
  "role_bindings",
  "metadata_only"
]);
const GOVERNANCE_PROJECTION_COMPANY_KEYS = new Set([
  "organization_id",
  "display_label",
  "ceo_organization_id",
  "display_order",
  "lifecycle"
]);
const GOVERNANCE_PROJECTION_ORGANIZATION_KEYS = new Set([
  "organization_id",
  "company_organization_id",
  "display_label",
  "parent_organization_id",
  "presentation_role",
  "display_order",
  "lifecycle"
]);
const GOVERNANCE_PROJECTION_ROLE_BINDING_KEYS = new Set([
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

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  return isRecord(value) && Object.keys(value).length === keys.size && Object.keys(value).every((key) => keys.has(key));
}

function safeToken(value, maxLength = 192) {
  if (typeof value !== "string") return null;
  const token = value.trim();
  if (!token || token.length > maxLength || !/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u.test(token)) return null;
  return token;
}

function safeNullableToken(value, maxLength = 192) {
  return value === null ? null : safeToken(value, maxLength);
}

function safeDisplayLabel(value) {
  if (typeof value !== "string") return null;
  const label = value.normalize("NFKC").trim();
  if (!label || Array.from(label).length > DISPLAY_LABEL_MAX_LENGTH) return null;
  if (/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(label)) return null;
  if (
    /^(?:[A-Za-z]:|[\\/]{1,2}|(?:\.{1,2}|~)[\\/]|(?:https?|ftp|ssh|s3|file|data|javascript):|[A-Za-z][A-Za-z0-9+.-]*:\/\/|www\.)/iu.test(label)
    || /^[^\s\\/]+(?:[\\/][^\s\\/]+)+$/u.test(label)
    || /^[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}(?:[/?#].*)?$/u.test(label)
  ) {
    return null;
  }
  return label;
}

function safeIsoTimestamp(value) {
  if (typeof value !== "string" || value.length > 40 || !/^[0-9T:+.-]+Z?$/u.test(value)) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

function safeSortOrder(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000 ? value : null;
}

function falseRawFlags(value) {
  return value.metadata_only === true && RAW_FLAG_KEYS.every((key) => value[key] === false);
}

function sortByOrder(left, right, idKey) {
  return left.sort_order - right.sort_order || left[idKey].localeCompare(right[idKey]);
}

export function normalizeOrganizationCatalogCompany(value) {
  if (!hasExactKeys(value, COMPANY_KEYS)) return null;
  const companyId = safeToken(value.company_id, 160);
  const displayLabel = safeDisplayLabel(value.display_label);
  const ceoGroupId = safeToken(value.ceo_group_id, 160);
  const sortOrder = safeSortOrder(value.sort_order);
  if (!companyId || !displayLabel || !ceoGroupId || sortOrder === null || !COMPANY_LIFECYCLES.has(value.lifecycle)) return null;
  return {
    company_id: companyId,
    display_label: displayLabel,
    ceo_group_id: ceoGroupId,
    sort_order: sortOrder,
    lifecycle: value.lifecycle
  };
}

export function normalizeOrganizationCatalogGroup(value) {
  if (!hasExactKeys(value, GROUP_KEYS)) return null;
  const organizationGroupId = safeToken(value.organization_group_id, 160);
  const companyId = safeToken(value.company_id, 160);
  const displayLabel = safeDisplayLabel(value.display_label);
  const parentGroupId = safeNullableToken(value.parent_group_id, 160);
  const sortOrder = safeSortOrder(value.sort_order);
  if (
    !organizationGroupId
    || !companyId
    || !displayLabel
    || sortOrder === null
    || parentGroupId === organizationGroupId
    || !PRESENTATION_ROLES.has(value.presentation_role)
    || !GROUP_LIFECYCLES.has(value.lifecycle)
  ) {
    return null;
  }
  if (value.presentation_role === "ceo" && parentGroupId !== null) return null;
  return {
    organization_group_id: organizationGroupId,
    company_id: companyId,
    display_label: displayLabel,
    parent_group_id: parentGroupId,
    presentation_role: value.presentation_role,
    sort_order: sortOrder,
    lifecycle: value.lifecycle
  };
}

function hasValidTopology(companies, groups) {
  const companiesById = new Map(companies.map((company) => [company.company_id, company]));
  const groupsById = new Map(groups.map((group) => [group.organization_group_id, group]));
  if (companiesById.size !== companies.length || groupsById.size !== groups.length) return false;

  for (const company of companies) {
    const ceoGroup = groupsById.get(company.ceo_group_id);
    if (!ceoGroup || ceoGroup.company_id !== company.company_id || ceoGroup.presentation_role !== "ceo") return false;
    if (company.lifecycle === "active" && ceoGroup.lifecycle !== "active") return false;
  }

  const ceoGroupIds = new Set(companies.map((company) => company.ceo_group_id));
  for (const group of groups) {
    const company = companiesById.get(group.company_id);
    if (!company) return false;
    if (group.lifecycle === "active" && company.lifecycle !== "active") return false;
    if (group.presentation_role === "ceo" && !ceoGroupIds.has(group.organization_group_id)) return false;
    if (group.parent_group_id === null) continue;
    const parent = groupsById.get(group.parent_group_id);
    if (!parent || parent.company_id !== group.company_id) return false;
    if (group.lifecycle === "active" && parent.lifecycle !== "active") return false;
  }

  for (const group of groups) {
    const visited = new Set([group.organization_group_id]);
    let parentGroupId = group.parent_group_id;
    while (parentGroupId !== null) {
      if (visited.has(parentGroupId)) return false;
      visited.add(parentGroupId);
      parentGroupId = groupsById.get(parentGroupId)?.parent_group_id ?? null;
    }
  }
  return true;
}

export function createEmptyOrganizationCatalog({ now = new Date().toISOString(), disabled = false, rootDisplayLabel = "조직" } = {}) {
  const updatedAt = safeIsoTimestamp(now) ?? new Date().toISOString();
  const label = safeDisplayLabel(rootDisplayLabel) ?? "조직";
  return {
    schema_version: ORGANIZATION_CATALOG_SCHEMA,
    catalog_revision: 0,
    updated_at: updatedAt,
    disabled: disabled === true,
    root_display_label: label,
    companies: [],
    groups: [],
    metadata_only: true,
    raw_preview: false,
    raw_turns: false,
    raw_messages: false,
    raw_reasoning: false,
    raw_tool_io: false,
    raw_cwd: false
  };
}

export function normalizeOrganizationCatalog(value) {
  if (
    !hasExactKeys(value, CATALOG_ROOT_KEYS)
    || value.schema_version !== ORGANIZATION_CATALOG_SCHEMA
    || !Number.isSafeInteger(value.catalog_revision)
    || value.catalog_revision < 0
    || typeof value.disabled !== "boolean"
    || safeIsoTimestamp(value.updated_at) === null
    || !safeDisplayLabel(value.root_display_label)
    || !Array.isArray(value.companies)
    || !Array.isArray(value.groups)
    || !falseRawFlags(value)
  ) {
    return null;
  }
  const companies = value.companies.map(normalizeOrganizationCatalogCompany);
  const groups = value.groups.map(normalizeOrganizationCatalogGroup);
  if (companies.some((company) => company === null) || groups.some((group) => group === null)) return null;
  if (!hasValidTopology(companies, groups)) return null;
  return {
    schema_version: ORGANIZATION_CATALOG_SCHEMA,
    catalog_revision: value.catalog_revision,
    updated_at: value.updated_at,
    disabled: value.disabled,
    root_display_label: safeDisplayLabel(value.root_display_label),
    companies: companies.sort((left, right) => sortByOrder(left, right, "company_id")),
    groups: groups.sort((left, right) => sortByOrder(left, right, "organization_group_id")),
    metadata_only: true,
    raw_preview: false,
    raw_turns: false,
    raw_messages: false,
    raw_reasoning: false,
    raw_tool_io: false,
    raw_cwd: false
  };
}

function normalizeGovernanceProjectionCompany(value) {
  if (!hasExactKeys(value, GOVERNANCE_PROJECTION_COMPANY_KEYS)) return null;
  const organizationId = safeToken(value.organization_id, 160);
  const displayLabel = safeDisplayLabel(value.display_label);
  const ceoOrganizationId = safeToken(value.ceo_organization_id, 160);
  const displayOrder = safeSortOrder(value.display_order);
  if (
    !organizationId
    || !displayLabel
    || ceoOrganizationId !== organizationId
    || displayOrder === null
    || !COMPANY_LIFECYCLES.has(value.lifecycle)
  ) {
    return null;
  }
  return {
    organization_id: organizationId,
    display_label: displayLabel,
    ceo_organization_id: ceoOrganizationId,
    display_order: displayOrder,
    lifecycle: value.lifecycle
  };
}

function normalizeGovernanceProjectionOrganization(value) {
  if (!hasExactKeys(value, GOVERNANCE_PROJECTION_ORGANIZATION_KEYS)) return null;
  const organizationId = safeToken(value.organization_id, 160);
  const companyOrganizationId = safeToken(value.company_organization_id, 160);
  const displayLabel = safeDisplayLabel(value.display_label);
  const parentOrganizationId = safeNullableToken(value.parent_organization_id, 160);
  const displayOrder = safeSortOrder(value.display_order);
  if (
    !organizationId
    || !companyOrganizationId
    || !displayLabel
    || parentOrganizationId === organizationId
    || displayOrder === null
    || !PRESENTATION_ROLES.has(value.presentation_role)
    || !GROUP_LIFECYCLES.has(value.lifecycle)
  ) {
    return null;
  }
  if (value.presentation_role === "ceo" && (parentOrganizationId !== null || companyOrganizationId !== organizationId)) return null;
  return {
    organization_id: organizationId,
    company_organization_id: companyOrganizationId,
    display_label: displayLabel,
    parent_organization_id: parentOrganizationId,
    presentation_role: value.presentation_role,
    display_order: displayOrder,
    lifecycle: value.lifecycle
  };
}

function isSafeGovernanceProjectionRoleBinding(value) {
  return hasExactKeys(value, GOVERNANCE_PROJECTION_ROLE_BINDING_KEYS)
    && Boolean(safeToken(value.role_binding_id, 160))
    && Boolean(safeToken(value.organization_id, 160))
    && (value.role_code === null || Boolean(safeToken(value.role_code, 160)))
    && (value.position_code === null || Boolean(safeToken(value.position_code, 160)))
    && (value.role_code !== null || value.position_code !== null)
    && safeSortOrder(value.rank) !== null
    && safeSortOrder(value.display_order) !== null
    && (value.stable_route_id === null || Boolean(safeToken(value.stable_route_id, 160)))
    && (value.display_label === null || safeDisplayLabel(value.display_label) === value.display_label)
    && GROUP_LIFECYCLES.has(value.lifecycle);
}

export function createOrganizationCatalogFromGovernanceProjection(value) {
  if (
    !hasExactKeys(value, GOVERNANCE_PROJECTION_ROOT_KEYS)
    || value.source_schema_version !== "soulforge.organization_governance_overlay.v1"
    || !Number.isSafeInteger(value.catalog_revision)
    || value.catalog_revision < 0
    || safeIsoTimestamp(value.effective_at) === null
    || safeIsoTimestamp(value.updated_at) === null
    || !["candidate", "validated_private"].includes(value.authority_state)
    || !safeDisplayLabel(value.root_display_label)
    || !Array.isArray(value.companies)
    || !Array.isArray(value.organizations)
    || !Array.isArray(value.role_bindings)
    || value.metadata_only !== true
  ) {
    return null;
  }
  const companies = value.companies.map(normalizeGovernanceProjectionCompany);
  const organizations = value.organizations.map(normalizeGovernanceProjectionOrganization);
  if (
    companies.some((company) => company === null)
    || organizations.some((organization) => organization === null)
    || !value.role_bindings.every(isSafeGovernanceProjectionRoleBinding)
  ) {
    return null;
  }
  const catalog = normalizeOrganizationCatalog({
    schema_version: ORGANIZATION_CATALOG_SCHEMA,
    catalog_revision: value.catalog_revision,
    updated_at: value.updated_at,
    disabled: false,
    root_display_label: value.root_display_label,
    companies: companies.map((company) => ({
      company_id: company.organization_id,
      display_label: company.display_label,
      ceo_group_id: company.ceo_organization_id,
      sort_order: company.display_order,
      lifecycle: company.lifecycle
    })),
    groups: organizations.map((organization) => ({
      organization_group_id: organization.organization_id,
      company_id: organization.company_organization_id,
      display_label: organization.display_label,
      parent_group_id: organization.parent_organization_id,
      presentation_role: organization.presentation_role,
      sort_order: organization.display_order,
      lifecycle: organization.lifecycle
    })),
    metadata_only: true,
    raw_preview: false,
    raw_turns: false,
    raw_messages: false,
    raw_reasoning: false,
    raw_tool_io: false,
    raw_cwd: false
  });
  return catalog;
}

export function validateOrganizationCatalog(value) {
  const catalog = normalizeOrganizationCatalog(value);
  if (!catalog) return { valid: false, error: "invalid_organization_catalog", catalog: null };
  return {
    valid: true,
    error: null,
    catalog,
    summary: {
      companies: catalog.companies.length,
      active_companies: catalog.companies.filter((company) => company.lifecycle === "active").length,
      groups: catalog.groups.length,
      active_groups: catalog.groups.filter((group) => group.lifecycle === "active").length,
      disabled: catalog.disabled
    }
  };
}

export function findOrganizationCatalogGroup(catalogInput, organizationGroupId, { activeOnly = false } = {}) {
  const catalog = normalizeOrganizationCatalog(catalogInput);
  const groupId = safeToken(organizationGroupId, 160);
  if (!catalog || !groupId) return null;
  const group = catalog.groups.find((item) => item.organization_group_id === groupId) ?? null;
  if (!group || (activeOnly && group.lifecycle !== "active")) return null;
  return { ...group };
}

export function validateOrganizationCatalogEnrollment(catalogInput, enrollmentRegistryInput) {
  const catalog = normalizeOrganizationCatalog(catalogInput);
  if (!catalog) return { valid: false, error: "invalid_organization_catalog", unknown_group_ids: [], current_enrollment_count: 0 };
  if (catalog.disabled) return { valid: false, error: "organization_catalog_disabled", unknown_group_ids: [], current_enrollment_count: 0 };
  const entries = Array.isArray(enrollmentRegistryInput?.entries) ? enrollmentRegistryInput.entries : [];
  const current = entries.filter((entry) => entry?.lifecycle === "current" || entry?.lifecycle === "accepted");
  const activeGroupIds = new Set(catalog.groups.filter((group) => group.lifecycle === "active").map((group) => group.organization_group_id));
  const unknownGroupIds = [...new Set(
    current
      .map((entry) => safeToken(entry?.organization_group_id, 160))
      .filter((groupId) => groupId && !activeGroupIds.has(groupId))
  )].sort();
  return {
    valid: unknownGroupIds.length === 0,
    error: unknownGroupIds.length === 0 ? null : "enrollment_organization_group_unassigned",
    unknown_group_ids: unknownGroupIds,
    current_enrollment_count: current.length
  };
}

function nextCatalog(catalog, { companies = catalog.companies, groups = catalog.groups, now = new Date().toISOString() } = {}) {
  return normalizeOrganizationCatalog({
    schema_version: ORGANIZATION_CATALOG_SCHEMA,
    catalog_revision: catalog.catalog_revision + 1,
    updated_at: safeIsoTimestamp(now) ?? new Date().toISOString(),
    disabled: false,
    root_display_label: catalog.root_display_label,
    companies,
    groups,
    metadata_only: true,
    raw_preview: false,
    raw_turns: false,
    raw_messages: false,
    raw_reasoning: false,
    raw_tool_io: false,
    raw_cwd: false
  });
}

function sameMetadata(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function inputValue(input, snakeCase, camelCase, fallback = undefined) {
  if (Object.prototype.hasOwnProperty.call(input ?? {}, snakeCase)) return input[snakeCase];
  if (Object.prototype.hasOwnProperty.call(input ?? {}, camelCase)) return input[camelCase];
  return fallback;
}

export function upsertOrganizationCatalogCompany(catalogInput, input = {}, { now = new Date().toISOString() } = {}) {
  const catalog = normalizeOrganizationCatalog(catalogInput);
  if (!catalog) return { error: "invalid_organization_catalog", changed: false, catalog: null };
  if (catalog.disabled) return { error: "organization_catalog_disabled", changed: false, catalog };
  const companyId = safeToken(input.company_id ?? input.companyId, 160);
  if (!companyId) return { error: "invalid_organization_company", changed: false, catalog };
  const current = catalog.companies.find((company) => company.company_id === companyId) ?? null;
  const company = normalizeOrganizationCatalogCompany({
    company_id: companyId,
    display_label: inputValue(input, "display_label", "displayLabel", current?.display_label),
    ceo_group_id: inputValue(input, "ceo_group_id", "ceoGroupId", current?.ceo_group_id),
    sort_order: inputValue(input, "sort_order", "sortOrder", current?.sort_order),
    lifecycle: inputValue(input, "lifecycle", "lifecycle", current?.lifecycle ?? "active")
  });
  if (!company) return { error: "invalid_organization_company", changed: false, catalog };
  if (current && sameMetadata(current, company)) return { error: null, changed: false, catalog, company: current };
  const next = nextCatalog(catalog, {
    companies: [...catalog.companies.filter((item) => item.company_id !== company.company_id), company],
    now
  });
  if (!next) return { error: "invalid_organization_catalog_topology", changed: false, catalog };
  return { error: null, changed: true, catalog: next, company };
}

export function upsertOrganizationCatalogGroup(catalogInput, input = {}, { now = new Date().toISOString() } = {}) {
  const catalog = normalizeOrganizationCatalog(catalogInput);
  if (!catalog) return { error: "invalid_organization_catalog", changed: false, catalog: null };
  if (catalog.disabled) return { error: "organization_catalog_disabled", changed: false, catalog };
  const groupId = safeToken(input.organization_group_id ?? input.organizationGroupId, 160);
  if (!groupId) return { error: "invalid_organization_group", changed: false, catalog };
  const current = catalog.groups.find((group) => group.organization_group_id === groupId) ?? null;
  const group = normalizeOrganizationCatalogGroup({
    organization_group_id: groupId,
    company_id: inputValue(input, "company_id", "companyId", current?.company_id),
    display_label: inputValue(input, "display_label", "displayLabel", current?.display_label),
    parent_group_id: inputValue(input, "parent_group_id", "parentGroupId", current?.parent_group_id ?? null),
    presentation_role: inputValue(input, "presentation_role", "presentationRole", current?.presentation_role),
    sort_order: inputValue(input, "sort_order", "sortOrder", current?.sort_order),
    lifecycle: inputValue(input, "lifecycle", "lifecycle", current?.lifecycle ?? "active")
  });
  if (!group) return { error: "invalid_organization_group", changed: false, catalog };
  if (current && sameMetadata(current, group)) return { error: null, changed: false, catalog, group: current };
  const next = nextCatalog(catalog, {
    groups: [...catalog.groups.filter((item) => item.organization_group_id !== group.organization_group_id), group],
    now
  });
  if (!next) return { error: "invalid_organization_catalog_topology", changed: false, catalog };
  return { error: null, changed: true, catalog: next, group };
}

export function retireOrganizationCatalogGroup(catalogInput, organizationGroupId, { now = new Date().toISOString() } = {}) {
  const catalog = normalizeOrganizationCatalog(catalogInput);
  if (!catalog) return { error: "invalid_organization_catalog", changed: false, catalog: null };
  if (catalog.disabled) return { error: "organization_catalog_disabled", changed: false, catalog };
  const groupId = safeToken(organizationGroupId, 160);
  const current = catalog.groups.find((group) => group.organization_group_id === groupId) ?? null;
  if (!current) return { error: "organization_group_not_found", changed: false, catalog };
  if (current.lifecycle === "retired") return { error: null, changed: false, catalog, group: current };
  const group = { ...current, lifecycle: "retired" };
  const next = nextCatalog(catalog, {
    groups: catalog.groups.map((item) => item.organization_group_id === groupId ? group : item),
    now
  });
  if (!next) return { error: "invalid_organization_catalog_topology", changed: false, catalog };
  return { error: null, changed: true, catalog: next, group };
}
