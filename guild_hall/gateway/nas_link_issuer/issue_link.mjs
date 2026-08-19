// One ticket folder on the NAS, and one link an outsider can open — the whole of the issuer's job.
//
// The shape comes from manual 12 §12.C: the engine hands out a **ticket** (a folder and an expiry,
// no link), and this gateway part turns that folder into something a person with no account and no
// synchronised PC can use. Upload wants a **file request** link — upload-only, so an outsider can
// put a file in and cannot list, read or take anything out. Download wants an ordinary share link
// with an expiry. Where the DSM exposes no file-request API at all, §12.C's own fallback applies:
// a share link on the dedicated *empty* folder the ticket just created, which discloses nothing
// because there is nothing in it yet.
//
// The file splits in two on purpose.
//
//   * `planLinkIssue` is pure. Given the ticket, the share, the capabilities and the expiry it
//     returns exactly which DSM path will be touched, which link kind will be asked for, and how
//     the expiry is encoded — with no clock, no network and no id in it. That is what makes the
//     mock replays byte-deterministic and what a reviewer can read without a NAS.
//   * `issueLink` executes that plan and adds the only two things that cannot be derived: the URL
//     and the DSM link id.
//
// No password, token or session ever appears in a return value. `password_set` is a boolean.

import {
  SYNOLOGY_ERROR_CODES, Secret, SynologyApiError,
} from './synology_api.mjs';

export const ISSUE_LINK_SCHEMA_VERSION = 'soulforge.nas_link_issue_result.v0';

/** file_request: upload-only. sharing_edit: the §12.C fallback. sharing_view: taking one file out. */
export const LINK_KINDS = Object.freeze(['file_request', 'sharing_edit', 'sharing_view']);

export const LINK_PURPOSES = Object.freeze(['upload', 'download']);

/**
 * How the expiry is written for DSM.
 *
 * DSM has shipped both encodings on `date_expired` across versions and the published API reference
 * does not say which one this box takes, so the encoding is a stated input with a default rather
 * than a constant this file guesses at. Confirming it against the actual DSM version is one of the
 * live-test steps (§12.C 회신 3번).
 */
export const EXPIRY_FORMATS = Object.freeze(['datetime', 'date']);

/** Which parameter carries the file-request intent on `SYNO.FileStation.Sharing` create. */
export const FILE_REQUEST_PARAMS = Object.freeze(['type', 'request']);

/**
 * The probe for the §12.C fallback: ask the share link to accept uploads.
 *
 * DSM may ignore an unknown parameter rather than refuse it, so a fallback link is reported with
 * `sharing_edit_permission_unverified` and the operator confirms the permission once in the DSM UI.
 * Claiming an upload permission we did not observe would be worse than saying we did not observe it.
 */
export const SHARING_EDIT_PROBE = Object.freeze({ enable_upload: 'true' });

export const ISSUE_ERROR_CODES = Object.freeze({
  ARGUMENT_INVALID: 'NAS_LINK_ARGUMENT_INVALID',
  FOLDER_REF_INVALID: 'NAS_LINK_FOLDER_REF_INVALID',
});

const fail = (code, message, detail = {}) => {
  throw new SynologyApiError(code, message, detail);
};

const TICKET_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/u;
const SHARE_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/u;
const ISO_INSTANT = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,3})?Z$/u;

const MAX_SEGMENTS = 8;
const MAX_SEGMENT = 120;

function hasControlCharacter(value) {
  for (const character of value) {
    const code = character.codePointAt(0);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

export function assertTicketId(value, field = 'ticket_id') {
  if (typeof value !== 'string' || !TICKET_ID.test(value)) {
    fail(ISSUE_ERROR_CODES.ARGUMENT_INVALID, 'a ticket id is a short safe token', { field });
  }
  return value;
}

export function assertShareName(value, field = 'share') {
  if (typeof value !== 'string' || !SHARE_NAME.test(value)) {
    fail(ISSUE_ERROR_CODES.ARGUMENT_INVALID, 'a share name is a short safe token', { field });
  }
  return value;
}

/**
 * The ticket folder, as a relative pointer under the share.
 *
 * Same rule the engine applies to a project-relative pointer: no drive letter, no leading
 * separator, no `..`, no backslash, and nothing that could make the NAS path resolve above the
 * share. The check is on the raw string — normalising first is precisely how a climb hides.
 */
export function assertTicketFolderRel(value, field = 'ticket_folder_rel') {
  if (typeof value !== 'string' || value.length === 0 || value.length > 400) {
    fail(ISSUE_ERROR_CODES.FOLDER_REF_INVALID, 'a ticket folder is a short relative pointer', { field });
  }
  if (hasControlCharacter(value)) {
    fail(ISSUE_ERROR_CODES.FOLDER_REF_INVALID, 'a ticket folder carries a control character', { field });
  }
  if (/^[A-Za-z]:[\\/]/u.test(value) || value.startsWith('/') || value.startsWith('\\')) {
    fail(ISSUE_ERROR_CODES.FOLDER_REF_INVALID,
      'this is a pointer under the share, not an absolute path', { field });
  }
  if (value.includes('\\')) {
    fail(ISSUE_ERROR_CODES.FOLDER_REF_INVALID,
      'a NAS pointer uses forward slashes', { field });
  }
  const segments = value.split('/').filter((part) => part.length > 0);
  if (segments.length === 0 || segments.length > MAX_SEGMENTS) {
    fail(ISSUE_ERROR_CODES.FOLDER_REF_INVALID,
      'a ticket folder is between one and eight segments deep', { field, max: MAX_SEGMENTS });
  }
  for (const segment of segments) {
    if (segment === '.' || segment === '..') {
      fail(ISSUE_ERROR_CODES.FOLDER_REF_INVALID,
        'a pointer may not climb out of the share', { field });
    }
    if (segment.length > MAX_SEGMENT || /[:*?"<>|]/u.test(segment)
      || segment.endsWith('.') || segment.endsWith(' ')) {
      fail(ISSUE_ERROR_CODES.FOLDER_REF_INVALID,
        'a folder segment carries a character the NAS will not keep', { field });
    }
  }
  return segments;
}

export function assertInstant(value, field = 'expires_at') {
  if (typeof value !== 'string' || !ISO_INSTANT.test(value) || Number.isNaN(Date.parse(value))) {
    fail(ISSUE_ERROR_CODES.ARGUMENT_INVALID,
      'an expiry is a UTC ISO-8601 instant such as 2026-08-22T05:00:00.000Z', { field });
  }
  return value;
}

/**
 * `2026-08-22T05:00:00.000Z` → `2026-08-22 05:00:00` (datetime) or `2026-08-22` (date).
 *
 * Computed in UTC. DSM applies the value in the NAS's own time zone, so a link can expire up to a
 * day early or late relative to the ticket; the result therefore carries the caller's exact
 * `expires_at` alongside what was sent, and the ticket — not the link — stays the record of when
 * the hand-over closes.
 */
export function dsmExpiry(instant, format = 'datetime') {
  assertInstant(instant, 'expires_at');
  if (!EXPIRY_FORMATS.includes(format)) {
    fail(ISSUE_ERROR_CODES.ARGUMENT_INVALID, 'unknown expiry format',
      { field: 'expiry_format', allowed: [...EXPIRY_FORMATS] });
  }
  const iso = new Date(Date.parse(instant)).toISOString();
  const day = iso.slice(0, 10);
  return format === 'date' ? day : `${day} ${iso.slice(11, 19)}`;
}

/**
 * Everything about the call that does not depend on the NAS answering.
 *
 * @param input `{ ticket_id, ticket_folder_rel, purpose, expires_at, share, capabilities,
 *   has_password, expiry_format, file_request_param }`
 * @returns a frozen plan: the DSM paths, the link kind that will be attempted, the fallback kind,
 *   and the exact extra parameters — never a password.
 */
export function planLinkIssue(input = {}) {
  const ticketId = assertTicketId(input.ticket_id);
  const segments = assertTicketFolderRel(input.ticket_folder_rel);
  const share = assertShareName(input.share);
  const purpose = input.purpose;
  if (!LINK_PURPOSES.includes(purpose)) {
    fail(ISSUE_ERROR_CODES.ARGUMENT_INVALID, 'a link is issued for an upload or a download',
      { field: 'purpose', allowed: [...LINK_PURPOSES] });
  }
  const expiresAt = assertInstant(input.expires_at);
  const expiryFormat = input.expiry_format ?? 'datetime';
  const requestParam = input.file_request_param ?? 'type';
  if (!FILE_REQUEST_PARAMS.includes(requestParam)) {
    fail(ISSUE_ERROR_CODES.ARGUMENT_INVALID, 'unknown file-request parameter probe',
      { field: 'file_request_param', allowed: [...FILE_REQUEST_PARAMS] });
  }
  // "Not probed yet" and "probed, and the box has nothing" are different facts and lead to
  // different plans: the first still attempts a file request, the second goes straight to the
  // fallback. Collapsing them would make a dry run claim a fallback nobody has established.
  const capabilities = input.capabilities ?? null;
  const capabilitiesKnown = capabilities !== null;
  const requestKind = capabilities?.file_request?.available === true
    ? capabilities.file_request.kind : null;
  const capabilityAbsent = purpose === 'upload' && capabilitiesKnown && requestKind === null;

  const folderPath = `/${share}/${segments.join('/')}`;
  const parentPath = segments.length === 1
    ? `/${share}` : `/${share}/${segments.slice(0, -1).join('/')}`;

  // Upload asks for a file request and falls back to an editable share link on the same empty
  // folder; download only ever wants a view link, so it has no fallback and needs no capability.
  const attempted = purpose === 'upload'
    ? (capabilityAbsent ? 'sharing_edit' : 'file_request')
    : 'sharing_view';
  const fallback = purpose === 'upload' ? 'sharing_edit' : null;

  return Object.freeze({
    schema_version: ISSUE_LINK_SCHEMA_VERSION,
    ticket_id: ticketId,
    purpose,
    share,
    folder_path: folderPath,
    folder_parent_path: parentPath,
    folder_name: segments[segments.length - 1],
    expires_at: expiresAt,
    expiry_format: expiryFormat,
    dsm_date_expired: dsmExpiry(expiresAt, expiryFormat),
    link_kind_attempted: attempted,
    link_kind_fallback: fallback,
    capabilities_known: capabilitiesKnown,
    capability_kind: requestKind,
    capability_absent: capabilityAbsent,
    file_request_param: requestParam,
    file_request_extra: Object.freeze(requestParam === 'type'
      ? { type: 'request' } : { request: 'true' }),
    sharing_extra: Object.freeze(attempted === 'sharing_edit' || fallback === 'sharing_edit'
      ? { ...SHARING_EDIT_PROBE } : {}),
    password_set: input.has_password === true,
  });
}

/**
 * Runs one plan against one client: folder first, then link.
 *
 * The folder is created before the link on purpose — a link to a folder that does not exist is a
 * link that fails in an outsider's browser, and the whole point of this path is that the outsider
 * needs no support call.
 *
 * @param options `{ client, password }` plus the `planLinkIssue` input. `password` is a `Secret`
 *   or a plain string and is never returned, logged, or put in an error.
 */
export async function issueLink(options = {}) {
  const client = options.client;
  if (client === null || typeof client?.capabilities !== 'function') {
    fail(ISSUE_ERROR_CODES.ARGUMENT_INVALID, 'issuing a link needs a Synology client', {});
  }
  const capabilities = await client.capabilities();
  const password = options.password ?? null;
  const plan = planLinkIssue({ ...options, capabilities, has_password: password !== null });

  const folder = await client.createFolder(plan.folder_parent_path, plan.folder_name);

  const notes = [];
  let fallbackReason = null;
  let linkKind = plan.link_kind_attempted;
  let link = null;

  const secret = password === null ? null : (password instanceof Secret ? password : new Secret(password));
  const shared = {
    path: plan.folder_path,
    date_expired: plan.dsm_date_expired,
    password: secret,
  };

  if (plan.purpose === 'download') {
    link = await client.createSharingLink({ ...shared, extra: {} });
  } else if (plan.capability_absent) {
    fallbackReason = 'file_request_capability_absent';
    linkKind = 'sharing_edit';
    link = await client.createSharingLink({ ...shared, extra: plan.sharing_extra });
  } else {
    try {
      link = plan.capability_kind === 'file_request_api'
        ? await client.createFileRequestLink({ ...shared, extra: {} })
        : await client.createSharingLink({ ...shared, extra: plan.file_request_extra });
    } catch (error) {
      // Only a DSM-level refusal falls back. A transport failure, an https refusal or a missing
      // session means we do not know what the box would have said, and guessing there would create
      // an editable link nobody asked for.
      const recoverable = error?.code === SYNOLOGY_ERROR_CODES.DSM_REFUSED
        || error?.code === SYNOLOGY_ERROR_CODES.CAPABILITY_MISSING;
      if (!recoverable) throw error;
      fallbackReason = error.code === SYNOLOGY_ERROR_CODES.CAPABILITY_MISSING
        ? 'file_request_capability_absent' : 'file_request_refused';
      linkKind = 'sharing_edit';
      link = await client.createSharingLink({ ...shared, extra: plan.sharing_extra });
    }
  }

  if (linkKind === 'sharing_edit') notes.push('sharing_edit_permission_unverified');
  if (folder.existed) notes.push('ticket_folder_already_existed');

  return Object.freeze({
    schema_version: ISSUE_LINK_SCHEMA_VERSION,
    ticket_id: plan.ticket_id,
    purpose: plan.purpose,
    link_url: link.link_url,
    link_kind: linkKind,
    expires_at: plan.expires_at,
    dsm_link_id: link.dsm_link_id,
    dsm_date_expired: plan.dsm_date_expired,
    folder_path: plan.folder_path,
    folder_created: folder.created === true,
    capability_kind: plan.capability_kind,
    fallback_reason: fallbackReason,
    password_set: plan.password_set,
    notes: Object.freeze(notes),
  });
}
