// "이 과제 지금 어디쯤이야?" — every stage on one page.
//
// Latest stored counts per stage, how much of each stage's work order is still blocked, and the
// housekeeping totals the last observation walk reported. Three sources, kept apart in the answer:
// a judgement is not an observation and a tidying note is neither (10장 §10.6).

import { join } from 'node:path';

import { orderStageWork } from '../../rules/stage_rule_compiler.mjs';
import { summariseAssessment } from './judge_result.mjs';
import { FOOTER, heading, lines, table } from '../render.mjs';

export const name = 'project_status';
export const title_ko = '과제 현황';
export const description_ko = '전 단계 한눈에 — 단계별 최근 판정 수치, 순서 목록에서 막힌 수, 그리고 마지막 훑기의 청소 알림 총계.';
export const write = false;
export const data_class = 'team_judgment';
export const confidential_fields = Object.freeze([
  'observations.sources.auto_file', 'observations.sources.confirmed_file',
]);

export const inputSchema = Object.freeze({
  type: 'object',
  properties: {},
  additionalProperties: false,
});

export async function handler(args, ctx) {
  const stageCodes = await ctx.stageCodes();
  const observations = await ctx.loadObservations();
  const runs = await ctx.listRuns();

  const stages = [];
  for (const stageCode of stageCodes) {
    // A gate the rules give no required item — the lessons-learned gate is one — refuses to
    // compile or to order, and that refusal is reported as itself rather than as a row of zeroes.
    let compiled;
    let items;
    try {
      compiled = await ctx.compile([stageCode]);
      const order = orderStageWork(compiled, observations.work_order);
      const stage = order.stages.find((row) => row.stage_code === stageCode) ?? null;
      items = stage?.work_items ?? [];
    } catch (error) {
      stages.push({
        stage_code: stageCode, compiled: false, compile_refusal: error?.code ?? 'COMPILE_REFUSED',
        engine_requirements: 0, work_items: 0, blocked: 0, ready: 0,
        run_id: null, assessment_state: null, requirement_counts: null,
        open_risk_count: null, mission_candidates: 0,
      });
      continue;
    }

    const runId = await ctx.latestRunFor(stageCode);
    let summary = null;
    if (runId !== null) summary = summariseAssessment(await ctx.readAssessment(runId, stageCode));

    stages.push({
      stage_code: stageCode,
      compiled: true,
      compile_refusal: null,
      engine_requirements: compiled.mapping_table
        .filter((row) => row.stage_code === stageCode && row.engine_requirement_id !== null).length,
      work_items: items.length,
      ready: items.filter((item) => item.ready).length,
      blocked: items.filter((item) => !item.ready).length,
      run_id: runId,
      assessment_state: summary?.assessment_state ?? null,
      requirement_counts: summary?.requirement_counts ?? null,
      open_risk_count: summary?.open_risk_count ?? null,
      mission_candidates: summary?.mission_candidates?.length ?? 0,
    });
  }

  const receipt = await ctx.readJsonIfPresent(
    join(ctx.profile.observations_dir, 'receipt.json'), 'observation_receipt');

  const totals = { satisfied: 0, missing: 0, unknown: 0, not_applicable: 0, conflict: 0 };
  for (const stage of stages) {
    for (const key of Object.keys(totals)) totals[key] += stage.requirement_counts?.[key] ?? 0;
  }

  const structured = {
    project_code: ctx.profile.project_code,
    engine_version: ctx.engine_version,
    stages,
    totals,
    runs: runs.map((row) => row.run_id),
    observations: {
      merged_rows: observations.rows.length,
      sources: observations.sources,
    },
    housekeeping: {
      items: receipt?.housekeeping?.counts?.items ?? null,
      by_kind: receipt?.housekeeping?.counts?.by_kind ?? null,
      files_inventoried: receipt?.walk?.files_inventoried ?? null,
    },
  };

  const markdown = lines(
    `# ${ctx.profile.project_code} — 전 단계 현황`,
    table(['단계', '요구', '충족', '결손', '불명', '막힌 것', '판정', '실행'],
      stages.map((row) => [
        row.stage_code, row.engine_requirements,
        row.requirement_counts?.satisfied, row.requirement_counts?.missing,
        row.requirement_counts?.unknown, row.blocked, row.assessment_state, row.run_id,
      ])),
    heading('합계'),
    table(['충족', '결손', '불명', '해당없음', '상충'],
      [[totals.satisfied, totals.missing, totals.unknown, totals.not_applicable, totals.conflict]]),
    heading('폴더 청소 알림 (판단 아님)'),
    structured.housekeeping.items === null ? '(마지막 훑기 영수증 없음)'
      : table(['총계', ...Object.keys(structured.housekeeping.by_kind ?? {})],
        [[structured.housekeeping.items,
          ...Object.values(structured.housekeeping.by_kind ?? {})]]),
    FOOTER,
  );

  return { markdown, structured };
}
