// 작은 파일은 문으로 — one small file, through the call itself, into a ticket folder.
//
// The normal way in is a link: the person drops the file into the folder `file_ticket` named and
// the engine never carries the bytes. This is the other way, for the case where an assistant
// already holds a small file and a link would be three more steps than the file is worth.
//
// It is a narrow door on purpose. 25 MB (a mail attachment stops at 30), an extension the policy
// allows, and a digest the caller states and this tool checks — a base64 payload that arrived
// truncated has to fail here rather than become a file nobody notices is short. Nothing is
// registered by this call: the file lands in the ticket folder, exactly as if a person had dropped
// it there, and `file_register` is still what moves it into the project.

import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { ENGINE_MCP_ERROR_CODES, assertArgumentString, mcpFail } from '../engine_context.mjs';
import { assertPrincipalRef, assertTicketId, assertTicketUsable, assertUploadFileName } from '../tickets.mjs';
import { FOOTER, lines, table } from '../render.mjs';

export const name = 'file_put';
export const title_ko = '작은 파일 넣기';
export const description_ko = '작은 파일 하나를 표(ticket)가 가리키는 문 앞 칸에 그대로 넣는다. 해시를 확인하며, 등록은 별도(file_register)다.';
export const write = true;
export const data_class = 'team_judgment';
export const idempotent = false;
export const confidential_fields = Object.freeze(['file', 'folder_ref']);

const SHA256_HEX = /^[0-9a-f]{64}$/u;
// base64 grows by four bytes per three, and the cap below is applied to the decoded length anyway;
// this one only stops a payload that could never be inside the cap from being decoded at all.
const MAX_BASE64_LENGTH = 40 * 1024 * 1024;

export const inputSchema = Object.freeze({
  type: 'object',
  properties: {
    ticket_id: { type: 'string', description: 'file_ticket(upload)이 낸 표' },
    name: { type: 'string', description: '파일 이름(경로 아님). 확장자는 허용 목록 안이어야 한다' },
    content_base64: { type: 'string', description: '파일 내용 base64' },
    sha256: { type: 'string', description: '보낸 쪽이 계산한 sha256(소문자 64자) — 다르면 거절' },
  },
  required: ['ticket_id', 'name', 'content_base64', 'sha256'],
  additionalProperties: false,
});

export async function handler(args, ctx) {
  ctx.requireWrite(name);
  const principalRef = assertPrincipalRef(ctx.requirePrincipal(name));
  const door = ctx.fileDoor();
  const ticketId = assertTicketId(args.ticket_id);
  const now = ctx.now();

  const ledger = await ctx.readTicketLedger();
  const ticket = assertTicketUsable(ledger.tickets.get(ticketId), {
    now,
    purpose: 'upload',
    principal_ref: principalRef,
    may_act_for_others: ctx.mayActForOthers(),
  });

  const file = assertUploadFileName(args.name, { allowed_extensions: door.policy.allowed_extensions });
  const declared = assertArgumentString(args.sha256, 'sha256', 64);
  if (!SHA256_HEX.test(declared)) {
    mcpFail(ENGINE_MCP_ERROR_CODES.ARGUMENTS_INVALID,
      'sha256 must be sixty-four lower-case hex characters', { field: 'sha256' });
  }
  if (typeof args.content_base64 !== 'string' || args.content_base64.length === 0
    || args.content_base64.length > MAX_BASE64_LENGTH) {
    mcpFail(ENGINE_MCP_ERROR_CODES.ARGUMENTS_INVALID,
      'content_base64 must be a base64 string within the door cap', { field: 'content_base64' });
  }
  const bytes = Buffer.from(args.content_base64, 'base64');
  if (bytes.length === 0) {
    mcpFail(ENGINE_MCP_ERROR_CODES.ARGUMENTS_INVALID, 'this decoded to nothing',
      { field: 'content_base64' });
  }
  if (bytes.length > door.policy.max_file_bytes) {
    mcpFail(ENGINE_MCP_ERROR_CODES.FILE_TOO_LARGE,
      'this file is bigger than the door carries; put it in the ticket folder and use a link',
      { field: 'content_base64', bytes: bytes.length, max_bytes: door.policy.max_file_bytes });
  }
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== declared) {
    mcpFail(ENGINE_MCP_ERROR_CODES.HASH_MISMATCH,
      'the bytes that arrived are not the bytes the caller hashed', { field: 'sha256' });
  }

  const folder = ctx.resolveProjectRef(ticket.folder_ref, 'ticket_id');
  const target = join(folder, file.name);
  await ctx.writeBytesCreateOnly(target, bytes, { field: 'ticket_file' });

  await ctx.appendFileReceipt({
    schema_version: 'soulforge.engine_mcp_file_operation.v0',
    logged_at: now,
    tool: name,
    operation: 'put',
    principal_ref: principalRef,
    role: ctx.view?.role ?? null,
    ticket_id: ticketId,
    folder_ref: ticket.folder_ref,
    files: [{ name: file.name, sha256: actual, bytes: bytes.length }],
  });

  const structured = {
    schema_version: 'soulforge.engine_mcp_file_put.v0',
    ticket_id: ticketId,
    file: ctx.pointer(target),
    file_name: file.name,
    bytes: bytes.length,
    sha256: actual,
    folder_ref: ticket.folder_ref,
    registered: false,
    next: '아직 등록은 아니다. file_register로 단계·산출물을 붙여야 정식 자리로 옮겨진다.',
  };

  const markdown = lines(
    `# 문 앞 칸에 넣음 — ${file.name}`,
    table(['표', '파일', '크기', '해시(앞 12)'], [[
      ticketId, file.name, bytes.length, actual.slice(0, 12),
    ]]),
    structured.next,
    FOOTER,
  );

  return { markdown, structured };
}
