import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { historyCli } from '../../src/history_cli.mjs';
import { hashText } from '../../src/knowledge_layer/data.mjs';

const root = () => {
  const dir = mkdtempSync(join(tmpdir(), 'history-handoff-synthetic-'));
  return [dir, () => rmSync(dir, { recursive: true, force: true })];
};
const fileAt = (dir, ref) => isAbsolute(ref) ? ref : join(dir, ref);
const input = () => ({ project: 'DEMO-1', month: '2026-09', as_of: '2026-09-23',
  records: [{ id: 'SRC-1', project: 'DEMO-1', date: '2026-09-23', kind: 'mail',
    title: '합성 요청', sender: 'Person A', recipient: 'Person B',
    attachments: [], thread_ref: 'synthetic-thread', text: '도면을 요청했다.',
    text_sha256: hashText('도면을 요청했다.'), originrefs: ['synthetic:source-1'] }] });
const cli = async argv => {
  let out = '', err = '';
  const code = await historyCli(argv, { stdout: { write: value => { out += value; } },
    stderr: { write: value => { err += value; } } });
  let parsedOut = out;
  if (out && !argv.includes('--help')) parsedOut = JSON.parse(out);
  return { code, out: parsedOut, err: err ? JSON.parse(err) : null };
};

test('file handoff prepares packets then finalizes one supplied draft without a network call', async t => {
  const [dir, cleanup] = root(); t.after(cleanup);
  const inputPath = join(dir, 'input.json'), draftPath = join(dir, 'draft.json');
  writeFileSync(inputPath, JSON.stringify(input()));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('network_must_not_be_called'); };
  try {
    const prepared = await cli(['--prepare', '--input', inputPath, '--output-root', dir]);
    assert.equal(prepared.code, 0, JSON.stringify(prepared.err));
    assert.equal(prepared.out.status, 'prepared');
    assert.equal(prepared.out.packets.length, 1);
    const manifestPath = fileAt(dir, prepared.out.manifest_path);
    const packet = JSON.parse(readFileSync(fileAt(dir, prepared.out.packets[0].path), 'utf8'));
    assert.ok(packet.allowed_evidence_ids.length > 0);
    writeFileSync(draftPath, JSON.stringify({
      schema: 'soulforge.history_external_draft.v1', prepare_id: prepared.out.prepare_id,
      drafts: [{ packet_id: packet.packet_id, sentences: [
        { text: '도면을 요청했다.', evidence_ids: [packet.allowed_evidence_ids[0]] }] }],
    }));
    const finalized = await cli(['--finalize', '--input', inputPath,
      '--prepared', manifestPath, '--draft', draftPath, '--output-root', dir]);
    assert.equal(finalized.code, 0, JSON.stringify(finalized.err));
    assert.equal(finalized.out.status, 'finalized');
    assert.ok(readdirSync(dir).includes('history-head.json'));
    const repeated = await cli(['--finalize', '--input', inputPath,
      '--prepared', manifestPath, '--draft', draftPath, '--output-root', dir]);
    assert.equal(repeated.code, 0, JSON.stringify(repeated.err));
    assert.equal(repeated.out.status, 'unchanged');
  } finally { globalThis.fetch = originalFetch; }
});

test('file handoff refuses a partial sibling draft before any head advances', async t => {
  const [dir, cleanup] = root(); t.after(cleanup);
  const value = input();
  value.records.push({ ...value.records[0], id: 'SRC-2', date: '2026-09-22',
    text: '회의를 열었다.', text_sha256: hashText('회의를 열었다.'),
    originrefs: ['synthetic:source-2'] });
  const inputPath = join(dir, 'input.json'), draftPath = join(dir, 'draft.json');
  writeFileSync(inputPath, JSON.stringify(value));
  const prepared = await cli(['--prepare', '--input', inputPath, '--output-root', dir]);
  assert.equal(prepared.code, 0, JSON.stringify(prepared.err));
  assert.equal(prepared.out.packets.length, 2);
  const drafts = prepared.out.packets.map(entry => {
    const packet = JSON.parse(readFileSync(fileAt(dir, entry.path), 'utf8'));
    return { packet_id: packet.packet_id, sentences: [
      { text: '합성 기록을 남겼다.', evidence_ids: [packet.allowed_evidence_ids[0]] }] };
  });
  const manifestPath = fileAt(dir, prepared.out.manifest_path);
  writeFileSync(draftPath, JSON.stringify({ schema: 'soulforge.history_external_draft.v1',
    prepare_id: prepared.out.prepare_id, drafts: drafts.slice(0, 1) }));
  const partial = await cli(['--finalize', '--input', inputPath, '--prepared', manifestPath,
    '--draft', draftPath, '--output-root', dir]);
  assert.equal(partial.code, 2);
  assert.equal(readdirSync(dir).includes('history-head.json'), false);
  writeFileSync(draftPath, JSON.stringify({ schema: 'soulforge.history_external_draft.v1',
    prepare_id: prepared.out.prepare_id, drafts }));
  const complete = await cli(['--finalize', '--input', inputPath, '--prepared', manifestPath,
    '--draft', draftPath, '--output-root', dir]);
  assert.equal(complete.code, 0, JSON.stringify(complete.err));
  assert.equal(complete.out.accepted_cells.length, 2);
});

test('file handoff CLI refuses old model modes and binding flags', async t => {
  const [dir, cleanup] = root(); t.after(cleanup);
  const inputPath = join(dir, 'input.json');
  writeFileSync(inputPath, JSON.stringify(input()));
  const help = await cli(['--help']);
  assert.equal(help.code, 0);
  assert.match(help.out, /--finalize/u);
  for (const args of [
    ['--run', '--input', inputPath, '--output-root', dir],
    ['--prepare', '--input', inputPath, '--output-root', dir, '--binding', inputPath],
    ['--finalize', '--input', inputPath, '--output-root', dir],
  ]) {
    const rejected = await cli(args);
    assert.equal(rejected.code, 2);
    assert.equal(rejected.err.status, 'hold');
  }
  assert.equal(readdirSync(dir).includes('history-head.json'), false);
});
