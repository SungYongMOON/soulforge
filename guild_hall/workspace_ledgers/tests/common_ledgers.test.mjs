import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildCommonRow, headersFor, isSafeFileName, resolveSafePath } from '../src/common_ledgers.mjs';

test('isSafeFileName: accepts an ordinary ledger file name', () => {
  assert.equal(isSafeFileName('거래처_ABC.csv'), true);
});

test('isSafeFileName: rejects path separators, traversal, control bytes, reserved device names, trailing dot/space', () => {
  assert.equal(isSafeFileName('a/b.csv'), false);
  assert.equal(isSafeFileName('a\\b.csv'), false);
  assert.equal(isSafeFileName('../escape.csv'), false);
  assert.equal(isSafeFileName('a' + String.fromCharCode(1) + 'b.csv'), false);
  assert.equal(isSafeFileName('CON.csv'), false);
  assert.equal(isSafeFileName('name.csv.'), false);
  assert.equal(isSafeFileName('name.csv '), false);
  assert.equal(isSafeFileName(''), false);
  assert.equal(isSafeFileName('x'.repeat(200) + '.csv'), false);
});

test('isSafeFileName (NIT 12, fresh non-author review, 2026-09-21): rejects DEL and every invisible/bidi-control codepoint', () => {
  const codepoints = [0x7F, 0x200B, 0x200C, 0x200D, 0x2060, 0xFEFF, 0x200E, 0x200F, 0x202A, 0x202E, 0x2066, 0x2069];
  for (const codepoint of codepoints) {
    const name = `a${String.fromCharCode(codepoint)}b.csv`;
    assert.equal(isSafeFileName(name), false, `codepoint ${codepoint} should be rejected`);
  }
});

test('resolveSafePath: resolves a safe name under its base directory', () => {
  const base = path.join(tmpdir(), 'workspace-ledgers-common-ledgers-test');
  const resolved = resolveSafePath(base, 'ok.csv');
  assert.ok(resolved);
  assert.ok(resolved.endsWith('ok.csv'));
});

test('resolveSafePath: returns null for a traversal-shaped name, never resolving outside the base', () => {
  const base = path.join(tmpdir(), 'workspace-ledgers-common-ledgers-test');
  assert.equal(resolveSafePath(base, '../../escape.csv'), null);
});

// -------------------------------------------------------------------------------- R2
test('headersFor (R2, coordinator fresh review round 2): 판독_과제미정.csv (A2 item 2\'s renamed bucket) is admin-shaped -- it must keep its 세부분류 column', () => {
  const headers = headersFor('판독_과제미정.csv');
  assert.ok(headers.includes('세부분류'), 'the renamed bucket file lost its 세부분류 column');
  // the OLD (pre-rename) file name is no longer admin-shaped -- nothing routes to it
  // any more, so it falling back to the base (non-admin) header shape is expected,
  // not a regression.
  assert.equal(headersFor('과제없음_확인함.csv').includes('세부분류'), false);
});

test('buildCommonRow (R2): the reader\'s own reason (detail) is carried into 판독_과제미정.csv\'s row, not silently dropped', () => {
  const mail = { event_id: 'm1', at: '2026-09-01T00:00:00Z', subject: 's', from: { name: 'n', email: 'a@b.example' }, attachment_names: [] };
  const row = buildCommonRow({ folderScope: 'P00-000_공통', fileName: '판독_과제미정.csv', mail, detail: '아직 확인 못함' });
  assert.ok(row.includes('아직 확인 못함'), 'the reading decision\'s own 이유 text must land in the 세부분류 cell');
});
