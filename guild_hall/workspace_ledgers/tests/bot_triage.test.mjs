// Every guardrail `ops/bot_triage.mjs` exists to enforce, proved against a synthetic
// custody/workspace plane under os.tmpdir() -- never a real one.
//
// Linux/Windows: nothing here asserts a path separator, a drive letter or an errno.
// Paths are built with path.join and compared by basename or by `existsSync`.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { RULE_SCHEMA_VERSION } from '../src/classifier.mjs';
import { decodeCsv, encodeCsv } from '../src/ledgers.mjs';
import { READING_HEADERS } from '../src/owner_tables.mjs';
import {
  assertReceiptsWritable, BOT_ALLOWED_LEVELS, BOT_TRIAGE_CONFIG_SCHEMA, BOT_TRIAGE_RECEIPT_SCHEMA,
  botExcludeTargets, isValidMailId, maskAddresses, MAX_MAIL_ID_CHARS, recipientLabel, runCli,
} from '../ops/bot_triage.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BOT_TRIAGE = path.join(HERE, '..', 'ops', 'bot_triage.mjs');

// Fixture strings a receipt must never carry (the "no subject/body/address" contract).
const FIXTURE_SUBJECT = '분류 안 되는 메일';
const FIXTURE_BODY_PHRASE = '논의할 내용이 있습니다.';
const FIXTURE_SENDER_LOCAL_PART = 'sender-local-part';
const FIXTURE_SENDER = `${FIXTURE_SENDER_LOCAL_PART}@client.example`;

function rule(code, folder, hint = []) {
  return {
    schema_version: RULE_SCHEMA_VERSION, project_code: code, folder_name: folder, rule_version: 'v1', status: 'draft',
    match_fields: ['subject', 'body_text', 'attachment_names'], case_insensitive_literals: true,
    exact: [{ label: code, kind: 'literal', value: code }], hint,
    yields_to: null, conflict_policy: 'two_projects_exact_on_one_mail_means_hold_no_attribution', sender_policy: 'hint_only',
  };
}
const jsonl = lines => lines.map(line => JSON.stringify(line)).join('\n');
const sha256Of = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

function makeFixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'wl-bot-triage-'));
  const workspacesRoot = path.join(root, 'workspaces');
  const hiworksDir = path.join(root, 'events', 'hiworks');
  const gmailDir = path.join(root, 'events', 'gmail_sent');
  const receiptsDir = path.join(root, 'receipts');
  for (const dir of [hiworksDir, gmailDir, receiptsDir]) mkdirSync(dir, { recursive: true });

  const folderA = 'P00-001_예시과제';
  const ruleDir = path.join(workspacesRoot, folderA, '020_MGMT/021_자동화설정_운영규칙');
  mkdirSync(ruleDir, { recursive: true });
  writeFileSync(path.join(ruleDir, 'mail_routing_rule.json'), `${JSON.stringify(rule('P00-001', folderA), null, 2)}\n`);

  // A second project whose HINT term (never its exact term) matches u2's body -- the
  // review-only signal `listUnclassified`'s `hint_codes` carries and the wrapper shows
  // as 후보. A hint never attributes, so u2 stays unclassified.
  const folderB = 'P00-002_다른과제';
  const ruleDirB = path.join(workspacesRoot, folderB, '020_MGMT/021_자동화설정_운영규칙');
  mkdirSync(ruleDirB, { recursive: true });
  writeFileSync(path.join(ruleDirB, 'mail_routing_rule.json'),
    `${JSON.stringify(rule('P00-002', folderB, [{ label: '힌트말', kind: 'literal', value: '내용 둘' }]), null, 2)}\n`);

  writeFileSync(path.join(hiworksDir, 'events.jsonl'), jsonl([
    {
      event_id: 'u1', subject: FIXTURE_SUBJECT, from: FIXTURE_SENDER, to: ['me@example.com'], cc: [],
      received_at: '2026-09-01T01:00:00Z',
      body_text: `보낸 사람: x\n안녕하세요.\n\n${FIXTURE_BODY_PHRASE}\n\n감사합니다.`,
      attachments: [{ name: '첨부.pdf' }],
    },
    {
      event_id: 'u2', subject: '또 다른 미분류', from: 'other@client.example', to: ['me@example.com'], cc: [],
      received_at: '2026-09-02T01:00:00Z', body_text: '내용 둘', attachments: [],
    },
  ]));

  const orgConfigPath = path.join(root, 'org_config.json');
  writeFileSync(orgConfigPath, JSON.stringify({ our_domain: 'example.com', organisations: {}, family: {} }));
  const readingTablePath = path.join(root, '판독_결정표.csv');

  return { root, workspacesRoot, hiworksDir, gmailDir, receiptsDir, orgConfigPath, readingTablePath };
}

function writeConfig(fixture, overrides = {}, fileName = 'bot_triage.config.json') {
  const body = {
    schema_version: BOT_TRIAGE_CONFIG_SCHEMA,
    workspaces_root: fixture.workspacesRoot,
    org_config: fixture.orgConfigPath,
    org_config_sha256: sha256Of(readFileSync(fixture.orgConfigPath)),
    custody: { hiworks_events: [fixture.hiworksDir], gmail_sent_events: [fixture.gmailDir] },
    reading_table: fixture.readingTablePath,
    receipts_dir: fixture.receiptsDir,
    reader_label: '판독봇',
    human_actors: ['오너'],
    daily_decision_cap: 5,
    list_limit_cap: 10,
    ...overrides,
  };
  const configPath = path.join(fixture.root, fileName);
  writeFileSync(configPath, `${JSON.stringify(body, null, 2)}\n`);
  return { configPath, configSha256: sha256Of(readFileSync(configPath)) };
}

/** Runs the wrapper in-process, capturing what it would have printed. */
function run(argv, { now = '2026-09-10T02:00:00.000Z', deps = {} } = {}) {
  const out = [];
  const err = [];
  const code = runCli(argv, { now, deps, stdout: line => out.push(String(line)), stderr: line => err.push(String(line)) });
  return { code, stdout: out.join('\n'), stderr: err.join('\n') };
}

// Control characters are BUILT here, never typed as literals into this source -- a raw
// NUL or ESC in a tracked file is exactly what byte_hygiene.test.mjs refuses, and it
// is also the class of byte R-1 exists to keep out of the Owner's CSV.
const NUL = String.fromCharCode(0);
const ESC = String.fromCharCode(27);
const TAB = String.fromCharCode(9);
const VERTICAL_TAB = String.fromCharCode(11);
const C1_CONTROL = String.fromCharCode(0x85);

const receiptFiles = receiptsDir => readdirSync(receiptsDir).filter(name => name.startsWith('bot_triage-') && name.endsWith('.json'));
function readReceipts(receiptsDir) {
  return receiptFiles(receiptsDir).map(name => JSON.parse(readFileSync(path.join(receiptsDir, name), 'utf8')));
}
function readingRows(readingTablePath) {
  if (!existsSync(readingTablePath)) return { headers: [], rows: [] };
  return decodeCsv(readFileSync(readingTablePath, 'utf8'));
}

// ------------------------------------------------------------------- list/show
test('list: one line per mail, name+domain only (never a full address), and the limit cap holds', () => {
  const fixture = makeFixture();
  try {
    const { configPath, configSha256 } = writeConfig(fixture, { list_limit_cap: 1 });
    const result = run(['list', '--config', configPath, '--config-sha256', configSha256, '--limit', '10']);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /미분류 2건/u);
    // The cap (1) wins over the requested --limit 10.
    assert.equal(result.stdout.split('\n').filter(line => /^\d\)/u.test(line)).length, 1);
    assert.match(result.stdout, /남은 1건/u);
    assert.ok(result.stdout.includes('@client.example'), 'the sender domain should be shown');
    assert.equal(result.stdout.includes(FIXTURE_SENDER_LOCAL_PART), false, 'no full e-mail address may appear');
    assert.ok(result.stdout.length <= 6000);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('list/show: the 후보 column carries the module own review-only hint codes, and a hint never attributes', () => {
  const fixture = makeFixture();
  try {
    const { configPath, configSha256 } = writeConfig(fixture);
    const pin = ['--config', configPath, '--config-sha256', configSha256];
    const listed = run(['list', ...pin]);
    assert.equal(listed.code, 0, listed.stderr);
    const lineFor = id => listed.stdout.split('\n').find(line => line.includes(id));
    // u2's body carries P00-002's hint term -- shown as a candidate, still unclassified.
    assert.match(lineFor('u2'), /후보 P00-002/u);
    assert.match(lineFor('u1'), /후보 없음/u);
    assert.match(listed.stdout, /미분류 2건/u);

    const shown = run(['show', ...pin, '--id', 'u2']);
    assert.equal(shown.code, 0, shown.stderr);
    assert.match(shown.stdout, /후보 P00-002/u);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('show: headers, attachment names and the body, capped, with no full address', () => {
  const fixture = makeFixture();
  try {
    const { configPath, configSha256 } = writeConfig(fixture);
    const result = run(['show', '--config', configPath, '--config-sha256', configSha256, '--id', 'u1', '--max-chars', '40']);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /제목: 분류 안 되는 메일/u);
    assert.match(result.stdout, /첨부 1건: 첨부\.pdf/u);
    assert.equal(result.stdout.includes(FIXTURE_SENDER_LOCAL_PART), false);
    const bodyLine = result.stdout.split('\n').at(-1);
    assert.ok(bodyLine.length <= 40, `body line should honour --max-chars 40, got ${bodyLine.length}`);
    const receipt = readReceipts(fixture.receiptsDir).find(entry => entry.command === 'show');
    assert.equal(receipt.counts.body_chars <= 40, true);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('list/show/decide receipts carry no subject, body, address or host path', () => {
  const fixture = makeFixture();
  try {
    const { configPath, configSha256 } = writeConfig(fixture);
    const pin = ['--config', configPath, '--config-sha256', configSha256];
    assert.equal(run(['list', ...pin]).code, 0);
    assert.equal(run(['show', ...pin, '--id', 'u1']).code, 0);
    const decided = run(['decide', ...pin, '--id', 'u1', '--level', 'exclude', '--target', '과제미정', '--why', '과제를 특정할 단서가 없음']);
    assert.equal(decided.code, 0, decided.stderr);

    const serialised = receiptFiles(fixture.receiptsDir)
      .map(name => readFileSync(path.join(fixture.receiptsDir, name), 'utf8')).join('\n');
    assert.equal(serialised.length > 0, true);
    for (const needle of [FIXTURE_SUBJECT, FIXTURE_BODY_PHRASE, FIXTURE_SENDER, FIXTURE_SENDER_LOCAL_PART, '첨부.pdf']) {
      assert.equal(serialised.includes(needle), false, `receipt leaked: ${needle}`);
    }
    // Host paths: the fixture root and every directory the config names.
    for (const hostPath of [fixture.root, fixture.workspacesRoot, fixture.hiworksDir, fixture.readingTablePath]) {
      assert.equal(serialised.includes(hostPath), false, `receipt leaked a host path: ${hostPath}`);
      assert.equal(serialised.includes(hostPath.split(path.sep).join('/')), false, 'receipt leaked a host path (posix form)');
    }
    const receipt = readReceipts(fixture.receiptsDir).find(entry => entry.command === 'decide');
    assert.equal(receipt.schema_version, BOT_TRIAGE_RECEIPT_SCHEMA);
    assert.equal(receipt.mail_id, 'u1');
    assert.equal(receipt.level, 'exclude');
    assert.equal(receipt.target, '과제미정');
    assert.equal(receipt.target_kind, 'exclude_category');
    assert.equal(receipt.result, 'ok');
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

// ------------------------------------------------------------------- decide
test('decide: appends exactly one row with an empty Owner확인 and the pinned reader label; a second identical call is refused', () => {
  const fixture = makeFixture();
  try {
    const { configPath, configSha256 } = writeConfig(fixture);
    const pin = ['--config', configPath, '--config-sha256', configSha256];
    const first = run(['decide', ...pin, '--id', 'u1', '--level', 'include_with_review', '--target', 'P00-001', '--why', '본문이 그 과제 회의록임']);
    assert.equal(first.code, 0, first.stderr);

    const table = readingRows(fixture.readingTablePath);
    assert.deepEqual(table.headers, [...READING_HEADERS]);
    assert.equal(table.rows.length, 1);
    const row = table.rows[0];
    assert.equal(row[READING_HEADERS.indexOf('메일소스ID')], 'u1');
    assert.equal(row[READING_HEADERS.indexOf('결정')], 'include_with_review');
    assert.equal(row[READING_HEADERS.indexOf('과제_또는_분류')], 'P00-001');
    assert.equal(row[READING_HEADERS.indexOf('판독자')], '판독봇');
    assert.equal(row[READING_HEADERS.indexOf('제목')], FIXTURE_SUBJECT);
    // 2026-09-22 date-format fix: 수신일 is the Seoul calendar date derived from the
    // mail's own received_at ('2026-09-01T01:00:00Z' -> 2026-09-01 10:00 KST), never
    // the raw ISO instant.
    assert.equal(row[READING_HEADERS.indexOf('수신일')], '2026-09-01');
    assert.equal(row[READING_HEADERS.indexOf('Owner확인')], '');

    // The same call again: u1 is no longer unclassified, so the wrapper refuses before
    // the library's own duplicate check is ever reached, and nothing is appended.
    const second = run(['decide', ...pin, '--id', 'u1', '--level', 'include_with_review', '--target', 'P00-001', '--why', '본문이 그 과제 회의록임']);
    assert.equal(second.code, 2);
    assert.match(second.stderr, /id_not_in_queue/u);
    assert.equal(readingRows(fixture.readingTablePath).rows.length, 1);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('decide (2026-09-22 date-format fix): an unparseable or missing received_at is written as an empty 수신일, never a raw slice or an Invalid Date literal', () => {
  const fixture = makeFixture();
  try {
    writeFileSync(path.join(fixture.hiworksDir, 'garbled.jsonl'), jsonl([
      { event_id: 'garbled-date', subject: '완전히 무관한 제목', from: 'x@client.example', to: ['me@example.com'], cc: [], received_at: '이상한값', body_text: '', attachments: [] },
      { event_id: 'no-date', subject: '완전히 무관한 제목 둘', from: 'x@client.example', to: ['me@example.com'], cc: [], body_text: '', attachments: [] },
    ]));
    const { configPath, configSha256 } = writeConfig(fixture);
    const pin = ['--config', configPath, '--config-sha256', configSha256];
    assert.equal(run(['decide', ...pin, '--id', 'garbled-date', '--level', 'exclude', '--target', '과제미정', '--why', '단서 없음']).code, 0);
    assert.equal(run(['decide', ...pin, '--id', 'no-date', '--level', 'exclude', '--target', '과제미정', '--why', '단서 없음']).code, 0);
    const table = readingRows(fixture.readingTablePath);
    const garbled = table.rows.find(row => row[READING_HEADERS.indexOf('메일소스ID')] === 'garbled-date');
    const noDate = table.rows.find(row => row[READING_HEADERS.indexOf('메일소스ID')] === 'no-date');
    assert.equal(garbled[READING_HEADERS.indexOf('수신일')], '');
    assert.equal(noDate[READING_HEADERS.indexOf('수신일')], '');
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('decide: the second write archives the previous table bytes under history/, the way the library does', () => {
  const fixture = makeFixture();
  try {
    const { configPath, configSha256 } = writeConfig(fixture);
    const pin = ['--config', configPath, '--config-sha256', configSha256];
    assert.equal(run(['decide', ...pin, '--id', 'u1', '--level', 'exclude', '--target', '과제미정', '--why', '단서 없음']).code, 0);
    const historyDir = path.join(path.dirname(fixture.readingTablePath), 'history');
    assert.equal(existsSync(historyDir), false, 'a first-ever table has nothing to archive');

    assert.equal(run(['decide', ...pin, '--id', 'u2', '--level', 'exclude', '--target', '과제미정', '--why', '단서 없음'],
      { now: '2026-09-10T03:00:00.000Z' }).code, 0);
    assert.equal(readdirSync(historyDir).length, 1);
    assert.equal(readingRows(fixture.readingTablePath).rows.length, 2);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('decide: include is refused with its own code, and the allowed level list never contains it', () => {
  const fixture = makeFixture();
  try {
    const { configPath, configSha256 } = writeConfig(fixture);
    const result = run(['decide', '--config', configPath, '--config-sha256', configSha256,
      '--id', 'u1', '--level', 'include', '--target', 'P00-001', '--why', '확실함']);
    assert.equal(result.code, 2);
    assert.match(result.stderr, /workspace_ledgers_bot_triage_level_include_refused/u);
    assert.equal(existsSync(fixture.readingTablePath), false, 'nothing may be written');
    assert.equal(BOT_ALLOWED_LEVELS.includes('include'), false);
    const receipt = readReceipts(fixture.receiptsDir).at(-1);
    assert.equal(receipt.result, 'refused');
    assert.equal(receipt.code, 'workspace_ledgers_bot_triage_level_include_refused');
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('decide: an unknown exclude category, an unknown project code, a multi-project target and a missing why are each refused', () => {
  const fixture = makeFixture();
  try {
    const { configPath, configSha256 } = writeConfig(fixture);
    const pin = ['--config', configPath, '--config-sha256', configSha256];
    const cases = [
      { argv: ['--id', 'u1', '--level', 'exclude', '--target', '아무분류', '--why', '이유'], code: /target_not_allowed/u },
      { argv: ['--id', 'u1', '--level', 'exclude', '--target', '과제외:기타', '--why', '이유'], code: /target_not_allowed/u },
      { argv: ['--id', 'u1', '--level', 'include_with_review', '--target', 'P99-999', '--why', '이유'], code: /target_unknown_project/u },
      { argv: ['--id', 'u1', '--level', 'include_with_review', '--target', 'P00-001;P99-999', '--why', '이유'], code: /target_multiple_projects/u },
      { argv: ['--id', 'u1', '--level', 'exclude', '--target', '과제미정', '--why', '  '], code: /why_required/u },
      { argv: ['--id', 'u1', '--level', 'exclude', '--target', '과제미정', '--why', 'a'.repeat(400)], code: /why_too_long/u },
      { argv: ['--id', 'u1', '--level', 'vendor_only', '--target', '어떤거래처', '--why', '이유'], code: /vendor_only_without_organisation/u },
      { argv: ['--id', 'unknown-id', '--level', 'exclude', '--target', '과제미정', '--why', '이유'], code: /id_not_in_queue/u },
    ];
    for (const one of cases) {
      const result = run(['decide', ...pin, ...one.argv]);
      assert.equal(result.code, 2, `expected a refusal for ${JSON.stringify(one.argv)}`);
      assert.match(result.stderr, one.code);
    }
    assert.equal(existsSync(fixture.readingTablePath), false, 'no refusal may write a row');
    // The legacy spelling is accepted by the library but never offered here.
    assert.equal(botExcludeTargets().includes('과제없음'), false);
    assert.equal(botExcludeTargets().includes('과제미정'), true);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('decide: the daily cap is counted from this wrapper own receipts, per Seoul day, and only successful appends count', () => {
  const fixture = makeFixture();
  try {
    const { configPath, configSha256 } = writeConfig(fixture, { daily_decision_cap: 1 });
    const pin = ['--config', configPath, '--config-sha256', configSha256];
    // A refusal first: it must not consume the budget.
    assert.equal(run(['decide', ...pin, '--id', 'u1', '--level', 'include', '--target', 'P00-001', '--why', '이유']).code, 2);
    assert.equal(run(['decide', ...pin, '--id', 'u1', '--level', 'exclude', '--target', '과제미정', '--why', '단서 없음']).code, 0);

    const capped = run(['decide', ...pin, '--id', 'u2', '--level', 'exclude', '--target', '과제미정', '--why', '단서 없음'],
      { now: '2026-09-10T05:00:00.000Z' });
    assert.equal(capped.code, 2);
    assert.match(capped.stderr, /daily_cap_reached/u);
    assert.equal(readingRows(fixture.readingTablePath).rows.length, 1);

    // The next Seoul day starts a fresh budget (2026-09-10T16:00Z is 2026-09-11 KST).
    const nextDay = run(['decide', ...pin, '--id', 'u2', '--level', 'exclude', '--target', '과제미정', '--why', '단서 없음'],
      { now: '2026-09-10T16:00:00.000Z' });
    assert.equal(nextDay.code, 0, nextDay.stderr);
    assert.equal(readingRows(fixture.readingTablePath).rows.length, 2);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('the reader label cannot be overridden: identity/path flags do not exist on this surface', () => {
  const fixture = makeFixture();
  try {
    const { configPath, configSha256 } = writeConfig(fixture);
    const pin = ['--config', configPath, '--config-sha256', configSha256];
    for (const extra of [['--reader', '오너'], ['--human-actors', '판독봇'], ['--workspaces-root', fixture.workspacesRoot],
      ['--reading-table', fixture.readingTablePath], ['--lineage', path.join(fixture.root, 'lineage.json')]]) {
      const result = run(['decide', ...pin, '--id', 'u1', '--level', 'exclude', '--target', '과제미정', '--why', '이유', ...extra]);
      assert.equal(result.code, 2, `expected a refusal for ${extra[0]}`);
      assert.match(result.stderr, /workspace_ledgers_bot_triage_unknown_flag/u);
      assert.equal(existsSync(fixture.readingTablePath), false);
    }
    // And the row a successful call does write carries the config's label, nothing else.
    assert.equal(run(['decide', ...pin, '--id', 'u1', '--level', 'exclude', '--target', '과제미정', '--why', '이유']).code, 0);
    assert.equal(readingRows(fixture.readingTablePath).rows[0][READING_HEADERS.indexOf('판독자')], '판독봇');
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('correct is not implemented here, and says why', () => {
  const fixture = makeFixture();
  try {
    const { configPath, configSha256 } = writeConfig(fixture);
    const result = run(['correct', '--config', configPath, '--config-sha256', configSha256, '--id', 'u1']);
    assert.equal(result.code, 2);
    assert.match(result.stderr, /correct_not_supported/u);
    assert.equal(receiptFiles(fixture.receiptsDir).length, 0);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

// ------------------------------------------------------------------- refusals from the library
test('an Owner table that failed to load refuses list and decide, surfacing the library code', () => {
  const fixture = makeFixture();
  try {
    // A reading table with the wrong header -- the same shape triage.test.mjs uses.
    writeFileSync(fixture.readingTablePath, `${String.fromCharCode(0xFEFF)}잘못된헤더\r\nx\r\n`);
    const { configPath, configSha256 } = writeConfig(fixture);
    const pin = ['--config', configPath, '--config-sha256', configSha256];
    for (const argv of [['list', ...pin], ['decide', ...pin, '--id', 'u1', '--level', 'exclude', '--target', '과제미정', '--why', '이유']]) {
      const result = run(argv);
      assert.equal(result.code, 2);
      assert.match(result.stderr, /workspace_ledgers_triage_owner_table_failures/u);
    }
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

// ------------------------------------------------------------------- config
test('a config digest mismatch exits 4 and writes nothing at all, receipt included', () => {
  const fixture = makeFixture();
  try {
    const { configPath } = writeConfig(fixture);
    const wrong = `sha256:${'0'.repeat(64)}`;
    const result = run(['list', '--config', configPath, '--config-sha256', wrong]);
    assert.equal(result.code, 4);
    assert.match(result.stderr, /workspace_ledgers_bot_triage_config_sha256_mismatch/u);
    assert.deepEqual(receiptFiles(fixture.receiptsDir), []);
    assert.equal(existsSync(fixture.readingTablePath), false);

    // The same for a config whose pinned org config no longer matches.
    const pin = writeConfig(fixture);
    writeFileSync(fixture.orgConfigPath, JSON.stringify({ our_domain: 'changed.example', organisations: {}, family: {} }));
    const drifted = run(['list', '--config', pin.configPath, '--config-sha256', pin.configSha256]);
    assert.equal(drifted.code, 4);
    assert.match(drifted.stderr, /org_config_sha256_mismatch/u);
    assert.deepEqual(receiptFiles(fixture.receiptsDir), []);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('a malformed config (bad schema, missing field, bad digest shape) exits 4', () => {
  const fixture = makeFixture();
  try {
    const cases = [
      [{ schema_version: 'something.else.v9' }, /config_schema_unknown/u],
      [{ reader_label: '' }, /config_field_invalid/u],
      [{ org_config_sha256: 'not-a-digest' }, /config_field_invalid/u],
      [{ daily_decision_cap: -1 }, /config_field_invalid/u],
      [{ custody: { hiworks_events: [], gmail_sent_events: [] } }, /config_field_invalid/u],
    ];
    let index = 0;
    for (const [overrides, expected] of cases) {
      index += 1;
      const { configPath, configSha256 } = writeConfig(fixture, overrides, `bad-${index}.json`);
      const result = run(['list', '--config', configPath, '--config-sha256', configSha256]);
      assert.equal(result.code, 4, `expected exit 4 for ${JSON.stringify(overrides)}`);
      assert.match(result.stderr, expected);
    }
    assert.deepEqual(receiptFiles(fixture.receiptsDir), []);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

// ------------------------------------------------------------------- helpers/process
test('maskAddresses keeps the domain and drops the local part', () => {
  assert.equal(maskAddresses('보낸이 kim@corp.example 님'), '보낸이 @corp.example 님');
  assert.equal(maskAddresses('도메인만 @corp.example'), '도메인만 @corp.example');
});

test('a recipient with no display name reads as a nameless domain, not a naked @domain', () => {
  assert.equal(recipientLabel('me@example.com'), '(이름 없음) @example.com');
  assert.equal(recipientLabel('홍길동'), '홍길동');
});

test('the file runs as its own process and returns the documented exit codes', () => {
  const fixture = makeFixture();
  try {
    const { configPath, configSha256 } = writeConfig(fixture);
    const ok = spawnSync(process.execPath, [BOT_TRIAGE, 'list', '--config', configPath, '--config-sha256', configSha256], { encoding: 'utf8' });
    assert.equal(ok.status, 0, `${ok.stdout}\n${ok.stderr}`);
    assert.match(ok.stdout, /미분류 2건/u);

    const refused = spawnSync(process.execPath, [BOT_TRIAGE, 'decide', '--config', configPath, '--config-sha256', configSha256,
      '--id', 'u1', '--level', 'include', '--target', 'P00-001', '--why', '이유'], { encoding: 'utf8' });
    assert.equal(refused.status, 2);

    const badPin = spawnSync(process.execPath, [BOT_TRIAGE, 'list', '--config', configPath, '--config-sha256', 'sha256:zz'], { encoding: 'utf8' });
    assert.equal(badPin.status, 4);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

// ---------------------------------------------- R-1: control characters
test('R-1: every C0/C1 control character in --why is refused (TAB included), never stripped, and nothing is written', () => {
  const fixture = makeFixture();
  try {
    const { configPath, configSha256 } = writeConfig(fixture);
    const pin = ['--config', configPath, '--config-sha256', configSha256];
    for (const character of [NUL, ESC, TAB, VERTICAL_TAB, C1_CONTROL]) {
      const result = run(['decide', ...pin, '--id', 'u1', '--level', 'exclude', '--target', '과제미정',
        '--why', `앞${character}뒤`]);
      assert.equal(result.code, 2);
      assert.match(result.stderr, /workspace_ledgers_bot_triage_why_control_characters/u);
      assert.equal(result.stderr.includes(character), false, 'the refusal itself must not echo the control character');
    }
    // CR/LF keeps its own, more specific code -- the two mistakes stay distinguishable.
    const multiline = run(['decide', ...pin, '--id', 'u1', '--level', 'exclude', '--target', '과제미정', '--why', '앞\n뒤']);
    assert.equal(multiline.code, 2);
    assert.match(multiline.stderr, /why_not_single_line/u);

    assert.equal(existsSync(fixture.readingTablePath), false, 'no control-character refusal may write a row');
    const serialised = receiptFiles(fixture.receiptsDir)
      .map(name => readFileSync(path.join(fixture.receiptsDir, name), 'utf8')).join('');
    for (const character of [NUL, ESC, VERTICAL_TAB, C1_CONTROL]) {
      assert.equal(serialised.includes(character), false, 'a receipt must not carry a raw control character');
    }
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('R-1: --id and a vendor_only --target are control-character checked too', () => {
  const fixture = makeFixture();
  try {
    const { configPath, configSha256 } = writeConfig(fixture);
    const pin = ['--config', configPath, '--config-sha256', configSha256];
    const badId = run(['decide', ...pin, '--id', `u1${ESC}`, '--level', 'exclude', '--target', '과제미정', '--why', '이유']);
    assert.equal(badId.code, 2);
    assert.match(badId.stderr, /workspace_ledgers_bot_triage_id_control_characters/u);

    const badShow = run(['show', ...pin, '--id', `u1${NUL}`]);
    assert.equal(badShow.code, 2);
    assert.match(badShow.stderr, /workspace_ledgers_bot_triage_id_control_characters/u);

    const badTarget = run(['decide', ...pin, '--id', 'u1', '--level', 'vendor_only', '--target', `가나${NUL}`, '--why', '이유']);
    assert.equal(badTarget.code, 2);
    assert.match(badTarget.stderr, /workspace_ledgers_bot_triage_target_control_characters/u);

    assert.equal(existsSync(fixture.readingTablePath), false);
    const serialised = receiptFiles(fixture.receiptsDir)
      .map(name => readFileSync(path.join(fixture.receiptsDir, name), 'utf8')).join('');
    for (const character of [NUL, ESC]) {
      assert.equal(serialised.includes(character), false, 'a refused id/target must not reach a receipt raw');
    }
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('N-1: a raw --level is stripped and bounded before it reaches a receipt or stderr', () => {
  const fixture = makeFixture();
  try {
    const { configPath, configSha256 } = writeConfig(fixture);
    const blob = `${ESC}[31m${'x'.repeat(500)}`;
    const result = run(['decide', '--config', configPath, '--config-sha256', configSha256,
      '--id', 'u1', '--level', blob, '--target', '과제미정', '--why', '이유']);
    assert.equal(result.code, 2);
    assert.match(result.stderr, /workspace_ledgers_bot_triage_level_not_allowed/u);
    assert.equal(result.stderr.includes(ESC), false);
    assert.ok(result.stderr.length < 400, `stderr should be bounded, got ${result.stderr.length}`);
    const receipt = readReceipts(fixture.receiptsDir).at(-1);
    assert.equal(receipt.level.includes(ESC), false);
    assert.ok(receipt.level.length <= 80, `a recorded level should be bounded, got ${receipt.level.length}`);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('N-2: the unknown-flag and unexpected-argument branches redact host paths too', () => {
  const fixture = makeFixture();
  try {
    const { configPath, configSha256 } = writeConfig(fixture);
    const pin = ['--config', configPath, '--config-sha256', configSha256];
    const stray = run(['decide', ...pin, fixture.readingTablePath]);
    assert.equal(stray.code, 2);
    assert.match(stray.stderr, /workspace_ledgers_bot_triage_unexpected_argument/u);
    assert.equal(stray.stderr.includes(fixture.root), false, 'a stray argument must not print a host path');

    const unknown = run(['decide', ...pin, '--reading-table', fixture.readingTablePath]);
    assert.equal(unknown.code, 2);
    assert.match(unknown.stderr, /workspace_ledgers_bot_triage_unknown_flag/u);
    assert.equal(unknown.stderr.includes(fixture.root), false);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

// ---------------------------------------------- S-1: receipt write failure
test('S-1: a receipt that cannot be written is a hard failure, and after a successful append it says the row WAS added', () => {
  const fixture = makeFixture();
  try {
    const { configPath, configSha256 } = writeConfig(fixture);
    const pin = ['--config', configPath, '--config-sha256', configSha256];
    const boom = () => { throw new Error('receipt write refused'); };

    const decided = run(['decide', ...pin, '--id', 'u1', '--level', 'exclude', '--target', '과제미정', '--why', '단서 없음'],
      { deps: { writeReceipt: boom } });
    assert.equal(decided.code, 2, 'a silently lost decide receipt must never exit 0');
    assert.match(decided.stderr, /workspace_ledgers_bot_triage_receipt_write_failed_after_append/u);
    assert.match(decided.stderr, /판독표에는 줄이 이미 추가되었습니다/u);
    // The row really is there -- which is exactly why the operator has to be told.
    assert.equal(readingRows(fixture.readingTablePath).rows.length, 1);

    // A read-only command gets the plain code (no row was appended).
    const listed = run(['list', ...pin], { deps: { writeReceipt: boom } });
    assert.equal(listed.code, 2);
    assert.match(listed.stderr, /workspace_ledgers_bot_triage_receipt_write_failed(?!_after_append)/u);
    assert.equal(listed.stderr.includes('판독표에는'), false);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

// ---------------------------------------------- S-6: a valid long id is recorded whole
test('S-6: a valid mail id is recorded in the receipt in FULL, so the receipt still matches its row', () => {
  const fixture = makeFixture();
  try {
    // 122 characters: past the 80-char label bound that used to truncate every id,
    // well inside the explicit ceiling. The loader's synthetic ids can be this long.
    const longId = `evt-${'a'.repeat(118)}`;
    assert.equal(longId.length, 122);
    writeFileSync(path.join(fixture.hiworksDir, 'long-id.jsonl'), jsonl([{
      event_id: longId, subject: '긴 아이디 메일', from: 'x@client.example', to: ['me@example.com'], cc: [],
      received_at: '2026-09-05T01:00:00Z', body_text: '내용', attachments: [],
    }]));
    const { configPath, configSha256 } = writeConfig(fixture);
    const pin = ['--config', configPath, '--config-sha256', configSha256];

    const decided = run(['decide', ...pin, '--id', longId, '--level', 'exclude', '--target', '과제미정', '--why', '단서 없음']);
    assert.equal(decided.code, 0, decided.stderr);

    const row = readingRows(fixture.readingTablePath).rows[0];
    const csvId = row[READING_HEADERS.indexOf('메일소스ID')];
    const receipt = readReceipts(fixture.receiptsDir).find(entry => entry.command === 'decide');
    assert.equal(csvId, longId, 'the CSV keeps the whole id');
    assert.equal(receipt.mail_id, longId, 'the receipt must keep the whole id too, or it cannot be matched to its row');
    assert.equal(receipt.mail_id, csvId);

    // A never-validated id (a refusal path) is still bounded and control-free.
    const refused = run(['decide', ...pin, '--id', `${ESC}${'z'.repeat(400)}`, '--level', 'exclude', '--target', '과제미정', '--why', '이유']);
    assert.equal(refused.code, 2);
    // Selected by code, not by directory order -- several runs wrote receipts here.
    const refusedReceipt = readReceipts(fixture.receiptsDir)
      .find(entry => entry.code === 'workspace_ledgers_bot_triage_id_control_characters');
    assert.ok(refusedReceipt, 'the refused run should have left its own receipt');
    assert.ok(refusedReceipt.mail_id.length <= 80, `a refused id stays bounded, got ${refusedReceipt.mail_id.length}`);
    assert.equal(refusedReceipt.mail_id.includes(ESC), false);

    // ... and "full" is itself bounded: past the explicit ceiling the id is refused.
    const tooLong = run(['decide', ...pin, '--id', 'y'.repeat(MAX_MAIL_ID_CHARS + 1), '--level', 'exclude', '--target', '과제미정', '--why', '이유']);
    assert.equal(tooLong.code, 2);
    assert.match(tooLong.stderr, /workspace_ledgers_bot_triage_id_too_long/u);
    assert.equal(isValidMailId(longId), true);
    assert.equal(isValidMailId('y'.repeat(MAX_MAIL_ID_CHARS + 1)), false);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

// ---------------------------------------------- S-7: no receipt, no row
test('S-7: decide proves the receipts directory is writable BEFORE appending, so an unwritable one can never leave rows without receipts', async () => {
  const fixture = makeFixture();
  try {
    const { configPath, configSha256 } = writeConfig(fixture, { daily_decision_cap: 3 });
    const pin = ['--config', configPath, '--config-sha256', configSha256];
    const { listUnclassified } = await import('../src/triage.mjs');
    // The real sequence this guards: the config verified the directory, and then it
    // stopped being one. Staged inside the queue read (the same technique the S-5 test
    // uses) so the REAL probe -- not a stub -- is what refuses.
    const breakReceiptsDir = (config, options) => {
      const queue = listUnclassified({
        workspacesRoot: config.workspacesRoot, hiworksDirs: config.hiworksDirs,
        gmailSentDirs: config.gmailSentDirs, orgConfigPath: config.orgConfigPath,
        readingTablePath: config.readingTablePath, limit: 500, ...(options ?? {}),
      });
      rmSync(config.receiptsDir, { recursive: true, force: true });
      writeFileSync(config.receiptsDir, '');
      return queue;
    };

    // The old behaviour: three decides against a cap of 3 left three rows and no
    // receipts at all, so the budget never advanced. Now the first one refuses.
    for (const id of ['u1', 'u2']) {
      // Put the directory back first: the previous run left a regular file there, and
      // `loadBotConfig` would (correctly) refuse that up front as an exit 4 before the
      // mid-run probe this test is about could ever fire.
      rmSync(fixture.receiptsDir, { recursive: true, force: true });
      mkdirSync(fixture.receiptsDir, { recursive: true });
      const result = run(['decide', ...pin, '--id', id, '--level', 'exclude', '--target', '과제미정', '--why', '단서 없음'],
        { deps: { readQueue: breakReceiptsDir } });
      assert.equal(result.code, 2);
      assert.match(result.stderr, /workspace_ledgers_bot_triage_receipts_unwritable_before_append/u);
    }
    assert.equal(existsSync(fixture.readingTablePath), false, 'no receipt means no row, ever');
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('S-7: the probe creates an absent directory, removes its own file, and leaves nothing the daily-cap count can see', () => {
  const fixture = makeFixture();
  try {
    // Absent directory: created, exactly as the real receipt write would.
    const fresh = path.join(fixture.root, 'brand', 'new', 'receipts');
    assertReceiptsWritable(fresh);
    assert.equal(existsSync(fresh), true);
    assert.deepEqual(readdirSync(fresh), [], 'the probe file must not survive');

    // A path that cannot be created because an ancestor is a regular file. Both
    // platforms fail here; the errno differs (ENOTDIR / ENOENT / EEXIST) and nothing
    // below depends on which.
    const blocker = path.join(fixture.root, 'blocker');
    writeFileSync(blocker, '');
    assert.throws(() => assertReceiptsWritable(path.join(blocker, 'receipts')),
      error => error.code === 'workspace_ledgers_bot_triage_receipts_unwritable_before_append');

    // A leftover probe from a crashed run is invisible to the daily-cap count and
    // never breaks it (it is not JSON, and it matches neither half of the filter).
    const { configPath, configSha256 } = writeConfig(fixture);
    const pin = ['--config', configPath, '--config-sha256', configSha256];
    assert.equal(run(['decide', ...pin, '--id', 'u1', '--level', 'exclude', '--target', '과제미정', '--why', '이유']).code, 0);
    writeFileSync(path.join(fixture.receiptsDir, '.bot_triage_probe-leftover.tmp'), 'not json at all');
    const listed = run(['list', ...pin]);
    assert.equal(listed.code, 0, listed.stderr);
    assert.match(listed.stdout, /오늘 판독 1\/5건/u, 'a leftover probe is neither counted nor a parse error');
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('N-5: the config-failure stderr branch redacts and bounds its detail too', () => {
  const fixture = makeFixture();
  try {
    // An unreadable org config reports its basename -- derived from caller-supplied
    // path text, so it goes through the same safeDetail as every other printed detail.
    const { configPath, configSha256 } = writeConfig(fixture, { org_config: path.join(fixture.root, 'missing', 'org_config.json') });
    const result = run(['list', '--config', configPath, '--config-sha256', configSha256]);
    assert.equal(result.code, 4);
    assert.match(result.stderr, /workspace_ledgers_bot_triage_config_org_config_unreadable/u);
    assert.equal(result.stderr.includes(fixture.root), false, 'a config failure must not print a host path');
    assert.equal(result.stderr.includes(ESC), false);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

// ---------------------------------------------- S-2: an existing usable decision
test('S-2: an existing hold_owner_review row is marked on the queue line and re-deciding is refused by the wrapper', () => {
  const fixture = makeFixture();
  try {
    writeFileSync(fixture.readingTablePath, encodeCsv(READING_HEADERS, [
      ['u1', '2026-09-01', '분류 안 되는 메일', 'hold_owner_review', '', '사람 확인 필요', '오너', '2026-09-05', ''],
    ]));
    const { configPath, configSha256 } = writeConfig(fixture);
    const pin = ['--config', configPath, '--config-sha256', configSha256];

    const listed = run(['list', ...pin]);
    assert.equal(listed.code, 0, listed.stderr);
    const line = listed.stdout.split('\n').find(entry => entry.includes('u1'));
    assert.match(line, /이미판정\(hold_owner_review\)/u);

    const shown = run(['show', ...pin, '--id', 'u1']);
    assert.equal(shown.code, 0, shown.stderr);
    assert.match(shown.stdout, /이미 판독줄이 있습니다\(hold_owner_review\)/u);

    const again = run(['decide', ...pin, '--id', 'u1', '--level', 'exclude', '--target', '과제미정', '--why', '이유']);
    assert.equal(again.code, 2);
    assert.match(again.stderr, /workspace_ledgers_bot_triage_mail_already_decided(?!_invalid)/u);
    // Refused by the wrapper, so the library's own duplicate check is never reached.
    assert.equal(again.stderr.includes('workspace_ledgers_triage_decision_duplicate'), false);
    assert.equal(readingRows(fixture.readingTablePath).rows.length, 1);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

// ---------------------------------------------- S-3: the body gets its own budget
test('S-3: show renders a body at the documented --max-chars maximum, truncating rather than dropping it', () => {
  const fixture = makeFixture();
  try {
    // A body far longer than the whole stdout budget, in its own custody file.
    writeFileSync(path.join(fixture.hiworksDir, 'long.jsonl'), jsonl([{
      event_id: 'u3', subject: '긴 본문 메일', from: 'long@client.example', to: ['me@example.com'], cc: [],
      received_at: '2026-09-04T01:00:00Z', body_text: '가나다라마바사'.repeat(2000), attachments: [],
    }]));
    const { configPath, configSha256 } = writeConfig(fixture);
    const result = run(['show', '--config', configPath, '--config-sha256', configSha256, '--id', 'u3', '--max-chars', '6000']);
    assert.equal(result.code, 0, result.stderr);
    const lines = result.stdout.split('\n');
    const labelIndex = lines.findIndex(line => line.startsWith('본문(최대'));
    assert.notEqual(labelIndex, -1, 'the body label line must survive');
    const body = lines.slice(labelIndex + 1).join('\n');
    assert.ok(body.length > 400, `the body must actually render, got ${body.length} chars`);
    assert.match(body, /본문 \d+자 중 \d+자/u, 'a truncated body says how much was cut');
    assert.ok(result.stdout.length <= 6000, `total output must stay within the cap, got ${result.stdout.length}`);
    const receipt = readReceipts(fixture.receiptsDir).at(-1);
    assert.equal(receipt.counts.body_truncated, true);
    assert.ok(receipt.counts.body_chars > 400);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

// ---------------------------------------------- S-5: org-config TOCTOU
test('S-5: an org config that changes after the digest check fails closed with nothing appended', async () => {
  const fixture = makeFixture();
  try {
    const { configPath, configSha256 } = writeConfig(fixture);
    const pin = ['--config', configPath, '--config-sha256', configSha256];
    const { listUnclassified } = await import('../src/triage.mjs');
    // Rewrites the pinned org config from INSIDE the queue read -- the exact window
    // the re-check exists for, reproduced without a timing race (the same technique
    // ops/daily_refresh.mjs's own TOCTOU test uses).
    const movingQueue = (config, options) => {
      const queue = listUnclassified({
        workspacesRoot: config.workspacesRoot, hiworksDirs: config.hiworksDirs,
        gmailSentDirs: config.gmailSentDirs, orgConfigPath: config.orgConfigPath,
        readingTablePath: config.readingTablePath, limit: 500, ...(options ?? {}),
      });
      writeFileSync(fixture.orgConfigPath, JSON.stringify({ our_domain: 'moved.example', organisations: {}, family: {} }));
      return queue;
    };

    const decided = run(['decide', ...pin, '--id', 'u1', '--level', 'exclude', '--target', '과제미정', '--why', '이유'],
      { deps: { readQueue: movingQueue } });
    assert.equal(decided.code, 2, 'exit 2 -- this run started, then failed; it is not a refuse-before-start 4');
    assert.match(decided.stderr, /workspace_ledgers_bot_triage_org_config_changed_during_run/u);
    assert.equal(existsSync(fixture.readingTablePath), false, 'nothing may be appended after the config moved');

    // Put the pinned bytes back: the run above left the moved copy on disk, which
    // `loadBotConfig` would (correctly) refuse up front as an exit 4 before the
    // mid-run re-check this test is about could ever fire.
    writeFileSync(fixture.orgConfigPath, JSON.stringify({ our_domain: 'example.com', organisations: {}, family: {} }));
    const listed = run(['list', ...pin], { deps: { readQueue: movingQueue } });
    assert.equal(listed.code, 2);
    assert.match(listed.stderr, /org_config_changed_during_run/u);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('an existing row that can never route is flagged, and the wrapper refuses to decide it again', () => {
  const fixture = makeFixture();
  try {
    // vendor_only with no organisation this module can match: the module README's S3
    // dead end. The queue shows it; the wrapper must not try to "fix" it.
    writeFileSync(fixture.readingTablePath, encodeCsv(READING_HEADERS, [
      ['u1', '', '', 'vendor_only', '어떤거래처', '이유', '오너', '2026-09-01', ''],
    ]));
    const { configPath, configSha256 } = writeConfig(fixture);
    const pin = ['--config', configPath, '--config-sha256', configSha256];
    const listed = run(['list', ...pin]);
    assert.equal(listed.code, 0, listed.stderr);
    assert.match(listed.stdout, /손질필요\(vendor_only_without_organisation\)/u);

    const again = run(['decide', ...pin, '--id', 'u1', '--level', 'exclude', '--target', '과제미정', '--why', '이유']);
    assert.equal(again.code, 2);
    assert.match(again.stderr, /mail_already_decided_invalid/u);
    assert.equal(readingRows(fixture.readingTablePath).rows.length, 1);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});
