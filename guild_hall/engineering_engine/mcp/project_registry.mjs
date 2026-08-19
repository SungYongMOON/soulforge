// 과제 명부 — the one page that says which projects this door may serve (부록 B, 최소 변경 1번).
//
// Before this file existed the door was "one process, one project": the profile it was started
// with was the only project it knew, and there was no place to write down that a second one
// exists. The registry is that place. It holds nothing a profile already holds — each row is a
// project code and the absolute path of that project's private profile — so the profile stays the
// single isolation boundary and the registry only says which profiles are in play.
//
// The instance is private (`_workmeta/system/engine/project_registry.json` by convention, asserted
// with the repository's own `guard:workmeta-write` before it is created). What is public is this
// contract and a synthetic fixture whose paths are `<abs>` placeholders.
//
// Validation is split the way the profile's is: `validateProjectRegistry` is pure, and the loader
// below is the one place allowed to read the disk.

import { readFile } from 'node:fs/promises';

import {
  assertPathUnderRoots, assertSafeString, assertToken, profileRoots, validateProjectProfile,
} from './project_profile.mjs';

export const ENGINE_PROJECT_REGISTRY_SCHEMA_VERSION = 'soulforge.engine_project_registry.v0';

export const PROJECT_STATUSES = Object.freeze(['active', 'paused', 'closed']);

export const REGISTRY_ERROR_CODES = Object.freeze({
  REGISTRY_INVALID: 'ENGINE_MCP_REGISTRY_INVALID',
  REGISTRY_DUPLICATE_PROJECT: 'ENGINE_MCP_REGISTRY_DUPLICATE_PROJECT',
  REGISTRY_PROFILE_REFUSED: 'ENGINE_MCP_REGISTRY_PROFILE_REFUSED',
  PROJECT_UNKNOWN: 'SE_MCP_PROJECT_UNKNOWN',
});

export class ProjectRegistryError extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = 'ProjectRegistryError';
    this.code = code;
    this.detail = detail;
  }
}

const fail = (code, message, detail = {}) => {
  throw new ProjectRegistryError(code, message, detail);
};

export const MAX_PROJECTS = 256;

export const REGISTRY_REQUIRED_ROW_KEYS = Object.freeze(['project_code', 'profile', 'status']);
export const REGISTRY_OPTIONAL_ROW_KEYS = Object.freeze(['display_label', 'added_at']);
const REQUIRED_ROW_KEYS = REGISTRY_REQUIRED_ROW_KEYS;
const OPTIONAL_ROW_KEYS = REGISTRY_OPTIONAL_ROW_KEYS;

/** Where the private instance lives by convention (asserted with `guard:workmeta-write`). */
export const REGISTRY_INSTANCE_PATH_CONVENTION = '_workmeta/system/engine/project_registry.json';

const INSTANT = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,9})?Z$/u;

/**
 * Validates one registry object against one repository root.
 *
 * @param raw the parsed registry JSON
 * @param options `{ repo_root }`
 * @returns a frozen registry whose profile paths are resolved
 */
export function validateProjectRegistry(raw, options = {}) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    fail(REGISTRY_ERROR_CODES.REGISTRY_INVALID, 'a registry must be a JSON object', {});
  }
  const known = ['schema_version', 'projects', 'default_project', 'note'];
  const unknown = Object.keys(raw).filter((key) => !known.includes(key));
  if (unknown.length > 0) {
    fail(REGISTRY_ERROR_CODES.REGISTRY_INVALID, 'a registry carries an unknown key', { unknown });
  }
  if (raw.schema_version !== ENGINE_PROJECT_REGISTRY_SCHEMA_VERSION) {
    fail(REGISTRY_ERROR_CODES.REGISTRY_INVALID, 'unexpected registry schema_version',
      { expected: ENGINE_PROJECT_REGISTRY_SCHEMA_VERSION });
  }
  if (!Array.isArray(raw.projects) || raw.projects.length === 0
    || raw.projects.length > MAX_PROJECTS) {
    fail(REGISTRY_ERROR_CODES.REGISTRY_INVALID,
      'projects must be a non-empty array of at most 256 rows', {});
  }
  const roots = profileRoots(assertRepoRoot(options.repo_root));

  const seen = new Set();
  const projects = raw.projects.map((row, index) => {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) {
      fail(REGISTRY_ERROR_CODES.REGISTRY_INVALID, 'a registry row must be an object',
        { field: `projects[${index}]` });
    }
    const missing = REQUIRED_ROW_KEYS.filter((key) => !Object.hasOwn(row, key));
    const extra = Object.keys(row)
      .filter((key) => ![...REQUIRED_ROW_KEYS, ...OPTIONAL_ROW_KEYS].includes(key));
    if (missing.length > 0 || extra.length > 0) {
      fail(REGISTRY_ERROR_CODES.REGISTRY_INVALID,
        'a registry row carries exactly the declared keys',
        { field: `projects[${index}]`, missing, unknown: extra });
    }
    const projectCode = assertToken(row.project_code, `projects[${index}].project_code`);
    if (seen.has(projectCode)) {
      fail(REGISTRY_ERROR_CODES.REGISTRY_DUPLICATE_PROJECT,
        'two registry rows name the same project', { project_code: projectCode });
    }
    seen.add(projectCode);
    if (!PROJECT_STATUSES.includes(row.status)) {
      fail(REGISTRY_ERROR_CODES.REGISTRY_INVALID, 'unknown project status',
        { field: `projects[${index}].status`, statuses: [...PROJECT_STATUSES] });
    }
    // The profile itself may live on either plane: a project keeps it beside its own material,
    // and a project whose folder is not on this machine yet keeps it in the metadata plane.
    const profile = assertPathUnderRoots(row.profile, `projects[${index}].profile`, roots,
      ['project', 'metadata'], REGISTRY_ERROR_CODES.REGISTRY_INVALID);
    const addedAt = row.added_at === undefined || row.added_at === null ? null : row.added_at;
    if (addedAt !== null && (typeof addedAt !== 'string' || !INSTANT.test(addedAt))) {
      fail(REGISTRY_ERROR_CODES.REGISTRY_INVALID, 'added_at must be a UTC ISO-8601 instant',
        { field: `projects[${index}].added_at` });
    }
    return Object.freeze({
      project_code: projectCode,
      profile,
      display_label: row.display_label === undefined || row.display_label === null ? null
        : assertSafeString(row.display_label, `projects[${index}].display_label`, 64),
      status: row.status,
      added_at: addedAt,
    });
  });

  const defaultProject = raw.default_project === undefined || raw.default_project === null
    ? null : assertToken(raw.default_project, 'default_project');
  if (defaultProject !== null && !seen.has(defaultProject)) {
    fail(REGISTRY_ERROR_CODES.REGISTRY_INVALID,
      'default_project names a project the registry does not carry',
      { default_project: defaultProject });
  }

  return Object.freeze({
    schema_version: ENGINE_PROJECT_REGISTRY_SCHEMA_VERSION,
    projects: Object.freeze(projects),
    // With one project the default is that project: naming it twice would be a second place to
    // get it wrong. With several, an unstated default means the caller has to say which one.
    default_project: defaultProject ?? (projects.length === 1 ? projects[0].project_code : null),
  });
}

function assertRepoRoot(value) {
  if (typeof value !== 'string' || value.length === 0) {
    fail(REGISTRY_ERROR_CODES.REGISTRY_INVALID, 'a repository root is required', {});
  }
  return value;
}

/** The registry a `--profile` start implies: one project, itself the default. */
export function registryOfOne({ project_code: projectCode, profile_path: profilePath }) {
  return Object.freeze({
    schema_version: ENGINE_PROJECT_REGISTRY_SCHEMA_VERSION,
    projects: Object.freeze([Object.freeze({
      project_code: projectCode,
      profile: profilePath,
      display_label: null,
      status: 'active',
      added_at: null,
    })]),
    default_project: projectCode,
  });
}

export const projectRow = (registry, projectCode) =>
  registry.projects.find((row) => row.project_code === projectCode) ?? null;

/**
 * Reads every profile the registry names and validates it.
 *
 * A registry that points at one unreadable profile does not half-open: the whole start fails, the
 * same way a bad profile has always failed. Serving four of five projects and staying quiet about
 * the fifth is how a caller ends up believing a project is empty rather than absent.
 */
export async function loadRegistryProfiles(registry, { repo_root: repoRoot }) {
  const profiles = new Map();
  for (const row of registry.projects) {
    let raw;
    try {
      raw = JSON.parse(await readFile(row.profile, 'utf8'));
    } catch (error) {
      fail(REGISTRY_ERROR_CODES.REGISTRY_PROFILE_REFUSED,
        'a registry row names a profile that cannot be read',
        { project_code: row.project_code, code: error?.code ?? 'INVALID_JSON' });
    }
    let profile;
    try {
      profile = validateProjectProfile(raw, { repo_root: repoRoot });
    } catch (error) {
      fail(REGISTRY_ERROR_CODES.REGISTRY_PROFILE_REFUSED,
        'a registry row names a profile the door refuses',
        { project_code: row.project_code, code: error?.code ?? null, detail: error?.detail ?? null });
    }
    if (profile.project_code !== row.project_code) {
      fail(REGISTRY_ERROR_CODES.REGISTRY_PROFILE_REFUSED,
        'a registry row and its profile disagree about the project code',
        { registry_project_code: row.project_code, profile_project_code: profile.project_code });
    }
    profiles.set(row.project_code, profile);
  }
  return profiles;
}

/** Loads and validates a registry file, then every profile in it. */
export async function loadProjectRegistry({ registry_path: registryPath, repo_root: repoRoot }) {
  let raw;
  try {
    raw = JSON.parse(await readFile(registryPath, 'utf8'));
  } catch (error) {
    fail(REGISTRY_ERROR_CODES.REGISTRY_INVALID, 'the registry file could not be read',
      { code: error?.code ?? 'INVALID_JSON' });
  }
  const registry = validateProjectRegistry(raw, { repo_root: repoRoot });
  const profiles = await loadRegistryProfiles(registry, { repo_root: repoRoot });
  return { registry, profiles };
}
