// "누가 무엇을 볼 수 있게 되어 있어?" — the access table, read (9.1F, F3).
//
// Owner and PM only, and read-only in the strong sense: there is no tool that edits this table
// anywhere in the door. The table is a file the Owner writes, and a door that could widen its own
// permissions would make every other check in this layer decorative.
//
// The answer is the table as it applies here: the base rows, the override rows for this project if
// there are any, and — because "what does the table say" and "what would it do" are different
// questions — the decision it produces for every role against every tool.

import { DATA_CLASSES, ROLES, decideToolAccess, grantFor, resolveAccessView } from '../access_table.mjs';
import { FOOTER, heading, lines, table } from '../render.mjs';

export const name = 'access_table';
export const title_ko = '권한표 보기';
export const description_ko = '역할별 허용 도구·자료 등급·역량과 이 과제의 덮어쓰기를 보여준다(Owner·PM 전용, 읽기만).';
export const write = false;
export const data_class = 'confidential_contract';

export const inputSchema = Object.freeze({
  type: 'object',
  properties: {
    role: {
      type: 'string',
      enum: [...ROLES],
      description: '이 역할만 보기(생략하면 전부)',
    },
  },
  additionalProperties: false,
});

export async function handler(args, ctx) {
  const accessTable = ctx.shared?.access_table ?? null;
  const projectCode = ctx.profile.project_code;
  const projectStatus = ctx.shared?.projects?.statusOf?.(projectCode) ?? 'active';
  const tools = ctx.shared?.tools ?? [];
  const roles = args.role === undefined ? [...ROLES] : [args.role];

  const rows = roles.map((role) => {
    const base = accessTable?.roles?.[role] ?? null;
    const effective = grantFor(accessTable ?? { roles: {} }, role, projectCode);
    const view = resolveAccessView({
      table: accessTable, principal: { principal_ref: 'role_probe', role }, project_code: projectCode,
    });
    const allowed = tools.filter((tool) => decideToolAccess({
      view, tool, write_enabled: true, project_status: projectStatus,
    }).allowed).map((tool) => tool.name);
    return {
      role,
      declared: base !== null,
      overridden: effective !== null && base !== effective,
      tools: [...(effective?.tools ?? [])],
      classes: [...(effective?.classes ?? [])],
      capabilities: [...(effective?.capabilities ?? [])],
      allowed_tools_here: allowed,
      write_tools_here: allowed.filter((toolName) =>
        tools.find((tool) => tool.name === toolName)?.write === true),
    };
  });

  const structured = {
    schema_version: 'soulforge.engine_mcp_access_table_view.v0',
    table_schema_version: accessTable?.schema_version ?? null,
    source: accessTable?.source ?? 'built_in_default',
    path: ctx.shared?.access_table_path ?? null,
    project_code: projectCode,
    project_status: projectStatus,
    data_classes: [...DATA_CLASSES],
    project_override_present: Object.hasOwn(accessTable?.project_overrides ?? {}, projectCode),
    roles: rows,
    mutation: {
      available: false,
      note: '권한을 바꾸는 도구는 없다. 접근표 파일을 Owner가 고치고 서버를 다시 띄운다(9.1F).',
    },
  };

  const markdown = lines(
    `# 권한표 — ${projectCode} (${structured.source})`,
    table(['역할', '선언됨', '과제 덮어쓰기', '등급', '허용 도구', '쓰기 도구'],
      rows.map((row) => [
        row.role, row.declared, row.overridden, row.classes,
        row.allowed_tools_here.length, row.write_tools_here.length,
      ])),
    heading('역할별 허용 도구'),
    table(['역할', '도구'], rows.map((row) => [row.role, row.allowed_tools_here])),
    structured.mutation.note,
    FOOTER,
  );

  return { markdown, structured };
}
