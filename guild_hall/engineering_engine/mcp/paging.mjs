// One page of a long list, and the cursor that asks for the next one (9.1E 벤치마크 ⑪).
//
// A thousand-project registry, a stage with two hundred rows, a run with a hundred issues — none
// of these fit one MCP result comfortably, and the failure mode of not paging is silent
// truncation somewhere downstream. So the list-shaped answers carry `limit`/`cursor` and say what
// they left out: `total` and `next_cursor` are part of the answer, never inferred from the length.
//
// The cursor is an offset written as text. It is opaque to the caller by contract — the shape may
// change — and it is validated as a small integer here so it cannot be used to index anywhere
// unexpected.

import { ENGINE_MCP_ERROR_CODES, mcpFail } from './engine_context.mjs';

export const DEFAULT_PAGE_LIMIT = 100;
export const MAX_PAGE_LIMIT = 1000;

/**
 * @param rows the full list
 * @param args the tool arguments (`limit`, `cursor`)
 * @param options `{ default_limit, field }`
 * @returns `{ items, page: { offset, limit, total, returned, next_cursor } }`
 */
export function paginate(rows, args = {}, options = {}) {
  const field = options.field ?? 'items';
  const limit = args.limit === undefined ? (options.default_limit ?? DEFAULT_PAGE_LIMIT)
    : args.limit;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PAGE_LIMIT) {
    mcpFail(ENGINE_MCP_ERROR_CODES.ARGUMENTS_INVALID,
      'limit must be an integer between 1 and 1000', { field: 'limit' });
  }
  const offset = args.cursor === undefined ? 0 : parseCursor(args.cursor);
  if (offset > rows.length) {
    mcpFail(ENGINE_MCP_ERROR_CODES.ARGUMENTS_INVALID,
      'this cursor lies past the end of the list', { field: 'cursor', total: rows.length });
  }
  const items = rows.slice(offset, offset + limit);
  const nextOffset = offset + items.length;
  return {
    items,
    page: {
      field,
      offset,
      limit,
      total: rows.length,
      returned: items.length,
      next_cursor: nextOffset < rows.length ? String(nextOffset) : null,
    },
  };
}

function parseCursor(cursor) {
  if (typeof cursor !== 'string' || !/^[0-9]{1,9}$/u.test(cursor)) {
    mcpFail(ENGINE_MCP_ERROR_CODES.ARGUMENTS_INVALID,
      'a cursor is the opaque string a previous page returned', { field: 'cursor' });
  }
  return Number.parseInt(cursor, 10);
}

/** The two properties a paged tool declares, so the three of them cannot drift apart. */
export const pagingProperties = (defaultLimit = DEFAULT_PAGE_LIMIT) => Object.freeze({
  limit: {
    type: 'integer',
    minimum: 1,
    maximum: MAX_PAGE_LIMIT,
    description: `한 번에 받을 줄 수(기본 ${defaultLimit})`,
  },
  cursor: {
    type: 'string',
    description: '앞 페이지가 돌려준 커서(생략하면 처음부터)',
  },
});
