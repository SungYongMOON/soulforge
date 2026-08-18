// "지금 관측된 게 뭐야?" — what the observation run currently holds.
//
// Counts only. The observation files carry no document name and no path (10장 §10.5), so neither
// does this answer.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { REGISTERED_CANDIDATES_FILE, latestConfirmedName } from '../engine_context.mjs';
import { FOOTER, heading, lines, table } from '../render.mjs';

export const name = 'observe_status';
export const title_ko = '관측 현황';
export const description_ko = '프로필이 가리키는 관측 실행의 현재 상태 — 단계별 관측 수, 확인 대기 수, 등록 대기 줄, 청소 알림 수.';
export const write = false;

export const inputSchema = Object.freeze({
  type: 'object',
  properties: {},
  additionalProperties: false,
});

export async function handler(args, ctx) {
  const directory = ctx.profile.observations_dir;
  const auto = await ctx.readJsonIfPresent(
    join(directory, 'artifact_observations_auto.json'), 'artifact_observations_auto');
  const receipt = await ctx.readJsonIfPresent(join(directory, 'receipt.json'), 'observation_receipt');
  const confirmedName = await latestConfirmedName(directory);
  const confirmed = confirmedName === null ? null
    : await ctx.readJsonIfPresent(join(directory, confirmedName), 'confirmed_observations');
  const registeredText = await readLineCount(join(directory, REGISTERED_CANDIDATES_FILE));
  const merged = await ctx.loadObservations();

  const byStage = {};
  for (const [stage, rows] of Object.entries(auto?.by_stage ?? {})) byStage[stage] = rows.length;
  for (const [stage, rows] of Object.entries(confirmed?.by_stage ?? {})) {
    byStage[stage] = Math.max(byStage[stage] ?? 0, rows.length);
  }

  const structured = {
    observations_dir: ctx.pointer(directory),
    files: {
      auto: auto === null ? null : 'artifact_observations_auto.json',
      confirmed: confirmedName,
      registered_candidates: registeredText === null ? null : REGISTERED_CANDIDATES_FILE,
    },
    counts: {
      auto_observations: auto?.artifact_observations?.length ?? 0,
      confirmed_observations: confirmed?.artifact_observations?.length ?? 0,
      merged_observations: merged.rows.length,
      registered_pending: registeredText ?? 0,
      candidates: receipt?.candidates?.counts?.candidates ?? null,
      auto_confirmed: receipt?.candidates?.counts?.auto_confirmed ?? null,
      needs_owner_confirmation: receipt?.candidates?.counts?.needs_owner_confirmation ?? null,
      auto_confirm_withheld_no_own_cue:
        receipt?.candidates?.counts?.auto_confirm_withheld_no_own_cue ?? null,
      housekeeping_items: receipt?.housekeeping?.counts?.items ?? null,
    },
    observations_by_stage: byStage,
  };

  const markdown = lines(
    `# 관측 현황 — ${ctx.profile.project_code}`,
    table(['자동', '확정', '합친 것', '등록 대기', '확인 대기', '청소 항목'], [[
      structured.counts.auto_observations, structured.counts.confirmed_observations,
      structured.counts.merged_observations, structured.counts.registered_pending,
      structured.counts.needs_owner_confirmation, structured.counts.housekeeping_items,
    ]]),
    heading('단계별 관측'),
    table(['단계', '수'], Object.entries(byStage).sort()),
    FOOTER,
  );

  return { markdown, structured };
}

/** The registered-candidate file is JSONL, so it is counted rather than parsed as one value. */
async function readLineCount(path) {
  try {
    const text = await readFile(path, 'utf8');
    return text.split('\n').filter((line) => line.trim().length > 0).length;
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}
