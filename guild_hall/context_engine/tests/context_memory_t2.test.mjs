import test from 'node:test';
import assert from 'node:assert/strict';
import { makeUniformNotAvailable } from '../src/guards/accepted_context_query.mjs';
import { sourceMetadata } from '../harness/fixtures/accepted_context_read_fixture.mjs';
import { ref } from '../harness/fixtures/accepted_context_fixture.mjs';
import { createT2Fixture, readT2Pages } from '../harness/fixtures/context_memory_t2_fixture.mjs';
import { sha256Canonical } from '../../shared/project_history_envelope.mjs';

const unavailable = makeUniformNotAvailable();
const spans = pages => pages.flatMap(page => page.hits.map(hit => hit.source_span_ref));
const query = (x, f = x.g1, delta = {}) => x.readerFor(f).query({ ...x.request, accepted_generation_ref: f.currentRef, ...delta });
function accept(x, f) {
  const result = x.store.acceptCandidate(f.submission);
  assert.equal(result.status, 'ACCEPTED', JSON.stringify(result.blocker_codes));
  return result;
}

test('T2 actual build/review/accept -> G1 readback -> pending correction -> separately accepted G2', async () => {
  const x = createT2Fixture();
  assert.equal(sha256Canonical({ g1: x.g1.request, g2: x.g2.request,
    reviews: [x.g1.submission.registered_human_review, x.g2.submission.registered_human_review], bodies: [...x.bodies] }),
  'sha256:77d6e3f2df3b8ac24ae5750d09ef115b7afe7e47eb5cfe716845905b182ed69f');
  assert.equal(x.g1.builtCandidate.status, 'ready_for_registered_human_review');
  assert.equal(x.store.listGenerations().length, 0);
  assert.deepEqual(await query(x), unavailable);
  const g1 = accept(x, x.g1);
  const before = x.store.getCurrentPointer();
  const pages1 = await readT2Pages(x, x.g1);
  assert.ok(spans(pages1).includes('timeline-span:1'));
  assert.equal(spans(pages1).length, 7);
  assert.ok(x.g2.builtCandidate.project_context.memberships.some(m =>
    m.source_span_ref === 'timeline-span:corrected' && m.reviewer_state === 'pending_registered_human_review'));
  x.state.source = sourceMetadata(x.g2);
  assert.deepEqual(await query(x), unavailable);
  assert.deepEqual(await query(x, x.g2), unavailable);
  assert.deepEqual(x.store.getCurrentPointer(), before);
  for (const change of [s => { delete s.registered_human_review; },
    s => { s.registered_human_review.verdict = 'rejected'; },
    s => { s.registered_human_review = structuredClone(x.g1.submission.registered_human_review); },
    s => { s.registered_human_review.reviewed_membership_refs.pop(); }]) {
    const submission = structuredClone(x.g2.submission); change(submission);
    assert.notEqual(x.store.acceptCandidate(submission).status, 'ACCEPTED');
    assert.deepEqual(x.store.getCurrentPointer(), before);
    assert.equal(x.store.listGenerations().length, 1);
  }
  const g2 = accept(x, x.g2);
  assert.notDeepEqual(g2.manifest.reviewer_receipt.decision_ref, g1.manifest.reviewer_receipt.decision_ref);
  assert.notEqual(g2.manifest.reviewer_receipt.reviewed_candidate_digest, g1.manifest.reviewer_receipt.reviewed_candidate_digest);
  const pages2 = await readT2Pages(x, x.g2);
  assert.ok(spans(pages2).includes('timeline-span:corrected'));
  assert.ok(!spans(pages2).includes('timeline-span:1'));
  assert.deepEqual(await query(x), unavailable);
  assert.deepEqual(await query(x, x.g2, { cursor: pages1[0].cursor }), unavailable);
  assert.deepEqual(x.store.getGeneration(x.g1.currentRef), g1.manifest);
  assert.deepEqual(x.store.getReceipt(x.g1.currentRef), g1.receipt);
  assert.equal(g2.manifest.project_context.memberships.find(m => m.source_span_ref === 'timeline-span:1').acceptance_state, 'excluded_historical');
  assert.deepEqual(g2.manifest.prior_generation_ref, x.g1.currentRef);
  for (const body of x.bodies.values()) assert.ok(!JSON.stringify([...pages1, ...pages2]).includes(body));
});

test('T2 same inputs rebuild and replay both generations deterministically without pointer rollback', async () => {
  async function run() {
    const x = createT2Fixture();
    const g1 = accept(x, x.g1); const pages1 = await readT2Pages(x, x.g1);
    x.state.source = sourceMetadata(x.g2);
    const g2 = accept(x, x.g2); const pages2 = await readT2Pages(x, x.g2);
    const pointer = x.store.getCurrentPointer();
    for (const [f, original] of [[x.g1, g1], [x.g2, g2]]) {
      const replay = accept(x, f);
      assert.equal(replay.idempotent_replay, true);
      assert.deepEqual(replay.manifest, original.manifest);
      assert.deepEqual(replay.receipt, original.receipt);
      assert.equal(replay.execution_evidence.in_memory_pointer_advanced, false);
      assert.deepEqual(x.store.getCurrentPointer(), pointer);
    }
    assert.deepEqual(await readT2Pages(x, x.g2), pages2);
    assert.equal(x.store.listGenerations().length, 2);
    return { candidates: [x.g1.builtCandidate, x.g2.builtCandidate], g1, g2, pages1, pages2 };
  }
  assert.deepEqual(await run(), await run());
});

test('T2 competing same-prior submissions: one CAS winner, loser changes no stored generation', () => {
  const x = createT2Fixture(); accept(x, x.g1);
  const competing = structuredClone(x.g2.submission);
  competing.registered_human_review.decision_ref = ref(82);
  accept(x, x.g2);
  const before = x.store.getCurrentPointer();
  const loser = x.store.acceptCandidate(competing);
  assert.equal(loser.status, 'HOLD');
  assert.ok(loser.blocker_codes.some(code => /CAS|PRIOR|WRITER/u.test(code)));
  assert.deepEqual(x.store.getCurrentPointer(), before);
  assert.equal(x.store.listGenerations().length, 2);
});

for (const failure of ['deleted-source', 'source-bytes-drift', 'source-revision-drift',
  'revoked-before-read', 'revoked-during-read', 'correction-during-read',
  'pointer-during-read', 'bundle-throw', 'mixed-manifest-receipt']) {
  test('T2 actual accepted source read failure: ' + failure, async () => {
    const x = createT2Fixture(); accept(x, x.g1);
    if (failure === 'deleted-source') x.bodies.clear();
    if (failure === 'source-bytes-drift') for (const key of x.bodies.keys()) x.bodies.set(key, 'changed synthetic bytes');
    if (failure === 'source-revision-drift') x.state.source.source_revision_refs[0].source_revision_ref = ref(999);
    if (failure === 'revoked-before-read') x.state.acl.revoked_actors.add(x.request.actor_ref);
    const read = x.providers.readSourceRevision;
    x.providers.readSourceRevision = async row => {
      const result = read(row);
      if (failure === 'revoked-during-read') x.state.acl.revoked_actors.add(x.request.actor_ref);
      if (failure === 'correction-during-read') x.state.source = sourceMetadata(x.g2);
      if (failure === 'pointer-during-read' && x.store.listGenerations().length === 1) {
        accept(x, x.g2); x.state.source = sourceMetadata(x.g2);
      }
      return result;
    };
    if (failure === 'bundle-throw') x.providers.readAcceptedGeneration = async () => { throw new Error('synthetic read failure'); };
    if (failure === 'mixed-manifest-receipt') {
      accept(x, x.g2); x.state.source = sourceMetadata(x.g2);
      x.providers.readAcceptedGeneration = async () => ({ manifest: x.store.getGeneration(x.g2.currentRef), receipt: x.store.getReceipt(x.g1.currentRef) });
    }
    const result = await query(x, failure === 'mixed-manifest-receipt' ? x.g2 : x.g1);
    if (['deleted-source', 'source-bytes-drift'].includes(failure)) {
      assert.equal(result.status, 'ok');
      assert.equal(result.source_readback.complete, false);
      assert.ok(result.source_readback.sources.every(s => s.status ===
        (failure === 'deleted-source' ? 'SOURCE_UNAVAILABLE' : 'REVISION_MISMATCH')));
    } else assert.deepEqual(result, unavailable);
    if (['revoked-before-read', 'source-revision-drift', 'bundle-throw', 'mixed-manifest-receipt'].includes(failure)) assert.equal(x.readLog.length, 0);
    if (failure.endsWith('during-read')) assert.equal(x.readLog.length, 1);
  });
}

test('T2 source-first/pointer-first interruption windows expose no mixed current generation and recover', async () => {
  for (const sourceFirst of [true, false]) {
    const x = createT2Fixture(); accept(x, x.g1);
    if (sourceFirst) x.state.source = sourceMetadata(x.g2); else accept(x, x.g2);
    assert.deepEqual(await query(x), unavailable);
    assert.deepEqual(await query(x, x.g2), unavailable);
    assert.equal(x.readLog.length, 0);
    if (sourceFirst) accept(x, x.g2); else x.state.source = sourceMetadata(x.g2);
    await readT2Pages(x, x.g2);
    assert.equal(x.store.listGenerations().length, 2);
  }
});

test('T2 project/purpose/common authority and source budget boundaries survive real acceptance', async () => {
  const x = createT2Fixture(); accept(x, x.g1);
  for (const delta of [{ project_ref: ref(999) }, { actor_ref: 'actor:other' },
    { purpose: 'ungranted' }, { project_ref: null }, { budget: { max_units: 101 } }]) {
    assert.deepEqual(await query(x, x.g1, delta), unavailable);
  }
  assert.equal(x.readLog.length, 0);
  assert.equal((await query(x, x.g1, { scope: 'common' })).source_readback.complete, true);
  x.state.acl.actors.get(x.request.actor_ref).allowed_scopes.delete('common');
  const count = x.readLog.length;
  assert.deepEqual(await query(x, x.g1, { scope: 'common' }), unavailable);
  assert.equal(x.readLog.length, count);
  const full = await query(x, x.g1, { budget: { max_units: 100 } });
  assert.equal(full.hits.length, 7);
  assert.equal(full.source_readback.source_reads, 2);
  assert.equal(full.source_readback.complete, false);
  assert.equal(full.source_readback.sources.filter(s => s.status === 'BUDGET_EXCEEDED').length, 5);
});

test('T2 retained history is exact-ref storage; current-only reader does not claim historical snapshot queries', async () => {
  const x = createT2Fixture(); const original = accept(x, x.g1);
  accept(x, x.g2); x.state.source = sourceMetadata(x.g2);
  assert.deepEqual(x.store.getGeneration(x.g1.currentRef), original.manifest);
  assert.deepEqual(await query(x, x.g1, { valid_at: x.request.as_of, known_at: x.request.as_of }), unavailable);
  const current = await query(x, x.g2, { valid_at: '2000-01-01T00:00:00.000Z', known_at: x.request.as_of });
  assert.equal(current.status, 'ok'); assert.equal(current.hits.length, 0);
});
