// **"이제 뭐 해야 해?"** — the answer of 11장, over the door.
//
// The same four calls the `engine_next_steps_runner` makes, in the same order, over the same
// inputs: `orderStageWork` → `buildGuideCards` → `buildInstructionPackets` → `renderNextStepsAnswer`.
// The difference is that this one writes nothing. The CLI's create-only output exists so an answer
// on disk is a record; an answer handed back through a call is not a record and should not pretend
// to be one, so nothing is stored and the receipt line the server appends says a read happened.
//
// The judgement comes from a stored assessment — the newest run that judged this stage, unless the
// caller names one. It is never recomputed here (11장 §11.4: 복사, 재계산 금지).

import { orderStageWork } from '../../stage_rules/stage_rule_compiler.mjs';
import { buildGuideCards } from '../../guidance/guide_cards.mjs';
import { buildInstructionPackets } from '../../guidance/instruction_packet.mjs';
import { renderNextStepsAnswer } from '../../guidance/answer_render.mjs';
import {
  ENGINE_MCP_ERROR_CODES, assertInstant, assertRunId, mcpFail,
} from '../engine_context.mjs';

export const name = 'next_steps';
export const title_ko = '다음 할 일';
export const description_ko = '한 단계의 위치·부족·다음 할 일·그 뒤를 한 장으로 낸다. 판정은 저장된 영수증을 그대로 인용하고 다시 계산하지 않는다.';
export const write = false;

const DEFAULT_TOP = 3;

export const inputSchema = Object.freeze({
  type: 'object',
  properties: {
    stage_code: { type: 'string', description: '엔진 단계 코드 (예: 120_CDR)' },
    run_id: { type: 'string', description: '판정을 가져올 실행 id(생략하면 그 단계의 가장 최근 실행)' },
    top: { type: 'integer', minimum: 1, maximum: 32, description: '다음 할 일 개수(기본 3)' },
    known_at: { type: 'string', description: '지시서에 찍을 시각(UTC ISO-8601). 생략하면 서버 시각을 쓰고 그렇게 표시한다.' },
  },
  required: ['stage_code'],
  additionalProperties: false,
});

export async function handler(args, ctx) {
  const stageCode = await ctx.assertKnownStage(args.stage_code);
  const top = args.top === undefined ? DEFAULT_TOP : args.top;
  if (!Number.isSafeInteger(top) || top < 1 || top > 32) {
    mcpFail(ENGINE_MCP_ERROR_CODES.ARGUMENTS_INVALID, 'top must be an integer between 1 and 32', {});
  }
  const runId = args.run_id === undefined
    ? await ctx.latestRunFor(stageCode)
    : assertRunId(args.run_id);
  if (runId === null) {
    mcpFail(ENGINE_MCP_ERROR_CODES.RUN_UNKNOWN,
      'no stored run has judged this stage yet', { stage_code: stageCode });
  }
  const knownAtSource = args.known_at === undefined ? 'server_clock' : 'caller';
  const knownAt = args.known_at === undefined ? ctx.now() : assertInstant(args.known_at);

  const assessment = await ctx.readAssessment(runId, stageCode);
  const compiled = await ctx.compile([stageCode]);
  const observations = await ctx.loadObservations();
  const workOrder = orderStageWork(compiled, observations.work_order);
  const cards = buildGuideCards({
    compile_result: compiled,
    vocabulary: ctx.vocabulary,
    compiled_variant: await ctx.loadVariant(),
    work_order: workOrder,
  });

  const bound = Object.hasOwn(assessment, 'role_bound_assessment')
    ? assessment.role_bound_assessment : assessment;
  const missionCount = (bound.next_mission_candidates ?? []).length;
  const instructions = buildInstructionPackets({
    assessment,
    work_order: workOrder,
    guide_cards: cards,
    known_at: knownAt,
    include_next_ready: missionCount < top,
    top_n: Math.max(top - missionCount, 0),
  });
  const answer = renderNextStepsAnswer({
    assessment,
    work_order: workOrder,
    instructions,
    guide_cards: cards,
    stage_code: stageCode,
    locale: 'ko',
  });

  const structured = {
    stage_code: stageCode,
    run_id: runId,
    top,
    known_at: knownAt,
    known_at_source: knownAtSource,
    answer: answer.answer,
    counts: {
      cards: cards.receipt.counts.cards,
      instructions: instructions.receipt.counts.instructions,
      requirement_counts: answer.answer.position.requirement_counts,
      observations_supplied: observations.work_order.length,
    },
    next_steps: answer.answer.next_steps.map((step) => ({
      order: step.order,
      artifact_type_id: step.artifact_type_id,
      instruction_kind: step.instruction_kind,
    })),
    written: false,
  };

  return { markdown: answer.markdown, structured };
}
