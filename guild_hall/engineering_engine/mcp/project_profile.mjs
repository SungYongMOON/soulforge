// The per-project profile the MCP door reads before it will answer anything.
//
// The door carries no project knowledge of its own. Which rule layers a project stands on, where
// its observations live, where its receipts go — all of that is one private JSON file the Owner
// writes once per project, and this module is the gate that file has to pass.
//
// Two rules do the work:
//
//   * every path is absolute, and every path lies under a root this repository already owns
//     (`_workspaces/**`, `_workmeta/**`, or the rule-spec assets). A caller cannot widen that set
//     and a tool cannot accept a path from outside it, so "read this file for me" is not something
//     the door can be talked into.
//   * the key set is exact. A profile with an unknown key is refused rather than ignored, because
//     an ignored key is a setting the writer believes is in force.
//
// Pure: no file, no clock, no network. The server reads the bytes and hands them here.

import { sep as PATH_SEP, isAbsolute, relative, resolve } from 'node:path';

export const ENGINE_PROJECT_PROFILE_SCHEMA_VERSION = 'soulforge.engine_project_profile.v0';

export const PROFILE_ERROR_CODES = Object.freeze({
  PROFILE_INVALID: 'ENGINE_MCP_PROFILE_INVALID',
  PROFILE_PATH_RELATIVE: 'ENGINE_MCP_PROFILE_PATH_RELATIVE',
  PROFILE_PATH_OUTSIDE_ROOTS: 'ENGINE_MCP_PROFILE_PATH_OUTSIDE_ROOTS',
  PATH_OUTSIDE_ROOTS: 'ENGINE_MCP_PATH_OUTSIDE_ROOTS',
});

export class ProjectProfileError extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = 'ProjectProfileError';
    this.code = code;
    this.detail = detail;
  }
}

const fail = (code, message, detail = {}) => {
  throw new ProjectProfileError(code, message, detail);
};

/** The one accepted value: this layer never invents a `known_at`, the caller states it. */
export const KNOWN_AT_POLICY = 'caller_supplied';

export const PROFILE_REQUIRED_KEYS = Object.freeze([
  'schema_version',
  'project_code',
  'business_type',
  'prime',
  'quality_grade',
  'compiled_variant',
  'overlays',
  'overlay_conditions',
  'project_binding',
  'base_packet',
  'base_launch',
  'alias_patterns',
  'project_root',
  'outputs_root',
  'observations_dir',
  'receipts_dir',
  'runs_root',
  'known_at_policy',
]);

/**
 * Which roots each path field may sit under.
 *
 * `rule_assets` is the public rule-spec export directory. It is here because the compiled variant
 * and the prime overlay are repository assets, not project material: a project profile points at
 * them, it does not own a copy. Everything a project owns stays in `_workspaces`; everything that
 * records a run stays in `_workmeta`.
 */
export const PROFILE_PATH_ROOTS = Object.freeze({
  compiled_variant: Object.freeze(['rule_assets', 'project']),
  overlays: Object.freeze(['rule_assets', 'project']),
  project_binding: Object.freeze(['project']),
  base_packet: Object.freeze(['project']),
  base_launch: Object.freeze(['metadata', 'project']),
  alias_patterns: Object.freeze(['project']),
  project_root: Object.freeze(['project']),
  outputs_root: Object.freeze(['project']),
  observations_dir: Object.freeze(['project']),
  receipts_dir: Object.freeze(['metadata']),
  runs_root: Object.freeze(['metadata']),
});

export const MAX = Object.freeze({
  string: 256,
  path: 4096,
  overlays: 16,
  conditions: 64,
});

const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/u;
const WINDOWS_ABSOLUTE = /^[A-Za-z]:[\\/]/u;
const UNC_ABSOLUTE = /^\\\\[^\\/]/u;

/** Written as a code-point scan rather than a regexp so the source file carries no control byte. */
export function hasControlCharacter(value) {
  for (const character of value) {
    const code = character.codePointAt(0);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/** The three roots a profile may name, derived from one repository root. */
export function profileRoots(repoRoot) {
  const root = resolve(repoRoot);
  return Object.freeze({
    project: resolve(root, '_workspaces'),
    metadata: resolve(root, '_workmeta'),
    rule_assets: resolve(root, '.registry', 'skills', 'se_foldertree_generate', 'codex', 'assets'),
  });
}

/** Windows compares paths without case; POSIX does not. Nothing else differs here. */
const comparablePath = (value) => (process.platform === 'win32' ? value.toLowerCase() : value);

export function isPathUnder(candidate, root) {
  const left = comparablePath(resolve(candidate));
  const right = comparablePath(resolve(root));
  if (left === right) return true;
  return left.startsWith(right.endsWith(PATH_SEP) ? right : `${right}${PATH_SEP}`);
}

/**
 * An absolute path is a drive-letter path, a UNC path, or a POSIX rooted path — and never one
 * carrying a `..` segment. `resolve` would flatten `..` silently, which is exactly how a path that
 * reads as "inside the project" ends up outside it.
 */
export function assertAbsolutePath(value, field) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX.path) {
    fail(PROFILE_ERROR_CODES.PROFILE_INVALID, 'a path field must be a non-empty string', { field });
  }
  if (hasControlCharacter(value)) {
    fail(PROFILE_ERROR_CODES.PROFILE_INVALID, 'a path field carries a control character', { field });
  }
  const absolute = WINDOWS_ABSOLUTE.test(value) || UNC_ABSOLUTE.test(value)
    || (process.platform !== 'win32' && isAbsolute(value));
  if (!absolute) {
    fail(PROFILE_ERROR_CODES.PROFILE_PATH_RELATIVE,
      'a profile path must be absolute', { field });
  }
  // The raw string, not the normalised one: `normalize` flattens `..` away, which is exactly how a
  // path that reads as "inside the project" ends up resolving somewhere else.
  if (value.split(/[\\/]/u).includes('..')) {
    fail(PROFILE_ERROR_CODES.PROFILE_PATH_RELATIVE,
      'a profile path may not climb out of itself', { field });
  }
  return resolve(value);
}

/** The check every tool re-uses when it is handed a path at call time. */
export function assertPathUnderRoots(value, field, roots, allowed,
  code = PROFILE_ERROR_CODES.PATH_OUTSIDE_ROOTS) {
  const absolute = assertAbsolutePath(value, field);
  for (const name of allowed) {
    if (isPathUnder(absolute, roots[name])) return absolute;
  }
  fail(code, 'a path lies outside the roots this door may read',
    { field, allowed_roots: [...allowed] });
  return null;
}

export function assertSafeString(value, field, max = MAX.string) {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) {
    fail(PROFILE_ERROR_CODES.PROFILE_INVALID, 'a field must be a short non-empty string', { field });
  }
  if (hasControlCharacter(value)) {
    fail(PROFILE_ERROR_CODES.PROFILE_INVALID, 'a field carries a control character', { field });
  }
  return value;
}

export function assertToken(value, field) {
  assertSafeString(value, field);
  if (!SAFE_TOKEN.test(value)) {
    fail(PROFILE_ERROR_CODES.PROFILE_INVALID, 'a token field carries an unexpected character',
      { field });
  }
  return value;
}

/**
 * Validates one project profile object against one repository root.
 *
 * @param raw the parsed profile JSON
 * @param options `{ repo_root }`
 * @returns a frozen profile whose paths are resolved, plus the roots they were checked against
 */
export function validateProjectProfile(raw, options = {}) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    fail(PROFILE_ERROR_CODES.PROFILE_INVALID, 'a profile must be a JSON object', {});
  }
  const repoRoot = assertAbsolutePath(options.repo_root ?? '', 'repo_root');
  const roots = profileRoots(repoRoot);

  const present = Object.keys(raw).sort();
  const required = [...PROFILE_REQUIRED_KEYS].sort();
  const missing = required.filter((key) => !present.includes(key));
  const unknown = present.filter((key) => !required.includes(key));
  if (missing.length > 0 || unknown.length > 0) {
    fail(PROFILE_ERROR_CODES.PROFILE_INVALID,
      'a profile must carry exactly the declared keys', { missing, unknown });
  }
  if (raw.schema_version !== ENGINE_PROJECT_PROFILE_SCHEMA_VERSION) {
    fail(PROFILE_ERROR_CODES.PROFILE_INVALID, 'unexpected profile schema_version',
      { expected: ENGINE_PROJECT_PROFILE_SCHEMA_VERSION });
  }
  if (raw.known_at_policy !== KNOWN_AT_POLICY) {
    fail(PROFILE_ERROR_CODES.PROFILE_INVALID,
      'the only accepted known_at policy is caller_supplied', { field: 'known_at_policy' });
  }

  const profile = {
    schema_version: ENGINE_PROJECT_PROFILE_SCHEMA_VERSION,
    // The project code names directories and receipt lines, so it stays a strict token. The three
    // labels below only ever appear in an answer a person reads, and a business type or a prime
    // contractor is frequently written in Korean; forcing them into ascii would make the profile
    // lie about what the project is called.
    project_code: assertToken(raw.project_code, 'project_code'),
    business_type: assertSafeString(raw.business_type, 'business_type', 64),
    prime: assertSafeString(raw.prime, 'prime', 64),
    quality_grade: assertSafeString(raw.quality_grade, 'quality_grade', 64),
    known_at_policy: KNOWN_AT_POLICY,
  };

  const pathField = (field, value) => assertPathUnderRoots(value, field, roots,
    PROFILE_PATH_ROOTS[field], PROFILE_ERROR_CODES.PROFILE_PATH_OUTSIDE_ROOTS);

  profile.compiled_variant = pathField('compiled_variant', raw.compiled_variant);

  if (!Array.isArray(raw.overlays) || raw.overlays.length > MAX.overlays) {
    fail(PROFILE_ERROR_CODES.PROFILE_INVALID, 'overlays must be an array of at most 16 paths', {});
  }
  profile.overlays = Object.freeze(raw.overlays.map((value, index) =>
    assertPathUnderRoots(value, `overlays[${index}]`, roots, PROFILE_PATH_ROOTS.overlays,
      PROFILE_ERROR_CODES.PROFILE_PATH_OUTSIDE_ROOTS)));

  if (!Array.isArray(raw.overlay_conditions) || raw.overlay_conditions.length > MAX.conditions) {
    fail(PROFILE_ERROR_CODES.PROFILE_INVALID, 'overlay_conditions must be an array of tokens', {});
  }
  profile.overlay_conditions = Object.freeze(raw.overlay_conditions
    .map((value, index) => assertToken(value, `overlay_conditions[${index}]`)));

  // A binding is small enough to state inline, and often is; a project that keeps it in a file
  // names that file instead. Both, and nothing else.
  if (typeof raw.project_binding === 'string') {
    profile.project_binding = pathField('project_binding', raw.project_binding);
    profile.project_binding_inline = null;
  } else if (raw.project_binding !== null && typeof raw.project_binding === 'object'
    && !Array.isArray(raw.project_binding)) {
    profile.project_binding = null;
    profile.project_binding_inline = raw.project_binding;
  } else {
    fail(PROFILE_ERROR_CODES.PROFILE_INVALID,
      'project_binding must be an absolute path or an inline object', {});
  }

  profile.base_packet = pathField('base_packet', raw.base_packet);
  profile.base_launch = raw.base_launch === null ? null : pathField('base_launch', raw.base_launch);
  profile.alias_patterns = raw.alias_patterns === null
    ? null : pathField('alias_patterns', raw.alias_patterns);
  profile.project_root = pathField('project_root', raw.project_root);
  profile.outputs_root = pathField('outputs_root', raw.outputs_root);
  profile.observations_dir = pathField('observations_dir', raw.observations_dir);
  profile.receipts_dir = pathField('receipts_dir', raw.receipts_dir);
  profile.runs_root = pathField('runs_root', raw.runs_root);

  // The observation run has to live inside the project's own output root. That invariant is what
  // lets `observe_confirm` accept a sheet path from a caller at all: "under the observations
  // directory" is a check with a fixed answer, not a directory a caller can move.
  if (!isPathUnder(profile.observations_dir, profile.outputs_root)) {
    fail(PROFILE_ERROR_CODES.PROFILE_INVALID,
      'observations_dir must lie under outputs_root', {});
  }
  if (!isPathUnder(profile.outputs_root, profile.project_root)) {
    fail(PROFILE_ERROR_CODES.PROFILE_INVALID,
      'outputs_root must lie under project_root', {});
  }

  return Object.freeze({ ...profile, roots });
}

/** A repo-relative pointer for a result: the door never prints an absolute local path. */
export function repoPointer(repoRoot, absolutePath) {
  const rel = relative(resolve(repoRoot), resolve(absolutePath)).split(PATH_SEP).join('/');
  return rel.startsWith('..') ? null : rel;
}
