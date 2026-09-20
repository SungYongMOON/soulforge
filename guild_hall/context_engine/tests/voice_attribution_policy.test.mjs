// Every branch of `src/runtime/voice_attribution_policy.mjs`. Pure functions,
// no I/O, no model -- every case here is a plain object in, a plain object out.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GENERIC_TERMS, MIN_CORROBORATION, MONEY_PATTERN, RISK_MARKERS, VOICE_ATTRIBUTION_POLICY_VERSION,
  classifyAttribution, distinctiveTerms, hasRiskMarker, linearCorroborates, mailCorroborates,
  matchedRiskMarkers, projectAliasTerms,
} from '../src/runtime/voice_attribution_policy.mjs';

const segment = (overrides = {}) => ({ nature: 'project_work', title: '시험 일정 공유', description: '다음 주 일정 공유',
  project_candidates: [], ...overrides });
const strongCandidate = { project_code: 'P24-049', strength: 'strong', basis: ['key_terms'], evidence_row_ids: [1] };
const weakCandidate = { project_code: 'P24-049', strength: 'weak', basis: ['key_terms'], evidence_row_ids: [1] };
const strongCandidateOtherProject = { project_code: 'P23-043', strength: 'strong', basis: ['key_terms'], evidence_row_ids: [2] };

// --------------------------------------------------------------- constants
test('exports carry the version this whole module answers for', () => {
  assert.equal(VOICE_ATTRIBUTION_POLICY_VERSION, 'v0');
  assert.equal(MIN_CORROBORATION, 1);
  assert.ok(RISK_MARKERS.includes('결정'));
  assert.ok(RISK_MARKERS.includes('마감'));
  assert.ok(!RISK_MARKERS.includes('원'));
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

test('a bare 원 inside an ordinary word is never a risk marker on its own', () => {
  assert.equal(hasRiskMarker('외부 지원 인력을 확인했습니다'), false);
  assert.equal(hasRiskMarker('원본 파일과 직원 명단을 원인 분석에 씁니다'), false);
});

test('MONEY_PATTERN and hasRiskMarker/matchedRiskMarkers catch a digit-adjacent currency amount', () => {
  assert.equal(MONEY_PATTERN.test('지원'), false);
  assert.equal(hasRiskMarker('자재비 500,000원 지출 예정'), true);
  assert.deepEqual(matchedRiskMarkers('자재비 500,000원 지출 예정'), ['500,000원']);
  assert.deepEqual(matchedRiskMarkers('예산 50만원 정도'), ['50만원']);
  assert.deepEqual(matchedRiskMarkers('결정된 예산은 1억 규모입니다'), ['결정', '1억']);
});

test('MONEY_PATTERN requires the digit immediately before the unit, not merely nearby in the sentence', () => {
  assert.equal(MONEY_PATTERN.test('항목 1. 원인 분석'), false);
  assert.equal(MONEY_PATTERN.test('자료 3 원본 확인'), false);
  assert.equal(MONEY_PATTERN.test('1 원문을 참고'), false);
  assert.equal(hasRiskMarker('항목 1. 원인 분석'), false);
  assert.equal(hasRiskMarker('자료 3 원본 확인'), false);
  assert.equal(hasRiskMarker('1 원문을 참고'), false);
});

test('MONEY_PATTERN matches every listed amount form, with or without a space before 만원', () => {
  for (const text of ['500,000원', '5,000만원', '5,000 만원', '3억']) assert.equal(MONEY_PATTERN.test(text), true);
});

test('MONEY_PATTERN does not mistake a date or a version number for an amount', () => {
  for (const text of ['10월 12일', '0.1.7', '2026년']) assert.equal(MONEY_PATTERN.test(text), false);
});

test('matchedRiskMarkers collects more than one amount in the same text', () => {
  assert.deepEqual(matchedRiskMarkers('자재비 500,000원과 인건비 5,000 만원 모두 집행'), ['500,000원', '5,000 만원']);
});

// ----------------------------------------------------------- distinctive terms
test('distinctiveTerms lowercases, splits on non-word characters, and drops short/numeric/generic tokens', () => {
  assert.deepEqual(distinctiveTerms('P24-049 SAS 처리장치 (저주파 SAS)'), ['p24', 'sas', '처리장치', '저주파']);
  assert.deepEqual(distinctiveTerms('오늘 그리고 내일 1234 a'), []);
  assert.deepEqual(distinctiveTerms(''), []);
  assert.deepEqual(distinctiveTerms(null), []);
});

test('distinctiveTerms deduplicates repeated tokens', () => {
  assert.deepEqual(distinctiveTerms('저주파 저주파 처리장치 저주파'), ['저주파', '처리장치']);
});

test('GENERIC_TERMS includes the everyday work words that would otherwise link unrelated records', () => {
  for (const term of ['시험', '회의', '검토', '일정', '자료', '확인', '보고', '계획', '진행', '준비', '데이터']) {
    assert.ok(GENERIC_TERMS.includes(term), term);
  }
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

test('mailCorroborates matches the project code itself as a standalone token, even with no alias terms', () => {
  assert.equal(mailCorroborates({ subject: 'P24-049 검토 요청', fromDisplay: '' }, [], 'P24-049'), true);
  assert.equal(mailCorroborates({ subject: '검토 요청', fromDisplay: '담당자 <team@example.com> P24-049' }, [], 'P24-049'), true);
});

test('mailCorroborates does not match a code that only appears as part of a longer token, or in the wrong case', () => {
  assert.equal(mailCorroborates({ subject: 'P24-0491 다른 과제 건' }, [], 'P24-049'), false);
  assert.equal(mailCorroborates({ subject: 'XP24-049 안내' }, [], 'P24-049'), false);
  assert.equal(mailCorroborates({ subject: '관련 없음' }, [], 'P24-049'), false);
  assert.equal(mailCorroborates({ subject: '검토 요청', fromDisplay: '담당자 <p24-049-team@example.com>' }, [], 'P24-049'), false);
});

// ------------------------------------------------------------ linear corroboration
test('linearCorroborates is true with two distinct shared distinctive terms', () => {
  assert.equal(linearCorroborates({ title: 'SAS 처리장치 저주파 음향' }, '저주파 음향 관련 이슈'), true);
});

test('linearCorroborates is true with exactly one shared term when it is also a project alias term', () => {
  assert.equal(linearCorroborates({ title: 'SAS 처리장치 관련 논의' }, '이슈 정리 SAS', ['sas', '처리장치', '저주파']), true);
});

test('linearCorroborates is false with exactly one shared term that is not a project alias term', () => {
  assert.equal(linearCorroborates({ title: 'SAS 처리장치 관련 논의' }, '이슈 정리 SAS', []), false);
  assert.equal(linearCorroborates({ title: 'SAS 처리장치 관련 논의' }, '이슈 정리 SAS'), false);
});

test('linearCorroborates is false when nothing distinctive overlaps, or the title is empty', () => {
  assert.equal(linearCorroborates({ title: '점심 메뉴 이야기' }, '저주파 처리장치 이슈'), false);
  assert.equal(linearCorroborates({ title: '' }, '저주파 처리장치 이슈'), false);
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

test('classifyAttribution treats two strong rows naming the same project as one candidate, not a conflict', () => {
  const duplicated = segment({ project_candidates: [strongCandidate, { ...strongCandidate, basis: ['other'] }] });
  const result = classifyAttribution(duplicated, null);
  assert.equal(result.classification, 'provisional');
  assert.equal(result.reason, 'strong_candidate');
});

test('classifyAttribution returns exception with strong_conflict for two different strong candidates, even when corroborated', () => {
  const conflicting = segment({ project_candidates: [strongCandidate, strongCandidateOtherProject] });
  const result = classifyAttribution(conflicting, { corroborated: true, refs: ['mail:evt-1'] });
  assert.equal(result.classification, 'exception');
  assert.equal(result.reason, 'strong_conflict');
  assert.deepEqual(result.risk_markers, []);
});

test('classifyAttribution ignores a malformed strong row with no real project_code, for both single-strong and conflict decisions', () => {
  const malformed = { strength: 'strong', basis: ['key_terms'], evidence_row_ids: [9] }; // no project_code at all
  const oneMalformedOnly = segment({ project_candidates: [malformed, { ...malformed }] });
  assert.notEqual(classifyAttribution(oneMalformedOnly, null).classification, 'provisional');
  assert.notEqual(classifyAttribution(oneMalformedOnly, null).reason, 'strong_conflict');

  const realPlusMalformed = segment({ project_candidates: [strongCandidate, malformed] });
  const result = classifyAttribution(realPlusMalformed, null);
  assert.equal(result.classification, 'provisional');
  assert.equal(result.reason, 'strong_candidate');
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

test('classifyAttribution treats a bare money amount, with no listed word, as a risk marker', () => {
  const withWeak = segment({ project_candidates: [weakCandidate], title: '자재비 500,000원 지출', description: '' });
  const result = classifyAttribution(withWeak, null);
  assert.equal(result.classification, 'exception');
  assert.deepEqual(result.risk_markers, ['500,000원']);
});

test('classifyAttribution does not treat an ordinary word ending in 원 as a risk marker', () => {
  const withWeak = segment({ project_candidates: [weakCandidate], title: '외부 지원 인력 확인', description: '' });
  const result = classifyAttribution(withWeak, null);
  assert.equal(result.classification, 'candidate');
});
