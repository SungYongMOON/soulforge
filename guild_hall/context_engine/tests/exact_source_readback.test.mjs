import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createExactSourceReadback, readSourceBytesBounded } from '../src/adapters/exact_source_readback.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'exact-context-reader-')), path = join(root, 'source.txt');
  const body = 'Synthetic source assertion; not an accepted generation.'; writeFileSync(path, body);
  const binding = { actor_ref: 'actor:synthetic', purpose: 'work', source_revision_ref: { content_id: 'sha256:' + createHash('sha256').update(body).digest('hex') } };
  return { root, path, body, binding, entry: { binding, source_root: root, path, data_class: 'synthetic_test' } };
}
test('explicit admitted read returns exact source bytes without mutating original', async () => {
  const f = fixture();
  const reader = createExactSourceReadback({ entries: [f.entry], authorize: () => true, authoritySnapshot: () => ({ revision: '1' }) });
  assert.equal((await reader.readSourceRevision(f.binding)).body, f.body);
  assert.equal(readFileSync(f.path, 'utf8'), f.body);
  assert.equal(reader.metrics().source_body_loads, 1);
});
test('denied/unknown binding does not read; revision and authority changes refuse disclosure', async () => {
  const f = fixture(); let revision = '1';
  const denied = createExactSourceReadback({ entries: [f.entry], authorize: () => false, authoritySnapshot: () => ({ revision }) });
  await assert.rejects(() => denied.readSourceRevision(f.binding), /source_unavailable/); assert.equal(denied.metrics().source_body_loads, 0);
  const drift = createExactSourceReadback({ entries: [f.entry], authorize: () => { revision = '2'; return true; }, authoritySnapshot: () => ({ revision }) });
  await assert.rejects(() => drift.readSourceRevision(f.binding), /source_unavailable/);
  writeFileSync(f.path, 'changed');
  const reader = createExactSourceReadback({ entries: [f.entry], authorize: () => true, authoritySnapshot: () => ({ revision }) });
  await assert.rejects(() => reader.readSourceRevision(f.binding), /source_unavailable/);
});
test('a source that keeps growing is read only through maxBytes plus one sentinel', async () => {
  let readBytes = 0;
  const continuouslyGrowing = { async read(buffer, offset, length) {
    const bytesRead = Math.min(length, 7); buffer.fill(65, offset, offset + bytesRead); readBytes += bytesRead; return { bytesRead };
  } };
  const bytes = await readSourceBytesBounded(continuouslyGrowing, 32);
  assert.equal(bytes.length, 33); assert.equal(readBytes, 33);
});
