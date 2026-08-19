// "이 문으로 어떤 과제를 물어볼 수 있어?" — the registry, read (부록 B, 최소 변경 1·6번).
//
// Before the registry existed there was no answer to this question at all: the door knew the one
// project it had been started with and had no word for "the others". The listing is metadata only
// — code, label, status, the three profile labels a person recognises a project by — and the
// profile path is ⓒ, so a role without the confidential class sees the project exists and not
// where it lives.

import { FOOTER, lines, table } from '../render.mjs';

export const name = 'projects_list';
export const title_ko = '과제 목록';
export const description_ko = '이 문이 서빙할 수 있는 과제 명부 — 코드·표시 이름·상태·사업유형·발주처·등급·마지막 판단 시각.';
export const write = false;
export const data_class = 'team_judgment';
export const confidential_fields = Object.freeze(['projects[].profile']);

export const inputSchema = Object.freeze({
  type: 'object',
  properties: {
    status: {
      type: 'string',
      enum: ['active', 'paused', 'closed'],
      description: '이 상태의 과제만 보기(생략하면 전부)',
    },
  },
  additionalProperties: false,
});

export async function handler(args, ctx) {
  const projects = ctx.shared?.projects ?? null;
  const rows = projects === null ? [{
    project_code: ctx.profile.project_code,
    display_label: null,
    status: 'active',
    is_default: true,
    added_at: null,
    business_type: ctx.profile.business_type,
    prime: ctx.profile.prime,
    quality_grade: ctx.profile.quality_grade,
    profile: null,
    last_judge_run_at: await ctx.lastJudgeRunAt(),
    loaded: true,
  }] : await projects.listProjects();

  const filtered = args.status === undefined
    ? rows : rows.filter((row) => row.status === args.status);

  const structured = {
    schema_version: 'soulforge.engine_mcp_projects_list.v0',
    default_project: projects?.registry?.default_project ?? ctx.profile.project_code,
    counts: {
      total: rows.length,
      listed: filtered.length,
      active: rows.filter((row) => row.status === 'active').length,
      paused: rows.filter((row) => row.status === 'paused').length,
      closed: rows.filter((row) => row.status === 'closed').length,
      contexts_held: projects?.stats?.().held ?? 1,
    },
    projects: filtered,
    note: '판단 시각은 실행 색인이 있을 때만 나온다(없으면 null; 부록 B 변경 8번).',
  };

  const markdown = lines(
    `# 과제 목록 — ${structured.counts.listed}건 (전체 ${structured.counts.total})`,
    table(['과제', '표시 이름', '상태', '사업유형', '발주처', '등급', '마지막 판단', '기본'],
      filtered.map((row) => [
        row.project_code, row.display_label, row.status, row.business_type, row.prime,
        row.quality_grade, row.last_judge_run_at, row.is_default,
      ])),
    structured.note,
    FOOTER,
  );

  return { markdown, structured };
}
