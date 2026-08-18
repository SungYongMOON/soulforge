// "이제 뭐 해야 해?" — the one answer the guidance layer exists to produce (milestone M1).
//
// Four sections, always the same four, in this order: 위치 (where the project stands), 부족 (what
// is missing or unknown), 다음 할 일 3개 (the next three instructions, each with why, inputs,
// output, how, citations, owner and due date), 그 뒤 (what is blocked and by what).
//
// The order is the point. A reader who is given the work first will act before knowing whether
// the engine judged the state or merely failed to observe it, so the counts come first and the
// findings before the tasks. Nothing is computed here that the assessment, the work order and the
// instructions do not already carry: this module formats, it does not judge.
//
// Pure: no file, clock, random source, environment value, or network.
import { compareCodePoints } from '../kernel/canonical.mjs';
import {
  GUIDANCE_ERROR_CODES,
  MAX,
  ZERO_EFFECTS,
  assertArray,
  assertExactKeys,
  assertPlainObject,
  deepFreeze,
  guidanceDigest,
  guidanceFail,
} from './guide_cards.mjs';

export const NEXT_STEPS_ANSWER_SCHEMA_VERSION = 'soulforge.engine_next_steps_answer.v0';
export const SUPPORTED_LOCALES = Object.freeze(['ko']);

const NL = String.fromCharCode(10);
const BACKTICK = String.fromCharCode(96);

const REQUEST_FIELDS = Object.freeze(['assessment', 'work_order', 'instructions', 'guide_cards', 'stage_code']);
const REQUEST_OPTIONAL_FIELDS = Object.freeze(['locale']);

const COUNT_LABEL_KO = Object.freeze({
  satisfied: '충족',
  missing: '결손',
  unknown: '불명',
  not_applicable: '해당 없음',
  conflict: '상충',
});

const FINDING_LABEL_KO = Object.freeze({
  gap_missing: '결손',
  gap_unknown: '불명',
  gap_conflict: '상충',
  open_risk: '열린 위험',
  not_yet_observed: '아직 관측 안 됨',
});

const code = (value) => `${BACKTICK}${value}${BACKTICK}`;
const orDash = (value) => (value === null || value === undefined || value === '' ? '—' : String(value));

function readAssessment(assessment) {
  assertPlainObject(assessment, 'request.assessment', GUIDANCE_ERROR_CODES.ASSESSMENT_INVALID);
  const bound = Object.hasOwn(assessment, 'role_bound_assessment')
    ? assessment.role_bound_assessment : assessment;
  assertPlainObject(bound, 'request.assessment.role_bound_assessment', GUIDANCE_ERROR_CODES.ASSESSMENT_INVALID);
  assertPlainObject(bound.current_stage, 'assessment.current_stage', GUIDANCE_ERROR_CODES.ASSESSMENT_INVALID);
  return bound;
}

function readInstructions(instructions) {
  const rows = Array.isArray(instructions) ? instructions : instructions?.instructions;
  return assertArray(rows, 'request.instructions', MAX.instructions);
}

function readCards(cardSet) {
  const cards = Array.isArray(cardSet) ? cardSet : cardSet?.cards;
  return assertArray(cards, 'request.guide_cards', MAX.cards, GUIDANCE_ERROR_CODES.CARD_SET_INVALID);
}

function stageWorkItems(workOrder, stageCode) {
  assertPlainObject(workOrder, 'request.work_order', GUIDANCE_ERROR_CODES.WORK_ORDER_INVALID);
  const stages = assertArray(workOrder.stages, 'request.work_order.stages', MAX.stages,
    GUIDANCE_ERROR_CODES.WORK_ORDER_INVALID);
  const stage = stages.find((row) => row.stage_code === stageCode) ?? null;
  return stage === null ? [] : assertArray(stage.work_items, 'request.work_order.stages[].work_items', MAX.rows,
    GUIDANCE_ERROR_CODES.WORK_ORDER_INVALID);
}

function citationLine(instruction) {
  // Deduplicated: one locator can arrive twice, once as the row's own citation and once as the
  // citation behind an edge into it. Printing it twice would read as two independent sources.
  const refs = new Set();
  for (const entry of instruction.how?.method_refs ?? []) {
    for (const ref of entry.source_refs ?? []) refs.add(`${ref.source_key} ${ref.locator}`);
  }
  return refs.size === 0 ? '근거 미표기' : [...refs].join('; ');
}

function inputLine(instruction) {
  const inputs = instruction.inputs ?? [];
  if (inputs.length === 0) return '선행 입력 없음';
  return inputs.map((input) => {
    const label = input.label_ko === null || input.label_ko === undefined ? '' : `(${input.label_ko})`;
    return `${code(input.artifact_type_id)}${label} — ${input.input_state}`;
  }).join(', ');
}

function whyLine(instruction) {
  const finding = FINDING_LABEL_KO[instruction.why?.engine_finding] ?? orDash(instruction.why?.engine_finding);
  const reason = instruction.why?.reason_code ?? null;
  const guidance = (instruction.why?.guidance ?? []).map((sentence) => sentence.text_ko);
  const head = reason === null ? `엔진 판정: ${finding}.` : `엔진 판정: ${finding}(${reason}).`;
  return [head, ...guidance].join(' ');
}

/**
 * Renders the "what do I do next" answer for one stage, in Korean markdown and as the same
 * structure in JSON.
 *
 * @param request `{assessment, work_order, instructions, guide_cards, stage_code, locale?}`
 * @returns `{schema_version, locale, stage_code, answer, markdown, receipt}` deeply frozen
 */
export function renderNextStepsAnswer(request) {
  assertExactKeys(request, REQUEST_FIELDS, REQUEST_OPTIONAL_FIELDS, 'request');
  const locale = request.locale ?? 'ko';
  if (!SUPPORTED_LOCALES.includes(locale)) {
    // Refused rather than falling back to Korean: a caller that asked for another language and
    // silently received this one would have no way to notice.
    guidanceFail(GUIDANCE_ERROR_CODES.LOCALE_UNSUPPORTED, 'this renderer only writes Korean',
      { locale, supported: [...SUPPORTED_LOCALES] });
  }
  const assessment = readAssessment(request.assessment);
  const stageCode = request.stage_code;
  const instructions = readInstructions(request.instructions);
  const cards = readCards(request.guide_cards);
  const cardById = new Map(cards.map((card) => [card.card_id, card]));
  const items = stageWorkItems(request.work_order, stageCode);

  const counts = { ...assessment.current_stage.requirement_counts };
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);

  // The shortfall list is the engine's own issue list, read through the work order for a label.
  const labelByRequirement = new Map(items
    .filter((item) => item.engine_requirement_id !== null && item.engine_requirement_id !== undefined)
    .map((item) => [item.engine_requirement_id, item.artifact_type_id]));
  const cardByRequirement = new Map(cards
    .filter((card) => card.engine_requirement_id !== null && card.engine_requirement_id !== undefined)
    .map((card) => [card.engine_requirement_id, card]));
  const shortfall = (assessment.issues ?? [])
    .filter((issue) => issue.issue_kind === 'missing' || issue.issue_kind === 'unknown')
    .map((issue) => ({
      engine_requirement_id: issue.subject_id ?? null,
      artifact_type_id: labelByRequirement.get(issue.subject_id) ?? null,
      title_ko: cardByRequirement.get(issue.subject_id)?.title_ko ?? null,
      engine_finding: issue.issue_kind === 'missing' ? 'gap_missing' : 'gap_unknown',
      reason_code: issue.reason_code ?? null,
      required_capability: issue.required_capability ?? null,
    }))
    .sort((left, right) => compareCodePoints(
      `${left.engine_finding}${orDash(left.artifact_type_id)}`,
      `${right.engine_finding}${orDash(right.artifact_type_id)}`,
    ));

  const blocked = items
    .filter((item) => item.ready === false)
    .map((item) => ({
      artifact_type_id: item.artifact_type_id,
      title_ko: cardByRequirement.get(item.engine_requirement_id)?.title_ko ?? null,
      blocked_by: [...(item.blocked_by ?? [])],
    }));

  const nextSteps = instructions.map((instruction, position) => ({
    order: position + 1,
    instruction_id: instruction.instruction_id,
    instruction_kind: instruction.instruction_kind,
    artifact_type_id: instruction.for?.artifact_type_id ?? null,
    title_ko: instruction.what?.title_ko ?? null,
    what: instruction.what?.desc ?? null,
    why: whyLine(instruction),
    inputs: inputLine(instruction),
    output: [
      orDash(instruction.output?.title_ko ?? instruction.output?.artifact_type_id),
      orDash(instruction.output?.maturity_expected),
    ].join(' / '),
    how: instruction.how?.template?.note?.text_ko ?? '양식 없음',
    citations: citationLine(instruction),
    who: [
      orDash(instruction.who?.capability_default),
      orDash(instruction.who?.role_id),
      orDash(instruction.who?.principal_ref),
    ].join(' / '),
    due: instruction.due?.due_at ?? null,
    guidance_ref: instruction.guidance_ref ?? null,
    guidance_card_present: cardById.has(instruction.guidance_ref),
  }));

  const answer = {
    schema_version: NEXT_STEPS_ANSWER_SCHEMA_VERSION,
    locale,
    stage_code: stageCode,
    stage_label: assessment.current_stage.stage_label ?? null,
    position: {
      assessment_state: assessment.assessment_state ?? null,
      floor_status: assessment.current_stage.floor_status ?? null,
      requirement_total: total,
      requirement_counts: counts,
      open_risk_count: assessment.current_stage.open_risk_count ?? 0,
      work_items: items.length,
      ready_items: items.filter((item) => item.ready === true).length,
    },
    shortfall: {
      missing: counts.missing ?? 0,
      unknown: counts.unknown ?? 0,
      top_items: shortfall.slice(0, 5),
      total_items: shortfall.length,
    },
    next_steps: nextSteps,
    blocked: {
      count: blocked.length,
      items: blocked.slice(0, 5),
    },
    judgment_ref: instructions[0]?.judgment_ref ?? null,
    claim_ceiling: 'candidate',
  };

  const lines = [];
  lines.push(`# 이제 뭐 해야 하나 — ${orDash(answer.stage_label)} (${stageCode})`);
  lines.push('');
  lines.push('## 1. 위치');
  lines.push(`- 판정 상태: ${orDash(answer.position.assessment_state)} / 바닥 상태 ${orDash(answer.position.floor_status)}`);
  lines.push(`- 요구 ${total}건 — ${Object.entries(COUNT_LABEL_KO)
    .map(([key, label]) => `${label} ${counts[key] ?? 0}`).join(' · ')}`);
  lines.push(`- 순서 목록 ${answer.position.work_items}건 중 안 막힌 것 ${answer.position.ready_items}건, 열린 위험 ${answer.position.open_risk_count}건`);
  lines.push('');
  lines.push('## 2. 부족');
  lines.push(`- 결손 ${answer.shortfall.missing}건 · 불명 ${answer.shortfall.unknown}건 (엔진이 지목한 항목 ${answer.shortfall.total_items}건)`);
  if (answer.shortfall.top_items.length === 0) {
    lines.push('- 지목된 항목 없음');
  } else {
    for (const row of answer.shortfall.top_items) {
      lines.push(`- ${code(orDash(row.artifact_type_id))} ${orDash(row.title_ko)} — ${FINDING_LABEL_KO[row.engine_finding]}(${orDash(row.reason_code)}), 담당 ${orDash(row.required_capability)}`);
    }
  }
  lines.push('');
  lines.push(`## 3. 다음 할 일 ${nextSteps.length}개`);
  if (nextSteps.length === 0) {
    lines.push('- 지시서 없음');
  }
  for (const step of nextSteps) {
    lines.push('');
    lines.push(`### ${step.order}) ${orDash(step.title_ko)} (${code(orDash(step.artifact_type_id))})`);
    lines.push(`- 무엇을: ${orDash(step.what)}`);
    lines.push(`- 왜: ${step.why}`);
    lines.push(`- 입력: ${step.inputs}`);
    lines.push(`- 산출: ${step.output}`);
    lines.push(`- 어떻게: ${step.how}`);
    lines.push(`- 근거: ${step.citations}`);
    lines.push(`- 담당(capability / 논리역할 / 사람): ${step.who}`);
    lines.push(`- 기한: ${orDash(step.due)}`);
  }
  lines.push('');
  lines.push('## 4. 그 뒤 (막힌 것과 이유)');
  if (answer.blocked.items.length === 0) {
    lines.push('- 막힌 항목 없음');
  } else {
    for (const row of answer.blocked.items) {
      lines.push(`- ${code(row.artifact_type_id)} ${orDash(row.title_ko)} — 막은 입력: ${row.blocked_by.map(code).join(', ')}`);
    }
    if (answer.blocked.count > answer.blocked.items.length) {
      lines.push(`- 그 밖에 ${answer.blocked.count - answer.blocked.items.length}건`);
    }
  }
  lines.push('');
  lines.push('> 이 답은 안내다. 판단(충족·결손·불명)은 엔진 영수증이 정본이며 이 문서가 바꾸지 않는다.');
  lines.push('');
  const markdown = lines.join(NL);

  const receipt = {
    schema_version: NEXT_STEPS_ANSWER_SCHEMA_VERSION,
    deterministic: true,
    claim_ceiling: 'candidate',
    judgment_changed: false,
    locale,
    input_digests: {
      assessment_handle: assessment.assessment_handle ?? null,
      instructions: guidanceDigest(`${NEXT_STEPS_ANSWER_SCHEMA_VERSION}.instructions`, instructions),
      guide_cards: guidanceDigest(`${NEXT_STEPS_ANSWER_SCHEMA_VERSION}.guide_cards`, cards),
    },
    output_digests: {
      answer: guidanceDigest(`${NEXT_STEPS_ANSWER_SCHEMA_VERSION}.answer`, answer),
      markdown: guidanceDigest(`${NEXT_STEPS_ANSWER_SCHEMA_VERSION}.markdown`, { markdown }),
    },
    counts: {
      next_steps: nextSteps.length,
      shortfall_items: shortfall.length,
      blocked_items: blocked.length,
      markdown_lines: lines.length,
    },
    effects: { ...ZERO_EFFECTS },
  };

  return deepFreeze({
    schema_version: NEXT_STEPS_ANSWER_SCHEMA_VERSION,
    locale,
    stage_code: stageCode,
    answer,
    markdown,
    receipt,
  });
}
