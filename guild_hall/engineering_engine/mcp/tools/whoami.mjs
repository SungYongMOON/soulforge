// "나는 누구고 뭘 볼 수 있어?" — the caller's own standing, and nothing about anybody else.
//
// Every system that has principals has this call, and it exists for one reason: a caller who does
// not know what they may do reads a refusal as a broken tool. The answer is assembled from the
// access table and the tool set the server already holds (9.1F, F2) — this tool grants nothing and
// changes nothing, and there is deliberately no companion tool that edits the table.

import { decideToolAccess } from '../access_table.mjs';
import { FOOTER, heading, lines, table } from '../render.mjs';

export const name = 'whoami';
export const title_ko = '내 권한 보기';
export const description_ko = '이 호출자가 누구로 인식되는지, 어떤 역할·자료 등급·도구가 허용되는지, 어느 과제 범위인지 보여준다.';
export const write = false;
export const data_class = 'public_rules';

export const inputSchema = Object.freeze({
  type: 'object',
  properties: {},
  additionalProperties: false,
});

export async function handler(args, ctx) {
  const view = ctx.view;
  const tools = ctx.shared?.tools ?? [];
  const projectCode = ctx.profile.project_code;
  const projectStatus = ctx.shared?.projects?.statusOf?.(projectCode) ?? 'active';

  const decisions = tools.map((tool) => ({
    tool: tool.name,
    write: tool.write === true,
    data_class: tool.data_class,
    ...decideToolAccess({
      view, tool, write_enabled: ctx.write_enabled, project_status: projectStatus,
    }),
  }));
  const allowed = decisions.filter((row) => row.allowed).map((row) => row.tool);
  const refused = decisions.filter((row) => !row.allowed)
    .map((row) => ({ tool: row.tool, reason: row.reason }));

  const registry = ctx.shared?.projects?.registry ?? null;
  const structured = {
    schema_version: 'soulforge.engine_mcp_whoami.v0',
    principal_ref: view.principal_ref,
    role: view.role,
    anonymous: view.anonymous === true,
    access_table_source: view.table_source ?? null,
    visible_classes: [...view.classes],
    capabilities: view.all_capabilities === true ? ['*'] : [...view.capabilities],
    allowed_tools: allowed,
    refused_tools: refused,
    write_tools_enabled: ctx.write_enabled,
    project_scope: {
      project_code: projectCode,
      project_status: projectStatus,
      default_project: registry?.default_project ?? projectCode,
      projects_in_registry: registry?.projects?.length ?? 1,
    },
    note: view.anonymous === true
      ? '신원이 없으면 공개 규칙 등급(ⓐ)만 열린다. 나머지는 SE_MCP_PRINCIPAL_REQUIRED로 거절된다.'
      : '권한을 바꾸는 도구는 없다. 접근표는 파일이고 변경은 Owner가 한다(9.1F).',
  };

  const markdown = lines(
    `# 나 — ${structured.role ?? '신원 없음'} (${structured.principal_ref ?? '—'})`,
    table(['역할', '볼 수 있는 등급', '허용 도구', '거절 도구', '쓰기 스위치'], [[
      structured.role, structured.visible_classes, allowed.length, refused.length,
      ctx.write_enabled,
    ]]),
    heading('허용 도구'),
    allowed.length === 0 ? '(없음)' : allowed.join(' · '),
    heading('거절 도구와 사유'),
    table(['도구', '사유'], refused.map((row) => [row.tool, row.reason])),
    heading('과제 범위'),
    table(['과제', '상태', '기본 과제', '명부 과제 수'], [[
      structured.project_scope.project_code, structured.project_scope.project_status,
      structured.project_scope.default_project, structured.project_scope.projects_in_registry,
    ]]),
    structured.note,
    FOOTER,
  );

  return { markdown, structured };
}
