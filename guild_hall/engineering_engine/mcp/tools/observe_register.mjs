// "이 파일이 HDD 최종본이야" — one candidate row, written down and left for a person.
//
// This is deliberately not an observation. The automatic-confirmation rule (10장 §10.3 +1) has
// three conditions and none of them is "somebody said so in a chat": a line registered here waits
// in `registered_candidates.jsonl` with `decision: null` until the confirmation path takes it.
// Writing it straight into the engine's observations would make the door the one place where D37
// does not hold.

import { join } from 'node:path';

import { MATURITY } from '../../observation/artifact_observation_candidates.mjs';
import { isKnownArtifactType } from '../../stage_rules/artifact_vocabulary.mjs';
import {
  ENGINE_MCP_ERROR_CODES, REGISTERED_CANDIDATES_FILE, assertInstant, mcpFail,
} from '../engine_context.mjs';
import { assertSafeString, hasControlCharacter } from '../project_profile.mjs';
import { FOOTER, lines, table } from '../render.mjs';

export const name = 'observe_register';
export const title_ko = '관측 등록(확인 대기)';
export const description_ko = '파일 하나를 어떤 단계의 어떤 산출물로 보는지 후보로 적어 둔다. 자동 확정 규칙은 적용되지 않으며 사람 확인 전에는 관측이 아니다.';
export const write = true;
export const data_class = 'team_judgment';
export const idempotent = false;
export const confidential_fields = Object.freeze(['file', 'registered.file_ref']);

const MATURITY_VALUES = Object.freeze(Object.values(MATURITY));

export const inputSchema = Object.freeze({
  type: 'object',
  properties: {
    file_ref: { type: 'string', description: '과제 폴더 기준 상대 경로 (예: 120_CDR/125_.../03_Out/....pdf)' },
    artifact_type_id: { type: 'string', description: '산출물 표준어 토큰 (예: hdd)' },
    stage_code: { type: 'string', description: '엔진 단계 코드 (예: 120_CDR)' },
    maturity: { type: 'string', enum: [...MATURITY_VALUES], description: '성숙도(선택)' },
    note: { type: 'string', description: '왜 그렇게 보는지 한 줄(선택)' },
  },
  required: ['file_ref', 'artifact_type_id', 'stage_code'],
  additionalProperties: false,
});

/** A project-relative pointer, never an absolute path and never a climb. */
function assertFileRef(value) {
  assertSafeString(value, 'file_ref', 512);
  if (/^[A-Za-z]:[\\/]/u.test(value) || value.startsWith('/') || value.startsWith('\\')) {
    mcpFail(ENGINE_MCP_ERROR_CODES.ARGUMENTS_INVALID,
      'file_ref is a project-relative pointer, not an absolute path', {});
  }
  if (value.split(/[\\/]/u).includes('..')) {
    mcpFail(ENGINE_MCP_ERROR_CODES.ARGUMENTS_INVALID, 'file_ref may not climb out of the project', {});
  }
  return value.split('\\').join('/');
}

export async function handler(args, ctx) {
  ctx.requireWrite(name);
  const stageCode = await ctx.assertKnownStage(args.stage_code);
  const fileRef = assertFileRef(args.file_ref);
  const token = String(args.artifact_type_id ?? '');
  if (!isKnownArtifactType(token)) {
    mcpFail(ENGINE_MCP_ERROR_CODES.ARGUMENTS_INVALID,
      'this token is not in the artifact vocabulary', { artifact_type_id: token });
  }
  const maturity = args.maturity === undefined ? null : String(args.maturity);
  if (maturity !== null && !MATURITY_VALUES.includes(maturity)) {
    mcpFail(ENGINE_MCP_ERROR_CODES.ARGUMENTS_INVALID, 'unknown maturity', { maturity });
  }
  const note = args.note === undefined ? null : String(args.note);
  if (note !== null && (note.length > 512 || hasControlCharacter(note))) {
    mcpFail(ENGINE_MCP_ERROR_CODES.ARGUMENTS_INVALID, 'a note must be one short line', {});
  }

  const registeredAt = assertInstant(ctx.now(), 'registered_at');
  const row = {
    schema_version: 'soulforge.engine_mcp_registered_candidate.v0',
    registered_at: registeredAt,
    source: 'mcp.observe_register',
    stage_code: stageCode,
    artifact_type_id: token,
    file_ref: fileRef,
    maturity,
    note,
    decision: null,
  };
  const path = join(ctx.profile.observations_dir, REGISTERED_CANDIDATES_FILE);
  await ctx.appendLine(path, JSON.stringify(row), { field: 'registered_candidates' });

  const structured = {
    registered: row,
    file: ctx.pointer(path),
    confirmation_required: true,
    note: '자동 확정 규칙은 여기에 적용되지 않는다. 이 줄은 사람이 확인해야 관측이 된다(D37).',
  };

  const markdown = lines(
    '# 관측 후보 등록됨 (확인 대기)',
    table(['단계', '산출물', '파일', '성숙도'], [[stageCode, token, fileRef, maturity]]),
    structured.note,
    FOOTER,
  );

  return { markdown, structured };
}
