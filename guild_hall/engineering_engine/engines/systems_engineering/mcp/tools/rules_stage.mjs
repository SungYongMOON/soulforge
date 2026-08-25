// "PDR에 뭐가 있어야 해? 순서는?" — the expected list of one gate, in work order.
//
// Two existing pure functions, nothing added: `compileStageRules` says what the gate expects and
// `orderStageWork` says what to start on. The observations the profile already has are supplied so
// `blocked_by` reflects this project rather than an empty one.

import { orderStageWork } from '../../rules/stage_rule_compiler.mjs';
import { FOOTER, heading, lines, table } from '../render.mjs';

export const name = 'rules_stage';
export const title_ko = '단계 기대 목록과 순서';
export const description_ko = '한 단계(예: 120_CDR)에서 이 과제가 갖춰야 할 항목과 무엇부터 할지의 순서를, 게이트 역할·막힌 입력·근거와 함께 낸다.';
export const write = false;
export const data_class = 'public_rules';

export const inputSchema = Object.freeze({
  type: 'object',
  properties: {
    stage_code: { type: 'string', description: '엔진 단계 코드 (예: 120_CDR)' },
  },
  required: ['stage_code'],
  additionalProperties: false,
});

export async function handler(args, ctx) {
  const stageCode = await ctx.assertKnownStage(args.stage_code);
  const compiled = await ctx.compile([stageCode]);
  const observations = await ctx.loadObservations();
  const order = orderStageWork(compiled, observations.work_order);

  const rowsByToken = new Map();
  for (const row of compiled.mapping_table) {
    if (row.stage_code !== stageCode) continue;
    if (!rowsByToken.has(row.artifact_type_id) || row.engine_requirement_id !== null) {
      rowsByToken.set(row.artifact_type_id, row);
    }
  }
  const labelOf = (token) => ctx.vocabulary.find((entry) => entry.artifact_type_id === token) ?? null;

  const stage = order.stages.find((row) => row.stage_code === stageCode) ?? null;
  const workItems = (stage?.work_items ?? []).map((item) => {
    const row = rowsByToken.get(item.artifact_type_id) ?? null;
    const entry = labelOf(item.artifact_type_id);
    return {
      order_index: item.order_index,
      artifact_type_id: item.artifact_type_id,
      label_ko: entry === null ? null : entry.label_ko,
      node_kind: item.node_kind,
      gate_role: item.gate_role,
      evidence_level: item.evidence_level,
      minimum_presence_rule: item.minimum_presence_rule,
      maturity: row?.maturity ?? null,
      engine_requirement_id: item.engine_requirement_id,
      alias: item.alias,
      depends_on: [...item.depends_on],
      blocked_by: [...item.blocked_by],
      satisfied_inputs: [...item.satisfied_inputs],
      unresolved_inputs: [...item.unresolved_inputs],
      ready: item.ready,
      observation_state: item.observation_state,
      capability_default: entry === null ? null : entry.capability_default,
      source_refs: [...(row?.source_refs ?? [])],
    };
  });

  const structured = {
    stage_code: stageCode,
    project_code: ctx.profile.project_code,
    counts: {
      engine_requirements: compiled.mapping_table
        .filter((row) => row.stage_code === stageCode && row.engine_requirement_id !== null).length,
      mapping_rows: compiled.mapping_table.filter((row) => row.stage_code === stageCode).length,
      work_items: workItems.length,
      ready: workItems.filter((item) => item.ready).length,
      blocked: workItems.filter((item) => !item.ready).length,
      by_gate_role: order.receipt.counts.by_gate_role,
    },
    observations_supplied: observations.work_order.length,
    observation_sources: observations.sources,
    work_items: workItems,
    compiler_receipt_counts: compiled.receipt.counts,
    work_order_receipt_counts: order.receipt.counts,
  };

  const markdown = lines(
    `# ${stageCode} — 기대 목록과 순서`,
    `요구 ${structured.counts.engine_requirements} · 순서 목록 ${structured.counts.work_items}`
    + ` · 안 막힌 것 ${structured.counts.ready} · 막힌 것 ${structured.counts.blocked}`
    + ` · 공급된 관측 ${structured.observations_supplied}`,
    heading('무엇부터'),
    table(['#', '산출물', '역할', '근거', '기대', '막은 입력', '담당'],
      workItems.map((item) => [
        item.order_index + 1,
        `${item.label_ko ?? item.artifact_type_id} (${item.artifact_type_id})`,
        item.gate_role,
        item.evidence_level,
        item.minimum_presence_rule,
        item.blocked_by,
        item.capability_default,
      ])),
    heading('근거 인용 (위치만)'),
    table(['산출물', '인용'],
      workItems.map((item) => [item.artifact_type_id,
        item.source_refs.map((ref) => `${ref.source_key ?? '?'}#${ref.locator ?? '?'}`)])),
    FOOTER,
  );

  return { markdown, structured };
}
