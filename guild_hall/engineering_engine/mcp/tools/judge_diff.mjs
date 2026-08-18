// "지난번이랑 뭐 달라졌어?" — two stored assessments of the same stage, compared.
//
// The comparison is over what the two receipts state, nothing more: the requirement counts, and
// the per-requirement issue each run recorded. A requirement that appears in neither run's issue
// list carried no issue in either, and is not invented into the answer as "satisfied both times" —
// the counts already say how many those were.

import { assertRunId } from '../engine_context.mjs';
import { summariseAssessment } from './judge_result.mjs';
import { FOOTER, heading, lines, table } from '../render.mjs';

export const name = 'judge_diff';
export const title_ko = '판단 차이';
export const description_ko = '같은 단계의 판단 영수증 둘을 비교해 요구 수 변화와 요구별 판정 변화를 낸다.';
export const write = false;

export const inputSchema = Object.freeze({
  type: 'object',
  properties: {
    run_id_a: { type: 'string', description: '이전 실행 id' },
    run_id_b: { type: 'string', description: '이후 실행 id' },
    stage_code: { type: 'string', description: '엔진 단계 코드' },
  },
  required: ['run_id_a', 'run_id_b', 'stage_code'],
  additionalProperties: false,
});

const COUNT_KEYS = Object.freeze(['satisfied', 'missing', 'unknown', 'not_applicable', 'conflict']);

export async function handler(args, ctx) {
  const runA = assertRunId(args.run_id_a, 'run_id_a');
  const runB = assertRunId(args.run_id_b, 'run_id_b');
  const stageCode = await ctx.assertKnownStage(args.stage_code);

  const left = summariseAssessment(await ctx.readAssessment(runA, stageCode));
  const right = summariseAssessment(await ctx.readAssessment(runB, stageCode));

  const countDelta = {};
  for (const key of COUNT_KEYS) {
    const before = left.requirement_counts?.[key] ?? 0;
    const after = right.requirement_counts?.[key] ?? 0;
    countDelta[key] = { before, after, delta: after - before };
  }

  const indexOf = (summary) => new Map(summary.issues.map((row) => [row.subject_id, row]));
  const before = indexOf(left);
  const after = indexOf(right);
  const subjects = [...new Set([...before.keys(), ...after.keys()])].sort();
  const changes = [];
  for (const subject of subjects) {
    const from = before.get(subject) ?? null;
    const to = after.get(subject) ?? null;
    if (from !== null && to !== null && from.issue_kind === to.issue_kind
      && from.reason_code === to.reason_code) continue;
    changes.push({
      subject_id: subject,
      before: from === null ? null : { issue_kind: from.issue_kind, reason_code: from.reason_code },
      after: to === null ? null : { issue_kind: to.issue_kind, reason_code: to.reason_code },
      change: from === null ? 'issue_appeared' : to === null ? 'issue_cleared' : 'issue_changed',
    });
  }

  const structured = {
    stage_code: stageCode,
    run_id_a: runA,
    run_id_b: runB,
    assessment_state: { before: left.assessment_state, after: right.assessment_state },
    requirement_counts: countDelta,
    issue_changes: changes,
    counts: {
      issues_before: left.issues.length,
      issues_after: right.issues.length,
      changed: changes.length,
    },
  };

  const markdown = lines(
    `# ${stageCode} — ${runA} → ${runB}`,
    table(['판정', ...COUNT_KEYS],
      [['이전', ...COUNT_KEYS.map((key) => countDelta[key].before)],
        ['이후', ...COUNT_KEYS.map((key) => countDelta[key].after)],
        ['차이', ...COUNT_KEYS.map((key) => countDelta[key].delta)]]),
    heading('요구별 변화'),
    table(['요구', '이전', '이후', '무엇'],
      changes.map((row) => [row.subject_id, row.before?.issue_kind ?? '이슈 없음',
        row.after?.issue_kind ?? '이슈 없음', row.change])),
    FOOTER,
  );

  return { markdown, structured };
}
