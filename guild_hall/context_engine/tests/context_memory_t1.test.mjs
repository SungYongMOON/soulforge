import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAcceptedContextReader } from '../src/runtime/accepted_context_reader.mjs';
import { makeBaseline } from '../harness/context_memory_baseline.mjs';
import { loadFixture, makeExecutorInput, FIXTURE, digest } from '../harness/context_memory_harness.mjs';

async function setup(id = 'Q09') {
  const input = makeExecutorInput(loadFixture().runtime, id);
  const bytes = readFileSync(new URL('t1-source.json', FIXTURE));
  assert.equal(digest(bytes), '459b7737145dd11afcc3f555a0df311c1d5b2f50774d07aec35444faa9e7fd30');
  const source = JSON.parse(bytes);
  input.sources = input.sources.map(row => row.id === source.id ? { ...row, ...source } : row);
  const f = makeBaseline(input);
  const result = await f.reader.query(f.queryRequest);
  const rows = result.hits.map(hit => ({ actor_ref: f.queryRequest.actor_ref, purpose: f.queryRequest.purpose,
    scope: f.queryRequest.scope, source_lane: hit.source_lane,
    project_ref: f.binding.project_ref, accepted_generation_ref: f.queryRequest.accepted_generation_ref,
    grant_revision_ref: f.acl.actors.get('actor-a').grant_revision_ref,
    ...Object.fromEntries(['source_revision_ref', 'source_span_ref', 'context_unit_ref', 'context_event_ref',
      'context_branch_ref', 'valid_at', 'known_at'].map(key => [key, hit[key]])),
    locator: input.sources.find(s => s.id === hit.source_span_ref).locator }));
  let reads = 0;
  f.providers.readSourceRevision = binding => {
    reads += 1;
    const source = input.sources.find(s => s.id === binding.source_span_ref);
    if (source.state === 'unavailable') throw new Error('unavailable');
    return { binding, body: source.body };
  };
  const build = (bindings = rows, enabled = true) => createAcceptedContextReader({ enabled: true,
    binding: f.binding, providers: f.providers, sourceReadback: { enabled, max_reads: 2, bindings } });
  return { ...f, input, rows, build, reads: () => reads };
}

test('T1 actual reader resolves exact revision and paragraph without returning body', async () => {
  const f = await setup();
  const result = await f.build().query(f.queryRequest);
  assert.equal(result.status, 'ok');
  assert.equal(result.source_readback.complete, true);
  assert.ok(result.source_readback.source_reads > 0);
  assert.ok(result.source_readback.sources.every(s => s.status === 'VERIFIED'));
  assert.equal(result.boundaries.raw_payload_copied, false);
  assert.deepEqual(await f.build().query(f.queryRequest), result);
  for (const source of f.input.sources) assert.ok(!JSON.stringify(result).includes(source.body));
  assert.equal((await f.build(f.rows, false).query(f.queryRequest)).source_readback, undefined);
});

for (const field of ['project_ref', 'source_revision_ref', 'context_unit_ref', 'context_branch_ref', 'scope', 'source_lane', 'valid_at', 'known_at']) {
  test('T1 refuses mismatched exact binding: ' + field, async () => {
    const f = await setup();
    const rows = structuredClone(f.rows);
    for (const row of rows) row[field] = typeof row[field] === 'object'
      ? { ...row[field], entity_id: 'different-same-label' } : 'different-same-label';
    const result = await f.build(rows).query(f.queryRequest);
    assert.equal(result.source_readback.complete, false);
    assert.equal(f.reads(), 0);
  });
}

test('T1 rejects floating revision and conflicting alias bindings before source IO', async () => {
  const f = await setup();
  const rows = structuredClone(f.rows);
  rows.forEach(row => delete row.source_revision_ref.revision_id);
  assert.equal((await f.build(rows).query(f.queryRequest)).source_readback.complete, false);
  assert.equal((await f.build([...f.rows, ...f.rows]).query(f.queryRequest)).source_readback.complete, false);
  assert.equal(f.reads(), 0);
});

for (const failure of ['deleted', 'wrong-bytes', 'wrong-locator', 'wrong-response-identity']) {
  test('T1 does not verify unreadable or mismatched source: ' + failure, async () => {
    const f = await setup();
    const read = f.providers.readSourceRevision;
    if (failure === 'wrong-locator') f.rows.forEach(row => row.locator = 'paragraph:999');
    f.providers.readSourceRevision = binding => {
      if (failure === 'deleted') throw new Error('deleted');
      const result = read(binding);
      if (failure === 'wrong-bytes') result.body += 'changed';
      if (failure === 'wrong-response-identity') result.binding = { ...binding, actor_ref: 'other' };
      return result;
    };
    const result = await f.build().query(f.queryRequest);
    assert.equal(result.source_readback.complete, false);
    assert.ok(result.source_readback.sources.every(s => s.status !== 'VERIFIED'));
  });
}

test('T1 actor, purpose, project denial occurs before body IO', async () => {
  const f = await setup();
  for (const delta of [{ actor_ref: 'other' }, { purpose: 'forbidden' },
    { project_ref: { ...f.queryRequest.project_ref, entity_id: 'P-B' } }]) {
    assert.equal((await f.build().query({ ...f.queryRequest, ...delta })).status, 'NOT_AVAILABLE');
  }
  assert.equal(f.reads(), 0);
});

test('T1 revocation during body read suppresses all evidence', async () => {
  const f = await setup();
  const read = f.providers.readSourceRevision;
  f.providers.readSourceRevision = binding => {
    const value = read(binding); f.acl.revoked_actors.add('actor-a'); return value;
  };
  const result = await f.build().query(f.queryRequest);
  assert.equal(result.status, 'NOT_AVAILABLE');
  assert.equal(result.source_readback, undefined);
});

test('T1 separate valid/known cutoffs filter current accepted membership', async () => {
  const f = await setup();
  const request = { ...f.queryRequest, valid_at: '2000-01-01T00:00:00.000Z', known_at: f.queryRequest.as_of };
  const result = await f.build().query(request);
  assert.equal(result.status, 'ok'); assert.equal(result.hits.length, 0); assert.equal(f.reads(), 0);
  assert.equal((await f.build().query({ ...request, known_at: '1999-01-01T00:00:00.000Z' })).status, 'NOT_AVAILABLE');
});

test('T1 late correction cannot cross either cutoff and cursor pins both cutoffs', async () => {
  const f = await setup('Q05');
  const early = { ...f.queryRequest, as_of: '2026-01-07T00:00:00.000Z',
    valid_at: '2026-01-04T00:00:00.000Z', known_at: '2026-01-07T00:00:00.000Z' };
  assert.ok(!(await f.reader.query(early)).hits.some(hit => hit.source_span_ref === 'S-CURRENT'));
  assert.ok(!(await f.reader.query({ ...early, as_of: f.queryRequest.as_of,
    known_at: f.queryRequest.as_of, valid_at: '2026-01-02T00:00:00.000Z' })).hits.some(hit => hit.source_span_ref === 'S-CURRENT'));
  const many = await setup('Q21');
  const request = { ...many.queryRequest, budget: { max_units: 1 },
    valid_at: many.queryRequest.as_of, known_at: many.queryRequest.as_of };
  const first = await many.reader.query(request);
  assert.ok(first.cursor);
  const second = await many.reader.query({ ...request, cursor: first.cursor });
  assert.equal(second.status, 'ok');
  assert.notEqual(second.hits[0].source_span_ref, first.hits[0].source_span_ref);
  assert.equal((await many.reader.query({ ...request, cursor: first.cursor,
    valid_at: '2026-01-09T00:00:00.000Z' })).status, 'NOT_AVAILABLE');
});

test('T1 source read budget is explicit and missing originals stay unverified', async () => {
  const f = await setup('Q21');
  const result = await f.build().query(f.queryRequest);
  assert.equal(f.reads(), 2);
  assert.ok(result.source_readback.sources.some(row => row.status === 'BUDGET_EXCEEDED'));
  assert.equal(result.source_readback.complete, false);
  const missing = await setup('Q10');
  const unavailable = await missing.build().query(missing.queryRequest);
  assert.equal(unavailable.source_readback.complete, false);
  assert.equal(unavailable.boundaries.source_body_loaded, false);
  assert.equal(unavailable.source_readback.sources[0].status, 'SOURCE_UNAVAILABLE');
});
