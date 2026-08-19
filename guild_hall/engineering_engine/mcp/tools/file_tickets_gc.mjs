// 정리 — finished tickets to the trash, and never anywhere else.
//
// A ticket folder is scaffolding: once the registration moved the bytes into the project, the empty
// folder and the pickup copy in the outbox are litter that still carries somebody's name. This
// sweeps them, and the whole design of the sweep is in three lines:
//
//   * **it moves, it does not delete.** `trash_dir`, folder name intact. The engine has no tool
//     that removes a file, and this is the tool people would expect to be the exception.
//   * **it reports first.** `dry_run` defaults to true, so the answer to "run the cleanup" is a
//     list, and running it for real is a second decision with the same numbers in front of you.
//   * **it only touches what the ledger says is finished.** Used or expired, plus the grace period
//     the profile states. A folder nobody registered from is not litter; it is somebody's upload
//     still in progress, and it stays until its ticket expires.

import { join } from 'node:path';

import {
  assertPrincipalRef, ticketFolderRoot, ticketStateAt, ticketsDueForCleanup,
} from '../tickets.mjs';
import { FOOTER, heading, lines, table } from '../render.mjs';

export const name = 'file_tickets_gc';
export const title_ko = '문 앞 칸 정리 (휴지통으로)';
export const description_ko = '끝난 표(사용됨·기한 지남)의 칸 폴더를 휴지통 폴더로 옮긴다. 지우지 않으며 기본은 보고만 한다.';
export const write = true;
export const data_class = 'confidential_contract';
// Running it twice is the same sweep: the second run finds the folders already gone and says so.
export const idempotent = true;
export const confidential_fields = Object.freeze(['trash_folder', 'items[].folder_ref']);

export const inputSchema = Object.freeze({
  type: 'object',
  properties: {
    dry_run: {
      type: 'boolean',
      description: '기본 true — 무엇을 옮길지 보고만 한다. false여야 실제로 옮긴다',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 500,
      description: '한 번에 옮길 표 수(기본 100)',
    },
  },
  required: [],
  additionalProperties: false,
});

export async function handler(args, ctx) {
  ctx.requireWrite(name);
  const principalRef = assertPrincipalRef(ctx.requirePrincipal(name));
  const door = ctx.fileDoor();
  const now = ctx.now();
  const dryRun = args.dry_run !== false;
  const limit = args.limit ?? 100;

  const ledger = await ctx.readTicketLedger();
  const due = ticketsDueForCleanup([...ledger.tickets.values()], { now, policy: door.policy })
    .slice(0, limit);

  const items = [];
  for (const row of due) {
    // The row says which root its pointer was written against, so a ticket folder on the share and
    // one in the project tree are swept the same way without the sweep having to guess. The trash
    // is always on the same root as the folder, because the profile puts all three there together.
    const record = ledger.tickets.get(row.ticket_id);
    const rootKind = ticketFolderRoot(record);
    const folder = ctx.resolveDoorRef(row.folder_ref, 'folder_ref', rootKind);
    const present = await ctx.pathExists(folder);
    const files = present ? (await ctx.listFilesIn(folder)).length : 0;
    const item = {
      ticket_id: row.ticket_id,
      purpose: row.purpose,
      state: row.state,
      folder_ref: row.folder_ref,
      folder_root: rootKind,
      folder_present: present,
      files,
      moved: false,
    };
    if (!dryRun && present) {
      // Under the trash folder, keyed by ticket id: two sweeps of the same ticket cannot collide,
      // and a person looking for what happened to a hand-over has one name to look for.
      const target = join(door.trash_dir, row.ticket_id);
      await ctx.moveDirectoryCreateOnly(folder, target, { field: 'trash_target' });
      item.moved = true;
      item.trash_ref = ctx.doorRef(target);
      await ctx.appendTicketRow({
        ...record,
        status: 'cleaned',
        logged_at: now,
        cleaned_at: now,
        cleaned_by: principalRef,
        trash_ref: item.trash_ref,
      });
    }
    items.push(item);
  }

  if (!dryRun && items.some((item) => item.moved)) {
    await ctx.appendFileReceipt({
      schema_version: 'soulforge.engine_mcp_file_operation.v0',
      logged_at: now,
      tool: name,
      operation: 'cleanup_to_trash',
      principal_ref: principalRef,
      role: ctx.view?.role ?? null,
      trash_ref: ctx.doorRef(door.trash_dir),
      trash_root: door.root_kind,
      tickets: items.filter((item) => item.moved).map((item) => item.ticket_id),
    });
  }

  const open = [...ledger.tickets.values()]
    .filter((record) => ticketStateAt(record, now) === 'open').length;

  const structured = {
    schema_version: 'soulforge.engine_mcp_file_tickets_gc.v0',
    dry_run: dryRun,
    cleanup_after_days: door.policy.cleanup_after_days,
    trash_folder: ctx.pointer(door.trash_dir),
    trash_root: door.root_kind,
    counts: {
      due: due.length,
      moved: items.filter((item) => item.moved).length,
      already_gone: items.filter((item) => !item.folder_present).length,
      still_open: open,
    },
    items,
    note: dryRun
      ? '보고만 했다. 실제로 옮기려면 dry_run:false로 다시 부른다.'
      : '휴지통 폴더로 옮겼다. 지운 것은 없다.',
  };

  const markdown = lines(
    `# 문 앞 칸 정리 — ${dryRun ? '보고만' : '옮김'}`,
    table(['대상', '옮김', '이미 없음', '아직 열린 표'], [[
      structured.counts.due, structured.counts.moved,
      structured.counts.already_gone, structured.counts.still_open,
    ]]),
    heading('표'),
    table(['표', '용도', '상태', '파일', '옮김'], items.map((item) => [
      item.ticket_id, item.purpose, item.state, item.files, item.moved,
    ])),
    structured.note,
    FOOTER,
  );

  return { markdown, structured };
}
