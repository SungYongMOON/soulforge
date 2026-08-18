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

test('each next step states what, why, inputs, output, how, citation, owner and due date', () => {
  const { answer } = rendered();
  for (const label of ['- 무엇을: ', '- 왜: ', '- 입력: ', '- 산출: ', '- 어떻게: ', '- 근거: ',
    '- 담당(capability / 논리역할 / 사람): ', '- 기한: ']) {
    assert.equal(answer.markdown.split(label).length - 1, answer.answer.next_steps.length,
      `every step should state ${label.trim()}`);
  }
  const [first] = answer.answer.next_steps;
  assert.equal(first.artifact_type_id, 'act_stakeholder_expectations');
  assert.equal(first.guidance_card_present, true);
  assert.ok(first.why.startsWith('엔진 판정: 불명(observation_not_available).'));
  assert.equal(first.due, '2026-09-30T00:00:00.000Z');
});

test('a citation is printed once even when the row and one of its edges name the same locator', () => {
  const { answer } = rendered();
  const [first] = answer.answer.next_steps;
  assert.equal(first.citations, 'synthetic_guidebook_v0 table 2-1');
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
