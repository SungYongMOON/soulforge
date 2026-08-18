// Markdown for a person, rendered from the same object the tool returns as `structuredContent`.
//
// The MCP result carries both: a reader sees the table, an agent reads the JSON, and neither is a
// second source of truth because both come from one value the handler already built.

const CELL_ESCAPE = /\|/gu;

export const cell = (value) => {
  if (value === null || value === undefined) return '—';
  if (Array.isArray(value)) return value.length === 0 ? '—' : value.join(', ').replace(CELL_ESCAPE, '/');
  if (typeof value === 'boolean') return value ? '예' : '아니오';
  return String(value).replace(CELL_ESCAPE, '/');
};

export function table(headers, rows) {
  if (rows.length === 0) return '(없음)';
  const head = `| ${headers.join(' | ')} |`;
  const rule = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${row.map(cell).join(' | ')} |`);
  return [head, rule, ...body].join('\n');
}

export const heading = (text) => `## ${text}`;

export const lines = (...parts) => parts.filter((part) => part !== null && part !== '').join('\n\n');

/** Every answer ends the same way: the door is a door, the receipt is the record. */
export const FOOTER = '이 답은 MCP 문이 전한 것이고, 판단의 정본은 엔진 영수증이다.';
