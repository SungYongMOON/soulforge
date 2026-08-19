// "그 파일 좀 줘" — one small registered file, back through the call.
//
// The counterpart of `file_put`, and the only tool in this door that hands over a document's actual
// bytes. Everything else answers with metadata; this answers with the file, so it is the one place
// where the per-item class check has to be exactly right:
//
//   * a file inside a folder the profile marked confidential is refused for anybody without ⓒ,
//     with `SE_MCP_CLASS_EXCEEDED` — not a redacted answer, not an empty one. 9.1F 겹 3.
//   * 25 MB and no more. A bigger file is a download ticket and a link, not a JSON payload.
//   * read-only: nothing is created, nothing is recorded except the tool-call receipt the server
//     writes for every call.
//
// It is deliberately not a browsing tool. The caller has to already know the pointer — from a
// registration, a judgement, or an observation listing — because "show me what is in that folder"
// is a listing this door does not offer.

import { basename } from 'node:path';

import { ACCESS_ERROR_CODES } from '../access_table.mjs';
import { mcpFail } from '../engine_context.mjs';
import { MAX_SMALL_FILE_BYTES } from '../tickets.mjs';
import { FOOTER, lines, table } from '../render.mjs';

export const name = 'file_get';
export const title_ko = '작은 파일 받기';
export const description_ko = '등록된 작은 파일 하나를 base64로 돌려준다. 기밀 폴더의 파일은 등급이 되는 역할에게만 나간다.';
export const write = false;
export const data_class = 'team_judgment';
export const idempotent = true;
export const confidential_fields = Object.freeze(['artifact_ref', 'file']);

export const inputSchema = Object.freeze({
  type: 'object',
  properties: {
    artifact_ref: {
      type: 'string',
      description: '과제 폴더 기준 상대 경로 (예: 120_CDR/131_.../03_Out/....xlsx)',
    },
  },
  required: ['artifact_ref'],
  additionalProperties: false,
});

export async function handler(args, ctx) {
  ctx.requirePrincipal(name);
  const door = ctx.fileDoor();
  const source = ctx.resolveProjectRef(args.artifact_ref, 'artifact_ref');
  if (ctx.isConfidentialPath(source) && !ctx.canSeeClass('confidential_contract')) {
    mcpFail(ACCESS_ERROR_CODES.CLASS_EXCEEDED,
      'this file sits in a confidential folder and this role may not read it out',
      { field: 'artifact_ref', data_class: 'confidential_contract' });
  }
  const cap = Math.min(door.policy.max_file_bytes, MAX_SMALL_FILE_BYTES);
  const read = await ctx.readBytes(source, cap, { field: 'artifact_ref' });

  const structured = {
    schema_version: 'soulforge.engine_mcp_file_get.v0',
    artifact_ref: ctx.projectRef(source),
    file: ctx.pointer(source),
    file_name: basename(source),
    bytes: read.bytes,
    sha256: read.sha256,
    mtime_iso: read.mtime_iso,
    content_base64: read.content.toString('base64'),
  };

  const markdown = lines(
    `# 파일 — ${structured.file_name}`,
    table(['크기', '해시(앞 12)', '수정 시각'], [[
      structured.bytes, structured.sha256.slice(0, 12), structured.mtime_iso,
    ]]),
    '내용은 structuredContent의 content_base64에 있다.',
    FOOTER,
  );

  return { markdown, structured };
}
