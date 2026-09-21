import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { encodeCsv } from '../src/ledgers.mjs';
import {
  BUNDLE_HEADERS, BUNDLE_HEADERS_V2, buildBundleTable, buildReadingTable, buildVendorTable, buildWorkTagTable,
  isValidCalendarDateString, loadOwnerTables, OwnerTableConfigError, READING_HEADERS, readOwnerTable, resolveOwnerTablePaths,
  VENDOR_HEADERS, WORKTAG_HEADERS,
} from '../src/owner_tables.mjs';

function tmpFile(name) {
  const dir = mkdtempSync(path.join(tmpdir(), 'workspace-ledgers-owner-tables-'));
  return { dir, filePath: path.join(dir, name) };
}

test('readOwnerTable (NIT, coordinator fresh review round 5): a path whose parent segment is a regular file is treated the same as a missing file -- assert the module behaviour only, never a raw errno', () => {
  const { dir } = tmpFile('unused');
  try {
    // `readFileSync` on a path passing THROUGH a regular file reports ENOTDIR on Linux
    // but ENOENT on Windows for the same misconfiguration -- this test never inspects
    // `error.code` itself, only `readOwnerTable`'s own resulting shape, so it passes
    // identically on both platforms.
    const regularFile = path.join(dir, 'not-a-directory');
    writeFileSync(regularFile, 'x');
    const bogusPath = path.join(regularFile, 'sub', '묶음_확정표.csv');
    assert.deepEqual(readOwnerTable(bogusPath, BUNDLE_HEADERS_V2), { present: false }); // ordinary "skip" -- not configuredPaths
    assert.deepEqual(readOwnerTable(bogusPath, BUNDLE_HEADERS_V2, { missingIsFailure: true }),
      { present: true, ok: false, code: 'workspace_ledgers_owner_table_configured_but_missing' }); // S3 fail-closed path
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('resolveOwnerTablePaths (NIT, coordinator fresh review round 4): a relative config value that escapes workspacesRoot throws workspace_ledgers_owner_table_config_path_escape', () => {
  const workspacesRoot = path.join(tmpdir(), 'workspace-ledgers-owner-tables-root');
  assert.throws(
    () => resolveOwnerTablePaths({}, { orgConfig: { common_ledgers: { owner_tables: { bundle: '../../escaped/묶음.csv' } } }, workspacesRoot }),
    error => error instanceof OwnerTableConfigError && error.code === 'workspace_ledgers_owner_table_config_path_escape',
  );
});

test('resolveOwnerTablePaths (NIT): an absolute config value is unaffected by the escape guard', () => {
  const workspacesRoot = path.join(tmpdir(), 'workspace-ledgers-owner-tables-root');
  const absolute = path.join(tmpdir(), 'elsewhere', '묶음.csv');
  const resolved = resolveOwnerTablePaths({}, { orgConfig: { common_ledgers: { owner_tables: { bundle: absolute } } }, workspacesRoot });
  assert.equal(resolved.bundleTablePath, absolute);
  assert.equal(resolved.configuredPaths.bundle, true);
});

test('resolveOwnerTablePaths (NIT): a relative config value with workspacesRoot undefined throws a module error code, not a raw TypeError', () => {
  assert.throws(
    () => resolveOwnerTablePaths({}, { orgConfig: { common_ledgers: { owner_tables: { bundle: 'P00-000_공통/묶음.csv' } } }, workspacesRoot: undefined }),
    error => error instanceof OwnerTableConfigError && error.code === 'workspace_ledgers_owner_table_config_workspaces_root_required',
  );
});

test('resolveOwnerTablePaths: configuredPaths is false for an explicit argument, true only for an org-config fallback', () => {
  const workspacesRoot = path.join(tmpdir(), 'workspace-ledgers-owner-tables-root');
  const resolved = resolveOwnerTablePaths(
    { bundleTablePath: '/explicit/묶음.csv' },
    { orgConfig: { common_ledgers: { owner_tables: { bundle: 'x/묶음.csv', reading: 'x/판독.csv' } } }, workspacesRoot },
  );
  assert.equal(resolved.configuredPaths.bundle, false); // explicit argument wins, not config-sourced
  assert.equal(resolved.configuredPaths.reading, true); // no explicit override -- config-sourced
  assert.equal(resolved.configuredPaths.vendor, false); // neither explicit nor configured
});

test('loadOwnerTables (S3, coordinator fresh review round 4): a config-resolved path naming a file that does not exist fails closed, not "no table configured"', () => {
  const { dir } = tmpFile('unused');
  try {
    const missingPath = path.join(dir, 'does-not-exist.csv');
    const result = loadOwnerTables({ bundleTablePath: missingPath, configuredPaths: { bundle: true } });
    assert.deepEqual(result.bundles, []);
    assert.equal(result.failures.length, 1);
    assert.equal(result.failures[0].code, 'workspace_ledgers_owner_table_configured_but_missing');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('loadOwnerTables (S3): the SAME missing path with no configuredPaths entry (an explicit caller argument) keeps the original silent-skip behaviour', () => {
  const { dir } = tmpFile('unused');
  try {
    const missingPath = path.join(dir, 'does-not-exist.csv');
    const result = loadOwnerTables({ bundleTablePath: missingPath }); // configuredPaths omitted entirely
    assert.deepEqual(result.bundles, []);
    assert.deepEqual(result.failures, []); // skip, not a failure
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('loadOwnerTables: a missing table is skipped (present: false), not a failure', () => {
  const { dir } = tmpFile('unused');
  try {
    const result = loadOwnerTables({ bundleTablePath: path.join(dir, 'does-not-exist.csv') });
    assert.deepEqual(result.bundles, []);
    assert.deepEqual(result.failures, []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('loadOwnerTables: a header-mismatched table fails closed for that table only', () => {
  const { dir, filePath } = tmpFile('묶음_확정표.csv');
  writeFileSync(filePath, encodeCsv(['잘못된헤더'], [['x']]));
  try {
    const result = loadOwnerTables({ bundleTablePath: filePath });
    assert.deepEqual(result.bundles, []);
    assert.equal(result.failures.length, 1);
    assert.equal(result.failures[0].code, 'workspace_ledgers_owner_table_header_mismatch');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('loadOwnerTables: an encoding-broken table (replacement character) fails closed', () => {
  const { dir, filePath } = tmpFile('묶음_확정표.csv');
  // Built with String.fromCharCode (codepoints 0xFEFF and 0xFFFD) rather than typing
  // a control-character escape literally in source -- an editing tool can turn such an
  // escape into the actual raw codepoint in this FILE's own source, which
  // byte_hygiene.test.mjs (correctly) flags as an accident.
  const bom = String.fromCharCode(0xFEFF);
  const replacementChar = String.fromCharCode(0xFFFD);
  writeFileSync(filePath, `${bom}${BUNDLE_HEADERS.join(',')}\r\n제목${replacementChar},P00-001,근거,2026-09-21\r\n`);
  try {
    const result = loadOwnerTables({ bundleTablePath: filePath });
    assert.equal(result.failures[0].code, 'workspace_ledgers_owner_table_encoding');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('buildBundleTable: lowercases 제목구절, splits 과제 on ";", drops entries with no phrase or no codes', () => {
  const rows = [
    { '제목구절': 'ABC 회의', '과제': 'P00-001;P00-002', '근거': 'why', '확정일': '2026-09-21' },
    { '제목구절': '', '과제': 'P00-003', '근거': '', '확정일': '' },
    { '제목구절': 'x', '과제': '', '근거': '', '확정일': '' },
  ];
  const table = buildBundleTable(rows);
  assert.equal(table.length, 1);
  assert.equal(table[0].phrase, 'abc 회의');
  assert.deepEqual(table[0].codes, ['P00-001', 'P00-002']);
});

test('buildReadingTable: keyed by 메일소스ID, a later row for the same id overwrites the earlier one', () => {
  const rows = [
    { '메일소스ID': 'm1', '수신일': '2026-09-01', '제목': 's', '결정': 'hold_owner_review', '과제_또는_분류': '', '이유': 'a', '판독자': 'r', '판독일': '2026-09-01', 'Owner확인': '' },
    { '메일소스ID': 'm1', '수신일': '2026-09-01', '제목': 's', '결정': 'include', '과제_또는_분류': 'P00-001', '이유': 'b', '판독자': 'r', '판독일': '2026-09-02', 'Owner확인': '' },
  ];
  const table = buildReadingTable(rows);
  assert.equal(table.size, 1);
  assert.equal(table.get('m1').level, 'include');
});

test('buildVendorTable: keyed by lowercased 도메인 (may hold a bare domain or a full address)', () => {
  const rows = [{ '도메인': 'Vendor.Example', '거래처명': 'Vendor Co', '구분': '부품', '메모': '' }];
  const table = buildVendorTable(rows);
  assert.equal(table.get('vendor.example').name, 'Vendor Co');
});

test('buildWorkTagTable: trims and drops empty tags', () => {
  const rows = [{ '태그': ' SMT ', '설명': '' }, { '태그': '', '설명': '' }];
  assert.deepEqual(buildWorkTagTable(rows), ['SMT']);
});

test('loadOwnerTables: a table with all four files present loads all four lookups', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'workspace-ledgers-owner-tables-all-'));
  try {
    const bundlePath = path.join(dir, 'bundle.csv');
    const vendorPath = path.join(dir, 'vendor.csv');
    const readingPath = path.join(dir, 'reading.csv');
    const workTagPath = path.join(dir, 'worktag.csv');
    writeFileSync(bundlePath, encodeCsv(BUNDLE_HEADERS, [['ABC 회의', 'P00-001', '근거', '2026-09-21']]));
    writeFileSync(vendorPath, encodeCsv(VENDOR_HEADERS, [['vendor.example', 'Vendor Co', '부품', '']]));
    writeFileSync(readingPath, encodeCsv(READING_HEADERS, [['m1', '2026-09-01', 's', 'exclude', '광고', 'ad', 'r', '2026-09-01', '']]));
    writeFileSync(workTagPath, encodeCsv(WORKTAG_HEADERS, [['SMT', '']]));
    const result = loadOwnerTables({ bundleTablePath: bundlePath, vendorTablePath: vendorPath, readingTablePath: readingPath, workTagTablePath: workTagPath });
    assert.equal(result.bundles.length, 1);
    assert.equal(result.vendors.size, 1);
    assert.equal(result.readings.size, 1);
    assert.deepEqual(result.workTags, ['SMT']);
    assert.deepEqual(result.failures, []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// --------------------------------------------------------- required-review item 2
test('buildVendorTable (required-review item 2): a decomposed-Hangul 거래처명 is normalised to NFC, matching the composed form', () => {
  const composed = '가나다'; // NFC (typed directly -- ordinary precomposed Hangul, not a special codepoint)
  const decomposed = composed.normalize('NFD'); // same text, decomposed jamo sequence -- what a macOS paste routinely produces
  assert.notEqual(composed, decomposed); // sanity: they really are different byte sequences before normalisation
  const rows = [{ '도메인': 'vendor.example', '거래처명': decomposed, '구분': '부품', '메모': '' }];
  const table = buildVendorTable(rows);
  const entry = table.get('vendor.example');
  assert.equal(entry.name, composed); // stored in NFC regardless of the source row's own form
  assert.equal(entry.name.normalize('NFC'), entry.name);
});

test('buildVendorTable (NIT 11): a whitespace-only 거래처명 row is dropped', () => {
  const rows = [{ '도메인': 'vendor.example', '거래처명': '   ', '구분': '부품', '메모': '' }];
  assert.equal(buildVendorTable(rows).size, 0);
});

test('buildWorkTagTable (required-review item 2): a decomposed-Hangul tag is normalised to NFC', () => {
  const composed = '작업태그';
  const decomposed = composed.normalize('NFD');
  const tags = buildWorkTagTable([{ '태그': decomposed, '설명': '' }]);
  assert.deepEqual(tags, [composed]);
});

test('buildReadingTable (S9, fresh non-author review): a case-only 결정 variant is normalised to its canonical form, not counted as invalid', () => {
  const rows = [{ '메일소스ID': 'm1', '수신일': '', '제목': '', '결정': 'Include', '과제_또는_분류': 'P00-001', '이유': '', '판독자': '', '판독일': '', 'Owner확인': '' }];
  const table = buildReadingTable(rows);
  assert.equal(table.get('m1').level, 'include');
  assert.equal(table.invalidLevelCount, 0);
});

test('buildReadingTable (S9): an unrecognised 결정 value is kept (behaves like hold_owner_review downstream) but counted as invalid', () => {
  const rows = [{ '메일소스ID': 'm1', '수신일': '', '제목': '', '결정': '확인필요', '과제_또는_분류': '', '이유': '', '판독자': '', '판독일': '', 'Owner확인': '' }];
  const table = buildReadingTable(rows);
  assert.equal(table.get('m1').level, '확인필요');
  assert.equal(table.invalidLevelCount, 1);
});

// ------------------------------------------------------ A2 item 1 (2026-09-21 night)
test('loadOwnerTables (A2 item 1): a bundle table written under the current 5-column shape (with 적용끝) loads', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'workspace-ledgers-owner-tables-bundle-v2-'));
  try {
    const bundlePath = path.join(dir, 'bundle.csv');
    writeFileSync(bundlePath, encodeCsv(BUNDLE_HEADERS_V2, [['ABC 회의', 'P00-001', '근거', '2026-09-21', '2026-10-01']]));
    const result = loadOwnerTables({ bundleTablePath: bundlePath });
    assert.deepEqual(result.failures, []);
    assert.equal(result.bundles.length, 1);
    assert.equal(result.bundles[0].appliesUntil, '2026-10-01');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('loadOwnerTables (A2 item 1): a legacy 4-column bundle table (no 적용끝 column at all) still loads, appliesUntil is null (무기한)', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'workspace-ledgers-owner-tables-bundle-legacy-'));
  try {
    const bundlePath = path.join(dir, 'bundle.csv');
    writeFileSync(bundlePath, encodeCsv(BUNDLE_HEADERS, [['ABC 회의', 'P00-001', '근거', '2026-09-21']]));
    const result = loadOwnerTables({ bundleTablePath: bundlePath });
    assert.deepEqual(result.failures, []);
    assert.equal(result.bundles.length, 1);
    assert.equal(result.bundles[0].appliesUntil, null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('buildBundleTable (A2 item 1): a blank 적용끝 cell also parses to appliesUntil: null', () => {
  const rows = [{ '제목구절': 'x', '과제': 'P00-001', '근거': '', '확정일': '', '적용끝': '  ' }];
  assert.equal(buildBundleTable(rows)[0].appliesUntil, null);
});

// ------------------------------------------------------------------------------ S4
test('isValidCalendarDateString: shape-valid but non-existent dates (Feb 30, month 13) are rejected, real dates accepted', () => {
  assert.equal(isValidCalendarDateString('2026-09-15'), true);
  assert.equal(isValidCalendarDateString('2026-02-30'), false); // no such day
  assert.equal(isValidCalendarDateString('2026-13-01'), false); // no such month
  assert.equal(isValidCalendarDateString('2026-9-15'), false); // not zero-padded
  assert.equal(isValidCalendarDateString(''), false);
  assert.equal(isValidCalendarDateString('not-a-date'), false);
});

test('loadOwnerTables (S4, coordinator fresh review round 2): a 적용끝 cell that is shape-valid but not a real calendar date fails the WHOLE bundle table closed', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'workspace-ledgers-owner-tables-s4-'));
  try {
    const bundlePath = path.join(dir, 'bundle.csv');
    writeFileSync(bundlePath, encodeCsv(BUNDLE_HEADERS_V2, [
      ['ABC 회의', 'P00-001', '근거', '2026-09-21', '2026-02-30'],
    ]));
    const result = loadOwnerTables({ bundleTablePath: bundlePath });
    assert.deepEqual(result.bundles, []);
    assert.equal(result.failures.length, 1);
    assert.equal(result.failures[0].code, 'workspace_ledgers_owner_table_bundle_apply_until_invalid');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('loadOwnerTables (S4): a garbage (non-date-shaped) 적용끝 cell also fails the whole bundle table closed', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'workspace-ledgers-owner-tables-s4b-'));
  try {
    const bundlePath = path.join(dir, 'bundle.csv');
    writeFileSync(bundlePath, encodeCsv(BUNDLE_HEADERS_V2, [
      ['ABC 회의', 'P00-001', '근거', '2026-09-21', '아무거나'],
    ]));
    const result = loadOwnerTables({ bundleTablePath: bundlePath });
    assert.deepEqual(result.bundles, []);
    assert.equal(result.failures[0].code, 'workspace_ledgers_owner_table_bundle_apply_until_invalid');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ------------------------------------------------------------------------------ S9
test('loadOwnerTables (S9, coordinator fresh review round 2): a data row with an unquoted embedded comma (more fields than the header) fails closed as workspace_ledgers_owner_table_row_shape', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'workspace-ledgers-owner-tables-rowshape-'));
  try {
    const bundlePath = path.join(dir, 'bundle.csv');
    const bom = String.fromCharCode(0xFEFF);
    // Raw CSV text, not built via `encodeCsv` -- simulates an Owner hand-typing a
    // comma into a cell without quoting it (Excel would quote it automatically; a
    // plain text editor will not), splitting one data row into 5 fields against a
    // 4-column legacy header.
    writeFileSync(bundlePath, `${bom}${BUNDLE_HEADERS.join(',')}\r\n제목, 구절,P00-001,근거,2026-09-21\r\n`);
    const result = loadOwnerTables({ bundleTablePath: bundlePath });
    assert.deepEqual(result.bundles, []);
    assert.equal(result.failures.length, 1);
    assert.equal(result.failures[0].code, 'workspace_ledgers_owner_table_row_shape');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
