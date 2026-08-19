// "엔진 지금 어떤 상태야?" — version, rule판, switches, scope, in one call with no arguments
// (9.1E 벤치마크 ①).
//
// It folds in what `rules_version` says about the release manifest, because a caller that has to
// make two calls to learn "which engine, which rules, which switches" usually makes one and
// guesses the rest. `rules_version` stays as it is: it is the tool that hands the manifest over
// unchanged, and this one is the summary beside the operational state.
//
// The two path fields are ⓒ: a repo pointer names a project folder, and a role without the
// confidential class is told the field was withheld rather than shown it.

import { join } from 'node:path';

import { DATA_CLASSES, ROLES } from '../access_table.mjs';
import { FOOTER, heading, lines, table } from '../render.mjs';

export const name = 'engine_status';
export const title_ko = '엔진 상태';
export const description_ko = '엔진 판·규칙 층 지문·프로토콜·스위치 두 개·과제 명부·영수증 위치·허용 뿌리를 한 번에 보여준다(인자 없음).';
export const write = false;
export const data_class = 'public_rules';
export const confidential_fields = Object.freeze([
  'registry.path', 'receipts_root', 'observations_dir', 'access.table_path',
]);
// What the project *is* — its code and its three labels — and how many projects this door serves
// are ⓑ: a public-class answer about the engine should not tell an outsider which projects exist.
// The engine version, the protocol, the switches and the rule-layer versions stay ⓐ.
export const team_fields = Object.freeze([
  'project.project_code', 'project.business_type', 'project.prime', 'project.quality_grade',
  'project.status',
  'registry.projects', 'registry.default_project', 'registry.contexts_held',
  'access.roles_declared',
  // That this project's door stands on a share rather than on the project tree is a fact about the
  // project, so it travels with the rest of the ⓑ block (Owner 2026-08-19).
  'allowed_roots.nas', 'file_door.root_kind',
]);

export const inputSchema = Object.freeze({
  type: 'object',
  properties: {},
  additionalProperties: false,
});

export async function handler(args, ctx) {
  const release = await ctx.readJsonIfPresent(
    join(ctx.engine_root, 'topology', 'engine_release.json'), 'engine_release');
  const shared = ctx.shared ?? {};
  const registry = shared.projects?.registry ?? null;
  const accessTable = shared.access_table ?? null;
  const tools = shared.tools ?? [];

  const ruleLayers = Object.entries(release?.components?.rule_layers ?? {})
    .map(([key, row]) => ({
      key,
      spec_version: row.spec_version ?? null,
      compiled_sha256_12: (row.compiled_sha256 ?? '').slice(0, 12) || null,
    }));

  const structured = {
    schema_version: 'soulforge.engine_mcp_engine_status.v0',
    engine_version: ctx.engine_version,
    release: release === null ? null : {
      status: release.status ?? null,
      git_commit_12: (release.git_commit ?? '').slice(0, 12) || null,
      stage_rule_compiler: release.components?.stage_rule_compiler?.version ?? null,
      pilot_packet_generator: release.components?.pilot_packet_generator?.version ?? null,
      rule_layers: ruleLayers,
      prime_overlays: Object.keys(release.components?.prime_overlays ?? {}).length,
      note: release.note ?? null,
    },
    protocol: {
      version: shared.protocol_version ?? null,
      server_name: shared.server_name ?? null,
      transport: 'stdio',
    },
    switches: {
      feature_env: shared.feature_env ?? null,
      feature_on: true,
      write_env: shared.write_env ?? null,
      write_enabled: ctx.write_enabled === true,
    },
    registry: {
      source: shared.registry_source ?? null,
      path: shared.registry_path ?? null,
      projects: registry?.projects?.length ?? 1,
      default_project: registry?.default_project ?? ctx.profile.project_code,
      contexts_held: shared.projects?.stats?.().held ?? null,
      context_cache_max: shared.projects?.stats?.().max ?? null,
    },
    project: {
      project_code: ctx.profile.project_code,
      business_type: ctx.profile.business_type,
      prime: ctx.profile.prime,
      quality_grade: ctx.profile.quality_grade,
      status: shared.projects?.statusOf?.(ctx.profile.project_code) ?? 'active',
    },
    receipts_root: ctx.pointer(ctx.profile.receipts_dir),
    observations_dir: ctx.pointer(ctx.profile.observations_dir),
    // Three roots this repository owns, and — only when a project states one — the share its door
    // folders sit on. The share's own path is never printed: that it exists is ⓑ, where it is is ⓒ.
    allowed_roots: {
      project: '_workspaces/**',
      metadata: '_workmeta/**',
      rule_assets: '.registry/skills/se_foldertree_generate/codex/assets/**',
      ...((ctx.profile.nas_root ?? null) === null ? {} : { nas: 'nas:** (문 앞 칸 전용 공유폴더)' }),
    },
    file_door: {
      enabled: ctx.profile.file_door_enabled === true,
      root_kind: ctx.profile.door_root_kind,
    },
    access: {
      table_source: accessTable?.source ?? 'built_in_default',
      table_path: shared.access_table_path ?? null,
      roles_declared: Object.keys(accessTable?.roles ?? {}),
      roles_known: [...ROLES],
      data_classes: [...DATA_CLASSES],
      caller_role: ctx.view?.role ?? null,
    },
    tools: {
      total: tools.length,
      read: tools.filter((tool) => tool.write !== true).length,
      write: tools.filter((tool) => tool.write === true).length,
    },
    cache: ctx.cacheStats(),
  };

  // The markdown says the same thing as the JSON, so it hides the same fields: a reader without
  // the team class sees the engine, not the projects behind it.
  const teamVisible = ctx.canSeeClass('team_judgment');
  const shown = (value) => (teamVisible ? value : null);

  const markdown = lines(
    `# 엔진 상태 — ${structured.engine_version} (${structured.release?.status ?? '판 없음'})`,
    table(['프로토콜', '읽기 스위치', '쓰기 스위치', '과제 수', '기본 과제', '도구'], [[
      structured.protocol.version, '켜짐', structured.switches.write_enabled,
      shown(structured.registry.projects), shown(structured.registry.default_project),
      structured.tools.total,
    ]]),
    heading('규칙 층'),
    table(['키', '스펙 판', 'compiled sha'],
      ruleLayers.map((row) => [row.key, row.spec_version, row.compiled_sha256_12])),
    heading('이 과제'),
    teamVisible ? table(['과제', '사업유형', '발주처', '등급', '상태'], [[
      structured.project.project_code, structured.project.business_type,
      structured.project.prime, structured.project.quality_grade, structured.project.status,
    ]]) : '(이 역할에는 과제 신원이 표시되지 않는다 — 팀 판단 등급 ⓑ)',
    heading('허용 뿌리'),
    Object.entries(structured.allowed_roots)
      .filter(([key]) => key !== 'nas' || teamVisible)
      .map(([, value]) => value).join(' · '),
    FOOTER,
  );

  return { markdown, structured };
}
