import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compileRule, RULE_SCHEMA_VERSION } from '../src/classifier.mjs';
import {
  addressesOfMail, buildCommonConfig, classifyProjectHits, detectSystemSource, resolvePrimaryBucket, vendorsOfAddresses, workTagsOf,
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

test('resolvePrimaryBucket: nothing matches falls to 미분류', () => {
  const outcome = resolvePrimaryBucket(mail({ subject: '완전히 무관한 제목' }), noProject(), COMMON_CONFIG, { ourDomain: 'example.com' });
  assert.equal(outcome.bucket, 'unclassified');
  assert.equal(outcome.fileName, '미분류.csv');
});
