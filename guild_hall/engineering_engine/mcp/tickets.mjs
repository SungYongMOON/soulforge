// 문 앞 칸 — the ledger behind file intake and outtake (Owner 결정 2026-08-19, 09장 §9.1D).
//
// A person never opens the project folder. They ask the door for a **ticket** (주소표), put files in
// the one folder that ticket names, and ask the door to register them; the door moves the bytes into
// the task folder the rules resolve and writes the observation. The reverse direction is the same
// shape: a download ticket copies one registered file into a pickup folder that expires.
//
// This module is the part of that with no disk in it: what a ticket is, when it is still good, what
// a file may be called, and how the append-only ledger folds into "the current state of ticket X".
// The tools own the filesystem; the server owns the clock and the identity. Nothing here reads
// either, so two callers holding the same rows reach the same answer.
//
// Three rules give it its shape.
//
//   1. **A ticket is a folder, not a link.** The engine returns a machine target and an id; issuing
//      an actual OneDrive/SharePoint link is outside the engine (§12.B "밖에 있는 것"). So a ticket
//      record carries no URL, no token and no secret — only who asked, what for, until when.
//   2. **Append, never edit.** A status change is a new row. The ledger is evidence, and evidence
//      that can be rewritten in place is not evidence; `foldTicketLedger` is where "the latest row
//      wins" is written down once.
//   3. **Expiry is computed, never stored as truth.** `expires_at` is on the row for a person to
//      read, but `ticketStateAt` decides from the clock the caller states. A ticket that sat unused
//      over a weekend is expired because time passed, not because something remembered to mark it.

import { createHash } from 'node:crypto';

export const FILE_TICKET_SCHEMA_VERSION = 'soulforge.engine_mcp_file_ticket.v0';

/** 올리기(문 앞 칸에 넣는다) · 내려받기(칸에서 가져간다). Nothing else is a ticket. */
export const TICKET_PURPOSES = Object.freeze(['upload', 'download']);

/**
 * open → used → cleaned, with `expired` as what the clock says about an `open` one.
 *
 * `used` is only ever set by a registration that actually moved bytes, and `cleaned` only by the
 * housekeeping tool that moved the folders to the trash. Neither is reversible and neither deletes.
 */
export const TICKET_STATES = Object.freeze(['open', 'used', 'expired', 'cleaned']);

export const TICKET_ERROR_CODES = Object.freeze({
  POLICY_INVALID: 'ENGINE_MCP_TICKET_POLICY_INVALID',
  TICKET_INVALID: 'ENGINE_MCP_TICKET_INVALID',
  TICKET_UNKNOWN: 'ENGINE_MCP_TICKET_UNKNOWN',
  TICKET_NOT_OPEN: 'ENGINE_MCP_TICKET_NOT_OPEN',
  TICKET_NOT_YOURS: 'SE_MCP_PERMISSION_DENIED',
  FILE_NAME_REFUSED: 'ENGINE_MCP_FILE_NAME_REFUSED',
  EXTENSION_REFUSED: 'ENGINE_MCP_FILE_EXTENSION_REFUSED',
  VERSION_EXHAUSTED: 'ENGINE_MCP_FILE_VERSION_EXHAUSTED',
});

export class TicketError extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = 'TicketError';
    this.code = code;
    this.detail = detail;
  }
}

const fail = (code, message, detail = {}) => {
  throw new TicketError(code, message, detail);
};

/**
 * The policy a profile states when it opens the door, and what applies if it states half of it.
 *
 * Three days to put a file in, one day to pick one up, thirty days before the used ticket folders
 * are swept to the trash. They are defaults rather than constants because "how long does a supplier
 * have" is a project question, not an engine one.
 */
export const DEFAULT_TICKET_POLICY = Object.freeze({
  upload_ttl_hours: 72,
  download_ttl_hours: 24,
  cleanup_after_days: 30,
});

/**
 * What may come through the door.
 *
 * Office and drawing formats, the archive people actually send, and the plain text a receipt or a
 * note is written in. Not an executable, not a script, not a shortcut: the engine hands these files
 * to a folder people open, and a door that accepts `.exe` is a door that delivers one.
 */
export const DEFAULT_ALLOWED_EXTENSIONS = Object.freeze([
  'pdf', 'hwp', 'hwpx', 'doc', 'docx', 'xls', 'xlsx', 'xlsm', 'ppt', 'pptx',
  'txt', 'md', 'csv', 'json', 'xml', 'zip',
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'tif', 'tiff',
  'dwg', 'dxf', 'step', 'stp', 'igs', 'iges', 'stl', 'sldprt', 'sldasm',
]);

/** 25 MB. Bigger than a mail attachment (30 MB is where Hiworks/Gmail stop) is a link's job. */
export const MAX_SMALL_FILE_BYTES = 25 * 1024 * 1024;

/** How many files one ticket may hold, and how many versions one name may grow. */
export const MAX = Object.freeze({
  files_per_ticket: 64,
  versions: 20,
  file_name: 120,
  note: 512,
  ledger_rows: 200000,
});

const TICKET_ID = /^(?:up|dn)_[0-9]{8}t[0-9]{6}z_[0-9a-f]{6}$/u;
const PRINCIPAL_REF = /^[A-Za-z0-9][A-Za-z0-9_.@-]{0,63}$/u;
const CANONICAL_INSTANT = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/u;

/** Written as a scan rather than a regexp so this file carries no control byte of its own. */
function hasControlCharacter(value) {
  for (const character of value) {
    const code = character.codePointAt(0);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

export function assertInstantString(value, field) {
  if (typeof value !== 'string' || !CANONICAL_INSTANT.test(value)) {
    fail(TICKET_ERROR_CODES.TICKET_INVALID, 'an instant must be a canonical UTC timestamp', { field });
  }
  return value;
}

/**
 * The policy in force, from what the profile stated and the defaults for what it did not.
 *
 * A missing block is the same call as an empty one: the answer always carries all five settings, so
 * no caller downstream has to remember which of them a profile is allowed to leave out.
 */
export function validateTicketPolicy(stated) {
  const raw = stated ?? {};
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    fail(TICKET_ERROR_CODES.POLICY_INVALID, 'ticket_policy must be a JSON object', {});
  }
  const known = ['upload_ttl_hours', 'download_ttl_hours', 'cleanup_after_days',
    'allowed_extensions', 'max_file_bytes'];
  const unknown = Object.keys(raw).filter((key) => !known.includes(key));
  if (unknown.length > 0) {
    fail(TICKET_ERROR_CODES.POLICY_INVALID, 'ticket_policy carries an unknown key', { unknown });
  }
  const hours = (field, fallback, max) => {
    const value = raw[field];
    if (value === undefined) return fallback;
    if (!Number.isSafeInteger(value) || value <= 0 || value > max) {
      fail(TICKET_ERROR_CODES.POLICY_INVALID, 'a ticket lifetime must be a small positive integer',
        { field, max });
    }
    return value;
  };
  let extensions = DEFAULT_ALLOWED_EXTENSIONS;
  if (raw.allowed_extensions !== undefined) {
    if (!Array.isArray(raw.allowed_extensions) || raw.allowed_extensions.length === 0
      || raw.allowed_extensions.length > 64) {
      fail(TICKET_ERROR_CODES.POLICY_INVALID,
        'allowed_extensions must be a short non-empty array', { field: 'allowed_extensions' });
    }
    for (const entry of raw.allowed_extensions) {
      if (typeof entry !== 'string' || !/^[a-z0-9]{1,8}$/u.test(entry)) {
        fail(TICKET_ERROR_CODES.POLICY_INVALID,
          'an allowed extension is lowercase letters and digits, no dot',
          { field: 'allowed_extensions' });
      }
    }
    extensions = Object.freeze([...new Set(raw.allowed_extensions)].sort());
  }
  let maxBytes = MAX_SMALL_FILE_BYTES;
  if (raw.max_file_bytes !== undefined) {
    if (!Number.isSafeInteger(raw.max_file_bytes) || raw.max_file_bytes <= 0
      || raw.max_file_bytes > MAX_SMALL_FILE_BYTES) {
      fail(TICKET_ERROR_CODES.POLICY_INVALID,
        'max_file_bytes must be a positive integer no larger than the door cap',
        { field: 'max_file_bytes', max: MAX_SMALL_FILE_BYTES });
    }
    maxBytes = raw.max_file_bytes;
  }
  return Object.freeze({
    upload_ttl_hours: hours('upload_ttl_hours', DEFAULT_TICKET_POLICY.upload_ttl_hours, 24 * 90),
    download_ttl_hours: hours('download_ttl_hours', DEFAULT_TICKET_POLICY.download_ttl_hours, 24 * 90),
    cleanup_after_days: hours('cleanup_after_days', DEFAULT_TICKET_POLICY.cleanup_after_days, 3650),
    allowed_extensions: extensions,
    max_file_bytes: maxBytes,
  });
}

export function assertPrincipalRef(value, field = 'principal_ref') {
  if (typeof value !== 'string' || !PRINCIPAL_REF.test(value)) {
    fail(TICKET_ERROR_CODES.TICKET_INVALID, 'a principal reference is short and safe', { field });
  }
  // A folder is named after this, and Windows drops a trailing dot or space from a directory name
  // without saying so — which would make the folder the engine created and the folder it recorded
  // two different folders.
  if (value.endsWith('.') || value.endsWith('-')) {
    fail(TICKET_ERROR_CODES.TICKET_INVALID,
      'a principal reference may not end with a dot or a dash', { field });
  }
  return value;
}

export function assertTicketId(value, field = 'ticket_id') {
  if (typeof value !== 'string' || !TICKET_ID.test(value)) {
    fail(TICKET_ERROR_CODES.TICKET_INVALID, 'a ticket id is not shaped like one', { field });
  }
  return value;
}

/** `2026-08-19T05:30:00.000Z` → `20260819t053000z`: a folder name, lowercase, no separator. */
export const compactStamp = (instant) => String(instant)
  .replace(/[-:]/gu, '')
  .replace(/\.[0-9]+Z$/u, 'z')
  .replace(/T/u, 't');

/**
 * A ticket id: purpose, the minute it was issued, and six hex of the material that made it unique.
 *
 * Minted from the parts rather than drawn at random so a test can state the parts and get the same
 * id, and short because it names a directory that files are created under (경로 예산 60자/segment).
 */
export function mintTicketId({ purpose, created_at: createdAt, principal_ref: principalRef, nonce }) {
  if (!TICKET_PURPOSES.includes(purpose)) {
    fail(TICKET_ERROR_CODES.TICKET_INVALID, 'unknown ticket purpose', { field: 'purpose' });
  }
  assertInstantString(createdAt, 'created_at');
  assertPrincipalRef(principalRef);
  const digest = createHash('sha256')
    .update(`${FILE_TICKET_SCHEMA_VERSION}${purpose}${createdAt}${principalRef}${String(nonce ?? '')}`, 'utf8')
    .digest('hex')
    .slice(0, 6);
  return `${purpose === 'upload' ? 'up' : 'dn'}_${compactStamp(createdAt)}_${digest}`;
}

const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** `created_at` plus the lifetime this purpose gets, as a canonical instant. */
export function ticketExpiry(createdAt, purpose, policy) {
  assertInstantString(createdAt, 'created_at');
  const hours = purpose === 'download' ? policy.download_ttl_hours : policy.upload_ttl_hours;
  return new Date(Date.parse(createdAt) + hours * HOUR_MS).toISOString();
}

/**
 * One ticket, as the row that goes on the ledger.
 *
 * `folder_ref` is a project-relative pointer, never an absolute path: the ledger lives on the
 * metadata plane and the metadata plane holds pointers, hashes and status (AGENTS.md).
 */
export function newTicketRecord({
  ticket_id: ticketId, purpose, principal_ref: principalRef, role,
  created_at: createdAt, expires_at: expiresAt, folder_ref: folderRef,
  artifact_ref: artifactRef = null, note = null, files = [],
}) {
  assertTicketId(ticketId);
  if (!TICKET_PURPOSES.includes(purpose)) {
    fail(TICKET_ERROR_CODES.TICKET_INVALID, 'unknown ticket purpose', { field: 'purpose' });
  }
  assertPrincipalRef(principalRef);
  assertInstantString(createdAt, 'created_at');
  assertInstantString(expiresAt, 'expires_at');
  if (typeof folderRef !== 'string' || folderRef.length === 0 || folderRef.length > 400) {
    fail(TICKET_ERROR_CODES.TICKET_INVALID, 'a ticket names one folder', { field: 'folder_ref' });
  }
  if (note !== null && (typeof note !== 'string' || note.length > MAX.note
    || hasControlCharacter(note))) {
    fail(TICKET_ERROR_CODES.TICKET_INVALID, 'a note is one short line', { field: 'note' });
  }
  return {
    schema_version: FILE_TICKET_SCHEMA_VERSION,
    ticket_id: ticketId,
    purpose,
    principal_ref: principalRef,
    role: role ?? null,
    status: 'open',
    created_at: createdAt,
    expires_at: expiresAt,
    logged_at: createdAt,
    folder_ref: folderRef,
    artifact_ref: artifactRef,
    note,
    files: [...files],
  };
}

/**
 * The current row for every ticket the ledger has ever carried.
 *
 * Later rows replace earlier ones for the same id, and a row that is not shaped like a ticket is
 * skipped rather than fatal: a ledger with one bad line still has to answer for the other ninety.
 */
export function foldTicketLedger(rows) {
  const byId = new Map();
  let skipped = 0;
  for (const row of rows.slice(0, MAX.ledger_rows)) {
    if (row === null || typeof row !== 'object' || Array.isArray(row)
      || typeof row.ticket_id !== 'string' || !TICKET_ID.test(row.ticket_id)
      || !TICKET_PURPOSES.includes(row.purpose)) {
      skipped += 1;
      continue;
    }
    byId.set(row.ticket_id, row);
  }
  return { tickets: byId, skipped };
}

/**
 * What this ticket is right now, from the clock the caller states.
 *
 * A used or cleaned ticket stays that way; an open one whose expiry has passed reads `expired`
 * without anything having to write that down.
 */
export function ticketStateAt(record, now) {
  assertInstantString(now, 'now');
  if (record?.status === 'cleaned') return 'cleaned';
  if (record?.status === 'used') return 'used';
  if (typeof record?.expires_at !== 'string') return 'open';
  return Date.parse(now) >= Date.parse(record.expires_at) ? 'expired' : 'open';
}

/** A ticket a caller may still put files into or register from. */
export function assertTicketUsable(record, { now, purpose, principal_ref: principalRef, may_act_for_others: mayActForOthers = false }) {
  if (record === undefined || record === null) {
    fail(TICKET_ERROR_CODES.TICKET_UNKNOWN, 'this door has no such ticket', { field: 'ticket_id' });
  }
  if (record.purpose !== purpose) {
    fail(TICKET_ERROR_CODES.TICKET_NOT_OPEN, 'this ticket was issued for something else',
      { field: 'ticket_id', purpose: record.purpose });
  }
  if (!mayActForOthers && record.principal_ref !== principalRef) {
    fail(TICKET_ERROR_CODES.TICKET_NOT_YOURS, 'this ticket belongs to somebody else',
      { field: 'ticket_id' });
  }
  const state = ticketStateAt(record, now);
  if (state !== 'open') {
    fail(TICKET_ERROR_CODES.TICKET_NOT_OPEN, 'this ticket is no longer open',
      { field: 'ticket_id', state });
  }
  return record;
}

/**
 * The tickets housekeeping may sweep, and why.
 *
 * A ticket is swept when it is finished (used) or over (expired) *and* the grace period has passed
 * since it stopped being useful. Sweeping means moving the folders to the trash — never deleting —
 * so the cost of sweeping one early is that somebody looks in the trash.
 */
export function ticketsDueForCleanup(records, { now, policy }) {
  assertInstantString(now, 'now');
  const cutoff = Date.parse(now) - policy.cleanup_after_days * DAY_MS;
  const due = [];
  for (const record of records) {
    const state = ticketStateAt(record, now);
    if (state !== 'used' && state !== 'expired') continue;
    const since = state === 'used'
      ? Date.parse(record.used_at ?? record.logged_at ?? record.created_at)
      : Date.parse(record.expires_at);
    if (!Number.isFinite(since) || since > cutoff) continue;
    due.push({ ticket_id: record.ticket_id, purpose: record.purpose, state, folder_ref: record.folder_ref });
  }
  due.sort((left, right) => (left.ticket_id < right.ticket_id ? -1 : 1));
  return due;
}

// ---------------------------------------------------------------- file names

/** `report.pdf` → `{ stem: 'report', ext: 'pdf' }`; a name with no dot has no extension. */
export function splitFileName(name) {
  const at = name.lastIndexOf('.');
  if (at <= 0 || at === name.length - 1) return { stem: name, ext: '' };
  return { stem: name.slice(0, at), ext: name.slice(at + 1).toLowerCase() };
}

/**
 * One file name a person handed over, checked as a name rather than as a path.
 *
 * No separator, no climb, no device name, no control byte, no leading dot, and an extension the
 * policy allows. The refusal says which rule it broke and never echoes the name back — a rejected
 * file name is the caller's material, and a refusal is not a mirror.
 */
export function assertUploadFileName(name, { allowed_extensions: allowed, field = 'name' } = {}) {
  if (typeof name !== 'string' || name.length === 0 || name.length > MAX.file_name) {
    fail(TICKET_ERROR_CODES.FILE_NAME_REFUSED, 'a file name must be a short non-empty string',
      { field, max: MAX.file_name });
  }
  if (hasControlCharacter(name)) {
    fail(TICKET_ERROR_CODES.FILE_NAME_REFUSED, 'a file name carries a control character', { field });
  }
  if (/[\\/:*?"<>|]/u.test(name)) {
    fail(TICKET_ERROR_CODES.FILE_NAME_REFUSED, 'a file name carries a path or wildcard character',
      { field });
  }
  if (name === '.' || name === '..' || name.startsWith('.') || name.endsWith('.') || name.endsWith(' ')) {
    fail(TICKET_ERROR_CODES.FILE_NAME_REFUSED,
      'a file name may not start or end with a dot or a space', { field });
  }
  const { stem, ext } = splitFileName(name);
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/iu.test(stem)) {
    fail(TICKET_ERROR_CODES.FILE_NAME_REFUSED, 'this name is reserved by the operating system',
      { field });
  }
  if (ext === '') {
    fail(TICKET_ERROR_CODES.EXTENSION_REFUSED, 'a file must carry an extension', { field });
  }
  const list = allowed ?? DEFAULT_ALLOWED_EXTENSIONS;
  if (!list.includes(ext)) {
    fail(TICKET_ERROR_CODES.EXTENSION_REFUSED, 'this file type does not come through the door',
      { field, allowed_count: list.length });
  }
  return { name, stem, ext };
}

/**
 * `보고서.pdf` → `보고서 (v2).pdf` → `보고서 (v3).pdf`.
 *
 * Only ever reached when the caller asked for it (`allow_new_version`), because the default is to
 * refuse: a file that lands beside one with the same name is either a second copy nobody wanted or
 * a new version nobody declared, and the engine is not the one to decide which.
 */
export function versionedFileName(name, version) {
  if (!Number.isSafeInteger(version) || version < 2 || version > MAX.versions) {
    fail(TICKET_ERROR_CODES.VERSION_EXHAUSTED, 'a version suffix runs from v2 to the cap',
      { max: MAX.versions });
  }
  const { stem, ext } = splitFileName(name);
  return ext === '' ? `${stem} (v${version})` : `${stem} (v${version}).${ext}`;
}

/**
 * The first name in the version series that nothing is using.
 *
 * @param taken a predicate: does a file by this name already sit in the target folder
 */
export function nextFreeName(name, taken) {
  if (!taken(name)) return { name, version: 1 };
  for (let version = 2; version <= MAX.versions; version += 1) {
    const candidate = versionedFileName(name, version);
    if (!taken(candidate)) return { name: candidate, version };
  }
  fail(TICKET_ERROR_CODES.VERSION_EXHAUSTED,
    'this name already has as many versions as the door allows', { max: MAX.versions });
  return null;
}
