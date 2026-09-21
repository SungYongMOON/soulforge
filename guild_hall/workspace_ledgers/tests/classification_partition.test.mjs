// D-e (coordinator, fresh review round 2): end-to-end property test. For any mail,
// exactly one of {attributed to one or more project ledgers (deliberately shared mail
// only), OR classified into exactly one common-folder primary bucket} -- never a
// project ledger AND 미분류 (or any other common bucket) for the same mail. Runs both
// `refresh()` (writes project ledgers) and `refreshCommon()` (writes common-folder
// ledgers) over the SAME custody/owner-tables/org-config, then cross-checks every
// classified mail's actual on-disk membership against `classifyAllCommonMail`'s own
// classification -- the two production writers must never disagree about the same
// mail, now that both call the one classification function (D-a).
//
// Also covers the reviewer's three named mails:
//   M1 -- a project keyword appears ONLY in the body, with no vendor address on the
//         mail at all -- must NOT attribute (step 4 is vendor-gated; D-b).
//   M2 -- no `event_id` + a reading-table `include` row -- the row is written using
//         the id `classifyAllCommonMail` (what `triage list` shows a reader) actually
//         derived for this mail; `refresh()` must independently derive the SAME id
//         for the same physical mail and find that row too (D-c).
//   M3 -- a system-sender-domain mail with an Owner-confirmed reading `include` row --
//         must attribute despite the system-sender domain (D-d).
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { RULE_SCHEMA_VERSION } from '../src/classifier.mjs';
import { decodeCsv, encodeCsv } from '../src/ledgers.mjs';
import { listProjects } from '../src/rule_store.mjs';
import { PRIMARY_BUCKETS } from '../src/common_classifier.mjs';
import { BUNDLE_HEADERS_V2, READING_HEADERS, VENDOR_HEADERS } from '../src/owner_tables.mjs';
import { refresh } from '../src/refresh.mjs';
import { classifyAllCommonMail, refreshCommon } from '../src/common_refresh.mjs';

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
const RULE_DIR = '020_MGMT/021_자동화설정_운영규칙';
const LEDGER_DIR = '020_MGMT/027_수신이력_이동이력';
const VENDOR_TABLE_DIR = '020_MGMT/023_연락처_이해관계자';
const CODE_A = 'P00-001';
const FOLDER_A = 'P00-001_예시과제';
const CODE_B = 'P00-002';
const FOLDER_B = 'P00-002_다른과제';

function jsonl(lines) { return lines.map(line => JSON.stringify(line)).join('\n'); }
function event({ id, subject, from, at, body = '', to = ['me@example.com'] }) {
  const record = { subject, from, to, cc: [], received_at: at, body_text: body, attachments: [] };
  if (id !== undefined) record.event_id = id;
  return record;
}

function makeFixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'workspace-ledgers-partition-'));
  const workspacesRoot = path.join(root, '_workspaces');
  const workmetaRoot = path.join(root, '_workmeta');
  const hiworksDir = path.join(root, 'events', 'hiworks');
  const gmailDir = path.join(root, 'events', 'gmail_sent');
  const receiptsDir = path.join(root, 'receipts');
  for (const dir of [hiworksDir, gmailDir, receiptsDir]) mkdirSync(dir, { recursive: true });

  for (const [code, folder] of [[CODE_A, FOLDER_A], [CODE_B, FOLDER_B]]) {
    const ruleDir = path.join(workspacesRoot, folder, RULE_DIR);
    mkdirSync(ruleDir, { recursive: true });
    writeFileSync(path.join(ruleDir, 'mail_routing_rule.json'), `${JSON.stringify(rule(code, folder, [[code, code]]), null, 2)}\n`);
  }
  mkdirSync(path.join(workspacesRoot, COMMON_FOLDER, RULE_DIR), { recursive: true });
  mkdirSync(path.join(workspacesRoot, COMMON_FOLDER, VENDOR_TABLE_DIR), { recursive: true });
  mkdirSync(path.join(workspacesRoot, GENERAL_WORK_FOLDER), { recursive: true });

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

  const bundleTablePath = path.join(workspacesRoot, COMMON_FOLDER, RULE_DIR, '묶음_확정표.csv');
  const readingTablePath = path.join(workspacesRoot, COMMON_FOLDER, RULE_DIR, '판독_결정표.csv');
  const vendorTablePath = path.join(workspacesRoot, COMMON_FOLDER, VENDOR_TABLE_DIR, '거래처_대응표.csv');
  writeFileSync(bundleTablePath, encodeCsv(BUNDLE_HEADERS_V2, [['전혀 다른 내용', CODE_A, 'Owner 확인', '2026-09-21', '']]));
  writeFileSync(vendorTablePath, encodeCsv(VENDOR_HEADERS, [['vendor.example', '거래처A', '부품', '']]));
  // The reading table starts empty -- M2/M3's own rows are written in two steps
  // below, once M2's content-derived id is known.
  writeFileSync(readingTablePath, encodeCsv(READING_HEADERS, []));

  return {
    root, workspacesRoot, workmetaRoot, hiworksDir, gmailDir, receiptsDir, orgConfigPath,
    bundleTablePath, readingTablePath, vendorTablePath,
  };
}

const commonArgs = fixture => ({
  workspacesRoot: fixture.workspacesRoot, hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir],
  orgConfigPath: fixture.orgConfigPath, bundleTablePath: fixture.bundleTablePath,
  vendorTablePath: fixture.vendorTablePath, readingTablePath: fixture.readingTablePath,
});

function projectMailIds(workspacesRoot) {
  // { project_code -> Set(mail_source_id) }, from the REAL, WRITTEN per-project
  // ledgers (received + sent), not from anything in memory.
  const byCode = new Map();
  for (const project of listProjects({ workspacesRoot })) {
    const ids = new Set();
    for (const rel of [`${LEDGER_DIR}/메일_수신이력.csv`, `${LEDGER_DIR}/메일_발송이력.csv`]) {
      const filePath = path.join(workspacesRoot, project.folder_name, rel);
      let text;
      try { text = readFileSync(filePath, 'utf8'); } catch { continue; }
      const { headers, rows } = decodeCsv(text);
      const idIndex = headers.indexOf('메일소스ID');
      for (const row of rows) ids.add(row[idIndex]);
    }
    byCode.set(project.project_code, ids);
  }
  return byCode;
}

const M1_SUBJECT = '무관한 제목 M1';
const M2_SUBJECT = '무관한 제목 M2 (no event_id)';
const M3_SUBJECT = '무관한 제목 M3 (system sender)';

test('D-e (coordinator, fresh review round 2): partition invariant over a mixed fixture -- every mail lands in exactly one place, refresh() and the common pipeline agree, including M1/M2/M3', () => {
  const fixture = makeFixture();
  try {
    const events = [
      // Ordinary subject-rule hit -- project bucket, project A only.
      event({ id: 'h-rule', subject: `[${CODE_A}] 안내`, from: 'x@client.example', at: '2026-09-01T01:00:00Z' }),
      // Two-project subject collision -- held (보류.csv), never a project ledger.
      event({ id: 'h-held', subject: `${CODE_A} 그리고 ${CODE_B} 동시 언급`, from: 'x@client.example', at: '2026-09-01T02:00:00Z' }),
      // Bundle-table hit -- project bucket, project A only.
      event({ id: 'h-bundle', subject: '전혀 다른 내용의 문의', from: 'x@client.example', at: '2026-09-01T03:00:00Z' }),
      // System-sender domain, no rule/table signal at all -- system bucket.
      event({ id: 'h-system', subject: '정기 알림', from: 'noreply@sys.example', at: '2026-09-01T04:00:00Z' }),
      // Ads domain -- ads bucket (no primary file, by design).
      event({ id: 'h-ads', subject: '(광고) 특가', from: 'promo@ads.example', at: '2026-09-01T05:00:00Z' }),
      // Internal admin pattern from our own domain -- internal_admin bucket.
      event({ id: 'h-admin', subject: '9월 급여명세서', from: 'hr@example.com', at: '2026-09-01T06:00:00Z' }),
      // Agency-notice domain -- external_notice bucket.
      event({ id: 'h-external', subject: '기관 공지', from: 'official@agency.example', at: '2026-09-01T07:00:00Z' }),
      // Out-of-project pattern -- out_of_project bucket.
      event({ id: 'h-outproject', subject: '발주서 송부', from: 'x@client.example', at: '2026-09-01T08:00:00Z' }),
      // Code-pending pattern -- code_pending bucket.
      event({ id: 'h-codepending', subject: '신규과제후보 검토', from: 'x@client.example', at: '2026-09-01T09:00:00Z' }),
      // Vendor address only, no project/hold/reading -- organisation_undecided bucket
      // (no primary file, by design).
      event({ id: 'h-orgundecided', subject: '부품 관련 문의', from: 'sales@vendor.example', at: '2026-09-01T10:00:00Z' }),
      // Nothing matches at all -- unclassified bucket (미분류.csv).
      event({ id: 'h-unclassified', subject: '전혀 상관없는 안내', from: 'x@client.example', at: '2026-09-01T11:00:00Z' }),
      // 공유 (deliberately shared): reading table names BOTH projects.
      event({ id: 'h-shared', subject: '공유 프로젝트 안내', from: 'x@client.example', at: '2026-09-01T12:00:00Z' }),
      // S-a (coordinator, fresh review round 3): a supplier-type vendor address
      // (vendor.example -> 거래처A, kind 부품, not excluded by SUPPLIER_KIND_EXCLUDE)
      // with NO subject-rule/bundle-table signal at all, but its BODY contains exactly
      // one project's exact keyword -- step 4's supplier-body tie-break must attribute
      // it via refresh() too, basis "본문".
      event({ id: 'm-supplier-body', subject: '부품 배송 안내', from: 'sales@vendor.example', at: '2026-09-01T12:30:00Z',
        body: `${CODE_A} 관련 부품 배송 예정` }),
      // M1: the project A keyword appears ONLY in the body, and this mail touches NO
      // vendor address at all -- step 4 is vendor-gated (bodyOk requires a matched
      // vendor), so this must NOT attribute despite the body containing "P00-001".
      event({ id: 'm1', subject: M1_SUBJECT, from: 'nobody@client.example', at: '2026-09-01T13:00:00Z', body: `본문에 ${CODE_A} 키워드만 있음` }),
      // M2: NO event_id at all -- its id is discovered below, after a first pass.
      event({ subject: M2_SUBJECT, from: 'x@client.example', at: '2026-09-01T14:00:00Z' }),
      // M3: system-sender domain -- rescued by an Owner-confirmed reading row below.
      event({ id: 'm3', subject: M3_SUBJECT, from: 'noreply@sys.example', at: '2026-09-01T15:00:00Z' }),
    ];
    writeFileSync(path.join(fixture.hiworksDir, 'events.jsonl'), jsonl(events));

    // Phase 1: classify without M2/M3's reading rows yet, purely to discover M2's
    // content-derived synthetic id -- exactly what a reader would see from
    // `triage list`/`listUnclassified` before deciding it.
    const discoveryPass = classifyAllCommonMail(commonArgs(fixture));
    const m2Entry = discoveryPass.classified.find(entry => entry.mail.subject === M2_SUBJECT);
    assert.ok(m2Entry, 'M2 must be present in the discovery pass');
    const m2Id = m2Entry.mail.event_id;
    assert.ok(m2Id, 'M2 must have been assigned a (synthetic) id');
    assert.equal(m2Entry.outcome.bucket, 'unclassified'); // not yet decided

    // Phase 2: write the reading-table rows for M2 and M3 using the REAL derived id
    // for M2 -- this is the id a reading decision written from `triage list` output
    // would use.
    writeFileSync(fixture.readingTablePath, encodeCsv(READING_HEADERS, [
      [m2Id, '2026-09-01', M2_SUBJECT, 'include', CODE_A, 'M2 판독', 'tester', '2026-09-21', ''],
      ['m3', '2026-09-01', M3_SUBJECT, 'include', CODE_A, 'M3 Owner 확인', 'tester', '2026-09-21', 'owner-ok'],
      ['h-shared', '2026-09-01', '공유 프로젝트 안내', 'include', `${CODE_A};${CODE_B}`, '공동 작업', 'tester', '2026-09-21', ''],
    ]));

    // Phase 3: the two production writers, over the exact same inputs.
    const refreshReceipt = refresh({
      workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-21T00:00:00.000Z',
      // S-a: vendorTablePath passed to refresh() too (previously only readingTablePath/
      // bundleTablePath were) -- without it, step 4 never fires and m-supplier-body
      // would wrongly fall through to organisation_undecided/미분류 in refresh()'s own
      // pipeline even though the common pipeline (which already got vendorTablePath)
      // attributed it.
      bundleTablePath: fixture.bundleTablePath, readingTablePath: fixture.readingTablePath, vendorTablePath: fixture.vendorTablePath,
    });
    assert.equal(refreshReceipt.status, 'ok');
    const commonReceipt = refreshCommon({
      workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-21T00:00:00.000Z',
      bundleTablePath: fixture.bundleTablePath, readingTablePath: fixture.readingTablePath, vendorTablePath: fixture.vendorTablePath,
    });
    assert.equal(commonReceipt.status, 'ok');

    // Phase 4: the source of truth for "which bucket SHOULD this mail be in" -- the
    // same classification pass `refreshCommon`/`triage.mjs` themselves run.
    const finalPass = classifyAllCommonMail(commonArgs(fixture));
    const projectIds = projectMailIds(fixture.workspacesRoot);

    // The core property: for EVERY classified mail, project-ledger membership
    // (from the REAL, WRITTEN files) exactly matches what the classification pass
    // says -- never a mail in a project ledger AND also 미분류 (or any other bucket),
    // and never a `project`-bucket mail missing from the project(s) it names.
    for (const { mail, outcome } of finalPass.classified) {
      const memberOf = [...projectIds.entries()].filter(([, ids]) => ids.has(mail.event_id)).map(([code]) => code).sort();
      if (outcome.bucket === 'project') {
        assert.deepEqual(memberOf, [...outcome.projectCodes].sort(),
          `mail ${mail.event_id}: refresh()'s written ledgers must match the common pipeline's own project attribution exactly`);
        assert.ok(memberOf.length >= 1);
      } else {
        assert.deepEqual(memberOf, [], `mail ${mail.event_id}: classified as '${outcome.bucket}' but also found in a project ledger -- never both`);
      }
    }

    // Sanity: every PRIMARY_BUCKETS value is covered by at least the fixture's own
    // deliberate coverage of the interesting ones (not exhaustive over all 13, but
    // enough to prove the loop above actually exercised more than one shape).
    const bucketsSeen = new Set(finalPass.classified.map(entry => entry.outcome.bucket));
    for (const expected of ['project', 'held', 'system', 'ads', 'internal_admin', 'external_notice',
      'out_of_project', 'code_pending', 'organisation_undecided', 'unclassified']) {
      assert.ok(bucketsSeen.has(expected), `expected bucket '${expected}' to be exercised by this fixture`);
    }
    assert.deepEqual([...bucketsSeen].sort(), [...bucketsSeen].filter(b => PRIMARY_BUCKETS.includes(b)).sort());

    // ---- M1: body keyword, no vendor -- must NOT attribute to any project.
    const m1Entry = finalPass.classified.find(entry => entry.mail.event_id === 'm1');
    assert.notEqual(m1Entry.outcome.bucket, 'project');
    assert.equal([...projectIds.values()].some(ids => ids.has('m1')), false);

    // ---- M2: no event_id -- refresh() must derive the SAME synthetic id the common
    // pipeline discovered and find the reading row keyed by it.
    const m2FinalEntry = finalPass.classified.find(entry => entry.mail.event_id === m2Id);
    assert.ok(m2FinalEntry, 'M2 must still resolve to the same id on the second pass (deterministic content hash)');
    assert.equal(m2FinalEntry.outcome.bucket, 'project');
    assert.deepEqual(m2FinalEntry.outcome.projectCodes, [CODE_A]);
    assert.ok(projectIds.get(CODE_A).has(m2Id), 'refresh() must have written a row keyed by the exact same id the reading table used');

    // ---- M3: system-sender domain, rescued by an Owner-confirmed reading decision.
    const m3Entry = finalPass.classified.find(entry => entry.mail.event_id === 'm3');
    assert.equal(m3Entry.outcome.bucket, 'project');
    assert.deepEqual(m3Entry.outcome.projectCodes, [CODE_A]);
    assert.ok(projectIds.get(CODE_A).has('m3'));
    // and it is NOT double-counted as a system-skip in refresh()'s own receipt.
    assert.equal(refreshReceipt.skipped_system, 1); // only h-system

    // ---- h-shared: deliberately shared -- present in BOTH project ledgers, and
    // counted once (not twice) in the common pipeline's own per-mail tally.
    assert.ok(projectIds.get(CODE_A).has('h-shared'));
    assert.ok(projectIds.get(CODE_B).has('h-shared'));
    assert.equal(finalPass.classified.filter(entry => entry.mail.event_id === 'h-shared').length, 1);

    // ---- S-a: m-supplier-body (a supplier-type vendor address, body-only keyword) --
    // step 4 must attribute it via refresh() itself (not just the common pipeline),
    // land it in project A's ledger, and it must never appear in 미분류.
    const supplierEntry = finalPass.classified.find(entry => entry.mail.event_id === 'm-supplier-body');
    assert.equal(supplierEntry.outcome.bucket, 'project');
    assert.deepEqual(supplierEntry.outcome.projectCodes, [CODE_A]);
    assert.ok(projectIds.get(CODE_A).has('m-supplier-body'), 'refresh() must have written the supplier-body-attributed mail into project A\'s own ledger');
    assert.equal([...projectIds.values()].filter(ids => ids !== projectIds.get(CODE_A)).some(ids => ids.has('m-supplier-body')), false);
    assert.notEqual(supplierEntry.outcome.fileName, '미분류.csv');
    // the "본문:" basis label must show up somewhere in the WRITTEN received-history
    // ledger for project A -- not just in the in-memory classification result.
    const recvCsvPath = path.join(fixture.workspacesRoot, FOLDER_A, `${LEDGER_DIR}/메일_수신이력.csv`);
    const recvDecoded = decodeCsv(readFileSync(recvCsvPath, 'utf8'));
    const labelIndex = recvDecoded.headers.indexOf('적용규칙'); // buildHistoryRow's own `label` column
    const supplierRow = recvDecoded.rows.find(row => row[recvDecoded.headers.indexOf('메일소스ID')] === 'm-supplier-body');
    assert.ok(supplierRow, 'm-supplier-body must have its own row in project A\'s received-history ledger');
    assert.match(supplierRow[labelIndex], /^본문:/u);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});
