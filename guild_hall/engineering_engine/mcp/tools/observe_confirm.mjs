// "이 폴더는 맞아 / 이건 아니야" — the Owner's decisions applied to one confirmation sheet.
//
// `applyConfirmationSheet` (10장 §10.4) owns the rule that a file decision beats a folder decision
// beats an automatic confirmation, and `buildArtifactObservationsFromConfirmed` (§10.5) turns the
// survivors into the shape the packet generator eats. Both are pure; this tool reads the sheet the
// caller names — which must be the observation run the profile names, so it is a path with one
// possible parent — and writes the result once, create-only.

import { basename, join } from 'node:path';

import {
  applyConfirmationSheet,
} from '../../observation/observation_confirmation_sheet.mjs';
import {
  buildArtifactObservationsFromConfirmed,
} from '../../observation/artifact_observations_from_confirmed.mjs';
import { ENGINE_MCP_ERROR_CODES, compactInstant, mcpFail } from '../engine_context.mjs';
import { FOOTER, heading, lines, table } from '../render.mjs';

export const name = 'observe_confirm';
export const title_ko = '확인표 결정 반영';
export const description_ko = '확인표의 파일·업무폴더 결정을 적용해 확정 관측 파일을 한 번 만든다(덮어쓰지 않는다).';
export const write = true;

export const inputSchema = Object.freeze({
  type: 'object',
  properties: {
    sheet_json_path: {
      type: 'string',
      description: '확인표 JSON의 절대 경로. 프로필이 지정한 관측 폴더 아래여야 한다.',
    },
    decisions: {
      type: 'array',
      maxItems: 4096,
      description: 'confirm / reject / reassign / confirm_folder / reject_folder 결정 목록',
      items: { type: 'object' },
    },
  },
  required: ['sheet_json_path', 'decisions'],
  additionalProperties: false,
});

export async function handler(args, ctx) {
  ctx.requireWrite(name);
  const sheetPath = ctx.assertUnderObservations(args.sheet_json_path, 'sheet_json_path');
  if (!Array.isArray(args.decisions)) {
    mcpFail(ENGINE_MCP_ERROR_CODES.ARGUMENTS_INVALID, 'decisions must be an array', {});
  }
  const sheet = await ctx.readJson(sheetPath, 'confirmation_sheet');
  const runDir = ctx.profile.observations_dir;
  const candidatesFile = await ctx.readJson(join(runDir, 'candidates.json'), 'candidates');
  const inventoryFile = await ctx.readJson(join(runDir, 'inventory.json'), 'inventory');

  const knownAt = sheet.known_at ?? candidatesFile.known_at ?? null;
  if (typeof knownAt !== 'string') {
    mcpFail(ENGINE_MCP_ERROR_CODES.ARGUMENTS_INVALID,
      'the sheet states no known_at, so no confirmed file can be named', {});
  }

  const applied = applyConfirmationSheet(candidatesFile.candidates ?? [], args.decisions);
  const observations = buildArtifactObservationsFromConfirmed({
    confirmed: applied.confirmed,
    inventory: inventoryFile.rows ?? [],
    known_at: knownAt,
  });

  const outName = `confirmed_observations_${compactInstant(knownAt)}.json`;
  const outPath = join(runDir, outName);
  const body = {
    schema_version: 'soulforge.engine_mcp_confirmed_observations.v0',
    known_at: knownAt,
    sheet_file: basename(sheetPath),
    decisions_applied: args.decisions.length,
    confirmed: applied.confirmed,
    confirmation_receipt: applied.receipt,
    artifact_observations: observations.artifact_observations,
    by_stage: observations.by_stage,
    observation_receipt: observations.receipt,
  };
  await ctx.writeCreateOnly(outPath, `${JSON.stringify(body, null, 2)}\n`);

  const structured = {
    file: ctx.pointer(outPath),
    file_name: outName,
    known_at: knownAt,
    decisions_applied: args.decisions.length,
    counts: {
      confirmed_rows: applied.confirmed.length,
      artifact_observations: observations.artifact_observations.length,
      observations_by_stage: observations.receipt.counts?.observations_by_stage ?? null,
    },
  };

  const markdown = lines(
    `# 확정 반영 — ${outName}`,
    table(['결정 수', '확정된 줄', '관측'], [[
      structured.decisions_applied, structured.counts.confirmed_rows,
      structured.counts.artifact_observations,
    ]]),
    heading('단계별 관측'),
    table(['단계', '수'], Object.entries(structured.counts.observations_by_stage ?? {})),
    FOOTER,
  );

  return { markdown, structured };
}
