// "이 규칙은 어느 판이야?" — the engine release manifest, read as it stands.
//
// The manifest (`topology/engine_release.json`) is what a run receipt's `policy_ref` is derived
// from: rule-layer digests, overlays, vocabulary, compiler and generator versions, the code
// manifest and the git commit. This tool hands it over unchanged rather than summarising it into a
// second, disagreeing version label.

import { join } from 'node:path';

import { FOOTER, heading, lines, table } from '../render.mjs';

export const name = 'rules_version';
export const title_ko = '규칙·엔진 판 보기';
export const description_ko = '엔진 판(engine_version)과 그 판이 묶은 규칙 층·컴파일러·매니페스트 지문을 그대로 보여준다.';
export const write = false;

export const inputSchema = Object.freeze({
  type: 'object',
  properties: {},
  additionalProperties: false,
});

export async function handler(args, ctx) {
  const release = await ctx.readJson(
    join(ctx.engine_root, 'topology', 'engine_release.json'), 'engine_release');

  const layers = Object.entries(release.components?.rule_layers ?? {})
    .map(([key, row]) => [key, row.spec_version, (row.compiled_sha256 ?? '').slice(0, 12)]);
  const overlays = Object.entries(release.components?.prime_overlays ?? {})
    .map(([key, row]) => [key, (row.sha256 ?? '').slice(0, 12)]);

  const markdown = lines(
    `# 엔진 판 ${release.engine_version} (${release.status})`,
    `컴파일러 ${release.components?.stage_rule_compiler?.version ?? '—'}`
    + ` · 생성기 ${release.components?.pilot_packet_generator?.version ?? '—'}`
    + ` · git ${(release.git_commit ?? '').slice(0, 12) || '—'}`,
    heading('규칙 층'),
    table(['키', '스펙 판', 'compiled sha'], layers),
    heading('발주처 덧씌움'),
    table(['파일', 'sha'], overlays),
    release.note ?? '',
    FOOTER,
  );

  return { markdown, structured: { engine_release: release } };
}
