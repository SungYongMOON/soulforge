// Every branch of `src/runtime/voice_attribution_policy.mjs`. Pure functions,
// no I/O, no model -- every case here is a plain object in, a plain object out.
//
// v1 rewrite (Step 3): the classification section below replaces v0's.
// Kept, unchanged in meaning, from v0 (see each test's own note where it
// changed): the risk-marker/money-pattern/distinctive-term/alias/mail/Linear
// corroboration helpers, `strong_conflict`, the malformed-candidate guard,
// `segment_unreadable`. Rewritten because they encoded v0 behaviour a fresh
// review found wrong or a v0-era placeholder: `nature: 'unreadable'` used to
// `skip` (now `candidate`/`needs_recovery` -- CE-26); weak corroboration used
// to promote to `provisional` on its own (now `cues` only, never promotes);
// `risk_marker_without_corroboration` is renamed `important_and_unresolved`
// (or `conditional_or_reported` under a modality tag); a segment with no
// project candidates at all and a bare risk marker used to land in the same
// exception reason as everything else (now `missing_context`, a more
// specific reason, when nothing else in the text is named either).
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEADLINE_PATTERN, GENERIC_TERMS, MIN_CORROBORATION, MONEY_PATTERN, RISK_MARKERS, VOICE_ATTRIBUTION_POLICY_VERSION,
  classifyAttribution, contentCheck, detectModality, distinctiveTerms, extractAmounts, extractDates, hasRiskMarker,
  linearCorroborates, mailCorroborates, matchedRiskMarkers, projectAliasTerms,
} from '../src/runtime/voice_attribution_policy.mjs';

const segment = (overrides = {}) => ({ nature: 'project_work', title: '시험 일정 공유', description: '다음 주 일정 공유',
  project_candidates: [], quality: null, ...overrides });
const strongCandidate = { project_code: 'P24-049', strength: 'strong', basis: ['key_terms'], evidence_row_ids: [1] };
const weakCandidate = { project_code: 'P24-049', strength: 'weak', basis: ['key_terms'], evidence_row_ids: [1] };
const strongCandidateOtherProject = { project_code: 'P23-043', strength: 'strong', basis: ['key_terms'], evidence_row_ids: [2] };

// --------------------------------------------------------------- constants
test('exports carry the version this whole module answers for', () => {
  assert.equal(VOICE_ATTRIBUTION_POLICY_VERSION, 'v1');
  assert.equal(MIN_CORROBORATION, 1);
  assert.ok(RISK_MARKERS.includes('결정'));
  assert.ok(RISK_MARKERS.includes('마감'));
  assert.ok(!RISK_MARKERS.includes('원'));
  // v1 additions (CE-26 known misses, fixed rather than left for "a future
  // rule-v1 decision" -- this module now is that decision).
  assert.ok(RISK_MARKERS.includes('미완료'));
  assert.ok(RISK_MARKERS.includes('완료되지 않'));
});

// -------------------------------------------------------------- risk markers
test('hasRiskMarker and matchedRiskMarkers read the default list', () => {
  assert.equal(hasRiskMarker('금요일까지 마감입니다'), true);
  assert.equal(hasRiskMarker('점심 맛있게 드세요'), false);
  // '회신 주세요' (without '해') is not one of the recognised request forms --
  // a known miss, not a bug (see RISK_MARKERS's own comment).
  assert.deepEqual(matchedRiskMarkers('결정된 예산 금액을 회신 주세요'), ['결정', '금액']);
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
  assert.deepEqual(matchedRiskMarkers('자재비 500,000원, 인건비 5,000 만원 모두 집행'), ['500,000원', '5,000 만원']);
});

test('MONEY_PATTERN does not follow the unit into another word (원소/원인/원본 are not amounts)', () => {
  assert.equal(MONEY_PATTERN.test('3원소 배열'), false);
  assert.equal(matchedRiskMarkers('3원소 배열').length, 0);
  // A real amount immediately against a following Hangul particle, with no
  // space or punctuation, is the traded-away case -- known miss, documented
  // in MONEY_PATTERN's own comment, not asserted here as a false claim of
  // correctness either way.
});

test('MONEY_PATTERN allows one space between digits and a bare 원, but only for a number large enough to plausibly be an amount', () => {
  assert.equal(MONEY_PATTERN.test('5000 원'), true);
  assert.equal(MONEY_PATTERN.test('5,000 원'), true);
  assert.equal(MONEY_PATTERN.test('1 원문을 참고'), false);
  assert.equal(MONEY_PATTERN.test('자료 3 원본 확인'), false);
});

test('회신 only counts as a risk marker in a recognised request/deadline form, not on its own', () => {
  assert.deepEqual(matchedRiskMarkers('회신 감사합니다'), []);
  assert.deepEqual(matchedRiskMarkers('빠른 회신 요청드립니다'), ['회신 요청']);
  assert.deepEqual(matchedRiskMarkers('회신 바랍니다'), ['회신 바랍']);
  assert.deepEqual(matchedRiskMarkers('회신해 주세요'), ['회신해 주']);
  assert.deepEqual(matchedRiskMarkers('회신 부탁드립니다'), ['회신 부탁']);
  // v1: '금요일까지' now also matches DEADLINE_PATTERN on its own (widened
  // deadline detection, CE-26) -- both fire, not just the '까지 회신' form.
  assert.deepEqual(matchedRiskMarkers('금요일까지 회신 주세요'), ['까지 회신', '금요일까지']);
});

// v1: CE-26's known misses, now fixed rather than left for later.
test('DEADLINE_PATTERN and matchedRiskMarkers catch a relative-day deadline with no 회신/답장 word at all', () => {
  assert.equal(DEADLINE_PATTERN.test('내일까지 보내 주세요'), true);
  assert.equal(hasRiskMarker('내일까지 보내 주세요'), true);
  assert.deepEqual(matchedRiskMarkers('내일까지 보내 주세요'), ['내일까지']);
  assert.deepEqual(matchedRiskMarkers('금요일까지 제출 부탁드립니다'), ['제출', '금요일까지']);
  assert.deepEqual(matchedRiskMarkers('9월 20일까지 완료해 주세요'), ['9월 20일까지']);
});

test('DEADLINE_PATTERN does not fire on a bare 까지 with no day/date word before it', () => {
  assert.equal(DEADLINE_PATTERN.test('여기까지 왔습니다'), false);
  assert.equal(DEADLINE_PATTERN.test('이까지 진행했습니다'), false);
  assert.equal(hasRiskMarker('여기까지 왔습니다'), false);
});

test('미완료/완료되지 않 are risk markers on their own, with no deadline or money word needed', () => {
  assert.equal(hasRiskMarker('아직 미완료 상태입니다'), true);
  assert.deepEqual(matchedRiskMarkers('아직 완료되지 않았습니다'), ['완료되지 않']);
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

// ---------------------------------------------------------------- v1/R2: dates/amounts
test('extractDates finds M월 D일 and YYYY-MM-DD, but not a relative-week reference (documented as not checked)', () => {
  assert.deepEqual(extractDates('9월 20일까지 완료, 2026-09-20 확인, 다음 주에 재논의'), ['9월 20일', '2026-09-20']);
  assert.deepEqual(extractDates('별다른 날짜 없음'), []);
});

test('extractDates also finds M/D, YYYY.M.D, M.D and a bare D일 once a month was named earlier in the same text', () => {
  assert.deepEqual(extractDates('9/18 확인'), ['9/18']);
  assert.deepEqual(extractDates('2026.9.18 확인'), ['2026.9.18']);
  assert.deepEqual(extractDates('9.18 확인'), ['9.18']);
  assert.deepEqual(extractDates('9월에 논의하고 20일까지 완료'), ['20일']);
  // A bare day with no month named anywhere earlier does not reduce to a
  // real date -- not silently dropped (see contentCheck's own unverified
  // case), but not returned by extractDates either, which only ever answers
  // with dates it could actually parse.
  assert.deepEqual(extractDates('20일까지 완료'), []);
});

test('extractAmounts reuses MONEY_PATTERN', () => {
  assert.deepEqual(extractAmounts('자재비 500,000원, 인건비 5,000 만원'), ['500,000원', '5,000 만원']);
});

// ---------------------------------------------------------------- v1/R2: content check
test('contentCheck answers unverified when no transcript text was supplied, never a claim of confirmation', () => {
  const result = contentCheck({ cardText: '9월 20일까지 완료', transcriptText: null });
  assert.deepEqual(result, { status: 'unverified', mismatches: [] });
});

test('contentCheck answers unverified (not nothing_to_check) for whitespace-only transcript text, same as no text at all (R4)', () => {
  assert.deepEqual(contentCheck({ cardText: '9월 20일까지 완료', transcriptText: '   ' }), { status: 'unverified', mismatches: [] });
});

test('contentCheck answers confirmed when every card-stated date and amount appears in the transcript window, by canonical value not raw substring (R2)', () => {
  // The card says "9월 20일"/"500,000원"; the transcript states the same
  // date and amount in different surface forms (M/D, no thousands comma,
  // and with a space before the trailing particle so MONEY_PATTERN can
  // still find it) -- still confirmed, because the comparison is by
  // canonical value.
  const result = contentCheck({ cardText: '9월 20일까지 500,000원 집행', transcriptText: '9/20 까지 500000원 정도로 집행하기로 했습니다' });
  assert.deepEqual(result, { status: 'confirmed', mismatches: [] });
});

test('contentCheck normalises whitespace and commas before comparing', () => {
  const result = contentCheck({ cardText: '9월20일까지', transcriptText: '회의에서 9월 20일 까지 라고 말했습니다' });
  assert.equal(result.status, 'confirmed');
});

test('contentCheck answers mismatch and names every value (in the card\'s own words) the transcript window does not contain', () => {
  const result = contentCheck({ cardText: '9월 20일까지 500,000원 정도', transcriptText: '9월 25일에 500,000원 정도로 다시 논의하기로 했습니다' });
  assert.equal(result.status, 'mismatch');
  assert.deepEqual(result.mismatches, [{ kind: 'date', value: '9월 20일' }]);
});

test('contentCheck with no dates or amounts in the card text at all is nothing_to_check, not confirmed (R1)', () => {
  assert.deepEqual(contentCheck({ cardText: '시험 일정 공유', transcriptText: '전혀 다른 이야기' }),
    { status: 'nothing_to_check', mismatches: [] });
  assert.deepEqual(contentCheck({ cardText: '시험 일정 공유', transcriptText: null }),
    { status: 'nothing_to_check', mismatches: [] }, 'nothing_to_check even with no transcript at all');
});

test('contentCheck: a card date with no month context (a bare D일 alone) is unverified, never a manufactured mismatch (R2)', () => {
  const result = contentCheck({ cardText: '20일까지 완료', transcriptText: '20일에 완료 예정입니다' });
  assert.deepEqual(result, { status: 'unverified', mismatches: [] });
});

test('contentCheck: a card amount the transcript window states only in Korean number words (오천만 원) is unverified, not mismatch or confirmed (R2)', () => {
  // Design choice, documented rather than silently assumed: this module
  // does not parse Korean numeral words (오천만 = 50,000,000) into a
  // comparable amount, so a transcript window with no digit-written amount
  // at all cannot rule a card amount in or out -- it is `unverified`.
  const result = contentCheck({ cardText: '5,000만원 집행', transcriptText: '오천만 원 정도로 이야기했습니다' });
  assert.deepEqual(result, { status: 'unverified', mismatches: [] });
});

test('contentCheck: a genuine date mismatch is reported even when the card also names an amount the transcript cannot verify either way (R2)', () => {
  const result = contentCheck({ cardText: '9월 20일까지 5,000만원', transcriptText: '9월 25일에 오천만 원 정도로 이야기했습니다' });
  assert.equal(result.status, 'mismatch');
  assert.deepEqual(result.mismatches, [{ kind: 'date', value: '9월 20일' }]);
});

// ---------------------------------------------------------------- v1: modality
test('detectModality tags a conditional ("만약 …면", "…되면") as conditional, never a present decision', () => {
  assert.equal(detectModality('만약 승인되면 발주 진행하겠습니다'), 'conditional');
  assert.equal(detectModality('예산이 되면 진행합니다'), 'conditional');
});

test('detectModality tags reported/quoted speech as reported', () => {
  assert.equal(detectModality('지난번에 제출하겠다고 말했다'), 'reported');
  assert.equal(detectModality('발주하겠다고 했다'), 'reported');
});

test('detectModality tags a negation/prohibition as negated', () => {
  assert.equal(detectModality('발주하지 마세요'), 'negated');
  assert.equal(detectModality('아직 확정하지 않았습니다'), 'negated'); // '하지 않' wins over bare '아직'
});

test('detectModality tags a still-incomplete state as pending', () => {
  assert.equal(detectModality('아직 미완료 상태입니다'), 'pending');
});

test('detectModality is null for ordinary present-tense text', () => {
  assert.equal(detectModality('내일까지 보내 주세요'), null);
  assert.equal(detectModality('금요일에 마감합니다'), null);
});

// -------------------------------------------------------------- classification: input validity (step 1)
test('classifyAttribution: a structurally unreadable segment is skip/segment_unreadable, input invalid', () => {
  for (const bad of [null, {}]) {
    const result = classifyAttribution(bad);
    assert.equal(result.classification, 'skip');
    assert.equal(result.reason, 'segment_unreadable');
    assert.deepEqual(result.input, { valid: false, reason: 'segment_unreadable' });
  }
});

test('classifyAttribution: a stale/identity-changed segment is still classified normally, but input.valid is false', () => {
  const withStrong = segment({ project_candidates: [strongCandidate] });
  const fresh = classifyAttribution(withStrong, null);
  const stale = classifyAttribution(withStrong, null, { staleReason: 'segment_identity_changed' });
  assert.equal(stale.classification, fresh.classification);
  assert.equal(stale.reason, fresh.reason);
  assert.deepEqual(fresh.input, { valid: true, reason: null });
  assert.deepEqual(stale.input, { valid: false, reason: 'segment_identity_changed' });
});

// -------------------------------------------------------------- classification: 업무성 (step 3)
test('classifyAttribution: unreadable nature is candidate/needs_recovery, never skip (CE-26)', () => {
  const result = classifyAttribution(segment({ nature: 'unreadable' }));
  assert.equal(result.classification, 'candidate');
  assert.equal(result.reason, 'needs_recovery');
});

test('classifyAttribution: unreadable quality (marks or ratio) is candidate/needs_recovery even with an attributable nature', () => {
  const byMarks = classifyAttribution(segment({ quality: { marks: ['unreadable_ratio'] } }));
  assert.equal(byMarks.classification, 'candidate');
  assert.equal(byMarks.reason, 'needs_recovery');
  const byRatio = classifyAttribution(segment({ quality: { unreadable_ratio: 0.85 } }));
  assert.equal(byRatio.classification, 'candidate');
  assert.equal(byRatio.reason, 'needs_recovery');
  const belowThreshold = classifyAttribution(segment({ quality: { unreadable_ratio: 0.2 },
    project_candidates: [strongCandidate] }));
  assert.equal(belowThreshold.classification, 'provisional');
});

test('classifyAttribution: unreadable nature/quality takes precedence over a strong conflict', () => {
  const result = classifyAttribution(segment({ nature: 'unreadable',
    project_candidates: [strongCandidate, strongCandidateOtherProject] }));
  assert.equal(result.classification, 'candidate');
  assert.equal(result.reason, 'needs_recovery');
});

test('classifyAttribution: mixed nature with a risk marker or two candidates is exception/needs_split', () => {
  const byRisk = classifyAttribution(segment({ nature: 'mixed', title: '결정 필요', description: '' }));
  assert.equal(byRisk.classification, 'exception');
  assert.equal(byRisk.reason, 'needs_split');
  const byCount = classifyAttribution(segment({ nature: 'mixed', title: '', description: '',
    project_candidates: [weakCandidate, { ...weakCandidate, project_code: 'P23-043' }] }));
  assert.equal(byCount.classification, 'exception');
  assert.equal(byCount.reason, 'needs_split');
});

test('classifyAttribution: mixed nature with no risk marker and fewer than two candidates is candidate/mixed_unsplit', () => {
  const result = classifyAttribution(segment({ nature: 'mixed', title: '', description: '' }));
  assert.equal(result.classification, 'candidate');
  assert.equal(result.reason, 'mixed_unsplit');
});

test('classifyAttribution: mixed nature whose only marker is a deadline or a bare 약속, with zero candidates, is candidate/mixed_unsplit, not needs_split (S7)', () => {
  const deadlineOnly = classifyAttribution(segment({ nature: 'mixed', title: '내일까지 확인', description: '' }));
  assert.equal(deadlineOnly.classification, 'candidate');
  assert.equal(deadlineOnly.reason, 'mixed_unsplit');
  assert.deepEqual(deadlineOnly.risk_markers, ['내일까지']);

  const promiseOnly = classifyAttribution(segment({ nature: 'mixed', title: '약속 잡기', description: '' }));
  assert.equal(promiseOnly.classification, 'candidate');
  assert.equal(promiseOnly.reason, 'mixed_unsplit');
});

test('classifyAttribution: mixed nature with a decision/money/contract marker still needs_split even with zero candidates (S7)', () => {
  const decision = classifyAttribution(segment({ nature: 'mixed', title: '결정 필요', description: '' }));
  assert.equal(decision.reason, 'needs_split');
  const money = classifyAttribution(segment({ nature: 'mixed', title: '500,000원 지출', description: '' }));
  assert.equal(money.reason, 'needs_split');
});

test('classifyAttribution: mixed nature with a deadline marker AND two or more candidates still needs_split (S7)', () => {
  const result = classifyAttribution(segment({ nature: 'mixed', title: '내일까지 확인', description: '',
    project_candidates: [weakCandidate, { ...weakCandidate, project_code: 'P23-043' }] }));
  assert.equal(result.reason, 'needs_split');
});

test('classifyAttribution: idea/daily/other natures skip unless a commitment/request marker is present', () => {
  for (const nature of ['idea', 'personal', 'daily', 'undetermined']) {
    const result = classifyAttribution(segment({ nature, title: '점심 메뉴 이야기', description: '잘 부탁드립니다' }));
    assert.equal(result.classification, 'skip');
    assert.equal(result.reason, 'nature_not_project_or_team');
  }
});

test('classifyAttribution: a commitment/request marker in an idea/daily segment is preserved as candidate/work_signal_outside_project_nature, never skip', () => {
  for (const [title, expectedModality] of [
    ['아직 미완료', 'pending'], ['발주하지 마세요', 'negated'], ['내일까지 보내 주세요', null], ['요청 사항 있습니다', null],
  ]) {
    const result = classifyAttribution(segment({ nature: 'idea', title, description: '' }));
    assert.equal(result.classification, 'candidate', title);
    assert.equal(result.reason, 'work_signal_outside_project_nature', title);
    assert.equal(result.modality, expectedModality, title);
  }
});

// -------------------------------------------------------------- classification: exceptions first (step 4)
test('classifyAttribution treats two strong rows naming the same project as one candidate, not a conflict', () => {
  const duplicated = segment({ project_candidates: [strongCandidate, { ...strongCandidate, basis: ['other'] }] });
  const result = classifyAttribution(duplicated, null);
  assert.equal(result.classification, 'provisional');
  assert.equal(result.reason, 'strong_candidate');
});

test('classifyAttribution returns exception with strong_conflict for two different strong candidates, even with a corroboration cue', () => {
  const conflicting = segment({ project_candidates: [strongCandidate, strongCandidateOtherProject] });
  const result = classifyAttribution(conflicting, { corroborated: true, refs: ['mail:evt-1'] });
  assert.equal(result.classification, 'exception');
  assert.equal(result.reason, 'strong_conflict');
  assert.deepEqual(result.risk_markers, []);
  assert.deepEqual(result.cues, ['mail:evt-1'], 'corroboration still rides along as a cue, even on a conflict');
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

test('classifyAttribution: a hyphenated identifier matching no registered project code, with no candidate at all, is exception/new_project_candidate', () => {
  const result = classifyAttribution(segment({ title: 'ABC-123 신규 협의', description: '', project_candidates: [] }),
    null, { registeredProjectCodes: new Set(['P24-049']) });
  assert.equal(result.classification, 'exception');
  assert.equal(result.reason, 'new_project_candidate');
  assert.equal(result.new_project_signal, 'ABC-123');
});

test('classifyAttribution: the same identifier already in registeredProjectCodes does not trigger new_project_candidate', () => {
  const result = classifyAttribution(segment({ title: 'P24-049 관련 논의', description: '', project_candidates: [] }),
    null, { registeredProjectCodes: new Set(['P24-049']) });
  assert.notEqual(result.reason, 'new_project_candidate');
});

test('classifyAttribution: with no registeredProjectCodes supplied at all, the new-project check is disabled rather than flagging every identifier as new (S8)', () => {
  // An empty registry almost always means the caller could not load one at
  // all, not that this estate genuinely has zero projects -- flagging every
  // identifier-shaped token in that case would be noise on every call that
  // forgot (or failed) to pass one in.
  const result = classifyAttribution(segment({ title: 'XY-9 신규 건', description: '', project_candidates: [] }));
  assert.notEqual(result.reason, 'new_project_candidate');
});

test('classifyAttribution: a risk marker with no candidate and nothing else named in the text is exception/missing_context', () => {
  const result = classifyAttribution(segment({ title: '결정', description: '', project_candidates: [] }));
  assert.equal(result.classification, 'exception');
  assert.equal(result.reason, 'missing_context');
  assert.deepEqual(result.risk_markers, ['결정']);
});

test('classifyAttribution: a risk marker with no candidate but something else specific named in the text falls through past missing_context', () => {
  const result = classifyAttribution(segment({ title: '결정 예산', description: '담당자 승인 필요', project_candidates: [] }));
  assert.notEqual(result.reason, 'missing_context');
  assert.equal(result.classification, 'exception'); // still exception (step 7): weak/unclassified with a risk marker
});

// -------------------------------------------------------------- classification: content check (steps 5-6)
test('classifyAttribution: a unique strong candidate with a card date the transcript window does not contain is exception/content_mismatch', () => {
  const result = classifyAttribution(
    segment({ title: '9월 20일까지 완료', description: '', project_candidates: [strongCandidate] }),
    null, { transcriptText: '오늘 회의에서 9월 25일까지 완료하기로 했습니다' });
  assert.equal(result.classification, 'exception');
  assert.equal(result.reason, 'content_mismatch');
  assert.deepEqual(result.content_mismatches, [{ kind: 'date', value: '9월 20일' }]);
});

test('classifyAttribution: a unique strong candidate with no transcript text supplied is still provisional, honestly marked unverified', () => {
  const result = classifyAttribution(
    segment({ title: '9월 20일까지 완료', description: '', project_candidates: [strongCandidate] }));
  assert.equal(result.classification, 'provisional');
  assert.equal(result.reason, 'strong_candidate');
  assert.equal(result.content_check, 'unverified');
});

test('classifyAttribution: a unique strong candidate whose card content the transcript window does confirm is provisional, content_check confirmed', () => {
  const result = classifyAttribution(
    segment({ title: '9월 20일까지 완료', description: '', project_candidates: [strongCandidate] }),
    null, { transcriptText: '오늘 회의에서 9월 20일까지 완료하기로 했습니다' });
  assert.equal(result.classification, 'provisional');
  assert.equal(result.content_check, 'confirmed');
});

test('classifyAttribution: a unique strong candidate with no date/amount in the card text at all is provisional, content_check nothing_to_check (R1)', () => {
  const result = classifyAttribution(
    segment({ title: '담당자 논의', description: '', project_candidates: [strongCandidate] }), null,
    { transcriptText: '전혀 관련 없는 다른 이야기' });
  assert.equal(result.classification, 'provisional');
  assert.equal(result.content_check, 'nothing_to_check');
});

// -------------------------------------------------------------- classification: step 7 (weak/unclassified)
test('classifyAttribution: corroboration is a cue only -- it never promotes a weak/unclassified segment to provisional', () => {
  const withWeak = segment({ project_candidates: [weakCandidate] });
  const result = classifyAttribution(withWeak, { corroborated: true, refs: ['mail:evt-1'] });
  assert.equal(result.classification, 'candidate');
  assert.equal(result.reason, 'weak_or_unclassified_no_risk');
  assert.deepEqual(result.cues, ['mail:evt-1'], 'the ref still rides along as a cue');
});

test('classifyAttribution: a corroboration verdict below MIN_CORROBORATION still never promotes (irrelevant in v1, but cues reflect what was given)', () => {
  const withWeak = segment({ project_candidates: [weakCandidate] });
  const result = classifyAttribution(withWeak, { corroborated: true, refs: [] });
  assert.equal(result.classification, 'candidate');
  assert.deepEqual(result.cues, []);
});

test('classifyAttribution: exception for weak/unclassified with a risk marker and no modality is important_and_unresolved', () => {
  const withWeak = segment({ project_candidates: [weakCandidate], title: '예산 확정', description: '금요일 마감' });
  const result = classifyAttribution(withWeak, { corroborated: false, refs: [] });
  assert.equal(result.classification, 'exception');
  assert.equal(result.reason, 'important_and_unresolved');
  assert.equal(result.modality, null);
  assert.deepEqual(result.risk_markers, ['확정', '마감']);
});

test('classifyAttribution: exception for weak/unclassified with a risk marker under a conditional or reported modality is conditional_or_reported, never important_and_unresolved', () => {
  const conditional = classifyAttribution(segment({ title: '만약 승인되면 발주', description: '', project_candidates: [] }));
  assert.equal(conditional.classification, 'exception');
  assert.equal(conditional.reason, 'conditional_or_reported');
  assert.equal(conditional.modality, 'conditional');

  const reported = classifyAttribution(segment({ title: '지난번에 제출하겠다고 말했다', description: '', project_candidates: [] }));
  assert.equal(reported.classification, 'exception');
  assert.equal(reported.reason, 'conditional_or_reported');
  assert.equal(reported.modality, 'reported');
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

// ---------------------------------------------------- S3-3 regression tests (CE-22/CE-30 counterexamples)
test('S3-3: strong + strong (different projects) is exception/strong_conflict', () => {
  const result = classifyAttribution(segment({ project_candidates: [strongCandidate, strongCandidateOtherProject] }));
  assert.deepEqual([result.classification, result.reason], ['exception', 'strong_conflict']);
});

test('S3-3: an A→B split (two independent segments, each its own strong candidate) judges each on its own, no cross-segment interference', () => {
  const segmentA = classifyAttribution(segment({ title: '과제 A 시험 일정', description: '', project_candidates: [strongCandidate] }));
  const segmentB = classifyAttribution(segment({ title: '과제 B 예산 논의', description: '',
    project_candidates: [strongCandidateOtherProject] }));
  assert.deepEqual([segmentA.classification, segmentA.reason], ['provisional', 'strong_candidate']);
  assert.deepEqual([segmentB.classification, segmentB.reason], ['provisional', 'strong_candidate']);
});

test('S3-3: new-business evidence (an unregistered identifier, no candidate at all) is exception/new_project_candidate -- no code is invented', () => {
  const result = classifyAttribution(segment({ title: 'XZ-77 신규 거래처 협의', description: '', project_candidates: [] }),
    null, { registeredProjectCodes: new Set(['P24-049', 'P23-043']) });
  assert.deepEqual([result.classification, result.reason], ['exception', 'new_project_candidate']);
  assert.equal(result.new_project_signal, 'XZ-77');
  assert.deepEqual(segment({ title: 'XZ-77 신규 거래처 협의', description: '', project_candidates: [] }).project_candidates, []);
});

test('S3-3: 코드 없는 외부 협의 -- "아이디어 공유" is candidate, "내일까지 견적" is exception (the deadline signal is caught, not silently missed)', () => {
  const ideaSharing = classifyAttribution(segment({ title: '아이디어 공유', description: '', project_candidates: [] }));
  assert.equal(ideaSharing.classification, 'candidate');

  const quoteDeadline = classifyAttribution(segment({ title: '내일까지 견적', description: '', project_candidates: [] }));
  assert.equal(quoteDeadline.classification, 'exception');
  assert.ok(quoteDeadline.risk_markers.includes('내일까지'));
});

test('S3-3: a weak candidate with a same-day sender/title corroboration is a cue only, never promoted to provisional', () => {
  const withWeak = segment({ project_candidates: [weakCandidate], title: '시험 일정 공유', description: '' });
  const result = classifyAttribution(withWeak, { corroborated: true, refs: ['mail:evt-same-day'] });
  assert.equal(result.classification, 'candidate');
  assert.deepEqual(result.cues, ['mail:evt-same-day']);
});

test('S3-3: strong + a card date that does not match the transcript window is exception/content_mismatch', () => {
  const result = classifyAttribution(
    segment({ title: '10월 1일까지 완료', description: '', project_candidates: [strongCandidate] }),
    null, { transcriptText: '이번 건은 10월 5일까지 마무리하기로 했습니다' });
  assert.deepEqual([result.classification, result.reason], ['exception', 'content_mismatch']);
});

test('S3-3: strong + no transcript supplied at all is still provisional, content_check unverified (not a false claim of verification)', () => {
  const result = classifyAttribution(
    segment({ title: '10월 1일까지 완료', description: '', project_candidates: [strongCandidate] }));
  assert.deepEqual([result.classification, result.content_check], ['provisional', 'unverified']);
});

test('S3-3: "잘 부탁드립니다"/"점심 준비" (daily small talk, no commitment marker) is skip', () => {
  const result = classifyAttribution(segment({ nature: 'daily', title: '잘 부탁드립니다', description: '점심 준비' }));
  assert.equal(result.classification, 'skip');
});

test('S3-3: "아직 미완료"/"발주하지 마세요"/"내일까지 보내 주세요" preserve the work signal outside project nature, tagged with modality', () => {
  const pending = classifyAttribution(segment({ nature: 'idea', title: '아직 미완료', description: '' }));
  assert.deepEqual([pending.classification, pending.reason, pending.modality],
    ['candidate', 'work_signal_outside_project_nature', 'pending']);

  const negated = classifyAttribution(segment({ nature: 'idea', title: '발주하지 마세요', description: '' }));
  assert.deepEqual([negated.classification, negated.reason, negated.modality],
    ['candidate', 'work_signal_outside_project_nature', 'negated']);

  const plainRequest = classifyAttribution(segment({ nature: 'idea', title: '내일까지 보내 주세요', description: '' }));
  assert.deepEqual([plainRequest.classification, plainRequest.reason],
    ['candidate', 'work_signal_outside_project_nature']);
});

test('S3-3: "만약 승인되면 발주"/"지난번에 제출하겠다고 말했다" are conditional/reported, never a present decision', () => {
  const conditional = classifyAttribution(segment({ title: '만약 승인되면 발주', description: '', project_candidates: [] }));
  assert.equal(conditional.modality, 'conditional');
  assert.notEqual(conditional.reason, 'important_and_unresolved');

  const reported = classifyAttribution(segment({ title: '지난번에 제출하겠다고 말했다', description: '', project_candidates: [] }));
  assert.equal(reported.modality, 'reported');
  assert.notEqual(reported.reason, 'important_and_unresolved');
});

test('S3-3: an unreadable segment is candidate/needs_recovery, never skip', () => {
  const result = classifyAttribution(segment({ nature: 'unreadable' }));
  assert.deepEqual([result.classification, result.reason], ['candidate', 'needs_recovery']);
});
