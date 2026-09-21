import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { RULE_SCHEMA_VERSION } from '../src/classifier.mjs';
import { decodeCsv, encodeCsv } from '../src/ledgers.mjs';
import { listProjects } from '../src/rule_store.mjs';
import { PRIMARY_BUCKETS } from '../src/common_classifier.mjs';
import { BUNDLE_HEADERS, READING_HEADERS, VENDOR_HEADERS, WORKTAG_HEADERS } from '../src/owner_tables.mjs';
import { classifyAllCommonMail, CommonRefreshError, refreshCommon } from '../src/common_refresh.mjs';

function rule(code, folder, exactPairs) {
  return {
    schema_version: RULE_SCHEMA_VERSION, project_code: code, folder_name: folder, rule_version: 'v1', status: 'draft',
    match_fields: ['subject', 'body_text', 'attachment_names'], case_insensitive_literals: true,
    exact: exactPairs.map(([label, value]) => ({ label, kind: 'literal', value })), hint: [],
    yields_to: null, conflict_policy: 'two_projects_exact_on_one_mail_means_hold_no_attribution', sender_policy: 'hint_only',
  };
}

const COMMON_FOLDER = 'P00-000_공통';
const GENERAL_WORK_FOLDER = 'general_work_일반업무';
const KNOWLEDGE_FOLDER = 'K00-000_지식자료';
const RULE_DIR = '020_MGMT/021_자동화설정_운영규칙';
const LEDGER_DIR = '020_MGMT/027_수신이력_이동이력';
const ORG_TABLE_DIR = '020_MGMT/021_자동화설정_운영규칙';
const VENDOR_TABLE_DIR = '020_MGMT/023_연락처_이해관계자';

function jsonl(lines) { return lines.map(line => JSON.stringify(line)).join('\n'); }
function event({ id, subject, from, at, body = '' }) {
  return { event_id: id, subject, from, to: ['me@example.com'], cc: [], received_at: at, body_text: body, attachments: [] };
}

function makeFixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'workspace-ledgers-common-refresh-'));
  const workspacesRoot = path.join(root, '_workspaces');
  const workmetaRoot = path.join(root, '_workmeta');
  const hiworksDir = path.join(root, 'events', 'hiworks');
  const gmailDir = path.join(root, 'events', 'gmail_sent');
  const receiptsDir = path.join(root, 'receipts');
  for (const dir of [hiworksDir, gmailDir, receiptsDir]) mkdirSync(dir, { recursive: true });

  const folderA = 'P00-001_예시과제';
  const ruleDirA = path.join(workspacesRoot, folderA, RULE_DIR);
  mkdirSync(ruleDirA, { recursive: true });
  writeFileSync(path.join(ruleDirA, 'mail_routing_rule.json'),
    `${JSON.stringify(rule('P00-001', folderA, [['P00-001', 'P00-001']]), null, 2)}\n`);
  const folderB = 'P00-002_다른과제';
  const ruleDirB = path.join(workspacesRoot, folderB, RULE_DIR);
  mkdirSync(ruleDirB, { recursive: true });
  writeFileSync(path.join(ruleDirB, 'mail_routing_rule.json'),
    `${JSON.stringify(rule('P00-002', folderB, [['P00-002', 'P00-002']]), null, 2)}\n`);

  // Common / general-work / knowledge folders exist but carry no mail_routing_rule.json
  // -- spec section 1 item 4: only a folder with that file is a project.
  mkdirSync(path.join(workspacesRoot, COMMON_FOLDER, ORG_TABLE_DIR), { recursive: true });
  mkdirSync(path.join(workspacesRoot, COMMON_FOLDER, VENDOR_TABLE_DIR), { recursive: true });
  mkdirSync(path.join(workspacesRoot, GENERAL_WORK_FOLDER), { recursive: true });
  mkdirSync(path.join(workspacesRoot, KNOWLEDGE_FOLDER), { recursive: true });

  const events = [
    event({ id: 'h-project', subject: '[P00-001] 예시 프로젝트 안내', from: 'staff@client.example', at: '2026-09-01T01:00:00Z' }),
    event({ id: 'h-held', subject: 'P00-001 그리고 P00-002 같이 언급', from: 'staff@client.example', at: '2026-09-01T02:00:00Z' }),
    event({ id: 'h-system', subject: '알림 발송', from: 'noreply@sys.example', at: '2026-09-01T03:00:00Z' }),
    event({ id: 'h-ads', subject: '(광고) 특가 안내', from: 'promo@ads.example', at: '2026-09-01T04:00:00Z' }),
    event({ id: 'h-admin-own', subject: '9월 급여명세서 발송', from: 'hr@example.com', at: '2026-09-01T05:00:00Z' }),
    event({ id: 'h-notice-agency', subject: '기관 공지', from: 'official@agency.example', at: '2026-09-01T06:00:00Z' }),
    event({ id: 'h-outproject', subject: '발주서 송부', from: 'x@client.example', at: '2026-09-01T07:00:00Z' }),
    event({ id: 'h-codepending', subject: '신규과제후보 검토요청', from: 'x@client.example', at: '2026-09-01T08:00:00Z' }),
    event({ id: 'r-general', subject: '단발 지원 요청', from: 'x@client.example', at: '2026-09-01T09:00:00Z' }),
    event({ id: 'r-nocode', subject: '보류 대상 확인', from: 'x@client.example', at: '2026-09-01T10:00:00Z' }),
    event({ id: 'r-vendoronly', subject: '거래처 전용 메일', from: 'sales@vendor.example', at: '2026-09-01T11:00:00Z' }),
    event({ id: 'h-unclassified', subject: '전혀 무관한 안내', from: 'x@client.example', at: '2026-09-01T12:00:00Z' }),
    event({ id: 'h-vendor-secondary', subject: '[SMT] 부품 관련 문의', from: 'sales@vendor.example', at: '2026-09-01T13:00:00Z' }),
  ];
  writeFileSync(path.join(hiworksDir, 'events.jsonl'), jsonl(events));

  const orgConfigPath = path.join(root, 'org_config.json');
  writeFileSync(orgConfigPath, JSON.stringify({
    our_domain: 'example.com', organisations: {}, family: {},
    common_ledgers: {
      common_folder_name: COMMON_FOLDER, general_work_folder_name: GENERAL_WORK_FOLDER,
      system_notification_sources: [{ name: '시스템X', sender_domains: ['sys.example'] }],
      ads_sender_domains: ['ads.example'],
      agency_notice_sender_domains: ['agency.example'],
      internal_admin_subject_patterns: [{ label: '급여', pattern: '급여명세서' }],
      out_of_project_subject_patterns: [{ label: '구매', pattern: '발주서' }],
      code_pending_subject_patterns: [{ label: '후보', pattern: '신규과제후보' }],
    },
  }));

  const bundleTablePath = path.join(workspacesRoot, COMMON_FOLDER, ORG_TABLE_DIR, '묶음_확정표.csv');
  const readingTablePath = path.join(workspacesRoot, COMMON_FOLDER, ORG_TABLE_DIR, '판독_결정표.csv');
  const workTagTablePath = path.join(workspacesRoot, COMMON_FOLDER, ORG_TABLE_DIR, '작업태그_목록.csv');
  const vendorTablePath = path.join(workspacesRoot, COMMON_FOLDER, VENDOR_TABLE_DIR, '거래처_대응표.csv');
  writeFileSync(bundleTablePath, encodeCsv(BUNDLE_HEADERS, []));
  writeFileSync(readingTablePath, encodeCsv(READING_HEADERS, [
    ['r-general', '2026-09-01', '단발 지원 요청', 'exclude', '일반업무:단발 지원', '지원 업무', 'tester', '2026-09-21', ''],
    ['r-nocode', '2026-09-01', '보류 대상 확인', 'exclude', '과제없음', '과제 미확인', 'tester', '2026-09-21', ''],
    ['r-vendoronly', '2026-09-01', '거래처 전용 메일', 'vendor_only', '', '거래처 전용', 'tester', '2026-09-21', ''],
  ]));
  writeFileSync(workTagTablePath, encodeCsv(WORKTAG_HEADERS, [['SMT', '보드 실장']]));
  writeFileSync(vendorTablePath, encodeCsv(VENDOR_HEADERS, [['vendor.example', '거래처A', '부품', '']]));

  return {
    root, workspacesRoot, workmetaRoot, hiworksDir, gmailDir, receiptsDir, orgConfigPath,
    bundleTablePath, readingTablePath, workTagTablePath, vendorTablePath,
  };
}

test('spec section 1 item 4: only a folder with a 021 mail_routing_rule.json is a project -- common/general-work/knowledge folders are not', () => {
  const fixture = makeFixture();
  try {
    const projects = listProjects({ workspacesRoot: fixture.workspacesRoot });
    const codes = projects.map(project => project.project_code).sort();
    assert.deepEqual(codes, ['P00-001', 'P00-002']);
    assert.ok(!projects.some(project => project.folder_name === COMMON_FOLDER));
    assert.ok(!projects.some(project => project.folder_name === GENERAL_WORK_FOLDER));
    assert.ok(!projects.some(project => project.folder_name === KNOWLEDGE_FOLDER));
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('classifyAllCommonMail: every primary bucket is reachable and the reconciliation invariant holds (sum of primary buckets == deduped mail count)', () => {
  const fixture = makeFixture();
  try {
    const pass = classifyAllCommonMail({
      workspacesRoot: fixture.workspacesRoot, hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir],
      orgConfigPath: fixture.orgConfigPath, bundleTablePath: fixture.bundleTablePath, vendorTablePath: fixture.vendorTablePath,
      readingTablePath: fixture.readingTablePath, workTagTablePath: fixture.workTagTablePath,
    });
    assert.equal(pass.totalMails, 13);
    assert.deepEqual(pass.ruleFailures, []);
    assert.deepEqual(pass.ownerTableFailures, []);
    const sum = PRIMARY_BUCKETS.reduce((total, bucket) => total + pass.bucketTally[bucket], 0);
    assert.equal(sum, pass.totalMails);
    assert.equal(pass.bucketTally.project, 1);
    assert.equal(pass.bucketTally.held, 1);
    assert.equal(pass.bucketTally.system, 1);
    assert.equal(pass.bucketTally.ads, 1);
    assert.equal(pass.bucketTally.internal_admin, 1);
    assert.equal(pass.bucketTally.external_notice, 1);
    assert.equal(pass.bucketTally.out_of_project, 1);
    assert.equal(pass.bucketTally.code_pending, 1);
    assert.equal(pass.bucketTally.general_work, 1);
    assert.equal(pass.bucketTally.no_code_confirmed, 1);
    assert.equal(pass.bucketTally.vendor_only, 1);
    // h-vendor-secondary touches a known vendor with no project/hold/reading decision
    // -- organisation_undecided (coordinator correction), not 미분류; only
    // h-unclassified (no vendor, no signal at all) is truly unclassified.
    assert.equal(pass.bucketTally.organisation_undecided, 1);
    assert.equal(pass.bucketTally.unclassified, 1);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('refreshCommon: writes the expected primary-bucket and secondary-view ledgers with the spec headers', () => {
  const fixture = makeFixture();
  try {
    const receipt = refreshCommon({
      workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot, hiworksDirs: [fixture.hiworksDir],
      gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath, bundleTablePath: fixture.bundleTablePath,
      vendorTablePath: fixture.vendorTablePath, readingTablePath: fixture.readingTablePath, workTagTablePath: fixture.workTagTablePath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-21T00:00:00.000Z',
    });
    assert.equal(receipt.status, 'ok');
    assert.equal(receipt.total_mails, 13);

    const commonBase = path.join(fixture.workspacesRoot, COMMON_FOLDER, LEDGER_DIR);
    const generalWorkBase = path.join(fixture.workspacesRoot, GENERAL_WORK_FOLDER, LEDGER_DIR);

    const unclassified = decodeCsv(readFileSync(path.join(commonBase, '미분류.csv'), 'utf8'));
    assert.equal(unclassified.rows.length, 1); // h-vendor-secondary is organisation_undecided, not 미분류 (coordinator correction)
    assert.deepEqual(unclassified.headers, ['이력키', '분류', '수신시각', '제목', '발신자', '발신자메일', '첨부수', '메일소스ID', '원문복사여부', '메모']);

    const held = decodeCsv(readFileSync(path.join(commonBase, '보류.csv'), 'utf8'));
    assert.equal(held.rows.length, 1);

    const admin = decodeCsv(readFileSync(path.join(commonBase, '사내행정.csv'), 'utf8'));
    assert.equal(admin.rows.length, 1);
    assert.deepEqual(admin.headers, ['이력키', '분류', '세부분류', '수신시각', '제목', '발신자', '발신자메일', '첨부수', '메일소스ID', '원문복사여부', '메모']);
    assert.equal(admin.rows[0][2], '급여');

    const notice = decodeCsv(readFileSync(path.join(commonBase, '외부안내.csv'), 'utf8'));
    assert.equal(notice.rows.length, 1);
    assert.equal(notice.rows[0][2], '기관 안내');

    const outOfProject = decodeCsv(readFileSync(path.join(commonBase, '과제외_구매.csv'), 'utf8'));
    assert.equal(outOfProject.rows.length, 1);

    const codePending = decodeCsv(readFileSync(path.join(commonBase, '과제코드대기.csv'), 'utf8'));
    assert.equal(codePending.rows.length, 1);
    assert.equal(codePending.rows[0][2], '후보');

    const noCodeConfirmed = decodeCsv(readFileSync(path.join(commonBase, '과제없음_확인함.csv'), 'utf8'));
    assert.equal(noCodeConfirmed.rows.length, 1);

    const generalWork = decodeCsv(readFileSync(path.join(generalWorkBase, '일반업무_메일.csv'), 'utf8'));
    assert.equal(generalWork.rows.length, 1);
    assert.equal(generalWork.rows[0][2], '단발 지원');

    const system = decodeCsv(readFileSync(path.join(commonBase, '시스템알림_시스템X.csv'), 'utf8'));
    assert.equal(system.rows.length, 1);

    // vendor_only ("거래처 전용 메일") and ads ("(광고)") never get a dedicated primary file.
    assert.throws(() => readFileSync(path.join(commonBase, '거래처만.csv'), 'utf8'));

    // Secondary vendor view: both vendor-touched mails (r-vendoronly, h-vendor-secondary) show up, with distinct 과제 cells.
    const vendorView = decodeCsv(readFileSync(path.join(commonBase, '거래처_거래처A.csv'), 'utf8'));
    assert.equal(vendorView.rows.length, 2);
    assert.deepEqual(vendorView.headers, ['이력키', '분류', '과제', '과제근거', '수신시각', '제목', '발신자', '발신자메일', '첨부수', '메일소스ID', '원문복사여부', '메모']);
    const vendorProjectCells = vendorView.rows.map(row => row[2]).sort();
    assert.deepEqual(vendorProjectCells, ['거래처만', '미정']);
    // the organisation_undecided row (h-vendor-secondary) carries the fixed
    // basis "거래처(자동)", never classifyProjectHits' own '미정' text.
    const orgUndecidedRow = vendorView.rows.find(row => row[2] === '미정');
    assert.equal(orgUndecidedRow[3], '거래처(자동)');

    // Secondary work-tag view: only h-vendor-secondary carries [SMT].
    const workView = decodeCsv(readFileSync(path.join(commonBase, '작업_SMT.csv'), 'utf8'));
    assert.equal(workView.rows.length, 1);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('refreshCommon: Owner-entered 메모 cell survives a second refresh (preserved by 이력키)', () => {
  const fixture = makeFixture();
  try {
    refreshCommon({
      workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot, hiworksDirs: [fixture.hiworksDir],
      gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath, bundleTablePath: fixture.bundleTablePath,
      vendorTablePath: fixture.vendorTablePath, readingTablePath: fixture.readingTablePath, workTagTablePath: fixture.workTagTablePath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-21T00:00:00.000Z',
    });
    const commonBase = path.join(fixture.workspacesRoot, COMMON_FOLDER, LEDGER_DIR);
    const filePath = path.join(commonBase, '미분류.csv');
    const decoded = decodeCsv(readFileSync(filePath, 'utf8'));
    decoded.rows[0][decoded.rows[0].length - 1] = 'Owner 메모: 확인 필요';
    writeFileSync(filePath, encodeCsv(decoded.headers, decoded.rows));

    const receipt = refreshCommon({
      workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot, hiworksDirs: [fixture.hiworksDir],
      gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath, bundleTablePath: fixture.bundleTablePath,
      vendorTablePath: fixture.vendorTablePath, readingTablePath: fixture.readingTablePath, workTagTablePath: fixture.workTagTablePath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-21T01:00:00.000Z',
    });
    assert.equal(receipt.status, 'ok');
    const after = decodeCsv(readFileSync(filePath, 'utf8'));
    const memoValues = after.rows.map(row => row[row.length - 1]);
    assert.ok(memoValues.includes('Owner 메모: 확인 필요'));
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('refreshCommon --dry writes a receipt but never touches disk', () => {
  const fixture = makeFixture();
  try {
    const receipt = refreshCommon({
      workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot, hiworksDirs: [fixture.hiworksDir],
      gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath, bundleTablePath: fixture.bundleTablePath,
      vendorTablePath: fixture.vendorTablePath, readingTablePath: fixture.readingTablePath, workTagTablePath: fixture.workTagTablePath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-21T00:00:00.000Z', dry: true,
    });
    assert.equal(receipt.dry, true);
    assert.equal(receipt.status, 'ok');
    const commonBase = path.join(fixture.workspacesRoot, COMMON_FOLDER, LEDGER_DIR);
    assert.throws(() => readFileSync(path.join(commonBase, '미분류.csv'), 'utf8'));
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('refreshCommon (R4, fresh non-author review): a header-mismatched Owner table blocks EVERY common-folder ledger write, not just the affected one', () => {
  const fixture = makeFixture();
  try {
    writeFileSync(fixture.vendorTablePath, encodeCsv(['잘못된헤더'], [['x']]));
    const receipt = refreshCommon({
      workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot, hiworksDirs: [fixture.hiworksDir],
      gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath, bundleTablePath: fixture.bundleTablePath,
      vendorTablePath: fixture.vendorTablePath, readingTablePath: fixture.readingTablePath, workTagTablePath: fixture.workTagTablePath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-21T00:00:00.000Z',
    });
    assert.equal(receipt.status, 'failed');
    assert.equal(receipt.owner_table_failures.length, 1);
    assert.equal(receipt.owner_table_failures[0].code, 'workspace_ledgers_owner_table_header_mismatch');
    assert.deepEqual(receipt.files, []);
    // R4: NOTHING is written this run -- not even 미분류.csv, which the (broken)
    // vendor table has no direct bearing on. Writing it anyway while the vendor
    // table's own ledgers go stale is exactly the "same mail in two ledgers on disk"
    // bug this gate exists to prevent.
    const commonBase = path.join(fixture.workspacesRoot, COMMON_FOLDER, LEDGER_DIR);
    assert.throws(() => readFileSync(path.join(commonBase, '미분류.csv'), 'utf8'));
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('refreshCommon (R4): allowDegradedOwnerTables: true opts back into writing despite a malformed Owner table', () => {
  const fixture = makeFixture();
  try {
    writeFileSync(fixture.vendorTablePath, encodeCsv(['잘못된헤더'], [['x']]));
    const receipt = refreshCommon({
      workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot, hiworksDirs: [fixture.hiworksDir],
      gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath, bundleTablePath: fixture.bundleTablePath,
      vendorTablePath: fixture.vendorTablePath, readingTablePath: fixture.readingTablePath, workTagTablePath: fixture.workTagTablePath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-21T00:00:00.000Z', allowDegradedOwnerTables: true,
    });
    assert.equal(receipt.status, 'failed'); // still failed (owner_table_failures non-empty), but files ARE written
    assert.ok(receipt.files.length > 0);
    const commonBase = path.join(fixture.workspacesRoot, COMMON_FOLDER, LEDGER_DIR);
    assert.doesNotThrow(() => readFileSync(path.join(commonBase, '미분류.csv'), 'utf8'));
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('classifyAllCommonMail (coordinator, 2026-09-21): --hiworks-events and --gmail-sent-events pointing at the same real directory are rejected before any classification, mirroring refresh()\'s S-4 guard', () => {
  const fixture = makeFixture();
  try {
    assert.throws(() => classifyAllCommonMail({
      workspacesRoot: fixture.workspacesRoot, hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.hiworksDir],
      orgConfigPath: fixture.orgConfigPath, bundleTablePath: fixture.bundleTablePath, vendorTablePath: fixture.vendorTablePath,
      readingTablePath: fixture.readingTablePath, workTagTablePath: fixture.workTagTablePath,
    }), error => error instanceof CommonRefreshError && error.code === 'workspace_ledgers_custody_dirs_overlap');
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('classifyAllCommonMail (spec section 2, thread-vendor inheritance): an internal forward carrying no vendor address of its own still inherits the vendor from another mail in the same normalised-subject thread', () => {
  const fixture = makeFixture();
  try {
    writeFileSync(path.join(fixture.hiworksDir, 'thread-vendor.jsonl'), jsonl([
      // Direct hit: from the vendor's own address.
      event({ id: 'v-direct', subject: 'ABC 협의', from: 'sales@vendor.example', at: '2026-09-01T20:00:00Z' }),
      // Same conversation, forwarded internally -- no vendor address anywhere on this
      // mail's own from/to/cc, only the normalised subject ties it to the thread above.
      event({ id: 'v-forward', subject: 'Fwd: ABC 협의', from: 'colleague@example.com', at: '2026-09-01T20:05:00Z' }),
    ]));
    const vendorTablePath = path.join(fixture.root, 'vendor2.csv');
    writeFileSync(vendorTablePath, encodeCsv(VENDOR_HEADERS, [['vendor.example', '거래처A', '부품', '']]));

    const pass = classifyAllCommonMail({
      workspacesRoot: fixture.workspacesRoot, hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir],
      orgConfigPath: fixture.orgConfigPath, vendorTablePath,
    });
    const direct = pass.classified.find(entry => entry.mail.event_id === 'v-direct');
    const forwarded = pass.classified.find(entry => entry.mail.event_id === 'v-forward');
    assert.deepEqual(direct.projectResult.vendors.map(v => v.name), ['거래처A']);
    // Without inheritance this would be 'unclassified' (no vendor address of its own).
    assert.deepEqual(forwarded.projectResult.vendors.map(v => v.name), ['거래처A']);
    assert.equal(forwarded.outcome.bucket, 'organisation_undecided');
    assert.match(forwarded.projectResult.basis, /같은 대화의 거래처/);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('classifyAllCommonMail (S4, fresh non-author review): a generic shared subject does NOT inherit an unrelated organisation -- no shared participant and >30 days apart', () => {
  const fixture = makeFixture();
  try {
    writeFileSync(path.join(fixture.hiworksDir, 'thread-vendor-negative.jsonl'), jsonl([
      { event_id: 'g-direct', subject: '회의 안내', from: 'sales@vendor.example', to: ['teamA@example.com'], cc: [], received_at: '2026-01-01T00:00:00Z', body_text: '', attachments: [] },
      { event_id: 'g-unrelated', subject: '회의 안내', from: 'someoneElse@client.example', to: ['teamB@example.com'], cc: [], received_at: '2026-06-01T00:00:00Z', body_text: '', attachments: [] },
    ]));
    const vendorTablePath = path.join(fixture.root, 'vendor3.csv');
    writeFileSync(vendorTablePath, encodeCsv(VENDOR_HEADERS, [['vendor.example', '거래처B', '부품', '']]));

    const pass = classifyAllCommonMail({
      workspacesRoot: fixture.workspacesRoot, hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir],
      orgConfigPath: fixture.orgConfigPath, vendorTablePath,
    });
    const unrelated = pass.classified.find(entry => entry.mail.event_id === 'g-unrelated');
    assert.equal(unrelated.projectResult.vendors.length, 0); // no participant overlap, >30 days apart -- must not inherit 거래처B
    assert.equal(unrelated.outcome.bucket, 'unclassified');
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('refreshCommon (R2, fresh non-author review): a path-traversal-shaped vendor name is rejected, never written outside the ledger folder', () => {
  const fixture = makeFixture();
  try {
    writeFileSync(path.join(fixture.hiworksDir, 'traversal.jsonl'), jsonl([
      event({ id: 'trav-1', subject: '완전히 무관한 제목', from: 'sales@traversal.example', at: '2026-09-01T14:00:00Z' }),
    ]));
    writeFileSync(fixture.vendorTablePath, encodeCsv(VENDOR_HEADERS, [['traversal.example', '../../../../escape', '부품', '']]));

    const receipt = refreshCommon({
      workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot, hiworksDirs: [fixture.hiworksDir],
      gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath, bundleTablePath: fixture.bundleTablePath,
      vendorTablePath: fixture.vendorTablePath, readingTablePath: fixture.readingTablePath, workTagTablePath: fixture.workTagTablePath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-21T00:00:00.000Z',
    });
    assert.equal(receipt.status, 'failed');
    assert.ok(receipt.rejected_files.some(entry => entry.code === 'workspace_ledgers_ledger_name_unsafe'));
    // never wrote anything outside the intended base -- the escape target (four
    // levels up from the ledger folder) must not exist.
    const escapedPath = path.resolve(fixture.workspacesRoot, COMMON_FOLDER, LEDGER_DIR, '../../../../escape.csv');
    assert.throws(() => readFileSync(escapedPath, 'utf8'));
    // and no file literally named with the raw traversal text landed inside the ledger folder either.
    const commonBase = path.join(fixture.workspacesRoot, COMMON_FOLDER, LEDGER_DIR);
    assert.ok(!readdirSync(commonBase).some(name => name.includes('..')));
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('refreshCommon (R3, fresh non-author review): two vendor names differing only by letter case are rejected as a collision, neither written', () => {
  const fixture = makeFixture();
  try {
    writeFileSync(path.join(fixture.hiworksDir, 'case-collision.jsonl'), jsonl([
      event({ id: 'case-1', subject: '완전히 무관한 제목 A', from: 'a@case-x.example', at: '2026-09-01T14:00:00Z' }),
      event({ id: 'case-2', subject: '완전히 무관한 제목 B', from: 'b@case-y.example', at: '2026-09-01T15:00:00Z' }),
    ]));
    writeFileSync(fixture.vendorTablePath, encodeCsv(VENDOR_HEADERS, [
      ['case-x.example', 'CaseVendor', '부품', ''],
      ['case-y.example', 'casevendor', '부품', ''],
    ]));

    const receipt = refreshCommon({
      workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot, hiworksDirs: [fixture.hiworksDir],
      gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath, bundleTablePath: fixture.bundleTablePath,
      vendorTablePath: fixture.vendorTablePath, readingTablePath: fixture.readingTablePath, workTagTablePath: fixture.workTagTablePath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-21T00:00:00.000Z',
    });
    assert.equal(receipt.status, 'failed');
    const collisions = receipt.rejected_files.filter(entry => entry.code === 'workspace_ledgers_ledger_name_case_collision');
    assert.equal(collisions.length, 2); // both variants rejected, neither privileged over the other
    const commonBase = path.join(fixture.workspacesRoot, COMMON_FOLDER, LEDGER_DIR);
    assert.throws(() => readFileSync(path.join(commonBase, '거래처_CaseVendor.csv'), 'utf8'));
    assert.throws(() => readFileSync(path.join(commonBase, '거래처_casevendor.csv'), 'utf8'));
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('refreshCommon (R5, fresh non-author review): an unreadable custody directory blocks every write unless allowPartialSources is set, and partialSourcesInEffect only when it actually applies', () => {
  const fixture = makeFixture();
  try {
    const missingDir = path.join(fixture.root, 'does-not-exist');
    const blocked = refreshCommon({
      workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot, hiworksDirs: [fixture.hiworksDir, missingDir],
      gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath, bundleTablePath: fixture.bundleTablePath,
      vendorTablePath: fixture.vendorTablePath, readingTablePath: fixture.readingTablePath, workTagTablePath: fixture.workTagTablePath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-21T00:00:00.000Z',
    });
    assert.equal(blocked.status, 'failed');
    assert.equal(blocked.unreadable_dirs.length, 1);
    assert.deepEqual(blocked.files, []);
    assert.equal(blocked.allow_partial_sources_applied, false);
    const commonBase = path.join(fixture.workspacesRoot, COMMON_FOLDER, LEDGER_DIR);
    assert.throws(() => readFileSync(path.join(commonBase, '미분류.csv'), 'utf8'));

    const allowed = refreshCommon({
      workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot, hiworksDirs: [fixture.hiworksDir, missingDir],
      gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath, bundleTablePath: fixture.bundleTablePath,
      vendorTablePath: fixture.vendorTablePath, readingTablePath: fixture.readingTablePath, workTagTablePath: fixture.workTagTablePath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-21T01:00:00.000Z', allowPartialSources: true,
    });
    assert.equal(allowed.allow_partial_sources_applied, true);
    assert.ok(allowed.files.length > 0);

    // partialSourcesInEffect is FALSE (not merely the flag being passed) when every
    // custody directory actually IS readable -- a normal, fully-readable run.
    const fullyReadable = refreshCommon({
      workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot, hiworksDirs: [fixture.hiworksDir],
      gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath, bundleTablePath: fixture.bundleTablePath,
      vendorTablePath: fixture.vendorTablePath, readingTablePath: fixture.readingTablePath, workTagTablePath: fixture.workTagTablePath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-21T02:00:00.000Z', allowPartialSources: true,
    });
    assert.equal(fullyReadable.allow_partial_sources_applied, false);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('refreshCommon (S3, fresh non-author review): a vendor_only reading decision with no matched organisation is counted in the receipt, not silently dropped', () => {
  const fixture = makeFixture();
  try {
    writeFileSync(path.join(fixture.hiworksDir, 's3.jsonl'), jsonl([
      event({ id: 's3-noorg', subject: '완전히 무관한 제목', from: 'x@client.example', at: '2026-09-01T14:00:00Z' }),
    ]));
    writeFileSync(fixture.readingTablePath, encodeCsv(READING_HEADERS, [
      ['s3-noorg', '2026-09-01', '완전히 무관한 제목', 'vendor_only', '', '거래처 표기 없음', 'tester', '2026-09-21', ''],
    ]));
    const receipt = refreshCommon({
      workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot, hiworksDirs: [fixture.hiworksDir],
      gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath, bundleTablePath: fixture.bundleTablePath,
      vendorTablePath: fixture.vendorTablePath, readingTablePath: fixture.readingTablePath, workTagTablePath: fixture.workTagTablePath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-21T00:00:00.000Z',
    });
    assert.ok(receipt.vendor_only_without_organisation >= 1);
    assert.equal(receipt.bucket_counts.vendor_only, 0); // never routes there without an organisation match
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});
