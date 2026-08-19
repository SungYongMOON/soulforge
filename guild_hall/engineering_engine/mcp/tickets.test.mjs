// The ticket ledger, exercised as the pure thing it is: no disk, no clock, no identity.
//
// Every clock in here is a string the test states, which is the property that matters — a ticket
// that expires "in three days" has to expire because the caller said what time it is, not because
// the machine the test runs on agrees.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_ALLOWED_EXTENSIONS, DEFAULT_TICKET_POLICY, MAX, TICKET_ERROR_CODES, TicketError,
  assertPrincipalRef, assertTicketId, assertTicketUsable, assertUploadFileName, foldTicketLedger,
  mintTicketId, newTicketRecord, nextFreeName, splitFileName, ticketExpiry, ticketStateAt,
  ticketsDueForCleanup, validateTicketPolicy, versionedFileName,
} from './tickets.mjs';

const T0 = '2026-08-19T05:00:00.000Z';
const POLICY = validateTicketPolicy(null);

const refusalOf = (run) => {
  try {
    run();
  } catch (error) {
    assert.ok(error instanceof TicketError, `expected a TicketError, got ${error?.name}`);
    return error;
  }
  assert.fail('this should have been refused');
  return null;
};

const ticket = (over = {}) => newTicketRecord({
  ticket_id: mintTicketId({ purpose: 'upload', created_at: T0, principal_ref: 'owner_a' }),
  purpose: 'upload',
  principal_ref: 'owner_a',
  role: 'owner',
  created_at: T0,
  expires_at: ticketExpiry(T0, 'upload', POLICY),
  folder_ref: '020_MGMT/tickets/owner_a/up',
  ...over,
});

test('the default policy is three days in, one day out, thirty days before the sweep', () => {
  assert.deepEqual({ ...DEFAULT_TICKET_POLICY }, {
    upload_ttl_hours: 72, download_ttl_hours: 24, cleanup_after_days: 30,
  });
  assert.equal(POLICY.allowed_extensions, DEFAULT_ALLOWED_EXTENSIONS);
  assert.equal(ticketExpiry(T0, 'upload', POLICY), '2026-08-22T05:00:00.000Z');
  assert.equal(ticketExpiry(T0, 'download', POLICY), '2026-08-20T05:00:00.000Z');
});

test('a policy states only the keys it owns, and every one of them is a small positive integer', () => {
  const stated = validateTicketPolicy({
    upload_ttl_hours: 4, allowed_extensions: ['pdf', 'pdf', 'xlsx'], max_file_bytes: 1024,
  });
  assert.equal(stated.upload_ttl_hours, 4);
  assert.equal(stated.download_ttl_hours, DEFAULT_TICKET_POLICY.download_ttl_hours);
  assert.deepEqual([...stated.allowed_extensions], ['pdf', 'xlsx']);
  assert.equal(stated.max_file_bytes, 1024);

  assert.equal(refusalOf(() => validateTicketPolicy({ nonsense: 1 })).code,
    TICKET_ERROR_CODES.POLICY_INVALID);
  assert.equal(refusalOf(() => validateTicketPolicy({ upload_ttl_hours: 0 })).code,
    TICKET_ERROR_CODES.POLICY_INVALID);
  assert.equal(refusalOf(() => validateTicketPolicy({ allowed_extensions: ['.pdf'] })).code,
    TICKET_ERROR_CODES.POLICY_INVALID);
  // The cap is the door's, not the project's: a profile may narrow it and may not widen it.
  assert.equal(refusalOf(() => validateTicketPolicy({ max_file_bytes: 1024 * 1024 * 1024 })).code,
    TICKET_ERROR_CODES.POLICY_INVALID);
});

test('a ticket id is minted from its parts, fits a folder name, and is checked as a shape', () => {
  const id = mintTicketId({ purpose: 'upload', created_at: T0, principal_ref: 'owner_a' });
  assert.equal(id, mintTicketId({ purpose: 'upload', created_at: T0, principal_ref: 'owner_a' }));
  assert.notEqual(id, mintTicketId({ purpose: 'upload', created_at: T0, principal_ref: 'pm_b' }));
  assert.notEqual(id, mintTicketId({ purpose: 'download', created_at: T0, principal_ref: 'owner_a' }));
  assert.match(id, /^up_20260819t050000z_[0-9a-f]{6}$/u);
  assert.ok(id.length <= 60, 'a ticket id has to fit one path segment');
  assert.equal(assertTicketId(id), id);
  assert.equal(refusalOf(() => assertTicketId('../escape')).code, TICKET_ERROR_CODES.TICKET_INVALID);
  assert.equal(refusalOf(() => assertTicketId('up_1_ab')).code, TICKET_ERROR_CODES.TICKET_INVALID);
});

test('a principal reference names a folder, so a trailing dot is refused', () => {
  assert.equal(assertPrincipalRef('hong.gd@example.com'), 'hong.gd@example.com');
  assert.equal(refusalOf(() => assertPrincipalRef('owner.')).code, TICKET_ERROR_CODES.TICKET_INVALID);
  assert.equal(refusalOf(() => assertPrincipalRef('한글')).code, TICKET_ERROR_CODES.TICKET_INVALID);
  assert.equal(refusalOf(() => assertPrincipalRef('../owner')).code, TICKET_ERROR_CODES.TICKET_INVALID);
});

test('the state of a ticket comes from the clock the caller states, not from the row', () => {
  const row = ticket();
  assert.equal(ticketStateAt(row, T0), 'open');
  assert.equal(ticketStateAt(row, '2026-08-21T05:00:00.000Z'), 'open');
  assert.equal(ticketStateAt(row, '2026-08-22T05:00:00.000Z'), 'expired');
  assert.equal(ticketStateAt({ ...row, status: 'used' }, T0), 'used');
  assert.equal(ticketStateAt({ ...row, status: 'cleaned' }, T0), 'cleaned');
  // A used ticket does not become open again by being looked at before its expiry.
  assert.equal(ticketStateAt({ ...row, status: 'used' }, '2026-09-30T05:00:00.000Z'), 'used');
});

test('the ledger folds to the latest row per ticket and survives a torn line', () => {
  const row = ticket();
  const folded = foldTicketLedger([
    row,
    { not: 'a ticket' },
    null,
    { ...row, status: 'used', used_at: '2026-08-19T06:00:00.000Z' },
  ]);
  assert.equal(folded.tickets.size, 1);
  assert.equal(folded.skipped, 2);
  assert.equal(folded.tickets.get(row.ticket_id).status, 'used');
});

test('a ticket is usable only by its own holder, for its own purpose, while it is open', () => {
  const row = ticket();
  const held = { now: T0, purpose: 'upload', principal_ref: 'owner_a' };
  assert.equal(assertTicketUsable(row, held), row);

  assert.equal(refusalOf(() => assertTicketUsable(undefined, held)).code,
    TICKET_ERROR_CODES.TICKET_UNKNOWN);
  assert.equal(refusalOf(() => assertTicketUsable(row, { ...held, purpose: 'download' })).code,
    TICKET_ERROR_CODES.TICKET_NOT_OPEN);
  assert.equal(refusalOf(() => assertTicketUsable(row, { ...held, principal_ref: 'sw_b' })).code,
    TICKET_ERROR_CODES.TICKET_NOT_YOURS);
  // Owner and PM act for the whole project, which is what makes a stuck hand-over recoverable.
  assert.equal(assertTicketUsable(row,
    { ...held, principal_ref: 'pm_b', may_act_for_others: true }), row);
  assert.equal(refusalOf(() =>
    assertTicketUsable(row, { ...held, now: '2026-08-30T05:00:00.000Z' })).code,
  TICKET_ERROR_CODES.TICKET_NOT_OPEN);
  assert.equal(refusalOf(() => assertTicketUsable({ ...row, status: 'used' }, held)).code,
    TICKET_ERROR_CODES.TICKET_NOT_OPEN);
});

test('the sweep takes finished tickets past the grace period, and leaves open ones alone', () => {
  const open = ticket();
  const used = { ...ticket(), ticket_id: 'up_20260701t000000z_aaaaaa', status: 'used', used_at: '2026-07-01T00:00:00.000Z' };
  const expired = { ...ticket(), ticket_id: 'up_20260601t000000z_bbbbbb', expires_at: '2026-06-04T00:00:00.000Z' };
  const recentlyUsed = { ...ticket(), ticket_id: 'up_20260818t000000z_cccccc', status: 'used', used_at: '2026-08-18T00:00:00.000Z' };

  const due = ticketsDueForCleanup([open, used, expired, recentlyUsed], { now: T0, policy: POLICY });
  assert.deepEqual(due.map((row) => row.ticket_id),
    ['up_20260601t000000z_bbbbbb', 'up_20260701t000000z_aaaaaa']);
  assert.deepEqual(due.map((row) => row.state), ['expired', 'used']);
});

test('a file name is a name: no separator, no climb, no reserved word, no surprise extension', () => {
  assert.deepEqual(assertUploadFileName('K-VDS_BOM_260819.xlsx', { allowed_extensions: POLICY.allowed_extensions }),
    { name: 'K-VDS_BOM_260819.xlsx', stem: 'K-VDS_BOM_260819', ext: 'xlsx' });

  for (const bad of ['../escape.pdf', 'a/b.pdf', 'a\\b.pdf', '.hidden.pdf', 'trailing.pdf.', 'con.pdf', 'q*.pdf']) {
    assert.equal(refusalOf(() => assertUploadFileName(bad, { allowed_extensions: POLICY.allowed_extensions })).code,
      TICKET_ERROR_CODES.FILE_NAME_REFUSED, bad);
  }
  for (const bad of ['payload.exe', 'run.bat', 'noextension']) {
    assert.equal(refusalOf(() => assertUploadFileName(bad, { allowed_extensions: POLICY.allowed_extensions })).code,
      TICKET_ERROR_CODES.EXTENSION_REFUSED, bad);
  }
});

test('a second file of the same name becomes a stated version, and the series ends', () => {
  assert.deepEqual(splitFileName('보고서.pdf'), { stem: '보고서', ext: 'pdf' });
  assert.equal(versionedFileName('보고서.pdf', 2), '보고서 (v2).pdf');
  assert.equal(versionedFileName('archive.tar.gz', 3), 'archive.tar (v3).gz');

  const taken = new Set(['a.pdf', 'a (v2).pdf']);
  assert.deepEqual(nextFreeName('a.pdf', (name) => taken.has(name)), { name: 'a (v3).pdf', version: 3 });
  assert.deepEqual(nextFreeName('b.pdf', (name) => taken.has(name)), { name: 'b.pdf', version: 1 });
  assert.equal(refusalOf(() => nextFreeName('a.pdf', () => true)).code,
    TICKET_ERROR_CODES.VERSION_EXHAUSTED);
  assert.equal(refusalOf(() => versionedFileName('a.pdf', MAX.versions + 1)).code,
    TICKET_ERROR_CODES.VERSION_EXHAUSTED);
});

test('a ticket record carries a pointer and a note, and refuses anything longer than a line', () => {
  const row = ticket({ note: '발주처 CDR 발표자료' });
  assert.equal(row.status, 'open');
  assert.equal(row.note, '발주처 CDR 발표자료');
  assert.deepEqual(row.files, []);
  assert.equal(refusalOf(() => ticket({ note: 'x'.repeat(MAX.note + 1) })).code,
    TICKET_ERROR_CODES.TICKET_INVALID);
  assert.equal(refusalOf(() => ticket({ created_at: '2026-08-19' })).code,
    TICKET_ERROR_CODES.TICKET_INVALID);
});
