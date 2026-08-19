// "이 과제엔 무슨 규칙이 붙어?" — which layers this project stands on.
//
// Reads the compiled variant and the overlays the profile names and says what they are. No
// compile: a caller asking which rules apply should not have to pay for evaluating them.

import { paginate, pagingProperties } from '../paging.mjs';
import { FOOTER, heading, lines, table } from '../render.mjs';

export const name = 'rules_layers';
export const title_ko = '적용 층 보기';
export const description_ko = '이 과제에 붙는 규칙 층(사업유형 스펙·발주처 덧씌움·과제 덧씌움)과 그 판을 보여준다.';
export const write = false;
export const data_class = 'public_rules';
// Which rules apply is ⓐ; which project they apply *to*, and the names of the files it stands on,
// are ⓑ. An overlay file name carries the prime contractor and the project, so it is identity.
export const team_fields = Object.freeze([
  'project_code', 'business_type', 'prime', 'quality_grade', 'layers[].file_name',
]);

const DEFAULT_LIMIT = 32;

export const inputSchema = Object.freeze({
  type: 'object',
  properties: { ...pagingProperties(DEFAULT_LIMIT) },
  additionalProperties: false,
});

export async function handler(args, ctx) {
  const variant = await ctx.loadVariant();
  const overlayFiles = await ctx.loadOverlayFiles();
  const stageCodes = await ctx.stageCodes();

  const layers = [
    {
      layer: 'variant',
      file_name: ctx.profile.compiled_variant.split(/[\\/]/u).pop(),
      support_key: variant.support_key ?? null,
      business_type: variant.business_type ?? null,
      prime_contractor: variant.prime_contractor ?? null,
      quality_grade: variant.quality_grade ?? null,
      spec_version: variant.spec_version ?? null,
      spec_sha256: variant.spec_sha256 ?? null,
      gates: (variant.gates ?? []).length,
      ops: null,
    },
    ...overlayFiles.map((row) => ({
      layer: 'overlay',
      file_name: row.file_name,
      support_key: null,
      business_type: null,
      prime_contractor: null,
      quality_grade: null,
      spec_version: row.overlay.overlay_identity?.revision_label ?? null,
      spec_sha256: row.overlay.extends?.spec_sha256 ?? null,
      gates: null,
      ops: (row.overlay.ops ?? []).length,
    })),
  ];

  const paged = paginate(layers, args, { field: 'layers', default_limit: DEFAULT_LIMIT });

  const structured = {
    project_code: ctx.profile.project_code,
    business_type: ctx.profile.business_type,
    prime: ctx.profile.prime,
    quality_grade: ctx.profile.quality_grade,
    overlay_conditions: [...ctx.profile.overlay_conditions],
    engine_stage_codes: stageCodes,
    layers: paged.items,
    page: paged.page,
  };

  // The markdown hides what the JSON hides, for the same reader.
  const teamVisible = ctx.canSeeClass('team_judgment');

  const markdown = lines(
    teamVisible ? `# ${ctx.profile.project_code} — 붙는 규칙 층` : '# 붙는 규칙 층',
    table(['층', '파일', '판', 'op 수', '게이트 수'],
      paged.items.map((row) => [
        row.layer === 'variant' ? `사업유형 스펙 (${row.support_key ?? '—'})` : '덧씌움',
        teamVisible ? row.file_name : null, row.spec_version, row.ops, row.gates,
      ])),
    heading('켜진 조건'),
    structured.overlay_conditions.length === 0 ? '(없음)' : structured.overlay_conditions.join(', '),
    heading('엔진 단계'),
    stageCodes.join(' · '),
    FOOTER,
  );

  return { markdown, structured };
}
