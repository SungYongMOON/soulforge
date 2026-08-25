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

import { validateTicketPolicy } from './tickets.mjs';

export const ENGINE_PROJECT_PROFILE_SCHEMA_VERSION = 'soulforge.engine_project_profile.v0';

export const PROFILE_ERROR_CODES = Object.freeze({
  PROFILE_INVALID: 'ENGINE_MCP_PROFILE_INVALID',
  PROFILE_PATH_RELATIVE: 'ENGINE_MCP_PROFILE_PATH_RELATIVE',
  PROFILE_PATH_OUTSIDE_ROOTS: 'ENGINE_MCP_PROFILE_PATH_OUTSIDE_ROOTS',
  PROFILE_PLANE_MISMATCH: 'ENGINE_MCP_PROFILE_PLANE_MISMATCH',
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
 * The file door (문 앞 칸), stated only by a project that opens one.
 *
 * These are the one exception to "the key set is exact", and they are an exception in the safe
 * direction: a profile written before the door existed stays valid and the door simply refuses,
 * while an unknown key is still refused rather than ignored. `confidential_dirs` stands alone
 * because a project may want to mark its contract folders without opening a door at all; the other
 * four are all-or-nothing, because a door with an intake folder and no trash is a door that refuses
 * at the moment somebody needs it to work (`PROFILE_REQUIRED_KEYS` + these, and nothing else).
 */
export const PROFILE_FILE_DOOR_KEYS = Object.freeze([
  'intake_dir',
  'outbox_dir',
  'trash_dir',
  'ticket_policy',
]);

export const PROFILE_OPTIONAL_KEYS = Object.freeze([
  ...PROFILE_FILE_DOOR_KEYS,
  'confidential_dirs',
  'link_issuer',
  'nas_root',
]);

/**
 * The fourth root: a share the door's three folders may live on instead of the project tree
 * (manual 12 §12.B/§12.C, Owner 2026-08-19).
 *
 * The other three roots are places this repository owns, so they are derived from one repo root and
 * a caller cannot widen them. A NAS share is not that: it is company storage the engine reaches by
 * UNC path, and the only way to state it is for the Owner to write it in the profile. So it is
 * validated as a *shape* rather than looked up in a table — absolute, no climb, and for a UNC path
 * the `\\server\share` form specifically, because a drive letter is a per-login mapping and a door
 * that resolves through one breaks the moment nobody is logged in (§12.C: UNC + 전용 계정, 드라이브
 * 문자 아님).
 *
 * Stating it moves **only** the door's three folders. Everything else a profile names — the project
 * tree, the observations, the receipts, the confidential folders — stays exactly where it was, on
 * the roots this repository owns.
 */
export const NAS_ROOT_KEY = 'nas_root';

/** `\\server\share`, with both parts present. A bare `\\server` is not a place files live. */
const UNC_SHARE = /^\\\\[^\\/]+\\[^\\/]/u;

/**
 * The link issuer beside the door (manual 12 §12.C), stated by a project whose uploaders are
 * outside the company network.
 *
 * Two fields and no more. `kind` says which gateway part is spawned and `env_prefix` says where
 * that part will look for its credentials — **names only**: no host, no account and no secret is
 * ever written into a profile, because a profile is a file people copy between machines and read
 * over somebody's shoulder. The engine itself makes no network call either way; this field only
 * decides whether a child process is spawned after a ticket folder is made.
 */
export const LINK_ISSUER_KINDS = Object.freeze(['synology']);
export const LINK_ISSUER_KEYS = Object.freeze(['kind', 'env_prefix']);

/**
 * The env key suffixes the issuer declares, restated here so the door can ask "does this machine
 * carry them" without importing a module that owns a network client.
 *
 * A test asserts this list equals `NAS_ENV_SUFFIXES` in
 * `guild_hall/gateway/nas_link_issuer/synology_api.mjs`, so the two cannot drift apart silently.
 */
export const LINK_ISSUER_ENV_SUFFIXES = Object.freeze([
  'HOST', 'PORT', 'USER', 'PASSWORD', 'TOKEN', 'SHARE', 'UNC', 'MOCK',
]);

const ENV_PREFIX = /^[A-Z][A-Z0-9_]{2,31}$/u;

/**
 * One NAS root, checked as a shape.
 *
 * `assertAbsolutePath` already does the work that matters — absolute, no control byte, and no `..`
 * segment in the raw string — so this adds the one rule that is specific to a share: a path that
 * *looks* like UNC has to be the real two-part form written with backslashes. `//server/share`
 * is refused rather than normalised, because the two forms are not interchangeable to every
 * Windows API this path will eventually be handed to.
 */
export function assertNasRoot(value, field = NAS_ROOT_KEY) {
  const absolute = assertAbsolutePath(value, field);
  const looksUnc = String(value).startsWith('\\\\') || String(value).startsWith('//');
  if (looksUnc && !UNC_SHARE.test(String(value))) {
    fail(PROFILE_ERROR_CODES.PROFILE_INVALID,
      'a UNC nas root is written \\\\server\\share, with both parts', { field });
  }
  return absolute;
}

export function validateLinkIssuer(raw, field = 'link_issuer') {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    fail(PROFILE_ERROR_CODES.PROFILE_INVALID, 'a link issuer is a JSON object', { field });
  }
  const present = Object.keys(raw).sort();
  const expected = [...LINK_ISSUER_KEYS].sort();
  if (present.length !== expected.length || present.some((key, index) => key !== expected[index])) {
    fail(PROFILE_ERROR_CODES.PROFILE_INVALID,
      'a link issuer states exactly a kind and an env prefix',
      { field, expected, unknown: present.filter((key) => !expected.includes(key)) });
  }
  if (!LINK_ISSUER_KINDS.includes(raw.kind)) {
    fail(PROFILE_ERROR_CODES.PROFILE_INVALID, 'unknown link issuer kind',
      { field: `${field}.kind`, allowed: [...LINK_ISSUER_KINDS] });
  }
  assertSafeString(raw.env_prefix, `${field}.env_prefix`, 32);
  if (!ENV_PREFIX.test(raw.env_prefix)) {
    fail(PROFILE_ERROR_CODES.PROFILE_INVALID,
      'an env prefix is upper-case letters, digits and underscores', { field: `${field}.env_prefix` });
  }
  return Object.freeze({ kind: raw.kind, env_prefix: raw.env_prefix });
}

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
  // The file door writes only into the project's own folder tree: the bytes are project material
  // and the metadata plane holds pointers, not payload (AGENTS.md).
  intake_dir: Object.freeze(['project']),
  outbox_dir: Object.freeze(['project']),
  trash_dir: Object.freeze(['project']),
  confidential_dirs: Object.freeze(['project']),
});

export const MAX = Object.freeze({
  string: 256,
  path: 4096,
  overlays: 16,
  conditions: 64,
  confidential_dirs: 32,
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
  const unknown = present.filter((key) =>
    !required.includes(key) && !PROFILE_OPTIONAL_KEYS.includes(key));
  if (missing.length > 0 || unknown.length > 0) {
    fail(PROFILE_ERROR_CODES.PROFILE_INVALID,
      'a profile must carry exactly the declared keys', { missing, unknown });
  }
  const doorKeysPresent = PROFILE_FILE_DOOR_KEYS.filter((key) => present.includes(key));
  if (doorKeysPresent.length > 0 && doorKeysPresent.length !== PROFILE_FILE_DOOR_KEYS.length) {
    fail(PROFILE_ERROR_CODES.PROFILE_INVALID,
      'the file door is stated whole or not at all',
      { missing: PROFILE_FILE_DOOR_KEYS.filter((key) => !present.includes(key)) });
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

  // Two lines that make receipt mixing structurally impossible (부록 B, 최소 변경 2번). Being
  // somewhere under `_workmeta` was never enough: two profiles could name the same folder and
  // their `mcp_tool_calls.jsonl` would interleave with no way to tell the runs apart afterwards.
  // A project's records live under that project's own metadata folder, and nowhere else.
  const projectMetadata = resolve(roots.metadata, profile.project_code);
  for (const field of ['receipts_dir', 'runs_root']) {
    if (!isPathUnder(profile[field], projectMetadata)) {
      fail(PROFILE_ERROR_CODES.PROFILE_PLANE_MISMATCH,
        'this path must lie under the project\'s own metadata folder',
        { field, expected_under: `_workmeta/${profile.project_code}` });
    }
  }

  // ---- the file door (문 앞 칸), if this project opened one

  profile.confidential_dirs = Object.freeze((raw.confidential_dirs === undefined
    ? [] : assertDirList(raw.confidential_dirs, 'confidential_dirs'))
    .map((value, index) => underRoot(pathField('confidential_dirs', value),
      profile.project_root, `confidential_dirs[${index}]`)));

  const doorOpen = raw.intake_dir !== undefined;
  profile.file_door_enabled = doorOpen;
  profile.ticket_policy = doorOpen ? validateTicketPolicy(raw.ticket_policy) : null;

  // The NAS root is read before the door folders, because it decides which root they are measured
  // against. Absent, everything below is exactly what it was.
  profile.nas_root = raw.nas_root === undefined ? null : assertNasRoot(raw.nas_root);
  if (profile.nas_root !== null) {
    if (!doorOpen) {
      fail(PROFILE_ERROR_CODES.PROFILE_INVALID,
        'a nas root moves the file door this profile has not opened', { field: NAS_ROOT_KEY });
    }
    // The metadata plane holds pointers, hashes and status — never payload (AGENTS.md). A share
    // rooted inside it would turn every uploaded file into a `_workmeta` write.
    if (isPathUnder(profile.nas_root, roots.metadata)) {
      fail(PROFILE_ERROR_CODES.PROFILE_PLANE_MISMATCH,
        'a nas root may not lie on the metadata plane', { field: NAS_ROOT_KEY });
    }
  }
  const onNas = profile.nas_root !== null;
  profile.door_root = doorOpen ? (profile.nas_root ?? profile.project_root) : null;
  profile.door_root_kind = doorOpen ? (onNas ? 'nas' : 'project') : null;

  for (const field of PROFILE_FILE_DOOR_KEYS) {
    if (field === 'ticket_policy') continue;
    if (!doorOpen) {
      profile[field] = null;
      continue;
    }
    profile[field] = onNas
      // On the NAS the roots table does not apply: the share is not a place this repository owns,
      // so containment under the stated root is the whole check.
      ? underRoot(assertAbsolutePath(raw[field], field), profile.nas_root, field)
      : underRoot(pathField(field, raw[field]), profile.project_root, field);
  }

  if (doorOpen) {
    // Four containment rules, each closing one way the door could hand material to the wrong
    // place. A ticket folder inside a contract folder would give an uploader a listing of the
    // contract folder; a trash folder inside the intake folder would sweep tickets into a place
    // the next sweep walks again; and a door pointed at its own root would make every write a
    // write to the whole project — or to the whole share.
    for (const field of ['intake_dir', 'outbox_dir', 'trash_dir']) {
      if (isPathUnder(profile.door_root, profile[field])) {
        fail(PROFILE_ERROR_CODES.PROFILE_INVALID,
          'a door folder must be a folder inside its root, not the root itself', { field });
      }
      // A NAS door that resolves back into the project tree is a project door wearing a share's
      // name, and every cross-root rule below it would then be measuring the wrong distance.
      if (onNas && isPathUnder(profile[field], profile.project_root)) {
        fail(PROFILE_ERROR_CODES.PROFILE_INVALID,
          'a door folder on the nas root may not sit inside the project tree', { field });
      }
      for (const confidential of profile.confidential_dirs) {
        if (isPathUnder(profile[field], confidential)) {
          fail(PROFILE_ERROR_CODES.PROFILE_INVALID,
            'a door folder may not sit inside a confidential folder', { field });
        }
      }
    }
    if (isPathUnder(profile.trash_dir, profile.intake_dir)
      || isPathUnder(profile.trash_dir, profile.outbox_dir)
      || isPathUnder(profile.intake_dir, profile.outbox_dir)
      || isPathUnder(profile.outbox_dir, profile.intake_dir)) {
      fail(PROFILE_ERROR_CODES.PROFILE_INVALID,
        'the intake, outbox and trash folders must be three separate places',
        { field: 'trash_dir' });
    }
  }

  // A link issuer with no door has nothing to issue a link *for*, and a profile that states one is
  // a profile whose writer believes tickets are being handed out. Refused rather than ignored.
  profile.link_issuer = raw.link_issuer === undefined ? null : validateLinkIssuer(raw.link_issuer);
  if (profile.link_issuer !== null && !doorOpen) {
    fail(PROFILE_ERROR_CODES.PROFILE_INVALID,
      'a link issuer needs the file door this profile has not opened', { field: 'link_issuer' });
  }

  return Object.freeze({ ...profile, roots });
}

function assertDirList(value, field) {
  if (!Array.isArray(value) || value.length > MAX.confidential_dirs) {
    fail(PROFILE_ERROR_CODES.PROFILE_INVALID,
      'this field must be an array of at most 32 paths', { field });
  }
  return value;
}

/** Every door folder is inside its root — the roots check alone would allow a sibling. */
function underRoot(absolute, root, field) {
  if (!isPathUnder(absolute, root)) {
    fail(PROFILE_ERROR_CODES.PROFILE_PATH_OUTSIDE_ROOTS,
      'this path must lie under its declared root', { field });
  }
  return absolute;
}

/** A repo-relative pointer for a result: the door never prints an absolute local path. */
export function repoPointer(repoRoot, absolutePath) {
  const rel = relative(resolve(repoRoot), resolve(absolutePath)).split(PATH_SEP).join('/');
  return rel.startsWith('..') ? null : rel;
}
