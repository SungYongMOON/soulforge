// Synthetic estate only: every fixture is built under os.tmpdir() and removed
// again, and every address, subject and project code here is invented.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { RULE_SCHEMA_VERSION } from '../src/classifier.mjs';
import { encodeCsv } from '../src/ledgers.mjs';
import { BUNDLE_HEADERS, READING_HEADERS, VENDOR_HEADERS } from '../src/owner_tables.mjs';
import { buildMailAttributionIndex, MAIL_ATTRIBUTION_INDEX_SCHEMA, MailAttributionIndexError,
  attributionStrength, baseBasisOf, main } from '../ops/mail_attribution_index.mjs';

const RULE_DIR = '020_MGMT/021_자동화설정_운영규칙';
const VENDOR_DIR = '020_MGMT/023_연락처_이해관계자';
const COMMON_FOLDER = 'P00-000_공통';

function rule(code, folder, terms) {
  return { schema_version: RULE_SCHEMA_VERSION, project_code: code, folder_name: folder, rule_version: 'v1',
    // The shape a real saved rule has. Step 1 is subject-only whatever this says
    // (K1); `body_text` here is what step 4's supplier tie-break is allowed to reach.
    status: 'draft', match_fields: ['subject', 'body_text', 'attachment_names'], case_insensitive_literals: true,
    exact: terms.map(value => ({ label: value, kind: 'literal', value })), hint: [], yields_to: null,
    conflict_policy: 'two_projects_exact_on_one_mail_means_hold_no_attribution', sender_policy: 'hint_only' };
}

const event = ({ id, subject, from, at, body = '' }) => ({ event_id: id, subject, from,
  to: ['me@example.com'], cc: [], received_at: at, body_text: body, attachments: [] });

// One synthetic estate: two projects with subject rules, one supplier, and a
// reading table whose rows exercise every decision level this index has to treat
// differently.
function makeFixture({ readingRows = null, bundleRows = [], ruleJsonOverride = null } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'mail-attribution-index-'));
  const workspacesRoot = path.join(root, '_workspaces');
  const hiworksDir = path.join(root, 'events', 'hiworks');
  const gmailDir = path.join(root, 'events', 'gmail_sent');
  for (const dir of [hiworksDir, gmailDir]) mkdirSync(dir, { recursive: true });

  for (const [code, folder, terms] of [['P00-001', 'P00-001_하나', ['하나사업']], ['P00-002', 'P00-002_둘', ['둘사업']]]) {
    const dir = path.join(workspacesRoot, folder, RULE_DIR);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'mail_routing_rule.json'),
      ruleJsonOverride !== null && code === 'P00-001'
        ? ruleJsonOverride
        : `${JSON.stringify(rule(code, folder, terms), null, 2)}\n`);
  }
  mkdirSync(path.join(workspacesRoot, COMMON_FOLDER, RULE_DIR), { recursive: true });
  mkdirSync(path.join(workspacesRoot, COMMON_FOLDER, VENDOR_DIR), { recursive: true });

  writeFileSync(path.join(hiworksDir, 'events.jsonl'), [
    event({ id: 'm-title', subject: '하나사업 착수 회의', from: 'x@client.example', at: '2026-09-01T01:00:00Z' }),
    event({ id: 'm-held', subject: '하나사업 및 둘사업 합동', from: 'x@client.example', at: '2026-09-01T02:00:00Z' }),
    event({ id: 'm-bundle', subject: '합동 워크숍 정리', from: 'x@client.example', at: '2026-09-01T03:00:00Z' }),
    event({ id: 'm-include', subject: '사람이 확정한 건', from: 'x@client.example', at: '2026-09-01T04:00:00Z' }),
    event({ id: 'm-review', subject: '봇이 제안한 건', from: 'x@client.example', at: '2026-09-01T05:00:00Z' }),
    event({ id: 'm-hold', subject: '판단 보류 건', from: 'x@client.example', at: '2026-09-01T06:00:00Z' }),
    event({ id: 'm-vendoronly', subject: '거래처 전용 건', from: 'sales@supplier.example', at: '2026-09-01T07:00:00Z' }),
    event({ id: 'm-exclude', subject: '과제 아닌 건', from: 'x@client.example', at: '2026-09-01T08:00:00Z' }),
    event({ id: 'm-supplier-plain', subject: '부품 견적 회신', from: 'sales@supplier.example', at: '2026-09-01T09:00:00Z' }),
    event({ id: 'm-supplier-body', subject: '부품 납기 회신', from: 'sales@supplier.example', at: '2026-09-01T10:00:00Z',
      body: '문의하신 하나사업 관련 납기는 다음 주입니다.' }),
    event({ id: 'm-none', subject: '전혀 무관한 안내', from: 'x@client.example', at: '2026-09-01T11:00:00Z' }),
  ].map(row => JSON.stringify(row)).join('\n'));

  const orgConfigPath = path.join(root, 'org_config.json');
  writeFileSync(orgConfigPath, JSON.stringify({ our_domain: 'example.com', organisations: {}, family: {},
    common_ledgers: { common_folder_name: COMMON_FOLDER, general_work_folder_name: 'general_work_일반업무' } }));

  const bundleTablePath = path.join(workspacesRoot, COMMON_FOLDER, RULE_DIR, '묶음_확정표.csv');
  const readingTablePath = path.join(workspacesRoot, COMMON_FOLDER, RULE_DIR, '판독_결정표.csv');
  const vendorTablePath = path.join(workspacesRoot, COMMON_FOLDER, VENDOR_DIR, '거래처_대응표.csv');
  writeFileSync(bundleTablePath, encodeCsv(BUNDLE_HEADERS, bundleRows.length ? bundleRows
    : [['합동 워크숍', 'P00-001', '워크숍 확정', '2026-09-02']]));
  writeFileSync(readingTablePath, encodeCsv(READING_HEADERS, readingRows ?? [
    // Owner확인 filled -> confirmed.
    ['m-include', '2026-09-01', '사람이 확정한 건', 'include', 'P00-001', '사람 확인', 'owner', '2026-09-02', 'OK'],
    // An AI reader's own attribution starts here, and stays unconfirmed.
    ['m-review', '2026-09-01', '봇이 제안한 건', 'include_with_review', 'P00-002', '봇 제안', 'bot', '2026-09-02', ''],
    ['m-hold', '2026-09-01', '판단 보류 건', 'hold_owner_review', 'P00-001?', '모르겠음', 'bot', '2026-09-02', ''],
    ['m-vendoronly', '2026-09-01', '거래처 전용 건', 'vendor_only', '', '거래처만', 'bot', '2026-09-02', ''],
    ['m-exclude', '2026-09-01', '과제 아닌 건', 'exclude', '일반업무', '과제 아님', 'owner', '2026-09-02', 'OK'],
  ]));
  writeFileSync(vendorTablePath, encodeCsv(VENDOR_HEADERS, [['supplier.example', '공급사A', '부품', '']]));

  return { root, workspacesRoot, hiworksDir, gmailDir, orgConfigPath, bundleTablePath, readingTablePath, vendorTablePath };
}

const build = fixture => buildMailAttributionIndex({ workspacesRoot: fixture.workspacesRoot,
  hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
  bundleTablePath: fixture.bundleTablePath, readingTablePath: fixture.readingTablePath,
  vendorTablePath: fixture.vendorTablePath, now: '2026-09-22T00:00:00Z' });

const rowOf = (index, id) => index.attributions.find(row => row.mail_id === id) ?? null;

test('every attribution level lands where the ledgers already put it, and the rest is left alone', () => {
  const fixture = makeFixture();
  try {
    const index = build(fixture);
    assert.equal(index.schema_version, MAIL_ATTRIBUTION_INDEX_SCHEMA);

    // Attributed, and confirmed: the project's own subject rule, the Owner's bundle
    // table, and a reading decision whose Owner확인 cell is filled in.
    assert.deepEqual(rowOf(index, 'm-title'), { mail_id: 'm-title', projects: ['P00-001'], strength: 'confirmed', basis: '제목' });
    assert.deepEqual(rowOf(index, 'm-bundle'), { mail_id: 'm-bundle', projects: ['P00-001'], strength: 'confirmed', basis: '묶음 확정' });
    assert.deepEqual(rowOf(index, 'm-include'), { mail_id: 'm-include', projects: ['P00-001'], strength: 'confirmed', basis: '판독' });

    // Attributed, but nobody has confirmed it -- the flag has to travel.
    assert.deepEqual(rowOf(index, 'm-review'),
      { mail_id: 'm-review', projects: ['P00-002'], strength: 'unconfirmed', basis: '판독(검토 필요)' });
    assert.deepEqual(rowOf(index, 'm-supplier-body'),
      { mail_id: 'm-supplier-body', projects: ['P00-001'], strength: 'unconfirmed', basis: '본문' });

    // Never attributed, each for its own reason.
    for (const id of ['m-held', 'm-hold', 'm-vendoronly', 'm-exclude', 'm-supplier-plain', 'm-none']) {
      assert.equal(rowOf(index, id), null, `${id} must not be attributed`);
    }
    assert.equal(index.counts.held_two_projects, 1);
    assert.equal(index.counts.attributed, 5);
    assert.equal(index.counts.confirmed, 3);
    assert.equal(index.counts.unconfirmed, 2);
    assert.equal(index.counts.records, 11);
    assert.deepEqual(index.counts.by_project, {
      'P00-001': { confirmed: 3, unconfirmed: 1 }, 'P00-002': { confirmed: 0, unconfirmed: 1 },
    });
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('a supplier address on its own attributes nothing -- step 4 also needs the project’s own term in the body', () => {
  const fixture = makeFixture();
  try {
    const index = build(fixture);
    // Same sender, same vendor, same supplier kind: one names a project in its body
    // and the other does not, and only the first is attributed.
    assert.equal(rowOf(index, 'm-supplier-plain'), null);
    assert.equal(rowOf(index, 'm-supplier-body').projects[0], 'P00-001');
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('the same estate builds the same index twice -- only the build time differs', () => {
  const fixture = makeFixture();
  try {
    const first = build(fixture), second = build(fixture);
    assert.deepEqual(second.attributions, first.attributions);
    assert.deepEqual(second.counts, first.counts);
    assert.deepEqual(second.inputs, first.inputs);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('a mail moved to another project, or out of every project, is reflected on the next build', () => {
  const fixture = makeFixture();
  try {
    assert.equal(rowOf(build(fixture), 'm-include').projects[0], 'P00-001');
    // The Owner corrects the reading table: the same mail is now the other project's.
    writeFileSync(fixture.readingTablePath, encodeCsv(READING_HEADERS, [
      ['m-include', '2026-09-01', '사람이 확정한 건', 'include', 'P00-002', '정정', 'owner', '2026-09-03', 'OK'],
    ]));
    const moved = build(fixture);
    assert.deepEqual(rowOf(moved, 'm-include').projects, ['P00-002']);
    // And now the Owner decides it is no project's at all.
    writeFileSync(fixture.readingTablePath, encodeCsv(READING_HEADERS, [
      ['m-include', '2026-09-01', '사람이 확정한 건', 'exclude', '일반업무', '과제 아님', 'owner', '2026-09-04', 'OK'],
    ]));
    assert.equal(rowOf(build(fixture), 'm-include'), null);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('a malformed Owner table fails the build closed, and a rule that will not compile does too', () => {
  const broken = makeFixture();
  try {
    writeFileSync(broken.readingTablePath, 'these,are,not,the,headers\n1,2,3,4,5\n');
    assert.throws(() => build(broken), error => error instanceof MailAttributionIndexError
      && error.code === 'workspace_ledgers_attribution_owner_table_failures');
  } finally { rmSync(broken.root, { recursive: true, force: true }); }

  const badRule = makeFixture({ ruleJsonOverride: '{ not json at all\n' });
  try {
    assert.throws(() => build(badRule), error => error instanceof MailAttributionIndexError
      && error.code === 'workspace_ledgers_attribution_rule_failures');
  } finally { rmSync(badRule.root, { recursive: true, force: true }); }
});

test('no subject, body, address or Owner free text leaves the builder', () => {
  const fixture = makeFixture();
  try {
    const text = JSON.stringify(build(fixture));
    for (const secret of ['하나사업 착수', '봇이 제안한 건', 'supplier.example', 'client.example',
      '사람 확인', '워크숍 확정', '납기는 다음 주']) {
      assert.ok(!text.includes(secret), `index leaked ${secret}`);
    }
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('the CLI writes the index where it was told, and --dry writes nothing at all', () => {
  const fixture = makeFixture();
  try {
    const out = path.join(fixture.root, 'out', 'mail_attribution_index.json');
    const args = ['--workspaces-root', fixture.workspacesRoot, '--org-config', fixture.orgConfigPath,
      '--hiworks-events', fixture.hiworksDir, '--gmail-sent-events', fixture.gmailDir];
    assert.equal(main([...args, '--dry']), 0);
    assert.equal(existsSync(out), false);
    assert.equal(main([...args, '--out', out]), 0);
    const written = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(written.schema_version, MAIL_ATTRIBUTION_INDEX_SCHEMA);
    assert.equal(written.counts.attributed, written.attributions.length);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('a basis this builder does not know is refused rather than guessed at', () => {
  assert.equal(baseBasisOf('제목(같은 대화의 거래처)'), '제목');
  assert.equal(attributionStrength({ held: true, hits: [{ project_code: 'P00-001' }], basis: '제목' }), null);
  assert.equal(attributionStrength({ held: false, hits: [], basis: '미정' }), null);
  assert.throws(() => attributionStrength({ held: false, hits: [{ project_code: 'P00-001' }], basis: '새로운근거' }),
    error => error.code === 'workspace_ledgers_attribution_basis_unknown');
});
