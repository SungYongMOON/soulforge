import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildGuideCards, GuidanceError, GUIDANCE_ERROR_CODES } from './guide_cards.mjs';
import { buildInstructionPackets } from './instruction_packet.mjs';
import { renderNextStepsAnswer, NEXT_STEPS_ANSWER_SCHEMA_VERSION } from './answer_render.mjs';
import { compileStageRules, orderStageWork } from '../stage_rules/stage_rule_compiler.mjs';
import { ARTIFACT_VOCABULARY_V0 } from '../stage_rules/artifact_vocabulary.mjs';

const EXAMPLES = '../../../docs/architecture/workspace/examples/se_stage_rules/';
const load = (name) => JSON.parse(readFileSync(new URL(`${EXAMPLES}${name}`, import.meta.url), 'utf8'));

const FIXTURE = load('next_steps_synthetic_v0.json');

const throwsWith = (code) => (error) => {
  assert.ok(error instanceof GuidanceError, `expected a GuidanceError, got ${error?.name}`);
  assert.equal(error.code, code);
  return true;
};

function rendered(overrides = {}) {
  const compileResult = compileStageRules(structuredClone(FIXTURE.compile_request));
  const workOrder = orderStageWork(compileResult, structuredClone(FIXTURE.observations));
  const cards = buildGuideCards({
    compile_result: compileResult,
    vocabulary: ARTIFACT_VOCABULARY_V0,
    compiled_variant: structuredClone(FIXTURE.compile_request.compiled_variant),
    source_catalog: structuredClone(FIXTURE.source_catalog),
    template_library: structuredClone(FIXTURE.template_library),
    work_order: workOrder,
  });
  const instructions = buildInstructionPackets({
    assessment: structuredClone(FIXTURE.assessment_stdout),
    work_order: workOrder,
    guide_cards: cards,
    known_at: FIXTURE.known_at,
    context_fill: structuredClone(FIXTURE.context_fill),
    include_next_ready: true,
    top_n: 3,
  });
  const request = {
    assessment: structuredClone(FIXTURE.assessment_stdout),
    work_order: workOrder,
    instructions,
    guide_cards: cards,
    stage_code: '030_SRR',
    ...overrides,
  };
  return { cards, instructions, workOrder, request, answer: renderNextStepsAnswer(request) };
}

test('the answer carries the four sections in the declared order', () => {
  const { answer } = rendered();
  assert.equal(answer.schema_version, NEXT_STEPS_ANSWER_SCHEMA_VERSION);
  const headings = answer.markdown.split(String.fromCharCode(10))
    .filter((line) => line.startsWith('## '))
    .map((line) => line.slice(3));
  assert.deepEqual(headings, [
    '1. 위치',
    '2. 부족',
    '3. 다음 할 일 4개',
    '4. 그 뒤 (막힌 것과 이유)',
  ]);
  for (const marker of FIXTURE.expected.answer_sections) {
    assert.ok(answer.markdown.includes(marker), `missing section ${marker}`);
  }
});

test('위치 repeats the engine counts and nothing else', () => {
  const { answer } = rendered();
  const counts = FIXTURE.assessment_stdout.role_bound_assessment.current_stage.requirement_counts;
  assert.deepEqual(answer.answer.position.requirement_counts, counts);
  assert.equal(answer.answer.position.requirement_total,
    Object.values(counts).reduce((sum, value) => sum + value, 0));
  assert.equal(answer.answer.position.assessment_state, 'UNKNOWN');
  assert.ok(answer.markdown.includes('충족 1 · 결손 1 · 불명 4'));
});

test('부족 lists the engine issues, not a recount of its own', () => {
  const { answer } = rendered();
  assert.equal(answer.answer.shortfall.missing, 1);
  assert.equal(answer.answer.shortfall.unknown, 4);
  assert.equal(answer.answer.shortfall.total_items, 5);
  assert.deepEqual(answer.answer.shortfall.top_items[0], {
    engine_requirement_id: '030_SRR_review_minutes_srr',
    artifact_type_id: 'review_minutes_srr',
    title_ko: 'SRR 회의록',
    engine_finding: 'gap_missing',
    reason_code: 'observed_absent',
    required_capability: 'verification_review',
  });
});

test('each next step reads 왜 = 목적·막히는 것·근거 and 어떻게 = 입력·양식·방법 근거·담당', () => {
  const { answer } = rendered();
  for (const label of ['- 무엇을: ', '- 왜 · 목적: ', '- 왜 · 없으면 막히는 것: ', '- 왜 · 판정과 근거: ',
    '- 어떻게 · 입력: ', '- 어떻게 · 양식: ', '- 어떻게 · 방법 근거: ',
    '- 어떻게 · 담당(capability / 논리역할 / 사람): ', '- 산출: ', '- 기한: ']) {
    assert.equal(answer.markdown.split(label).length - 1, answer.answer.next_steps.length,
      `every step should state ${label.trim()}`);
  }
  const [first] = answer.answer.next_steps;
  assert.equal(first.artifact_type_id, 'act_stakeholder_expectations');
  assert.equal(first.guidance_card_present, true);
  assert.ok(first.why_judgement.startsWith('엔진 판정: 불명(observation_not_available).'));
  assert.equal(first.due, '2026-09-30T00:00:00.000Z');
});

test('the purpose and what stops without it reach the answer, or say they were not stated', () => {
  const { answer } = rendered();
  const ssrs = answer.answer.next_steps.find((step) => step.artifact_type_id === 'ssrs');
  assert.equal(ssrs.purpose,
    '합성 정본이 말하는 목적: 이해관계자 기대를 기술 요구로 바꿔 이후 설계와 시험의 기준을 만든다.');
  assert.deepEqual(ssrs.used_by, ['SRR 회의록', '요구사항 추적표', '아키텍처·설계해 정의']);
  assert.equal(ssrs.gate_role, 'core');
  assert.ok(answer.markdown.includes(`- 왜 · 목적: ${ssrs.purpose}`));

  const wbs = answer.answer.next_steps.find((step) => step.artifact_type_id === 'wbs');
  assert.equal(wbs.purpose, null);
  assert.deepEqual(wbs.used_by, []);
  assert.ok(answer.markdown.includes('- 왜 · 목적: 정본에 목적 문장 없음'));
  assert.ok(answer.markdown.includes('- 왜 · 없으면 막히는 것: 이것을 입력으로 적은 뒤 항목은 규칙표에 없다'));
});

test('the 양식 line says both what the canon calls the form and whether the project holds one', () => {
  const { answer } = rendered();
  const ssrs = answer.answer.next_steps.find((step) => step.artifact_type_id === 'ssrs');
  assert.ok(ssrs.how.includes('양식 파일이 라이브러리에 있다'));
  assert.ok(ssrs.how.includes('Rev3'));
  assert.ok(ssrs.template_ref.startsWith('030_SRR/'));
  const wbs = answer.answer.next_steps.find((step) => step.artifact_type_id === 'wbs');
  assert.equal(wbs.how, '양식 없음 · 양식 파일이 라이브러리에 없다');
  assert.equal(wbs.template_ref, null);
});

test('an input state is printed as 있음 · 없음 · 불명, never as the raw enum', () => {
  const { answer } = rendered();
  const activity = answer.answer.next_steps
    .find((step) => step.artifact_type_id === 'act_stakeholder_expectations');
  assert.ok(activity.inputs.endsWith('— 있음'));
  const ssrs = answer.answer.next_steps.find((step) => step.artifact_type_id === 'ssrs');
  assert.ok(ssrs.inputs.endsWith('— 불명'));
  assert.equal(answer.markdown.includes('— present'), false);
  assert.equal(answer.markdown.includes('— unknown'), false);
});

test('a citation is printed once, under the family the catalogue named', () => {
  const { answer } = rendered();
  const [first] = answer.answer.next_steps;
  assert.equal(first.citations, '출처 계열 미표기: synthetic_guidebook_v0 table 2-1');
  const ssrs = answer.answer.next_steps.find((step) => step.artifact_type_id === 'ssrs');
  assert.equal(ssrs.citations,
    '규정: synthetic_rule_book_v0 article 12 | 출처 계열 미표기: synthetic_guidebook_v0 table 2-1');
  const withoutSource = answer.answer.next_steps.find((step) => step.artifact_type_id === 'wbs');
  assert.equal(withoutSource.citations, '근거 미표기');
});

test('그 뒤 names what is blocked and by what', () => {
  const { answer } = rendered();
  assert.deepEqual(answer.answer.blocked.items.map((row) => row.artifact_type_id),
    ['ssrs', 'review_minutes_srr']);
  assert.deepEqual(answer.answer.blocked.items[0].blocked_by, ['act_stakeholder_expectations']);
  assert.ok(answer.markdown.includes('막은 입력'));
});

test('the answer says in its own text that it does not change the judgement', () => {
  const { answer } = rendered();
  assert.ok(answer.markdown.includes('판단(충족·결손·불명)은 엔진 영수증이 정본이며 이 문서가 바꾸지 않는다'));
  assert.equal(answer.receipt.judgment_changed, false);
  assert.equal(answer.answer.claim_ceiling, 'candidate');
  for (const value of Object.values(answer.receipt.effects)) assert.equal(value, 0);
});

test('two renders over the same inputs agree byte for byte', () => {
  const first = rendered().answer;
  const second = rendered().answer;
  assert.equal(first.markdown, second.markdown);
  assert.equal(first.receipt.output_digests.answer, second.receipt.output_digests.answer);
});

test('a locale this renderer does not write is refused rather than silently answered in Korean', () => {
  assert.throws(() => rendered({ locale: 'en' }), throwsWith(GUIDANCE_ERROR_CODES.LOCALE_UNSUPPORTED));
  const { answer } = rendered({ locale: 'ko' });
  assert.equal(answer.locale, 'ko');
});

test('a stage with no instructions still answers with its position', () => {
  const { request } = rendered();
  const answer = renderNextStepsAnswer({ ...request, instructions: [] });
  assert.equal(answer.answer.next_steps.length, 0);
  assert.ok(answer.markdown.includes('지시서 없음'));
  assert.ok(answer.markdown.includes('## 1. 위치'));
});
