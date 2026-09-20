// Every branch of `src/runtime/voice_attribution_policy.mjs`. Pure functions,
// no I/O, no model -- every case here is a plain object in, a plain object out.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GENERIC_TERMS, MIN_CORROBORATION, RISK_MARKERS, VOICE_ATTRIBUTION_POLICY_VERSION,
  classifyAttribution, distinctiveTerms, hasRiskMarker, linearCorroborates, mailCorroborates,
  matchedRiskMarkers, projectAliasTerms,
} from '../src/runtime/voice_attribution_policy.mjs';

const segment = (overrides = {}) => ({ nature: 'project_work', title: '시험 일정 공유', description: '다음 주 일정 공유',
  project_candidates: [], ...overrides });
const strongCandidate = { project_code: 'P24-049', strength: 'strong', basis: ['key_terms'], evidence_row_ids: [1] };
const weakCandidate = { project_code: 'P24-049', strength: 'weak', basis: ['key_terms'], evidence_row_ids: [1] };

// --------------------------------------------------------------- constants
test('exports carry the version this whole module answers for', () => {
  assert.equal(VOICE_ATTRIBUTION_POLICY_VERSION, 'v0');
  assert.equal(MIN_CORROBORATION, 1);
  assert.ok(RISK_MARKERS.includes('결정'));
  assert.ok(RISK_MARKERS.includes('마감'));
});

// -------------------------------------------------------------- risk markers
test('hasRiskMarker and matchedRiskMarkers read the default list', () => {
  assert.equal(hasRiskMarker('금요일까지 마감입니다'), true);
  assert.equal(hasRiskMarker('점심 맛있게 드세요'), false);
  assert.deepEqual(matchedRiskMarkers('결정된 예산 금액을 회신 주세요'), ['결정', '금액', '회신']);
  assert.deepEqual(matchedRiskMarkers('점심 맛있게 드세요'), []);
});

test('hasRiskMarker and matchedRiskMarkers accept a caller-supplied marker list', () => {
  assert.equal(hasRiskMarker('삭제 예정', ['삭제']), true);
  assert.equal(hasRiskMarker('삭제 예정', RISK_MARKERS), false);
  assert.deepEqual(matchedRiskMarkers('삭제 예정', ['삭제', '예정']), ['삭제', '예정']);
});

test('hasRiskMarker and matchedRiskMarkers tolerate non-string input', () => {
  assert.equal(hasRiskMarker(null), false);
  assert.equal(hasRiskMarker(undefined), false);
  assert.deepEqual(matchedRiskMarkers(42), []);
});

// ----------------------------------------------------------- distinctive terms
test('distinctiveTerms lowercases, splits on non-word characters, and drops short/numeric/generic tokens', () => {
  assert.deepEqual(distinctiveTerms('P24-049 SAS 처리장치 (저주파 SAS)'), ['p24', 'sas', '처리장치', '저주파']);
  assert.deepEqual(distinctiveTerms('오늘 그리고 내일 1234 a'), []);
  assert.deepEqual(distinctiveTerms(''), []);
  assert.deepEqual(distinctiveTerms(null), []);
});

test('distinctiveTerms deduplicates repeated tokens', () => {
  assert.deepEqual(distinctiveTerms('시험 시험 일정 시험'), ['시험', '일정']);
});

test('GENERIC_TERMS tokens never survive distinctiveTerms', () => {
  for (const term of GENERIC_TERMS) assert.deepEqual(distinctiveTerms(term), []);
});

// -------------------------------------------------------------- alias terms
test('projectAliasTerms drops the project code token but keeps the rest', () => {
  assert.deepEqual(projectAliasTerms('P24-049 SAS 처리장치 (저주파 SAS)', 'P24-049'), ['sas', '처리장치', '저주파']);
});

test('projectAliasTerms with no code strips nothing extra', () => {
  assert.deepEqual(projectAliasTerms('P24-049 SAS 처리장치'), ['p24', 'sas', '처리장치']);
});

// -------------------------------------------------------------- mail corroboration
test('mailCorroborates matches an alias term in the subject', () => {
  assert.equal(mailCorroborates({ subject: 'SAS 처리장치 검토 요청', fromDisplay: '' }, ['sas', '처리장치']), true);
});

test('mailCorroborates matches an alias term in the sender display text', () => {
  assert.equal(mailCorroborates({ subject: '검토 요청', fromDisplay: 'SAS팀 <team@example.com>' }, ['sas']), true);
});

test('mailCorroborates is false with no alias term present or no alias terms given', () => {
  assert.equal(mailCorroborates({ subject: '점심 메뉴', fromDisplay: '누군가' }, ['sas', '처리장치']), false);
  assert.equal(mailCorroborates({ subject: 'SAS 관련', fromDisplay: '' }, []), false);
});

// ------------------------------------------------------------ linear corroboration
test('linearCorroborates matches a shared distinctive term between issue title and segment text', () => {
  assert.equal(linearCorroborates({ title: 'SAS 처리장치 저주파 시험 준비' }, '시험 일정 공유 SAS 검토'), true);
});

test('linearCorroborates is false when nothing distinctive overlaps', () => {
  assert.equal(linearCorroborates({ title: '오늘 점심 메뉴' }, '시험 일정 공유'), false);
  assert.equal(linearCorroborates({ title: '' }, '시험 일정 공유'), false);
});

// -------------------------------------------------------------- classification
test('classifyAttribution skips a segment whose nature is not attributable', () => {
  for (const nature of ['idea', 'personal', 'mixed']) {
    const result = classifyAttribution(segment({ nature }));
    assert.equal(result.classification, 'skip');
    assert.equal(result.reason, 'nature_not_project_or_team');
    assert.equal(result.policy_version, VOICE_ATTRIBUTION_POLICY_VERSION);
  }
});

test('classifyAttribution skips an unreadable-nature segment with its own reason', () => {
  const result = classifyAttribution(segment({ nature: 'unreadable' }));
  assert.equal(result.classification, 'skip');
  assert.equal(result.reason, 'nature_unreadable');
});

test('classifyAttribution skips a segment that is not the expected shape', () => {
  assert.equal(classifyAttribution(null).classification, 'skip');
  assert.equal(classifyAttribution(null).reason, 'segment_unreadable');
  assert.equal(classifyAttribution({}).classification, 'skip');
  assert.equal(classifyAttribution({}).reason, 'segment_unreadable');
});

test('classifyAttribution returns provisional for a strong candidate, corroborated or not', () => {
  const withStrong = segment({ project_candidates: [strongCandidate] });
  const result = classifyAttribution(withStrong, null);
  assert.equal(result.classification, 'provisional');
  assert.equal(result.reason, 'strong_candidate');
  assert.deepEqual(result.risk_markers, []);
});

test('classifyAttribution returns provisional for a weak candidate corroborated by one independent source', () => {
  const withWeak = segment({ project_candidates: [weakCandidate] });
  const result = classifyAttribution(withWeak, { corroborated: true, refs: ['mail:evt-1'] });
  assert.equal(result.classification, 'provisional');
  assert.equal(result.reason, 'corroborated');
});

test('classifyAttribution does not treat a corroboration verdict below MIN_CORROBORATION as corroborated', () => {
  const withWeak = segment({ project_candidates: [weakCandidate] });
  const result = classifyAttribution(withWeak, { corroborated: true, refs: [] });
  assert.notEqual(result.classification, 'provisional');
});

test('classifyAttribution returns exception for weak/unclassified with a risk marker and no corroboration', () => {
  const withWeak = segment({ project_candidates: [weakCandidate], title: '예산 확정', description: '금요일 마감' });
  const result = classifyAttribution(withWeak, { corroborated: false, refs: [] });
  assert.equal(result.classification, 'exception');
  assert.equal(result.reason, 'risk_marker_without_corroboration');
  assert.deepEqual(result.risk_markers, ['확정', '마감']);
});

test('classifyAttribution treats an unclassified (no candidates) segment the same as weak for exception', () => {
  const unclassified = segment({ project_candidates: [], title: '계약 검토', description: '' });
  const result = classifyAttribution(unclassified, null);
  assert.equal(result.classification, 'exception');
  assert.deepEqual(result.risk_markers, ['계약']);
});

test('classifyAttribution returns candidate for weak/unclassified with no risk marker and no corroboration', () => {
  const withWeak = segment({ project_candidates: [weakCandidate] });
  const result = classifyAttribution(withWeak, { corroborated: false, refs: [] });
  assert.equal(result.classification, 'candidate');
  assert.equal(result.reason, 'weak_or_unclassified_no_risk');
});

test('classifyAttribution returns candidate for a fully unclassified segment with no risk marker', () => {
  const result = classifyAttribution(segment({ project_candidates: [], title: '점심 메뉴 논의', description: '' }));
  assert.equal(result.classification, 'candidate');
});
