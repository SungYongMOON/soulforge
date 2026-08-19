// "내 표 뭐 있더라?" — the ticket ledger, folded and filtered to what this caller may see.
//
// Read-only and metadata-only: an id, a purpose, an expiry, a state, and how many files sit in the
// folder. It is what stops the ticket from being a thing people write down: the door remembers.
//
// A team role sees their own tickets and nobody else's — not because another person's ticket is a
// secret but because a ticket is an address, and an address list is how a folder that was meant for
// one hand-over becomes a shared drive. Owner and PM see every row, which is what makes the sweep
// (`file_tickets_gc`) something they can check before they run it.

import { pagingProperties, paginate } from '../paging.mjs';
import { assertPrincipalRef, ticketFolderRoot, ticketStateAt } from '../tickets.mjs';
import { FOOTER, heading, lines, table } from '../render.mjs';

export const name = 'file_tickets_list';
export const title_ko = '문 앞 칸 표 목록';
export const description_ko = '이 과제에서 낸 표(ticket)와 상태를 본다. Owner·PM은 전부, 나머지는 자기 것만.';
export const write = false;
export const data_class = 'team_judgment';
export const idempotent = true;
export const confidential_fields = Object.freeze(['rows[].folder_ref', 'rows[].artifact_ref']);

export const inputSchema = Object.freeze({
  type: 'object',
  properties: {
    state: {
      type: 'string',
      enum: ['open', 'used', 'expired', 'cleaned', 'all'],
      description: '상태로 거르기(생략하면 전부)',
    },
    ...pagingProperties(),
  },
  required: [],
  additionalProperties: false,
});

export async function handler(args, ctx) {
  const principalRef = assertPrincipalRef(ctx.requirePrincipal(name));
  ctx.fileDoor();
  const now = ctx.now();
  const everyone = ctx.mayActForOthers();
  const wanted = args.state === undefined || args.state === 'all' ? null : args.state;

  const ledger = await ctx.readTicketLedger();
  const rows = [];
  for (const record of ledger.tickets.values()) {
    if (!everyone && record.principal_ref !== principalRef) continue;
    const state = ticketStateAt(record, now);
    if (wanted !== null && state !== wanted) continue;
    rows.push({
      ticket_id: record.ticket_id,
      purpose: record.purpose,
      principal_ref: record.principal_ref,
      state,
      created_at: record.created_at,
      expires_at: record.expires_at,
      files: Array.isArray(record.files) ? record.files.length : 0,
      folder_ref: record.folder_ref,
      // Which root that pointer is measured from — a listing whose pointers cannot be resolved is
      // a listing of strings. An old row has no field and means the project (12장 §12.B).
      folder_root: ticketFolderRoot(record),
      artifact_ref: record.artifact_ref ?? null,
      // That a link exists and when it dies, never the link. The ledger has no URL to give.
      link_kind: record.link?.link_kind ?? null,
      link_expires_at: record.link?.link_expires_at ?? null,
      note: record.note ?? null,
    });
  }
  rows.sort((left, right) => (left.created_at === right.created_at
    ? (left.ticket_id < right.ticket_id ? -1 : 1)
    : (left.created_at > right.created_at ? -1 : 1)));

  const page = paginate(rows, args, { field: 'rows' });
  const counts = { open: 0, used: 0, expired: 0, cleaned: 0 };
  for (const row of rows) counts[row.state] += 1;

  const structured = {
    schema_version: 'soulforge.engine_mcp_file_tickets_list.v0',
    scope: everyone ? 'project' : 'mine',
    counts: { ...counts, total: rows.length, ledger_lines_skipped: ledger.skipped },
    rows: page.items,
    page: page.page,
  };

  const markdown = lines(
    `# 문 앞 칸 표 — ${everyone ? '과제 전체' : '내 것'} ${rows.length}장`,
    table(['열림', '사용됨', '기한 지남', '치워짐'], [[
      counts.open, counts.used, counts.expired, counts.cleaned,
    ]]),
    heading('표'),
    table(['표', '용도', '사람', '상태', '기한', '파일'], page.items.map((row) => [
      row.ticket_id, row.purpose, row.principal_ref, row.state, row.expires_at, row.files,
    ])),
    FOOTER,
  );

  return { markdown, structured };
}
