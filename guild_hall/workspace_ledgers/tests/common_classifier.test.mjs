import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compileRule, RULE_SCHEMA_VERSION } from '../src/classifier.mjs';
import {
  addressesOfMail, buildCommonConfig, classifyByOwnerTables, classifyProjectHits, detectSystemSource, OrgConfigPatternError,
  OrgConfigValueError, participantEmailsOf, resolvePrimaryBucket, vendorsOfAddresses, workTagsOf,
} from '../src/common_classifier.mjs';

function rule(code, exactPairs) {
  return compileRule({
    schema_version: RULE_SCHEMA_VERSION, project_code: code, folder_name: `${code}_예시`, rule_version: 'v1',
    match_fields: ['subject', 'body_text', 'attachment_names'], case_insensitive_literals: true,
    exact: exactPairs.map(([label, value]) => ({ label, kind: 'literal', value })), hint: [], yields_to: null,
    conflict_policy: 'two_projects_exact_on_one_mail_means_hold_no_attribution', sender_policy: 'hint_only',
  }, { timeSafety: false });
}

const RULE_A = rule('P00-001', [['A트리거', 'A트리거']]);
const RULE_B = rule('P00-002', [['B트리거', 'B트리거']]);

test('classifyProjectHits step 1: a single title trigger wins, basis is 제목', () => {
  const result = classifyProjectHits({ id: 'm1', subject: 'A트리거 안내', body: '', addresses: [] },
    { compiledRules: [RULE_A, RULE_B], bundles: [], readings: new Map(), vendorLookup: new Map() });
  assert.equal(result.held, false);
  assert.equal(result.basis, '제목');
  assert.deepEqual(result.hits.map(hit => hit.project_code), ['P00-001']);
});

test('classifyProjectHits step 1: two title triggers on one mail means held, no attribution', () => {
  const result = classifyProjectHits({ id: 'm2', subject: 'A트리거 그리고 B트리거', body: '', addresses: [] },
    { compiledRules: [RULE_A, RULE_B], bundles: [], readings: new Map(), vendorLookup: new Map() });
  assert.equal(result.held, true);
  assert.equal(result.hits.length, 0);
  assert.deepEqual(result.candidates.sort(), ['P00-001', 'P00-002']);
});

test('classifyProjectHits step 2: a bundle-table phrase confirms one or more projects, sharing marked in the label', () => {
  const bundles = [{ phrase: '분기 회의', codes: ['P00-001', 'P00-002'], why: 'Owner 확인' }];
  const result = classifyProjectHits({ id: 'm3', subject: '2026 분기 회의 자료', body: '', addresses: [] },
    { compiledRules: [RULE_A, RULE_B], bundles, readings: new Map(), vendorLookup: new Map() });
  assert.equal(result.basis, '묶음 확정');
  assert.deepEqual(result.hits.map(hit => hit.project_code).sort(), ['P00-001', 'P00-002']);
  assert.match(result.hits[0].label, /공유 P00-001;P00-002/);
});

test('classifyProjectHits (K1, coordinator fresh review round 3): step 1 matches the subject ONLY -- a keyword only in the body, even with body_text in the rule\'s own match_fields, is never a step-1 hit', () => {
  const ruleWithBodyField = rule('P00-003', [['바디전용트리거', '바디전용트리거']]); // rule() above already sets match_fields to include body_text -- K1: not consulted for step 1
  const result = classifyProjectHits({ id: 'm-k1', subject: '평범한 제목', body: '바디전용트리거가 여기 있음', addresses: [] },
    { compiledRules: [ruleWithBodyField], bundles: [], readings: new Map(), vendorLookup: new Map() });
  assert.equal(result.held, false);
  assert.equal(result.hits.length, 0); // never a step-1 hit, no matter what the rule's own match_fields says
});

test('classifyProjectHits (K1): fields other than exactly [\'subject\'] throws workspace_ledgers_fields_not_supported', () => {
  assert.throws(
    () => classifyProjectHits({ id: 'm-k1b', subject: 'A트리거 안내', body: '', addresses: [] },
      { compiledRules: [RULE_A], bundles: [], readings: new Map(), vendorLookup: new Map(), fields: ['subject', 'body_text'] }),
    error => error.code === 'workspace_ledgers_fields_not_supported',
  );
});

// ------------------------------------------------------ A2 item 1 (2026-09-21 night)
test('classifyByOwnerTables (A2 item 1): a bundle row past its own 적용끝 does not match a mail received after that date, but still matches on/before it', () => {
  const bundles = [{ phrase: '분기 회의', codes: ['P00-001'], why: 'Owner 확인', appliesUntil: '2026-09-15' }];
  const knownCode = code => code === 'P00-001';
  const onCutoff = classifyByOwnerTables({ id: 'm1', subject: '2026 분기 회의 자료', at: '2026-09-15T23:00:00+09:00' }, { bundles, readings: new Map(), knownCode });
  assert.equal(onCutoff.decided, true);
  assert.equal(onCutoff.basis, '묶음 확정');
  const afterCutoff = classifyByOwnerTables({ id: 'm2', subject: '2026 분기 회의 자료', at: '2026-09-16T00:01:00Z' }, { bundles, readings: new Map(), knownCode });
  assert.equal(afterCutoff.decided, false); // no reading row either, so nothing decided at all
});

test('classifyByOwnerTables (S4, coordinator fresh review round 2): the tight UTC boundary around the Seoul-calendar cutoff day', () => {
  const bundles = [{ phrase: '분기 회의', codes: ['P00-001'], why: 'Owner 확인', appliesUntil: '2026-09-15' }];
  const knownCode = code => code === 'P00-001';
  // 2026-09-15T14:59:59Z is 2026-09-15 23:59:59 KST -- still the cutoff day itself.
  const stillOnDay = classifyByOwnerTables({ id: 'm1', subject: '2026 분기 회의 자료', at: '2026-09-15T14:59:59Z' }, { bundles, readings: new Map(), knownCode });
  assert.equal(stillOnDay.decided, true);
  // 2026-09-15T15:00:00Z is 2026-09-16 00:00:00 KST -- one second later in UTC, but
  // already the NEXT Seoul calendar day, past the cutoff.
  const nextDay = classifyByOwnerTables({ id: 'm2', subject: '2026 분기 회의 자료', at: '2026-09-15T15:00:00Z' }, { bundles, readings: new Map(), knownCode });
  assert.equal(nextDay.decided, false);
});

test('classifyByOwnerTables (A2 item 1): appliesUntil: null (legacy table, or a blank cell) applies indefinitely regardless of `at`', () => {
  const bundles = [{ phrase: '분기 회의', codes: ['P00-001'], why: 'Owner 확인', appliesUntil: null }];
  const knownCode = code => code === 'P00-001';
  const farFuture = classifyByOwnerTables({ id: 'm1', subject: '2026 분기 회의 자료', at: '2030-01-01T00:00:00Z' }, { bundles, readings: new Map(), knownCode });
  assert.equal(farFuture.decided, true);
  assert.equal(farFuture.basis, '묶음 확정');
});

test('classifyByOwnerTables: matches neither table returns decided:false but still surfaces unknownBundleTarget when a phrase matched an unknown code', () => {
  const bundles = [{ phrase: '분기 회의', codes: ['P99-999'], why: 'x', appliesUntil: null }];
  const knownCode = code => code === 'P00-001';
  const result = classifyByOwnerTables({ id: 'm1', subject: '2026 분기 회의 자료' }, { bundles, readings: new Map(), knownCode });
  assert.equal(result.decided, false);
  assert.equal(result.unknownBundleTarget, true);
});

test('classifyProjectHits step 3: reading table include/include_with_review attributes, vendor_only and exclude do not', () => {
  const readings = new Map([
    ['include-id', { level: 'include', target: 'P00-001', why: '검토완료' }],
    ['review-id', { level: 'include_with_review', target: 'P00-002', why: '추정' }],
    ['vendor-id', { level: 'vendor_only', target: '', why: '' }],
    ['exclude-id', { level: 'exclude', target: '광고', why: '' }],
    ['hold-id', { level: 'hold_owner_review', target: '', why: '' }],
  ]);
  const withId = id => classifyProjectHits({ id, subject: '무관한 제목', body: '', addresses: [] },
    { compiledRules: [RULE_A, RULE_B], bundles: [], readings, vendorLookup: new Map() });
  assert.deepEqual(withId('include-id').hits.map(h => h.project_code), ['P00-001']);
  assert.equal(withId('include-id').basis, '판독');
  assert.deepEqual(withId('review-id').hits.map(h => h.project_code), ['P00-002']);
  assert.equal(withId('review-id').basis, '판독(검토 필요)');
  assert.equal(withId('vendor-id').hits.length, 0);
  assert.equal(withId('vendor-id').basis, '판독: 거래처만');
  assert.equal(withId('exclude-id').hits.length, 0);
  assert.equal(withId('exclude-id').basis, '판독: 과제 아님');
  assert.equal(withId('hold-id').basis, '판독: 보류');
});

test('classifyProjectHits step 4: a supplier vendor confirms a project from the body, but a customer/agency/school vendor never does', () => {
  const vendorLookup = new Map([
    ['supplier.example', { key: 'supplier.example', name: 'Supplier Co', kind: '부품' }],
    ['customer.example', { key: 'customer.example', name: 'Customer Inc', kind: '고객사' }],
  ]);
  const supplierResult = classifyProjectHits({ id: 'm4', subject: '무관한 제목', body: 'A트리거가 본문에 있음', addresses: ['supplier.example'] },
    { compiledRules: [RULE_A, RULE_B], bundles: [], readings: new Map(), vendorLookup });
  assert.equal(supplierResult.basis, '본문');
  assert.deepEqual(supplierResult.hits.map(h => h.project_code), ['P00-001']);

  const customerResult = classifyProjectHits({ id: 'm5', subject: '무관한 제목', body: 'A트리거가 본문에 있음', addresses: ['customer.example'] },
    { compiledRules: [RULE_A, RULE_B], bundles: [], readings: new Map(), vendorLookup });
  assert.equal(customerResult.basis, '미정');
  assert.equal(customerResult.hits.length, 0);
});

test('classifyProjectHits step 4: two projects in the body is 미정(본문에 여러 과제), listing candidates', () => {
  const vendorLookup = new Map([['supplier.example', { key: 'supplier.example', name: 'Supplier Co', kind: '부품' }]]);
  const result = classifyProjectHits({ id: 'm6', subject: '무관한 제목', body: 'A트리거 그리고 B트리거', addresses: ['supplier.example'] },
    { compiledRules: [RULE_A, RULE_B], bundles: [], readings: new Map(), vendorLookup });
  assert.equal(result.basis, '미정(본문에 여러 과제)');
  assert.deepEqual(result.candidates.sort(), ['P00-001', 'P00-002']);
});

test('classifyProjectHits step 5: no signal at all is 미정', () => {
  const result = classifyProjectHits({ id: 'm7', subject: '무관한 제목', body: '', addresses: [] },
    { compiledRules: [RULE_A, RULE_B], bundles: [], readings: new Map(), vendorLookup: new Map() });
  assert.equal(result.basis, '미정');
  assert.equal(result.hits.length, 0);
});

test('addressesOfMail / vendorsOfAddresses: a mail matching two vendor addresses gets both, deduped by vendor name', () => {
  const addresses = addressesOfMail({ from: { name: '', email: 'a@vendor-x.example' }, to: [{ name: '', email: 'b@vendor-y.example' }], cc: [] });
  const vendorLookup = new Map([
    ['vendor-x.example', { key: 'vendor-x.example', name: 'Vendor X', kind: '부품' }],
    ['vendor-y.example', { key: 'vendor-y.example', name: 'Vendor Y', kind: '부품' }],
  ]);
  const vendors = vendorsOfAddresses(addresses, vendorLookup);
  assert.deepEqual(vendors.map(v => v.name).sort(), ['Vendor X', 'Vendor Y']);
});

test('workTagsOf: matches a "[태그]" literal in the subject, case-insensitively', () => {
  assert.deepEqual(workTagsOf('작업 안내 [smt] 진행', ['SMT', 'PCB']), ['SMT']);
  assert.deepEqual(workTagsOf('무관한 제목', ['SMT']), []);
});

// --------------------------------------------------------------- primary-bucket order
const ORG_CONFIG = {
  our_domain: 'example.com',
  common_ledgers: {
    common_folder_name: 'P00-000_공통',
    general_work_folder_name: 'general_work_일반업무',
    system_notification_sources: [{ name: '예시알림', sender_domains: ['notify.vendor.example'] }],
    ads_sender_domains: ['marketing.vendor.example'],
    ads_subject_patterns: ['^\\s*\\(광고\\)'],
    agency_notice_sender_domains: ['agency.example'],
    internal_admin_subject_patterns: [{ label: '급여', pattern: '급여명세서' }],
    out_of_project_subject_patterns: [{ label: '구매', pattern: '발주서' }],
    code_pending_subject_patterns: [{ label: '신규후보', pattern: '신규 ?과제 ?후보' }],
  },
};
const COMMON_CONFIG = buildCommonConfig(ORG_CONFIG);

function mail({ subject, fromDomain = 'client.example' }) { return { subject, fromDomain, from: { email: `x@${fromDomain}` } }; }

test('detectSystemSource: matched before anything else -- checked by the caller pipeline, but detectable standalone', () => {
  assert.equal(detectSystemSource(mail({ subject: 'anything', fromDomain: 'notify.vendor.example' }), COMMON_CONFIG), '예시알림');
  assert.equal(detectSystemSource(mail({ subject: 'anything' }), COMMON_CONFIG), null);
});

function noProject() { return { hits: [], held: false, vendors: [], candidates: [], reading: null }; }

test('resolvePrimaryBucket: ads subject pattern excludes with no file', () => {
  const outcome = resolvePrimaryBucket(mail({ subject: '(광고) 특가 안내' }), noProject(), COMMON_CONFIG, { ourDomain: 'example.com' });
  assert.equal(outcome.bucket, 'ads');
  assert.equal(outcome.fileName, null);
});

test('resolvePrimaryBucket: an ads sender-keyword match on the from address never throws (mail.from is a {name,email} record, not a string)', () => {
  const configWithKeyword = buildCommonConfig({ common_ledgers: { ads_sender_keywords: ['newsletter'] } });
  const outcome = resolvePrimaryBucket(mail({ subject: '무관한 제목', fromDomain: 'newsletter.vendor.example' }), noProject(), configWithKeyword, { ourDomain: 'example.com' });
  assert.equal(outcome.bucket, 'ads');
});

test('resolvePrimaryBucket: reading exclude target routes to the matching common bucket', () => {
  const reading = { level: 'exclude', target: '일반업무:단발 지원', why: '' };
  const outcome = resolvePrimaryBucket(mail({ subject: '단발 지원 요청' }), { ...noProject(), reading }, COMMON_CONFIG, { ourDomain: 'example.com' });
  assert.equal(outcome.bucket, 'general_work');
  assert.equal(outcome.fileName, '일반업무_메일.csv');
  assert.equal(outcome.detail, '단발 지원');
});

test('resolvePrimaryBucket (A2 item 2, rename): both the old "과제없음" target and the new "과제미정" token route to the renamed 판독_과제미정.csv bucket', () => {
  const oldToken = resolvePrimaryBucket(mail({ subject: '무관' }), { ...noProject(), reading: { level: 'exclude', target: '과제없음', why: '아직 모름' } },
    COMMON_CONFIG, { ourDomain: 'example.com' });
  assert.equal(oldToken.bucket, 'no_code_confirmed');
  assert.equal(oldToken.fileName, '판독_과제미정.csv');
  const newToken = resolvePrimaryBucket(mail({ subject: '무관' }), { ...noProject(), reading: { level: 'exclude', target: '과제미정', why: '아직 모름' } },
    COMMON_CONFIG, { ourDomain: 'example.com' });
  assert.equal(newToken.bucket, 'no_code_confirmed');
  assert.equal(newToken.fileName, '판독_과제미정.csv');
});

test('resolvePrimaryBucket: reading vendor_only with a matched vendor routes to vendor_only (no file)', () => {
  const reading = { level: 'vendor_only', target: '관련 P00-001', why: '' };
  const outcome = resolvePrimaryBucket(mail({ subject: '무관' }), { ...noProject(), vendors: [{ name: 'V' }], reading }, COMMON_CONFIG, { ourDomain: 'example.com' });
  assert.equal(outcome.bucket, 'vendor_only');
  assert.equal(outcome.fileName, null);
});

test('resolvePrimaryBucket: code-pending and out-of-project subject patterns, checked before admin/notice', () => {
  const pending = resolvePrimaryBucket(mail({ subject: '신규 과제 후보 검토' }), noProject(), COMMON_CONFIG, { ourDomain: 'example.com' });
  assert.equal(pending.bucket, 'code_pending');
  const outOfProject = resolvePrimaryBucket(mail({ subject: '발주서 송부' }), noProject(), COMMON_CONFIG, { ourDomain: 'example.com' });
  assert.equal(outOfProject.bucket, 'out_of_project');
  assert.equal(outOfProject.fileName, '과제외_구매.csv');
});

test('resolvePrimaryBucket: internal-admin pattern from our own domain is 사내행정, the same pattern from outside is 외부안내', () => {
  const own = resolvePrimaryBucket(mail({ subject: '9월 급여명세서 발송', fromDomain: 'example.com' }), noProject(), COMMON_CONFIG, { ourDomain: 'example.com' });
  assert.equal(own.bucket, 'internal_admin');
  const outside = resolvePrimaryBucket(mail({ subject: '9월 급여명세서 발송', fromDomain: 'client.example' }), noProject(), COMMON_CONFIG, { ourDomain: 'example.com' });
  assert.equal(outside.bucket, 'external_notice');
});

test('resolvePrimaryBucket: an agency-notice sender domain (no admin pattern match) is 외부안내: 기관 안내', () => {
  const outcome = resolvePrimaryBucket(mail({ subject: '무관한 제목', fromDomain: 'agency.example' }), noProject(), COMMON_CONFIG, { ourDomain: 'example.com' });
  assert.equal(outcome.bucket, 'external_notice');
  assert.equal(outcome.detail, '기관 안내');
});

test('resolvePrimaryBucket: nothing matches and no vendor touches the mail falls to 미분류', () => {
  const outcome = resolvePrimaryBucket(mail({ subject: '완전히 무관한 제목' }), noProject(), COMMON_CONFIG, { ourDomain: 'example.com' });
  assert.equal(outcome.bucket, 'unclassified');
  assert.equal(outcome.fileName, '미분류.csv');
});

test('resolvePrimaryBucket (coordinator correction): a mail touching a known organisation, with no project/hold/reading decision, is organisation_undecided -- not 미분류', () => {
  const outcome = resolvePrimaryBucket(mail({ subject: '완전히 무관한 제목' }),
    { ...noProject(), vendors: [{ name: 'Vendor Co' }] }, COMMON_CONFIG, { ourDomain: 'example.com' });
  assert.equal(outcome.bucket, 'organisation_undecided');
  assert.equal(outcome.fileName, null); // no primary file -- represented only in that vendor's own secondary ledger
  assert.equal(outcome.basisOverride, '거래처(자동)');
});

test('resolvePrimaryBucket (R1, fresh review): a mail touching a known organisation but with a hold_owner_review/unroutable reading decision stays in the triage queue (미분류), not organisation_undecided', () => {
  const vendors = [{ name: 'Vendor Co' }];
  const holdReading = { level: 'hold_owner_review', target: '', why: '' };
  const held = resolvePrimaryBucket(mail({ subject: '완전히 무관한 제목' }),
    { ...noProject(), vendors, reading: holdReading }, COMMON_CONFIG, { ourDomain: 'example.com' });
  assert.equal(held.bucket, 'unclassified');
  assert.equal(held.fileName, '미분류.csv');

  // An 'exclude' row whose target matches none of the routing prefixes -- also stays
  // in the triage queue rather than silently disappearing into organisation_undecided.
  const unroutableExclude = { level: 'exclude', target: '알 수 없는 분류', why: '' };
  const unroutable = resolvePrimaryBucket(mail({ subject: '완전히 무관한 제목' }),
    { ...noProject(), vendors, reading: unroutableExclude }, COMMON_CONFIG, { ourDomain: 'example.com' });
  assert.equal(unroutable.bucket, 'unclassified');

  // An 'include' row naming an unknown project code -- classifyProjectHits already
  // falls this through to the same generic reading branch (basis '판독: 보류'),
  // still carrying `reading`; resolvePrimaryBucket must not treat that as "no
  // decision" either.
  const unknownCodeReading = { level: 'include', target: 'P99-999', why: '' };
  const unknownCode = resolvePrimaryBucket(mail({ subject: '완전히 무관한 제목' }),
    { ...noProject(), vendors, reading: unknownCodeReading }, COMMON_CONFIG, { ourDomain: 'example.com' });
  assert.equal(unknownCode.bucket, 'unclassified');
});

// ------------------------------------------------------------------------------- S1
test('classifyProjectHits (S1): a bundle row naming ANY unknown code is not a match at all -- never attributes the known subset', () => {
  const bundles = [{ phrase: '분기 회의', codes: ['P00-001', 'P99-999'], why: 'Owner 확인' }];
  const result = classifyProjectHits({ id: 'm-s1a', subject: '2026 분기 회의 자료', body: '', addresses: [] },
    { compiledRules: [RULE_A, RULE_B], bundles, readings: new Map(), vendorLookup: new Map() });
  assert.equal(result.hits.length, 0);
  assert.equal(result.unknownBundleTarget, true);
  assert.equal(result.basis, '미정'); // falls all the way through to step 5 (no reading/body signal in this fixture)
});

test('classifyProjectHits (S1): an include reading row naming an unknown code is counted as unknownReadingTarget, not silently absorbed', () => {
  const readings = new Map([['m-s1b', { level: 'include', target: 'P99-999', why: 'x' }]]);
  const result = classifyProjectHits({ id: 'm-s1b', subject: '무관한 제목', body: '', addresses: [] },
    { compiledRules: [RULE_A, RULE_B], bundles: [], readings, vendorLookup: new Map() });
  assert.equal(result.hits.length, 0);
  assert.equal(result.unknownReadingTarget, true);
  assert.equal(result.basis, '판독: 보류');
});

// ------------------------------------------------------------------------------- S2
test('resolvePrimaryBucket (S2): an explicit vendor_only reading decision wins over a system-source pattern match, and is flagged decisionOverrodePattern', () => {
  const configWithSystemSource = buildCommonConfig({ common_ledgers: { system_notification_sources: [{ name: '시스템X', sender_domains: ['sys.example'] }] } });
  const reading = { level: 'vendor_only', target: '', why: '' };
  const outcome = resolvePrimaryBucket(mail({ subject: '무관', fromDomain: 'sys.example' }),
    { ...noProject(), vendors: [{ name: 'V' }], reading }, configWithSystemSource, { ourDomain: 'example.com' });
  assert.equal(outcome.bucket, 'vendor_only');
  assert.equal(outcome.decisionOverrodePattern, true);
});

test('resolvePrimaryBucket (S2): a hold_owner_review reading decision does NOT override a system-source pattern bucket -- it is explicitly "no decision yet"', () => {
  const configWithSystem = buildCommonConfig({ common_ledgers: { system_notification_sources: [{ name: '시스템X', sender_domains: ['sys.example'] }] } });
  const reading = { level: 'hold_owner_review', target: '', why: '' };
  const outcome = resolvePrimaryBucket(mail({ subject: '무관', fromDomain: 'sys.example' }),
    { ...noProject(), vendors: [], reading }, configWithSystem, { ourDomain: 'example.com' });
  assert.equal(outcome.bucket, 'system');
  assert.equal(outcome.decisionOverrodePattern, undefined);
});

test('resolvePrimaryBucket (S8, fresh non-author review): a reading decision that exists but does not route (vendor_only, no organisation) never falls into ads -- stays unclassified', () => {
  const configWithAds = buildCommonConfig({ common_ledgers: { ads_sender_domains: ['ads.example'] } });
  const reading = { level: 'vendor_only', target: '', why: '' };
  const outcome = resolvePrimaryBucket(mail({ subject: '무관', fromDomain: 'ads.example' }),
    { ...noProject(), vendors: [], reading }, configWithAds, { ourDomain: 'example.com' });
  assert.equal(outcome.bucket, 'unclassified'); // not 'ads' -- the mail is not lost with no artifact
});

test('resolvePrimaryBucket (S8): even a hold_owner_review decision suppresses the ads fallback', () => {
  const configWithAds = buildCommonConfig({ common_ledgers: { ads_sender_domains: ['ads.example'] } });
  const reading = { level: 'hold_owner_review', target: '', why: '' };
  const outcome = resolvePrimaryBucket(mail({ subject: '무관', fromDomain: 'ads.example' }),
    { ...noProject(), vendors: [], reading }, configWithAds, { ourDomain: 'example.com' });
  assert.equal(outcome.bucket, 'unclassified');
});

test('resolvePrimaryBucket: with no reading decision at all, an ads pattern match still excludes normally', () => {
  const configWithAds = buildCommonConfig({ common_ledgers: { ads_sender_domains: ['ads.example'] } });
  const outcome = resolvePrimaryBucket(mail({ subject: '무관', fromDomain: 'ads.example' }), noProject(), configWithAds, { ourDomain: 'example.com' });
  assert.equal(outcome.bucket, 'ads');
});

// ------------------------------------------------------------------------------- S7
test('buildCommonConfig (S7): a ReDoS-unsafe org-config pattern is rejected at config-load time with the config key, never the pattern text', () => {
  assert.throws(() => buildCommonConfig({ common_ledgers: { ads_subject_patterns: ['^(a|a)+$'] } }),
    error => error instanceof OrgConfigPatternError && error.code === 'workspace_ledgers_org_config_pattern_invalid'
      && error.configKey === 'common_ledgers.ads_subject_patterns[0]');
});

test('buildCommonConfig (S7): a structurally unsafe pattern (nested quantifier) in a labeled list is also rejected, naming its own config key', () => {
  assert.throws(() => buildCommonConfig({ common_ledgers: { internal_admin_subject_patterns: [{ label: '급여', pattern: '(a+)+' }] } }),
    error => error instanceof OrgConfigPatternError
      && error.configKey === 'common_ledgers.internal_admin_subject_patterns[0]');
});

test('participantEmailsOf: collects every from/to/cc address, lowercased', () => {
  const emails = participantEmailsOf({ from: { email: 'A@x.example' }, to: [{ email: 'b@x.example' }], cc: [{ email: 'C@y.example' }] });
  assert.deepEqual([...emails].sort(), ['a@x.example', 'b@x.example', 'c@y.example']);
});

// ------------------------------------------------------- required-review item 1
test('buildCommonConfig (required-review item 1, second fresh review): a path-traversal-shaped common_folder_name is rejected at config-build time, naming the config key only', () => {
  assert.throws(() => buildCommonConfig({ common_ledgers: { common_folder_name: '../../escaped' } }),
    error => error instanceof OrgConfigValueError && error.code === 'workspace_ledgers_org_config_value_invalid'
      && error.configKey === 'common_ledgers.common_folder_name');
});

test('buildCommonConfig (required-review item 1): the same rejection applies to general_work_folder_name', () => {
  assert.throws(() => buildCommonConfig({ common_ledgers: { general_work_folder_name: 'a/b' } }),
    error => error instanceof OrgConfigValueError && error.configKey === 'common_ledgers.general_work_folder_name');
});

test('buildCommonConfig (required-review item 1): a safe folder name is accepted', () => {
  const config = buildCommonConfig({ common_ledgers: { common_folder_name: 'P00-000_공통', general_work_folder_name: 'general_work_일반업무' } });
  assert.equal(config.commonFolderName, 'P00-000_공통');
  assert.equal(config.generalWorkFolderName, 'general_work_일반업무');
});

// ------------------------------------------------------- required-review item 2
test('classifyProjectHits (required-review item 2): bundle rows with a phrase match but unknown codes never shadow a later, valid row with an overlapping phrase (NIT 13)', () => {
  const bundles = [
    { phrase: '회의', codes: ['P99-999'], why: '모르는 코드' }, // matches first, but P99-999 unknown
    { phrase: '분기 회의', codes: ['P00-001'], why: '실제 결정' },
  ];
  const result = classifyProjectHits({ id: 'nit13', subject: '2026 분기 회의 자료', body: '', addresses: [] },
    { compiledRules: [RULE_A, RULE_B], bundles, readings: new Map(), vendorLookup: new Map() });
  assert.deepEqual(result.hits.map(hit => hit.project_code), ['P00-001']);
  assert.equal(result.unknownBundleTarget, false); // a valid match was found, so this is not "unknown"
});
