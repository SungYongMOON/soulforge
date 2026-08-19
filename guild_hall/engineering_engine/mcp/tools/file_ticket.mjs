// "파일 어디에 올려요?" / "그 파일 좀 받을 수 있어요?" — one ticket, one folder, one expiry.
//
// The ticket is the whole access model for files (Owner 결정 2026-08-19). A person never gets a
// path into the project and never opens the project folder: they get a folder of their own, under
// the intake folder, that exists only for this one hand-over and expires. Registration moves the
// bytes out of it; housekeeping sweeps what is left to the trash.
//
// Download is the mirror and is where the class check bites. The tool is ⓑ, so any team role may
// ask — but a file that lives in a folder the profile marked confidential is copied only for a
// caller who holds ⓒ, and everybody else is refused with `SE_MCP_CLASS_EXCEEDED` before anything
// is created. That is 9.1F 겹 3 applied per item rather than per tool.
//
// What this tool does not do: issue a link. Turning the folder it names into something a person can
// open from a browser is the gateway's job (OneDrive UI today); the engine makes no network call.

import { randomUUID } from 'node:crypto';
import { basename, join } from 'node:path';

import { ACCESS_ERROR_CODES } from '../access_table.mjs';
import { ENGINE_MCP_ERROR_CODES, assertArgumentString, mcpFail } from '../engine_context.mjs';
import {
  MAX, TICKET_PURPOSES, assertPrincipalRef, mintTicketId, newTicketRecord, ticketExpiry,
} from '../tickets.mjs';
import { FOOTER, heading, lines, table } from '../render.mjs';

export const name = 'file_ticket';
export const title_ko = '문 앞 칸 내주기 (올리기·내려받기 표)';
export const description_ko = '파일을 넣거나 받을 자리를 하나 만들고 그 자리의 표(ticket)를 낸다. 링크 발급은 엔진 밖에서 한다.';
export const write = true;
export const data_class = 'team_judgment';
// Every call makes a new folder, so two calls are two tickets rather than one.
export const idempotent = false;
export const confidential_fields = Object.freeze(['folder', 'folder_ref', 'artifact_ref', 'copied_file']);

export const inputSchema = Object.freeze({
  type: 'object',
  properties: {
    purpose: {
      type: 'string',
      enum: [...TICKET_PURPOSES],
      description: 'upload(문 앞 칸에 넣는다) 또는 download(칸에서 가져간다)',
    },
    artifact_ref: {
      type: 'string',
      description: 'download일 때 필수 — 과제 폴더 기준 상대 경로 (예: 120_CDR/131_.../03_Out/....xlsx)',
    },
    note: { type: 'string', description: '무엇을 위한 칸인지 한 줄(선택)' },
  },
  required: ['purpose'],
  additionalProperties: false,
});

export async function handler(args, ctx) {
  ctx.requireWrite(name);
  const principalRef = assertPrincipalRef(ctx.requirePrincipal(name));
  const door = ctx.fileDoor();
  const purpose = assertArgumentString(args.purpose, 'purpose', 16);
  if (!TICKET_PURPOSES.includes(purpose)) {
    mcpFail(ENGINE_MCP_ERROR_CODES.ARGUMENTS_INVALID, 'unknown ticket purpose',
      { field: 'purpose', allowed: [...TICKET_PURPOSES] });
  }
  const note = args.note === undefined ? null : assertArgumentString(args.note, 'note', MAX.note);
  if (purpose === 'upload' && args.artifact_ref !== undefined) {
    mcpFail(ENGINE_MCP_ERROR_CODES.ARGUMENTS_INVALID,
      'an upload ticket names no file — the file does not exist yet', { field: 'artifact_ref' });
  }

  const createdAt = ctx.now();
  // The stamp only carries seconds, and two hand-overs a second apart is an ordinary Tuesday, so
  // the id gets something unique of its own. The minting stays a pure function of its parts; this
  // is the one part that is not derived from them.
  const ticketId = mintTicketId({
    purpose, created_at: createdAt, principal_ref: principalRef, nonce: randomUUID(),
  });
  const baseDir = purpose === 'upload' ? door.intake_dir : door.outbox_dir;
  const folder = join(baseDir, principalRef, ticketId);

  let artifactRef = null;
  let copied = null;
  if (purpose === 'download') {
    if (args.artifact_ref === undefined) {
      mcpFail(ENGINE_MCP_ERROR_CODES.ARGUMENTS_INVALID,
        'a download ticket has to name the file to copy', { field: 'artifact_ref' });
    }
    const source = ctx.resolveProjectRef(args.artifact_ref, 'artifact_ref');
    const stats = await ctx.statFile(source);
    if (stats === null) {
      mcpFail(ENGINE_MCP_ERROR_CODES.FILE_UNREADABLE, 'there is no such file in this project',
        { field: 'artifact_ref' });
    }
    // Before the folder is made, not after: a refusal must leave nothing behind that says somebody
    // was allowed to ask.
    if (ctx.isConfidentialPath(source) && !ctx.canSeeClass('confidential_contract')) {
      mcpFail(ACCESS_ERROR_CODES.CLASS_EXCEEDED,
        'this file sits in a confidential folder and this role may not take it out',
        { field: 'artifact_ref', data_class: 'confidential_contract' });
    }
    artifactRef = ctx.projectRef(source);
    await ctx.makeDirectoryCreateOnly(folder, { field: 'ticket_folder' });
    const target = join(folder, basename(source));
    const result = await ctx.copyCreateOnly(source, target, { field: 'outbox_copy' });
    copied = { name: basename(source), sha256: result.sha256, bytes: stats.bytes };
  } else {
    await ctx.makeDirectoryCreateOnly(folder, { field: 'ticket_folder' });
  }

  const record = newTicketRecord({
    ticket_id: ticketId,
    purpose,
    principal_ref: principalRef,
    role: ctx.view?.role ?? null,
    created_at: createdAt,
    expires_at: ticketExpiry(createdAt, purpose, door.policy),
    folder_ref: ctx.projectRef(folder),
    artifact_ref: artifactRef,
    note,
    files: copied === null ? [] : [copied],
  });
  await ctx.appendTicketRow(record);
  await ctx.appendFileReceipt({
    schema_version: 'soulforge.engine_mcp_file_operation.v0',
    logged_at: createdAt,
    tool: name,
    operation: purpose === 'upload' ? 'ticket_open' : 'ticket_copy_out',
    principal_ref: principalRef,
    role: ctx.view?.role ?? null,
    ticket_id: ticketId,
    folder_ref: record.folder_ref,
    artifact_ref: artifactRef,
    files: record.files,
  });

  const structured = {
    schema_version: record.schema_version,
    ticket_id: ticketId,
    purpose,
    expires_at: record.expires_at,
    folder: ctx.pointer(folder),
    folder_ref: record.folder_ref,
    artifact_ref: artifactRef,
    copied_file: copied === null ? null : copied.name,
    allowed_extensions: door.policy.allowed_extensions.length,
    max_file_bytes: door.policy.max_file_bytes,
    next: purpose === 'upload'
      ? '이 폴더에 파일을 넣고 file_register로 등록한다. 링크는 이 폴더에 대해 OneDrive에서 만든다(엔진 밖).'
      : '이 폴더에서 가져간다. 기한이 지나면 정리 도구가 휴지통으로 옮긴다(지우지 않는다).',
  };

  const markdown = lines(
    `# 문 앞 칸 — ${purpose === 'upload' ? '올리기' : '내려받기'} 표 ${ticketId}`,
    table(['표', '쓰는 사람', '기한'], [[ticketId, principalRef, record.expires_at]]),
    heading('자리'),
    structured.folder ?? '(가려짐)',
    structured.next,
    FOOTER,
  );

  return { markdown, structured };
}
