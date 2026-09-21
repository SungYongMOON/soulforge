import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { encodeCsv } from '../src/ledgers.mjs';
import {
  BUNDLE_HEADERS, buildBundleTable, buildReadingTable, buildVendorTable, buildWorkTagTable,
  loadOwnerTables, READING_HEADERS, VENDOR_HEADERS, WORKTAG_HEADERS,
} from '../src/owner_tables.mjs';

function tmpFile(name) {
  const dir = mkdtempSync(path.join(tmpdir(), 'workspace-ledgers-owner-tables-'));
  return { dir, filePath: path.join(dir, name) };
}

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

test('buildVendorTable: keyed by lowercased 도메인(또는 주소 전체)', () => {
  const rows = [{ '도메인(또는 주소 전체)': 'Vendor.Example', '거래처명': 'Vendor Co', '구분': '부품', '메모': '' }];
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
