import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  MAX_SCAN_DEPTH,
  TOO_DEEP,
  deepFreeze,
  findLocalPath,
  findSecret,
  findUnknownKeyDeep,
  guardEntry,
  hasLocalPath,
  hasSecret,
  isSafeIdList,
  isSafeLabel,
  isSafeRef,
  UNKNOWN_KEY_DETAIL,
} from './guard_primitives.mjs';

// Built from parts so the repository stores no literal local absolute path while the detector
// still sees the exact shapes it must reject.
const fileUri = (...parts) => ['file:', '', '', ...parts].join('/');
const winPath = (...parts) => parts.join('\\');
const unc = (...parts) => `\\\\${parts.join('\\')}`;
const posix = (...parts) => ['', ...parts].join('/');

const CODES = Object.freeze({
  unknownField: 'RAW_OR_UNKNOWN_FIELD_FORBIDDEN',
  secret: 'SECRET_VALUE_FORBIDDEN',
  localPath: 'LOCAL_PATH_VALUE_FORBIDDEN',
  tooDeep: 'INPUT_TOO_DEEP',
});

test('every local absolute path alternative is detected, including the ones only docs mention', () => {
  const rejected = [
    winPath('C:', 'Users', 'user', 'plan.xlsx'),
    fileUri('C:', 'Users', 'user', 'plan.xlsx'),
    `ref:${fileUri('D:', 'data', 'plan.xlsx')}`,
    unc('fileserver', 'share', 'plan.xlsx'),
    posix('Users', 'user', 'plan.xlsx'),
    posix('home', 'user', 'plan.xlsx'),
    posix('mnt', 'disk', 'plan.xlsx'),
    posix('opt', 'app', 'plan.xlsx'),
    posix('srv', 'share', 'plan.xlsx'),
    posix('etc', 'conf', 'plan.xlsx'),
    posix('tmp', 'scratch', 'plan.xlsx'),
    posix('root', 'plan.xlsx'),
    posix('Volumes', 'disk', 'plan.xlsx'),
    posix('Applications', 'App', 'plan.xlsx'),
    posix('var', 'tmp', 'plan.xlsx'),
    'store:_workspaces/alpha/plan.xlsx',
    'store:_workmeta/alpha/report.json',
    'store:private-state/continuity.json',
    'ref:guild_hall/state/operations/x.json',
  ];
  for (const value of rejected) assert.equal(hasLocalPath(value), true, `must reject ${JSON.stringify(value)}`);

  const accepted = [
    'artifact://synthetic/alpha-workbook-0001',
    'invoice://synthetic/2026-08',
    'https://example.invalid/a/b',
    'guild_hall/agent_observation/README.md',
    'proj-synthetic-alpha',
  ];
  for (const value of accepted) assert.equal(hasLocalPath(value), false, `must accept ${JSON.stringify(value)}`);
});

test('every secret alternative is detected', () => {
  const rejected = [
    '-----BEGIN RSA PRIVATE KEY-----',
    'Bearer abcdef0123456789',
    'ghp_abcdefgh12345678',
    'github_pat_abcdefgh12345678',
    'sk-abcdefgh12345678',
    'xoxb-abcdefgh12345678',
    'AIzaAbCdEfGh12345678',
    'AKIAIOSFODNN7EXAMPLE',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop',
    'password:hunter2secret',
    'api_key=abcdefgh12345',
    'access_token: abcdefgh12345',
    'client_secret=abcdefgh12345',
  ];
  for (const value of rejected) assert.equal(hasSecret(value), true, `must reject ${JSON.stringify(value)}`);

  const accepted = ['artifact://synthetic/workbook-0001', 'model-synthetic-high', 'sk-short'];
  for (const value of accepted) assert.equal(hasSecret(value), false, `must accept ${JSON.stringify(value)}`);
});

test('safe refs reject anything a secret or path scan would catch', () => {
  assert.equal(isSafeRef('artifact://synthetic/workbook-0001'), true);
  assert.equal(isSafeRef(fileUri('C:', 'Users', 'x')), false);
  assert.equal(isSafeRef('Bearer abcdef0123456789'), false);
  assert.equal(isSafeRef(winPath('C:', 'x')), false, 'a backslash is outside the safe ref charset');
  assert.equal(isSafeRef(''), false);
  assert.equal(isSafeRef('a'.repeat(201)), false);
  assert.equal(isSafeRef(null), false);
});

test('safe labels enforce NFKC normalization, trimming, length and forbidden characters', () => {
  assert.equal(isSafeLabel('Synthetic Alpha 요구정리 TASK'), true);
  assert.equal(isSafeLabel('ＦＵＬＬＷＩＤＴＨ'), false, 'a non-NFKC form must be rejected, not silently normalized');
  assert.equal(isSafeLabel(' padded '), false);
  assert.equal(isSafeLabel('trailing '), false);
  assert.equal(isSafeLabel(''), false);
  assert.equal(isSafeLabel('a'.repeat(81)), false);
  assert.equal(isSafeLabel('a'.repeat(80)), true);
  for (const bad of ['a/b', 'a\\b', 'a:b', 'a|b', 'a<b', 'a>b', 'a\nb', 'a\u0000b']) {
    assert.equal(isSafeLabel(bad), false, `must reject ${JSON.stringify(bad)}`);
  }
  assert.equal(isSafeLabel(123), false);
});

test('safe id lists are bounded, non-empty and dense', () => {
  assert.equal(isSafeIdList(['a', 'b'], 4), true);
  // `every` skips holes, so a sparse array would otherwise pass and store a null element.
  const sparse = ['a', 'b'];
  sparse[4] = 'c';
  assert.equal(isSafeIdList(sparse, 8), false, 'a sparse list must be refused');
  // A decoy own property restores the key count the hole removed, so a key-count check alone fails.
  const decoyed = ['a'];
  decoyed[2] = 'b';
  decoyed.decoy = 'x';
  assert.equal(isSafeIdList(decoyed, 8), false, 'a hole hidden behind a decoy property must be refused');
  assert.equal(isSafeIdList([...sparse].map((v) => v ?? 'x'), 8), true);
  assert.equal(isSafeIdList([], 4), false);
  assert.equal(isSafeIdList(['a', 'b', 'c', 'd', 'e'], 4), false);
  assert.equal(isSafeIdList(['has space'], 4), false);
  assert.equal(isSafeIdList('a', 4), false);
});

test('deep freeze reaches array elements and nested objects', () => {
  const value = deepFreeze({ list: [{ inner: { leaf: 1 } }], plain: { leaf: 2 } });
  assert.equal(Object.isFrozen(value.list), true);
  assert.equal(Object.isFrozen(value.list[0]), true);
  assert.equal(Object.isFrozen(value.list[0].inner), true);
  assert.equal(Object.isFrozen(value.plain), true);
  assert.throws(() => value.list.push(1), TypeError);
  assert.throws(() => { value.list[0].inner.leaf = 9; }, TypeError);
});

test('the nested key audit sees a raw key hidden below the top level', () => {
  const allowed = new Set(['refs', 'ref_kind', 'ref_value']);
  assert.equal(findUnknownKeyDeep({ refs: [{ ref_kind: 'artifact', ref_value: 'x' }] }, allowed), null);
  assert.equal(findUnknownKeyDeep({ refs: [{ ref_kind: 'artifact', ref_value: 'x', transcript: 'raw' }] }, allowed), UNKNOWN_KEY_DETAIL);
  assert.equal(findUnknownKeyDeep({ unexpected: 1 }, allowed), UNKNOWN_KEY_DETAIL);
});

const nest = (depth) => {
  let value = 'leaf';
  for (let i = 0; i < depth; i += 1) value = { nested: value };
  return value;
};

test('a value deeper than the scan bound fails closed instead of blowing the stack', () => {
  assert.equal(findSecret(nest(MAX_SCAN_DEPTH + 5)), TOO_DEEP);
  assert.equal(findLocalPath(nest(MAX_SCAN_DEPTH + 5)), TOO_DEEP);
  assert.equal(findUnknownKeyDeep(nest(MAX_SCAN_DEPTH + 5), new Set(['nested'])), TOO_DEEP);
  assert.equal(findSecret(nest(2)), null);

  const guarded = guardEntry({ payload: nest(60_000) }, ['payload'], CODES);
  assert.equal(guarded.status, 'HOLD');
  assert.equal(guarded.hold_code, CODES.tooDeep);
});

test('an unsafe key name is never echoed back into a hold detail', () => {
  const hostile = [
    winPath('C:', 'Users', 'user', 'secret.xlsx'),
    'Bearer abcdef0123456789',
    'sk-abcdefgh12345678',
    'raw transcript body',
  ];
  for (const key of hostile) {
    const result = guardEntry({ [key]: 1 }, ['allowed'], CODES);
    assert.equal(result.hold_code, CODES.unknownField, key);
    assert.equal(result.detail, UNKNOWN_KEY_DETAIL, `detail must not reproduce ${JSON.stringify(key)}`);
  }
  // Even an innocuous-looking key is withheld: a safe-ID filter would still pass `sk-...`.
  assert.equal(guardEntry({ unexpected_field: 1 }, ['allowed'], CODES).detail, UNKNOWN_KEY_DETAIL);
  assert.equal(findUnknownKeyDeep({ [hostile[0]]: 1 }, new Set()), UNKNOWN_KEY_DETAIL);
});

test('every file in this owner stays plain text for grep-based validators', () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const files = readdirSync(dir).filter((name) => name.endsWith('.mjs') || name.endsWith('.md'));
  assert.ok(files.length >= 9, 'the scan must cover the whole owner, not a hand-listed subset');
  for (const name of files) {
    const raw = readFileSync(join(dir, name), 'utf8');
    assert.equal(raw.includes('\u0000'), false, `${name} must not contain a NUL byte`);
  }
});

test('the shared entry guard reports the most specific reason in a fixed order', () => {
  assert.equal(guardEntry(null, ['a'], CODES).hold_code, CODES.unknownField);
  // A payload carried on a prototype has no own enumerable properties, so every scan would skip it.
  const carrier = { a: 'Bearer abcdefgh12345678' };
  assert.equal(guardEntry(carrier, ['a'], CODES).hold_code, CODES.secret);
  assert.equal(guardEntry(Object.create(carrier), ['a'], CODES).hold_code, CODES.unknownField);
  assert.equal(guardEntry(Object.create(null), ['a'], CODES), null, 'a null prototype is still plain');
  assert.equal(guardEntry({ b: 1 }, ['a'], CODES).hold_code, CODES.unknownField);
  assert.equal(guardEntry({ a: 'Bearer abcdef0123456789' }, ['a'], CODES).hold_code, CODES.secret);
  assert.equal(guardEntry({ a: fileUri('C:', 'x') }, ['a'], CODES).hold_code, CODES.localPath);
  assert.equal(guardEntry({ a: 'clean-value' }, ['a'], CODES), null);

  // A value that matches both scans pins the order: swapping them would report the path code.
  const both = `Bearer abcdefgh12345678 ${fileUri('C:', 'Users', 'user', 'x')}`;
  assert.equal(hasSecret(both), true);
  assert.equal(hasLocalPath(both), true);
  assert.equal(guardEntry({ a: both }, ['a'], CODES).hold_code, CODES.secret);
});
