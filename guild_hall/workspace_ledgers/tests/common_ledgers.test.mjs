import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { isSafeFileName, resolveSafePath } from '../src/common_ledgers.mjs';

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
