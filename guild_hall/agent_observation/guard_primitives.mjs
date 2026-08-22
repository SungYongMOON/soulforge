import { createHash } from 'node:crypto';

// Shared strict-input primitives for the agent observation owner. Both the observation store
// and the job shop import these so a guard can never silently exist on only one side.

export const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/u;
export const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,199}$/u;
export const UTC_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

// A drive letter anywhere after a non-alphanumeric boundary, a UNC prefix, a well-known POSIX
// root, or a Soulforge private plane marker. A drive letter reached through a URI scheme prefix
// must not slip through a start-anchored check.
export const LOCAL_PATH_VALUE = new RegExp([
  '(?:^|[^A-Za-z0-9])[A-Za-z]:[\\\\/]',
  '\\\\\\\\[A-Za-z0-9]',
  '(?:^|[^A-Za-z0-9])/(?:Users|home|mnt|opt|srv|var|etc|tmp|root|Volumes|Applications)/',
  '(?:^|[^A-Za-z0-9])(?:_workmeta|_workspaces|private-state)/',
  'guild_hall/state/',
].join('|'), 'iu');

export const SECRET_VALUE = new RegExp([
  '-----BEGIN [A-Z ]+PRIVATE KEY-----',
  '\\bBearer\\s+[A-Za-z0-9._~+/=-]{8,}',
  '\\b(?:ghp_|github_pat_|sk-|xox[baprs]-|AIza)[A-Za-z0-9_-]{8,}',
  '\\bAKIA[0-9A-Z]{16}\\b',
  '\\beyJ[A-Za-z0-9_-]{10,}\\.eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}',
  '\\b(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret)\\s*[:=]',
].join('|'), 'iu');

const CONTROL_CHAR = /\p{C}/u;
const LABEL_FORBIDDEN_CHAR = /[\\/:|<>]/u;
const MAX_LABEL_LENGTH = 80;

// The crosswalk composite separator. Written as an escape so the source file stays plain text:
// a literal NUL would make every grep-based validator classify this module as binary and skip it.
export const COMPOSITE_SEPARATOR = '\u0000';

// The prototype must be plain too. The guards scan own enumerable properties, so a payload carried
// on a prototype would skip every scan while still reading normally through property access.
export function isPlainObject(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
export const isSafeId = (value) => typeof value === 'string' && SAFE_ID.test(value);
export const isUtcMs = (value) => typeof value === 'string' && UTC_MS.test(value);
export const isCount = (value, max) => Number.isSafeInteger(value) && value >= 0 && value <= max;

export const hasLocalPath = (value) => typeof value === 'string' && LOCAL_PATH_VALUE.test(value);
export const hasSecret = (value) => typeof value === 'string' && SECRET_VALUE.test(value);

export function isSafeRef(value) {
  if (typeof value !== 'string' || !SAFE_REF.test(value)) return false;
  return !hasLocalPath(value) && !hasSecret(value);
}

export function isSafeLabel(value) {
  if (typeof value !== 'string') return false;
  if (value.length === 0 || value.length > MAX_LABEL_LENGTH) return false;
  if (value !== value.normalize('NFKC')) return false;
  if (CONTROL_CHAR.test(value)) return false;
  if (LABEL_FORBIDDEN_CHAR.test(value)) return false;
  if (value.trim() !== value) return false;
  return !hasLocalPath(value) && !hasSecret(value);
}

export const hold = (holdCode, detail) => (detail === undefined
  ? { status: 'HOLD', hold_code: holdCode }
  : { status: 'HOLD', hold_code: holdCode, detail });

export const UNKNOWN_KEY_DETAIL = 'unknown_key_name_withheld';

// An unknown key name is producer-controlled, so it is never echoed back. A safe-ID filter is
// not enough: `sk-abcdefgh12345678` is a valid identifier and still a credential. The hold code
// already says an unknown field was present, which is the part a caller can act on.
export function unknownKeyIn(value, allowed) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) return UNKNOWN_KEY_DETAIL;
  return null;
}

// A deeply nested value must fail closed rather than blow the stack inside a guard.
export const MAX_SCAN_DEPTH = 12;
export const TOO_DEEP = Symbol('soulforge.agent_observation.too_deep');

function scanStrings(value, predicate, depth) {
  if (depth > MAX_SCAN_DEPTH) return TOO_DEEP;
  if (typeof value === 'string') return predicate(value) ? value : null;
  if (Array.isArray(value) || isPlainObject(value)) {
    for (const item of Object.values(value)) {
      const found = scanStrings(item, predicate, depth + 1);
      if (found !== null) return found;
    }
  }
  return null;
}

export const findSecret = (value) => scanStrings(value, hasSecret, 0);
export const findLocalPath = (value) => scanStrings(value, hasLocalPath, 0);

function scanKeys(value, allowedKeys, depth) {
  if (depth > MAX_SCAN_DEPTH) return TOO_DEEP;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = scanKeys(item, allowedKeys, depth + 1);
      if (found !== null) return found;
    }
    return null;
  }
  if (isPlainObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (!allowedKeys.has(key)) return UNKNOWN_KEY_DETAIL;
      const found = scanKeys(item, allowedKeys, depth + 1);
      if (found !== null) return found;
    }
  }
  return null;
}

// Nested audit: a raw key hidden inside a ref entry or a token block must be visible to the audit,
// not only a raw key at the top level of a record.
export const findUnknownKeyDeep = (value, allowedKeys) => scanKeys(value, allowedKeys, 0);

// `every` skips array holes, so a sparse list would pass and store an undefined element. Comparing
// key count to length is not enough on its own: one extra non-index own property restores the
// count the hole removed. Each index must actually be present.
export function isDenseArray(list) {
  if (!Array.isArray(list)) return false;
  // `every` and friends skip holes, so the indices have to be walked explicitly.
  for (let index = 0; index < list.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(list, index)) return false;
  }
  return true;
}

export const isSafeIdList = (list, maxLength) => isDenseArray(list)
  && list.length > 0 && list.length <= maxLength && list.every(isSafeId);

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

export const digestOf = (value) => `sha256:${createHash('sha256').update(stableStringify(value), 'utf8').digest('hex')}`;

export function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  // Object.values covers array elements too.
  for (const item of Object.values(value)) deepFreeze(item);
  return value;
}

export const ACCESSOR_FOUND = Symbol('soulforge.agent_observation.accessor_found');

function snapshotValue(value, depth) {
  if (depth > MAX_SCAN_DEPTH) return TOO_DEEP;
  if (value === null || typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    const copy = new Array(value.length);
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, index);
      // A hole is left as a hole so the dense checks downstream still see and reject it.
      if (descriptor === undefined) continue;
      if (descriptor.get !== undefined || descriptor.set !== undefined) return ACCESSOR_FOUND;
      const copied = snapshotValue(descriptor.value, depth + 1);
      if (copied === TOO_DEEP || copied === ACCESSOR_FOUND) return copied;
      copy[index] = copied;
    }
    return copy;
  }

  if (!isPlainObject(value)) return value;
  const copy = {};
  // Own property NAMES, not keys: a non-enumerable property is still an own property, and it would
  // otherwise be invisible to the scans while remaining readable by the record builder.
  for (const name of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (descriptor === undefined) continue;
    if (descriptor.get !== undefined || descriptor.set !== undefined) return ACCESSOR_FOUND;
    const copied = snapshotValue(descriptor.value, depth + 1);
    if (copied === TOO_DEEP || copied === ACCESSOR_FOUND) return copied;
    copy[name] = copied;
  }
  return copy;
}

// Reads every own property exactly once, through its descriptor, into a fresh plain structure.
// Validation and record building then both read that structure, so a getter or a Proxy trap cannot
// show the guard one value and the builder another, and a non-enumerable property cannot hide.
export const snapshotInput = (value) => snapshotValue(value, 0);

// Shared entry guard. It snapshots first, then validates the snapshot, and returns that
// snapshot for the caller to build from. Returns `{ status: 'OK', value }` or a hold.
export function guardEntry(rawInput, allowedKeys, codes) {
  const input = snapshotInput(rawInput);
  if (input === TOO_DEEP) return hold(codes.tooDeep);
  if (input === ACCESSOR_FOUND) return hold(codes.accessor);
  if (!isPlainObject(input)) return hold(codes.unknownField, 'input_not_object');
  const extra = unknownKeyIn(input, allowedKeys);
  if (extra !== null) return hold(codes.unknownField, extra);
  const secret = findSecret(input);
  if (secret === TOO_DEEP) return hold(codes.tooDeep);
  if (secret !== null) return hold(codes.secret);
  const localPath = findLocalPath(input);
  if (localPath === TOO_DEEP) return hold(codes.tooDeep);
  if (localPath !== null) return hold(codes.localPath);
  return { status: 'OK', value: input };
}
