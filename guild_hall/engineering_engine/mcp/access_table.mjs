// Who is calling, what they may call, and what they may be shown (설계 9.1F).
//
// The engine door does not authenticate anybody. Identity arrives from the layer above it — the
// assistant or gateway that a person actually logs into — and the engine's job is to believe that
// identity, write it into the receipt, and then filter what it answers by a table it can read.
// Three rules carry the weight:
//
//   * without a principal the door answers only the public rule class (ⓐ). Not "read-only for
//     anonymous": read tools over project judgement are refused too, because a caller the engine
//     cannot name is a caller it cannot log.
//   * a role the table does not declare gets nothing. A missing row is not an open door.
//   * material with no declared class is treated as ⓒ confidential. Fail-closed, so forgetting to
//     tag a document hides it rather than publishes it.
//
// Pure: no file, no clock, no network. The server reads the bytes and hands them here, exactly the
// way it does for the project profile.

export const ENGINE_ACCESS_TABLE_SCHEMA_VERSION = 'soulforge.engine_access_table.v0';

/** ⓐ 공개 규칙 · ⓑ 팀 판단 · ⓒ 기밀 계약 · ⓓ 개인 (9.1F). */
export const DATA_CLASSES = Object.freeze([
  'public_rules',
  'team_judgment',
  'confidential_contract',
  'personal',
]);

/** The class anything untagged is treated as. Fail-closed: forgetting to tag hides, never shows. */
export const DEFAULT_DATA_CLASS = 'confidential_contract';

export const PUBLIC_DATA_CLASS = 'public_rules';

export const ROLES = Object.freeze([
  'owner', 'pm', 'systems', 'hw', 'sw', 'quality', 'external',
]);

export const ACCESS_ERROR_CODES = Object.freeze({
  ACCESS_TABLE_INVALID: 'ENGINE_MCP_ACCESS_TABLE_INVALID',
  PRINCIPAL_INVALID: 'ENGINE_MCP_PRINCIPAL_INVALID',
  PRINCIPAL_REQUIRED: 'SE_MCP_PRINCIPAL_REQUIRED',
  PERMISSION_DENIED: 'SE_MCP_PERMISSION_DENIED',
  CLASS_EXCEEDED: 'SE_MCP_CLASS_EXCEEDED',
});

/** The reason a refusal states, in the vocabulary 9.1F fixed for the audit log. */
export const ACCESS_REASONS = Object.freeze({
  PRINCIPAL_REQUIRED: 'PRINCIPAL_REQUIRED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  CLASS_EXCEEDED: 'CLASS_EXCEEDED',
  WRITE_DISABLED: 'WRITE_DISABLED',
});

export class AccessTableError extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = 'AccessTableError';
    this.code = code;
    this.detail = detail;
  }
}

const fail = (code, message, detail = {}) => {
  throw new AccessTableError(code, message, detail);
};

const WILDCARD = '*';
const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9_.@-]{0,63}$/u;
const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/u;
const TOOL_NAME = /^[a-z][a-z0-9_]{2,63}$/u;

const MAX = Object.freeze({ tools: 64, classes: 4, capabilities: 16, projects: 256 });

/**
 * The table that applies when the Owner has not written one.
 *
 * It is not a placeholder: it is the reading of 9.1F that the engine falls back to, so it is as
 * narrow as that section. Owner and PM hold everything; a discipline role reads the rules and the
 * team judgement and may register a candidate; an outside party sees the public rule class only.
 * Widening any of this is a file the Owner writes, not a code change.
 */
export const DEFAULT_ACCESS_TABLE_V0 = Object.freeze({
  schema_version: ENGINE_ACCESS_TABLE_SCHEMA_VERSION,
  source: 'built_in_default',
  roles: Object.freeze({
    owner: Object.freeze({
      tools: Object.freeze([WILDCARD]),
      classes: Object.freeze([...DATA_CLASSES]),
      capabilities: Object.freeze([WILDCARD]),
    }),
    pm: Object.freeze({
      tools: Object.freeze([WILDCARD]),
      classes: Object.freeze([...DATA_CLASSES]),
      capabilities: Object.freeze([WILDCARD]),
    }),
    systems: Object.freeze({
      tools: Object.freeze([
        'whoami', 'engine_status', 'projects_list',
        'rules_layers', 'rules_stage', 'rules_card', 'rules_version',
        'observe_status', 'observe_register',
        'judge_result', 'judge_diff', 'next_steps', 'project_status',
      ]),
      classes: Object.freeze(['public_rules', 'team_judgment']),
      capabilities: Object.freeze(['systems_engineering']),
    }),
    hw: Object.freeze({
      tools: Object.freeze([
        'whoami', 'engine_status', 'projects_list',
        'rules_layers', 'rules_stage', 'rules_card', 'rules_version',
        'observe_status', 'observe_register',
        'judge_result', 'judge_diff', 'next_steps', 'project_status',
      ]),
      classes: Object.freeze(['public_rules', 'team_judgment']),
      capabilities: Object.freeze(['hw_engineering', 'mechanical_design']),
    }),
    sw: Object.freeze({
      tools: Object.freeze([
        'whoami', 'engine_status', 'projects_list',
        'rules_layers', 'rules_stage', 'rules_card', 'rules_version',
        'observe_status', 'observe_register',
        'judge_result', 'judge_diff', 'next_steps', 'project_status',
      ]),
      classes: Object.freeze(['public_rules', 'team_judgment']),
      capabilities: Object.freeze(['sw_engineering']),
    }),
    quality: Object.freeze({
      tools: Object.freeze([
        'whoami', 'engine_status', 'projects_list',
        'rules_layers', 'rules_stage', 'rules_card', 'rules_version',
        'observe_status', 'observe_register',
        'judge_result', 'judge_diff', 'next_steps', 'project_status',
      ]),
      classes: Object.freeze(['public_rules', 'team_judgment']),
      capabilities: Object.freeze([
        'verification_review', 'configuration_management', 'risk_management',
      ]),
    }),
    external: Object.freeze({
      tools: Object.freeze([
        'whoami', 'engine_status',
        'rules_layers', 'rules_stage', 'rules_card', 'rules_version',
      ]),
      classes: Object.freeze(['public_rules']),
      capabilities: Object.freeze([]),
    }),
  }),
  project_overrides: Object.freeze({}),
});

function assertStringArray(value, field, max, pattern) {
  if (!Array.isArray(value) || value.length > max) {
    fail(ACCESS_ERROR_CODES.ACCESS_TABLE_INVALID, 'a grant list must be a short array', { field });
  }
  for (const [index, entry] of value.entries()) {
    if (typeof entry !== 'string' || (entry !== WILDCARD && !pattern.test(entry))) {
      fail(ACCESS_ERROR_CODES.ACCESS_TABLE_INVALID, 'a grant list carries an unexpected value',
        { field: `${field}[${index}]` });
    }
  }
  return Object.freeze([...value]);
}

function validateGrant(raw, field) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    fail(ACCESS_ERROR_CODES.ACCESS_TABLE_INVALID, 'a role grant must be an object', { field });
  }
  const known = ['tools', 'classes', 'capabilities'];
  const unknown = Object.keys(raw).filter((key) => !known.includes(key));
  if (unknown.length > 0) {
    fail(ACCESS_ERROR_CODES.ACCESS_TABLE_INVALID, 'a role grant carries an unknown key',
      { field, unknown });
  }
  const classes = assertStringArray(raw.classes ?? [], `${field}.classes`, MAX.classes, SAFE_TOKEN);
  for (const entry of classes) {
    if (entry !== WILDCARD && !DATA_CLASSES.includes(entry)) {
      fail(ACCESS_ERROR_CODES.ACCESS_TABLE_INVALID, 'unknown data class', { field, class: entry });
    }
  }
  return Object.freeze({
    tools: assertStringArray(raw.tools ?? [], `${field}.tools`, MAX.tools, TOOL_NAME),
    classes: classes.includes(WILDCARD) ? Object.freeze([...DATA_CLASSES]) : classes,
    capabilities: assertStringArray(raw.capabilities ?? [], `${field}.capabilities`,
      MAX.capabilities, SAFE_TOKEN),
  });
}

function validateRoleMap(raw, field) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    fail(ACCESS_ERROR_CODES.ACCESS_TABLE_INVALID, 'roles must be an object', { field });
  }
  const roles = {};
  for (const [role, grant] of Object.entries(raw)) {
    if (!ROLES.includes(role)) {
      fail(ACCESS_ERROR_CODES.ACCESS_TABLE_INVALID, 'unknown role', { field, role });
    }
    roles[role] = validateGrant(grant, `${field}.${role}`);
  }
  return Object.freeze(roles);
}

/**
 * Validates one access table.
 *
 * A role the table leaves out is denied everything. That is the point of the table being exact:
 * "we forgot to write the row" and "this role may do nothing" have to read the same way, and the
 * safe one of the two is the one that refuses.
 */
export function validateAccessTable(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    fail(ACCESS_ERROR_CODES.ACCESS_TABLE_INVALID, 'an access table must be a JSON object', {});
  }
  const known = ['schema_version', 'roles', 'project_overrides', 'note', 'source'];
  const unknown = Object.keys(raw).filter((key) => !known.includes(key));
  if (unknown.length > 0) {
    fail(ACCESS_ERROR_CODES.ACCESS_TABLE_INVALID, 'an access table carries an unknown key',
      { unknown });
  }
  if (raw.schema_version !== ENGINE_ACCESS_TABLE_SCHEMA_VERSION) {
    fail(ACCESS_ERROR_CODES.ACCESS_TABLE_INVALID, 'unexpected access table schema_version',
      { expected: ENGINE_ACCESS_TABLE_SCHEMA_VERSION });
  }
  const overridesRaw = raw.project_overrides ?? {};
  if (overridesRaw === null || typeof overridesRaw !== 'object' || Array.isArray(overridesRaw)) {
    fail(ACCESS_ERROR_CODES.ACCESS_TABLE_INVALID, 'project_overrides must be an object', {});
  }
  const projectCodes = Object.keys(overridesRaw);
  if (projectCodes.length > MAX.projects) {
    fail(ACCESS_ERROR_CODES.ACCESS_TABLE_INVALID, 'too many project overrides', {});
  }
  const overrides = {};
  for (const projectCode of projectCodes) {
    if (!SAFE_TOKEN.test(projectCode)) {
      fail(ACCESS_ERROR_CODES.ACCESS_TABLE_INVALID, 'a project override key is not a project code',
        { project_code: projectCode });
    }
    overrides[projectCode] = validateRoleMap(overridesRaw[projectCode],
      `project_overrides.${projectCode}`);
  }
  return Object.freeze({
    schema_version: ENGINE_ACCESS_TABLE_SCHEMA_VERSION,
    source: typeof raw.source === 'string' ? raw.source : 'file',
    roles: validateRoleMap(raw.roles ?? {}, 'roles'),
    project_overrides: Object.freeze(overrides),
  });
}

/**
 * Validates the principal the assistant or gateway layer states for this session.
 *
 * `principal_ref` is an opaque reference, not a name the engine interprets: it is what the receipt
 * records so an access log can answer "who asked". The engine never derives authority from it —
 * authority comes from `role` and the table.
 */
export function validatePrincipal(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    fail(ACCESS_ERROR_CODES.PRINCIPAL_INVALID, 'a principal must be a JSON object', {});
  }
  const known = ['principal_ref', 'role'];
  const missing = known.filter((key) => !Object.hasOwn(raw, key));
  const unknown = Object.keys(raw).filter((key) => !known.includes(key));
  if (missing.length > 0 || unknown.length > 0) {
    fail(ACCESS_ERROR_CODES.PRINCIPAL_INVALID,
      'a principal carries exactly principal_ref and role', { missing, unknown });
  }
  if (typeof raw.principal_ref !== 'string' || !SAFE_REF.test(raw.principal_ref)) {
    fail(ACCESS_ERROR_CODES.PRINCIPAL_INVALID, 'principal_ref must be a short safe reference', {});
  }
  if (!ROLES.includes(raw.role)) {
    fail(ACCESS_ERROR_CODES.PRINCIPAL_INVALID, 'unknown role', { roles: [...ROLES] });
  }
  return Object.freeze({ principal_ref: raw.principal_ref, role: raw.role });
}

/**
 * The grant that applies to one role on one project: a project override replaces the base row
 * rather than merging into it, so reading the override alone tells the whole truth for that
 * project.
 */
export function grantFor(table, role, projectCode = null) {
  const override = projectCode === null ? undefined
    : table.project_overrides?.[projectCode]?.[role];
  return override ?? table.roles?.[role] ?? null;
}

/** The caller's standing for one project, as data. `null` principal means nobody is named. */
export function resolveAccessView({ table, principal = null, project_code: projectCode = null }) {
  if (principal === null) {
    return Object.freeze({
      anonymous: true,
      principal_ref: null,
      role: null,
      project_code: projectCode,
      tools: Object.freeze([]),
      all_tools: false,
      classes: Object.freeze([PUBLIC_DATA_CLASS]),
      capabilities: Object.freeze([]),
      all_capabilities: false,
      table_source: table?.source ?? 'built_in_default',
    });
  }
  const grant = grantFor(table, principal.role, projectCode);
  return Object.freeze({
    anonymous: false,
    principal_ref: principal.principal_ref,
    role: principal.role,
    project_code: projectCode,
    tools: Object.freeze([...(grant?.tools ?? [])]),
    all_tools: (grant?.tools ?? []).includes(WILDCARD),
    classes: Object.freeze([...(grant?.classes ?? [])]),
    capabilities: Object.freeze([...(grant?.capabilities ?? [])]),
    all_capabilities: (grant?.capabilities ?? []).includes(WILDCARD),
    table_source: table?.source ?? 'built_in_default',
  });
}

/** A tool nobody had to log in for: a read over the public rule class and nothing else. */
export const isPublicTool = (tool) =>
  tool.write !== true && (tool.data_class ?? DEFAULT_DATA_CLASS) === PUBLIC_DATA_CLASS;

export const viewAllowsTool = (view, toolName) =>
  view.all_tools === true || view.tools.includes(toolName);

export const viewSeesClass = (view, dataClass) =>
  view.classes.includes(dataClass ?? DEFAULT_DATA_CLASS);

export const viewSeesCapability = (view, capability) =>
  view.all_capabilities === true
  || (capability !== null && capability !== undefined && view.capabilities.includes(capability));

/**
 * One decision per call, in a fixed order: named, allowed, cleared for the class, and only then
 * whether the write switch is on. The order matters for what the receipt says — a caller who is
 * not allowed the tool at all should not learn from the refusal that the write switch is off.
 */
export function decideToolAccess({ view, tool, write_enabled: writeEnabled = false,
  project_status: projectStatus = 'active' }) {
  const dataClass = tool.data_class ?? DEFAULT_DATA_CLASS;
  if (view.anonymous === true) {
    return isPublicTool(tool)
      ? { allowed: true, reason: null, code: null }
      : {
        allowed: false,
        reason: ACCESS_REASONS.PRINCIPAL_REQUIRED,
        code: ACCESS_ERROR_CODES.PRINCIPAL_REQUIRED,
      };
  }
  if (!viewAllowsTool(view, tool.name)) {
    return {
      allowed: false,
      reason: ACCESS_REASONS.PERMISSION_DENIED,
      code: ACCESS_ERROR_CODES.PERMISSION_DENIED,
    };
  }
  if (!viewSeesClass(view, dataClass)) {
    return {
      allowed: false,
      reason: ACCESS_REASONS.CLASS_EXCEEDED,
      code: ACCESS_ERROR_CODES.CLASS_EXCEEDED,
      detail: { data_class: dataClass },
    };
  }
  if (projectStatus === 'closed' || (tool.write === true && projectStatus !== 'active')) {
    return {
      allowed: false,
      reason: ACCESS_REASONS.PERMISSION_DENIED,
      code: ACCESS_ERROR_CODES.PERMISSION_DENIED,
      detail: { project_status: projectStatus },
    };
  }
  if (tool.write === true && writeEnabled !== true) {
    return {
      allowed: false,
      reason: ACCESS_REASONS.WRITE_DISABLED,
      code: 'WRITE_TOOLS_DISABLED',
    };
  }
  return { allowed: true, reason: null, code: null };
}

// ---------------------------------------------------------------- filtering an answer

const descend = (node, key) => (node === null || node === undefined ? undefined : node[key]);

/**
 * Removes the fields a tool declares as ⓒ from one answer, leaving a marker rather than a hole.
 *
 * A path is dotted, and `[]` means "every element of this array": `stages[].launch`. The value is
 * replaced with `null` and named in the report, so a reader is told that something was withheld
 * rather than shown an answer that quietly lost a column.
 */
export function redactFields(value, paths) {
  if (paths === undefined || paths === null || paths.length === 0) {
    return { value, redacted: Object.freeze([]) };
  }
  const copy = structuredClone(value);
  const redacted = [];
  for (const path of paths) removeAtPath(copy, path.split('.'), path, redacted);
  return { value: copy, redacted: Object.freeze([...new Set(redacted)]) };
}

function removeAtPath(node, segments, label, redacted) {
  if (node === null || node === undefined) return false;
  const [head, ...rest] = segments;
  if (head.endsWith('[]')) {
    const list = descend(node, head.slice(0, -2));
    if (!Array.isArray(list)) return false;
    let hit = false;
    for (const element of list) {
      if (rest.length === 0) hit = true;
      else if (removeAtPath(element, rest, label, redacted)) hit = true;
    }
    return hit;
  }
  if (rest.length === 0) {
    if (node[head] === undefined || node[head] === null) return false;
    node[head] = null;
    redacted.push(label);
    return true;
  }
  return removeAtPath(descend(node, head), rest, label, redacted);
}
