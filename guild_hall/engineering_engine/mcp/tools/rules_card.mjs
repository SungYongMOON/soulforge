// "SEMP는 왜·언제·어떻게 만들어?" — one guide card.
//
// `buildGuideCards` (11장) builds every card of the stage from the rule rows; this tool picks the
// one that was asked for. Nothing is written here and no sentence is composed: the card's Korean
// comes from the guidance layer's fixed templates.

import { orderStageWork } from '../../stage_rules/stage_rule_compiler.mjs';
import { buildGuideCards } from '../../guidance/guide_cards.mjs';
import { ENGINE_MCP_ERROR_CODES, mcpFail } from '../engine_context.mjs';
import { FOOTER, heading, lines, table } from '../render.mjs';

export const name = 'rules_card';
export const title_ko = '가이드 카드 1장';
export const description_ko = '한 단계의 산출물 하나에 대해 왜·언제·무엇을·어떻게·누가와 정본 인용 위치를 담은 카드를 낸다.';
export const write = false;
export const data_class = 'public_rules';

export const inputSchema = Object.freeze({
  type: 'object',
  properties: {
    stage_code: { type: 'string', description: '엔진 단계 코드 (예: 030_SRR)' },
    artifact_type_id: { type: 'string', description: '산출물 표준어 토큰 (예: semp)' },
  },
  required: ['stage_code', 'artifact_type_id'],
  additionalProperties: false,
});

export async function handler(args, ctx) {
  const stageCode = await ctx.assertKnownStage(args.stage_code);
  const token = String(args.artifact_type_id ?? '');
  const compiled = await ctx.compile([stageCode]);
  const observations = await ctx.loadObservations();
  const order = orderStageWork(compiled, observations.work_order);
  const cards = buildGuideCards({
    compile_result: compiled,
    vocabulary: ctx.vocabulary,
    compiled_variant: await ctx.loadVariant(),
    work_order: order,
  });

  const card = cards.cards.find((row) => row.stage_code === stageCode
    && row.artifact_type_id === token) ?? null;
  if (card === null) {
    mcpFail(ENGINE_MCP_ERROR_CODES.CARD_NOT_FOUND, 'this stage carries no card for that token', {
      stage_code: stageCode,
      artifact_type_id: token,
      available: cards.cards.filter((row) => row.stage_code === stageCode)
        .map((row) => row.artifact_type_id),
    });
  }

  const structured = { stage_code: stageCode, card, receipt_counts: cards.receipt.counts };

  const markdown = lines(
    `# ${card.title_ko ?? card.artifact_type_id} (${card.artifact_type_id}) — ${stageCode}`,
    heading('왜'),
    card.why.map((sentence) => `- ${sentence.text_ko}`).join('\n'),
    heading('언제'),
    [card.when.stage_sequence_note?.text_ko, card.when.maturity_expected === null
      ? card.when.maturity_note?.text_ko : `기대 성숙도: ${card.when.maturity_expected}`]
      .filter(Boolean).map((text) => `- ${text}`).join('\n'),
    heading('무엇을'),
    table(['이름', '용어', '설명'], [[card.what.name, card.what.term, card.what.desc]]),
    heading('어떻게'),
    [`- 양식: ${card.how.template.note.text_ko}`,
      `- 입력: ${card.how.inputs.length === 0 ? '없음'
        : card.how.inputs.map((input) => `${input.artifact_type_id}(${input.scope})`).join(', ')}`,
      `- 이 산출물을 입력으로 쓰는 것: ${card.how.produces_for.length === 0 ? '없음'
        : card.how.produces_for.map((row) => row.artifact_type_id).join(', ')}`].join('\n'),
    heading('누가'),
    card.who.note?.text_ko ?? '—',
    heading('근거 (위치만)'),
    table(['출처', '위치', '색인'],
      card.citations.map((ref) => [ref.source_key, ref.locator, ref.catalog_known])),
    FOOTER,
  );

  return { markdown, structured };
}
