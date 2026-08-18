// "그때 그 판단 다시 보여줘" — one stored assessment, summarised.
//
// The stored stdout is the record. This reads it and counts; it does not re-judge, and the numbers
// it prints are the ones the run wrote.

import { ENGINE_MCP_ERROR_CODES, assertRunId, mcpFail } from '../engine_context.mjs';
import { FOOTER, heading, lines, table } from '../render.mjs';

export const name = 'judge_result';
export const title_ko = '판단 결과 보기';
export const description_ko = '저장된 판단 영수증 하나(실행 id + 단계)의 판정 상태·요구 수·mission 후보를 읽어 준다.';
export const write = false;

export const inputSchema = Object.freeze({
  type: 'object',
  properties: {
    run_id: { type: 'string', description: '실행 폴더 이름' },
    stage_code: { type: 'string', description: '엔진 단계 코드' },
  },
  required: ['run_id', 'stage_code'],
  additionalProperties: false,
});

export function summariseAssessment(stdout) {
  const bound = stdout.role_bound_assessment ?? stdout;
  return {
    status: stdout.status ?? null,
    mode: stdout.mode ?? null,
    assessment_state: bound.assessment_state ?? null,
    stage_code: bound.current_stage?.stage_code ?? null,
    floor_status: bound.current_stage?.floor_status ?? null,
    requirement_counts: bound.current_stage?.requirement_counts ?? null,
    open_risk_count: bound.current_stage?.open_risk_count ?? null,
    issues: (bound.issues ?? []).map((row) => ({
      subject_id: row.subject_id,
      issue_kind: row.issue_kind,
      reason_code: row.reason_code,
      required_capability: row.required_capability ?? null,
    })),
    mission_candidates: (bound.next_mission_candidates ?? []).map((row) => ({
      rank: row.rank,
      subject_id: row.subject_id,
      mission_kind: row.mission_kind,
      required_capability: row.role_decision?.required_capability ?? null,
      role_id: row.role_decision?.role_id ?? null,
      candidate_only: row.candidate_only === true,
      task_intent_created: row.task_intent_created === true,
    })),
    effects: stdout.effects ?? null,
    // Counts read zero and flags read false; both mean the same thing here, and asking only about
    // zero would quietly report a clean run as dirty.
    effects_all_zero: Object.values(stdout.effects ?? {})
      .every((value) => value === 0 || value === false),
    policy_ref: bound.policy_ref ?? null,
    assessment_handle: bound.assessment_handle ?? null,
  };
}

export async function handler(args, ctx) {
  const runId = assertRunId(args.run_id);
  const stageCode = await ctx.assertKnownStage(args.stage_code);
  const stdout = await ctx.readAssessment(runId, stageCode);
  const summary = summariseAssessment(stdout);
  if (summary.requirement_counts === null) {
    mcpFail(ENGINE_MCP_ERROR_CODES.RUN_UNKNOWN,
      'this receipt carries no requirement counts', { run_id: runId, stage_code: stageCode });
  }

  const structured = { run_id: runId, stage_code: stageCode, ...summary };
  const counts = summary.requirement_counts;

  const markdown = lines(
    `# ${runId} / ${stageCode} — 판정 ${summary.assessment_state}`,
    table(['충족', '결손', '불명', '해당없음', '상충', '열린 위험'], [[
      counts.satisfied, counts.missing, counts.unknown, counts.not_applicable, counts.conflict,
      summary.open_risk_count,
    ]]),
    heading('mission 후보'),
    table(['순위', '대상', '종류', '담당'],
      summary.mission_candidates.map((row) =>
        [row.rank, row.subject_id, row.mission_kind, row.required_capability])),
    `엔진 effect 전부 0: ${summary.effects_all_zero ? '예' : '아니오'}`,
    FOOTER,
  );

  return { markdown, structured };
}
