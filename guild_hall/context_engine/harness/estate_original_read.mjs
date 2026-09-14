// Dev harness and CLI: read one item of one project's selected generation back
// to its original -- the whole of every unit, and the attachments the original
// carries -- and, when asked, the text inside one of those attachments.
//
// It is the second half of the pair the search CLI starts. Search says an item
// exists and quotes one line of it; this says what the item actually holds. The
// same rules apply: read-only apart from the derived cache and the call ledger,
// no Cypher, no index name, no database address, no path from the caller. A
// caller may name the project, the item, a unit, an attachment, a character
// bound and a page -- nothing that could be a place on this host.
//
// Every call is charged to the investigation it belongs to before the work
// starts, so a failure or a retry costs what it cost. A session that has spent
// its six calls is refused with a summary of what it already asked, which is
// what a bot needs to answer with the evidence it has instead of asking again.
//
// usage:
//   node estate_original_read.mjs --root-table <file> --tools-config <file>
//        --project <code> --item <item id>
//        [--unit <unit id>] [--max-chars 6000] [--attachments]
//        [--attachment <index|file_id|sha256 앞 12자>] [--slide <n>|--page <n>] [--render]
//        [--json] [--dev-run <label>] [--generation <id>] [--binding <file>]
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readRootTable } from '../../path_registry/src/root_table.mjs';
import { createAliasedStoreIo } from '../src/adapters/aliased_store_io.mjs';
import { readToolsConfig } from '../src/runtime/attachment_derivation.mjs';
import { chargeInvestigation, BUDGET_EXHAUSTED_CODE } from '../src/runtime/investigation_budget.mjs';
import { readOriginal, DEFAULT_MAX_CHARACTERS } from '../src/runtime/original_read.mjs';

const sha256 = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
/** Said on every rendered image: the model that reads this output cannot see one. */
export const IMAGE_NOTICE = '이 봇은 이미지를 읽지 못합니다 — 그림은 사람이 열어 보거나 그림 읽기 도구가 연결되어야 합니다.';

export function options(argv) {
  const flags = new Map();
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const next = argv[index + 1];
    flags.set(token.slice(2), next === undefined || next.startsWith('--') ? true : (index++, next));
  }
  return flags;
}

const line = (text, width = 200) => {
  const first = String(text ?? '').split('\n').map(row => row.trim()).find(row => row.length > 0) ?? '';
  return [...first].length > width ? `${[...first].slice(0, width).join('')}…` : first;
};

function renderAttachmentEntries(answer, lines) {
  const list = answer.attachments;
  lines.push(`\nattachments ${list.status}${list.detail ? ` (${list.detail})` : ''}${list.entries.length ? ` ${list.entries.length}개` : ''}`);
  for (const entry of list.entries) {
    lines.push(`  #${entry.index} ${entry.kind} ${entry.name ?? entry.file_id ?? '-'} ${entry.mime ?? '-'} `
      + `${entry.size_bytes ?? '-'} bytes ${entry.sha256 ? entry.sha256.replace('sha256:', '').slice(0, 12) : '-'} `
      + `${entry.status}${entry.format ? ` ${entry.format}` : ''}${entry.detail ? ` (${entry.detail})` : ''}`);
  }
}

function renderExtract(extract, lines, { slide = null }) {
  if (!extract || extract.status !== 'ok') {
    lines.push(`  extract ${extract?.code ?? 'unavailable'}`);
    return;
  }
  if (Array.isArray(extract.slides)) {
    const size = extract.slide_size?.inches ?? {};
    lines.push(`  slides ${extract.counts.slides} shapes ${extract.counts.shapes} slide ${size.width ?? '-'}x${size.height ?? '-'} inch`);
    for (const page of extract.slides) {
      if (slide !== null && page.slide !== slide) continue;
      lines.push(`  [slide ${page.slide}] shapes ${page.shapes.length}`);
      for (const shape of page.shapes) {
        const box = shape.box.percent_of_slide;
        lines.push(`    shape ${shape.shape_id} "${shape.name}" ${shape.shape_type ?? '-'}`
          + ` box left ${box.left ?? '-'}% top ${box.top ?? '-'}% width ${box.width ?? '-'}% height ${box.height ?? '-'}%`);
        for (const run of shape.runs) lines.push(`      run: ${line(run)}`);
        if (Array.isArray(shape.table)) for (const row of shape.table) lines.push(`      cell: ${row.map(cell => line(cell, 60)).join(' | ')}`);
      }
    }
    return;
  }
  if (Array.isArray(extract.pages)) {
    lines.push(`  pages ${extract.counts.pages_read} of ${extract.counts.pages_in_file}`);
    for (const page of extract.pages) {
      if (slide !== null && page.page !== slide) continue;
      lines.push(`  [page ${page.page}]`);
      for (const row of String(page.text ?? '').split('\n')) if (row.trim()) lines.push(`    ${row.trim()}`);
    }
    return;
  }
  if (Array.isArray(extract.sheets)) {
    for (const sheet of extract.sheets) {
      lines.push(`  [sheet ${sheet.sheet}] ${sheet.bounds.rows}행 ${sheet.bounds.columns}열${sheet.truncated ? ' (잘림)' : ''}`);
      for (const cell of sheet.cells) lines.push(`    ${cell.ref}: ${line(cell.value, 120)}`);
    }
    return;
  }
  if (typeof extract.text === 'string') {
    lines.push(`  characters ${extract.characters}${extract.truncated ? ' (잘림)' : ''}`);
    for (const row of extract.text.split('\n')) lines.push(`    ${row}`);
  }
}

export function render(answer, { budget, toolsSha256, slide = null }) {
  const lines = [`project ${answer.project_code} generation ${answer.generation.generation_id} `
    + `(${answer.generation.selected ? 'selected' : 'named, not selected'}) documents ${answer.generation.documents} `
    + `tools ${toolsSha256.replace('sha256:', '').slice(0, 12)} `
    + `budget ${budget.call}/${budget.call + budget.remaining} (${budget.bucket})`,
  `status ${answer.status}`];
  if (answer.status === 'not_in_scope') {
    lines.push(`\nitem ${answer.item.item_id} 은(는) 이 세대의 목록에 없습니다. 검색으로 항목 id를 다시 확인하세요.`);
    return lines.join('\n');
  }
  const item = answer.item;
  lines.push(`\nitem ${item.source_kind} ${item.item_id} root=${item.root_ref} class=${item.data_class}`,
    `  title ${line(item.title)}`,
    `  at ${item.occurred_at ?? '-'} revision ${item.primary_revision_sha256.replace('sha256:', '').slice(0, 12)}`,
    `  doc_key ${item.doc_key.replace('sha256:', '').slice(0, 12)} manifest ${item.manifest_doc_key.replace('sha256:', '').slice(0, 12)}`
    + ` ${item.doc_key_matches ? '(일치)' : '(불일치 — 원본이 바뀌었습니다)'}`,
    `  units ${item.units_total} characters ${item.characters_total} (${item.units_from}${item.reread_code ? `: ${item.reread_code}` : ''})`);
  if (!answer.requested_unit_found) lines.push('\n요청한 단위 id가 이 항목에 없습니다.');
  for (const unit of answer.units) {
    lines.push(`\n[${unit.unit_id}] ${unit.unit_kind} ${unit.occurred_at ?? '-'} ${unit.characters}자`);
    lines.push(unit.text);
    if (unit.truncated) {
      lines.push(`[잘림: ${unit.characters}자 중 ${unit.shown}자 — --unit ${unit.unit_id} --max-chars <더 큰 값>]`);
    }
  }
  if (answer.attachments.detail !== 'not requested') renderAttachmentEntries(answer, lines);
  const attachment = answer.attachment;
  if (attachment) {
    lines.push(`\nattachment ${attachment.selector} ${attachment.name ?? attachment.file_id ?? '-'} `
      + `${attachment.format ?? '-'} ${attachment.status}${attachment.detail ? ` (${attachment.detail})` : ''}`);
    renderExtract(attachment.extract, lines, { slide });
    if (attachment.cache) lines.push(`  extract locator ${attachment.cache.extract}`);
    if (attachment.pages?.length) {
      lines.push(`  render pages ${attachment.pages.length}`);
      for (const page of attachment.cache.pages) {
        lines.push(`    page ${page.page} -> ${page.locator} (${page.width}x${page.height})`);
      }
      lines.push(`  ${IMAGE_NOTICE}`);
    }
  }
  return lines.join('\n');
}

async function main() {
  const flags = options(process.argv.slice(2));
  const tablePath = String(flags.get('root-table') ?? process.env.SOULFORGE_CONTEXT_ROOT_TABLE ?? '');
  const toolsPath = String(flags.get('tools-config') ?? process.env.SOULFORGE_CONTEXT_TOOLS_CONFIG ?? '');
  if (!tablePath) { process.stderr.write('[estate-original-read] original_read_root_table_required\n'); return 2; }
  if (!toolsPath) { process.stderr.write('[estate-original-read] original_read_tools_config_required\n'); return 2; }
  const toolsBytes = readFileSync(toolsPath);
  const toolsSha256 = sha256(toolsBytes);
  const tools = readToolsConfig(toolsBytes);
  const expected = flags.get('root-table-sha256');
  const io = createAliasedStoreIo(readRootTable({ tablePath,
    expectedSha256: typeof expected === 'string' ? expected : sha256(readFileSync(tablePath)) }));
  const project = String(flags.get('project') ?? '');
  const itemId = String(flags.get('item') ?? '');
  const slide = flags.get('slide') ?? flags.get('page');
  const attachmentSelector = flags.get('attachment') === undefined || flags.get('attachment') === true
    ? null : String(flags.get('attachment'));
  const args = { project, item: itemId, unit: flags.get('unit') === undefined ? null : String(flags.get('unit')),
    attachments: flags.get('attachments') === true, attachment: attachmentSelector, render: flags.get('render') === true,
    tools_config_sha256: toolsSha256.slice(0, 19), root_table_sha256: io.table_sha256.slice(0, 19) };
  let budget;
  try {
    budget = chargeInvestigation({ receiptsRoot: tools.receipts_root, cli: 'read', args,
      devRun: flags.get('dev-run') === undefined || flags.get('dev-run') === true ? null : String(flags.get('dev-run')) });
  } catch (error) {
    if (error?.code === BUDGET_EXHAUSTED_CODE) {
      process.stdout.write(`${['status investigation_budget_exhausted',
        `이 조사에서 이미 ${error.calls}번 호출했습니다. 확보한 근거로 답하고, 남은 일을 말해 주세요.`,
        ...error.summary].join('\n')}\n`);
      return 2;
    }
    throw error;
  }
  try {
    const answer = await readOriginal({ io, project, itemId, tools,
      unitId: flags.get('unit') === undefined || flags.get('unit') === true ? null : String(flags.get('unit')),
      maxChars: Number.parseInt(String(flags.get('max-chars') ?? DEFAULT_MAX_CHARACTERS), 10),
      wantAttachments: flags.get('attachments') === true,
      attachmentSelector, render: flags.get('render') === true,
      generationId: flags.get('generation') === undefined ? null : String(flags.get('generation')),
      bindingFile: String(flags.get('binding') ?? 'graph_index_binding.unified.json') });
    budget.finish(answer.attachment?.status ?? answer.status, answer.internal);
    process.stdout.write(flags.get('json') === true
      ? `${JSON.stringify({ ...answer, tools_config: { sha256: toolsSha256 }, budget: { bucket: budget.bucket, call: budget.call, remaining: budget.remaining } })}\n`
      : `${render(answer, { budget, toolsSha256, slide: slide === undefined || slide === true ? null : Number.parseInt(String(slide), 10) })}\n`);
    return 0;
  } catch (error) {
    budget.finish(String(error?.code ?? 'original_read_failed'));
    throw error;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().then(code => { process.exitCode = code; }, error => {
    process.stderr.write(`[estate-original-read] ${error?.code ?? 'original_read_failed'}\n`);
    process.exitCode = 2;
  });
}
