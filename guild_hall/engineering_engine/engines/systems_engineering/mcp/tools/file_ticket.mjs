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
// What this tool does not do: *make* a link. Turning the folder it names into something a person can
// open from a browser is the gateway's job and the engine makes no network call. What it does do,
// where the project profile names a `link_issuer` (§12.C), is **spawn** that gateway command as a
// child process and record what came back. The engine process still opens no socket and holds no
// credential; the child does, and it dies with its answer.
//
// **The link's class follows what the link reaches** (Owner 결정 2026-08-19). An upload link is ⓑ:
// it is a capability to one *empty* folder, discloses nothing about where that folder sits, and
// redacting it for the very roles allowed to open a ticket would leave them a ticket they cannot
// hand to the person waiting for it. A download link is the opposite — it reaches an actual file —
// so it takes that file's class: ⓒ when the artifact sits in a confidential folder, ⓑ otherwise.
//
// **The live URL never reaches `_workmeta`.** The ledger row records that a link of some kind exists
// and when it dies (`validateTicketLink` has no field for a URL at all); the URL goes to the answer
// and to one create-only marker file inside the ticket folder — the one place where being able to
// read it means you could already open the folder it points at.

import { randomUUID } from 'node:crypto';
import { basename, join } from 'node:path';

import { ACCESS_ERROR_CODES } from '../access_table.mjs';
import { ENGINE_MCP_ERROR_CODES, assertArgumentString, mcpFail } from '../engine_context.mjs';
import {
  MAX, TICKET_MARKER_FILE, TICKET_MARKER_SCHEMA_VERSION, TICKET_PURPOSES, assertPrincipalRef,
  mintTicketId, newTicketRecord, ticketExpiry,
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
  // ⓑ until the artifact says otherwise. A download link reaches a real file, so it inherits that
  // file's class; an upload link reaches an empty folder and stays ⓑ.
  let linkClass = 'team_judgment';
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
    if (ctx.isConfidentialPath(source)) {
      linkClass = 'confidential_contract';
      if (!ctx.canSeeClass('confidential_contract')) {
        mcpFail(ACCESS_ERROR_CODES.CLASS_EXCEEDED,
          'this file sits in a confidential folder and this role may not take it out',
          { field: 'artifact_ref', data_class: 'confidential_contract' });
      }
    }
    artifactRef = ctx.projectRef(source);
    await ctx.makeDirectoryCreateOnly(folder, { field: 'ticket_folder' });
    const target = join(folder, basename(source));
    const result = await ctx.copyCreateOnly(source, target, { field: 'outbox_copy' });
    copied = { name: basename(source), sha256: result.sha256, bytes: stats.bytes };
  } else {
    await ctx.makeDirectoryCreateOnly(folder, { field: 'ticket_folder' });
  }

  const expiresAt = ticketExpiry(createdAt, purpose, door.policy);
  // After the folder exists and before the ledger row: a link to a folder that is not there yet is
  // a link that fails in somebody's browser. A refusal here never fails the ticket — the folder is
  // already made and the ticket is the record of the hand-over, so the ticket is written either way
  // and `link_note` says why there is no link.
  const link = await ctx.issueTicketLink({
    issuer: door.link_issuer,
    ticket_id: ticketId,
    principal_ref: principalRef,
    purpose,
    expires_at: expiresAt,
  });

  // The URL goes to the folder it points at, and to the answer. Never to the ledger (§12.C).
  let markerRef = null;
  if (link.link_url !== null) {
    const marker = join(folder, TICKET_MARKER_FILE);
    await ctx.writeCreateOnly(marker, `${JSON.stringify({
      schema_version: TICKET_MARKER_SCHEMA_VERSION,
      ticket_id: ticketId,
      purpose,
      principal_ref: principalRef,
      expires_at: expiresAt,
      link_url: link.link_url,
      link_kind: link.link_kind,
      link_expires_at: link.link_expires_at,
      note: '이 칸의 표와 링크. 비밀번호·토큰·세션은 여기에도 없다. 기한이 지나면 링크는 닫힌다.',
    }, null, 2)}\n`, { field: 'ticket_marker' });
    markerRef = ctx.doorRef(marker);
  }
  const linkVisible = link.link_url !== null && ctx.canSeeClass(linkClass);

  const record = newTicketRecord({
    ticket_id: ticketId,
    purpose,
    principal_ref: principalRef,
    role: ctx.view?.role ?? null,
    created_at: createdAt,
    expires_at: expiresAt,
    folder_ref: ctx.doorRef(folder),
    folder_root: ctx.doorRootKind(),
    artifact_ref: artifactRef,
    note,
    files: copied === null ? [] : [copied],
    link: link.link_url === null ? null : {
      link_kind: link.link_kind,
      link_expires_at: link.link_expires_at,
      dsm_link_id: link.dsm_link_id,
    },
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
    folder_root: record.folder_root,
    artifact_ref: artifactRef,
    files: record.files,
    // Same rule as the ledger row: that a link of this kind exists, and when it dies. The URL is
    // not on the metadata plane at all.
    link_kind: link.link_kind,
    link_expires_at: link.link_expires_at,
    link_note: link.link_note,
  });

  const structured = {
    schema_version: record.schema_version,
    ticket_id: ticketId,
    purpose,
    expires_at: record.expires_at,
    folder: ctx.pointer(folder),
    folder_ref: record.folder_ref,
    folder_root: record.folder_root,
    artifact_ref: artifactRef,
    copied_file: copied === null ? null : copied.name,
    allowed_extensions: door.policy.allowed_extensions.length,
    max_file_bytes: door.policy.max_file_bytes,
    // The class rule is applied here rather than by the static field list, because it depends on
    // what this particular ticket reaches. A caller who cannot see that class is told the field was
    // withheld and why — the same shape the server's own redaction uses.
    link_url: linkVisible ? link.link_url : null,
    link_kind: link.link_kind,
    link_expires_at: link.link_expires_at,
    link_data_class: link.link_url === null ? null : linkClass,
    link_withheld: link.link_url !== null && !linkVisible,
    link_note: link.link_note,
    ticket_marker_ref: markerRef,
    next: nextLine(purpose, link),
  };

  const markdown = lines(
    `# 문 앞 칸 — ${purpose === 'upload' ? '올리기' : '내려받기'} 표 ${ticketId}`,
    table(['표', '쓰는 사람', '기한'], [[ticketId, principalRef, record.expires_at]]),
    heading('자리'),
    structured.folder ?? '(가려짐)',
    heading('링크'),
    structured.link_url
      ?? (link.link_url === null ? `(없음 — ${link.link_note})` : '(가려짐 — 이 역할에는 이 링크가 안 보인다)'),
    structured.next,
    FOOTER,
  );

  return { markdown, structured };
}

/**
 * What the person holding this ticket does next — which differs entirely depending on whether a
 * link came back, so the answer says the one thing that applies rather than listing both.
 */
function nextLine(purpose, link) {
  if (purpose === 'download') {
    return link.link_url === null
      ? '이 폴더에서 가져간다. 기한이 지나면 정리 도구가 휴지통으로 옮긴다(지우지 않는다).'
      : '이 링크로 받는다. 기한이 지나면 링크가 닫히고 칸은 정리 때 휴지통으로 간다(지우지 않는다).';
  }
  if (link.link_url === null) {
    return '이 폴더에 파일을 넣고 file_register로 등록한다. 링크는 이 폴더에 대해 공유 UI에서 만든다(엔진 밖).';
  }
  return '이 링크를 올릴 사람에게 전달한다. 올라오면 file_register로 등록한다(링크는 기한이 지나면 닫힌다).';
}
