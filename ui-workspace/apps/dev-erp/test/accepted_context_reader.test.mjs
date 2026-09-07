import assert from 'node:assert/strict';
import test from 'node:test';
import { createAcceptedContextReader } from '../src/accepted_context_reader.mjs';
import { makeUniformNotAvailable } from '../src/accepted_context_query.mjs';
import { ref, hash } from './helpers/accepted_context_fixture.mjs';
import { buildProjectContextGenerationCandidate } from '../../../../guild_hall/engineering_engine/kernel/project_context_generation_candidate.mjs';

import { fixture, correctedFixture, sourceMetadata } from './helpers/accepted_context_read_fixture.mjs';

test('actual candidate correction preserves source and membership predecessors through separate human review', () => {
  const x = fixture();
  const g2 = correctedFixture(x.f);
  const oldPointer = x.store.getCurrentPointer();
  const noReview = structuredClone(g2.submission); noReview.registered_human_review.verdict = 'rejected';
  assert.notEqual(x.store.acceptCandidate(noReview).status, 'ACCEPTED');
  assert.deepEqual(x.store.getCurrentPointer(), oldPointer);
  assert.equal(x.store.acceptCandidate(g2.submission).status, 'ACCEPTED');
  assert.equal(x.store.getGeneration(g2.currentRef).project_context.memberships.find(m => m.source_span_ref === 'timeline-span:1').acceptance_state, 'excluded_historical');
  for (const mutate of [
    request => { request.owner_context_contract.memberships[2].membership_state = 'active'; },
    request => { request.owner_context_contract.source_ref_crosswalk[3].inclusion_state = 'superseded'; },
    request => { request.owner_context_contract.memberships.at(-1).predecessor_source_span_ref = 'missing-predecessor'; },
  ]) {
    const input = structuredClone(g2.request); mutate(input);
    const result = buildProjectContextGenerationCandidate(input, { material_ref: ref(999, hash('rejected')), expected_material_sha256: hash('rejected'),
      expected_project_binding_ref: g2.projectBindingRef, valid_at: '2026-08-01T00:00:00.000Z', known_at: '2026-08-02T00:00:00.000Z' });
    assert.equal(result.receipt.status, 'HOLD');
    assert.ok(result.receipt.blocker_codes.some(code => /SOURCE_NOT_INCLUDED|CROSSWALK_MISMATCH|SUPERSESSION_INVALID/u.test(code)));
  }
});

test('G1 read, correction invalidation, separate G2 acceptance and stale pagination', async () => {
  const x = fixture();
  const first = await x.reader.query(x.request);
  assert.equal(first.status, 'ok'); assert.ok(first.cursor);
  const g2 = correctedFixture(x.f);
  x.state.source = sourceMetadata(g2);
  assert.deepEqual(await x.reader.query(x.request), makeUniformNotAvailable());
  assert.deepEqual(x.store.getCurrentPointer().generation_ref, x.f.currentRef);
  assert.deepEqual(await x.reader.query({ ...x.request, accepted_generation_ref: g2.currentRef }), makeUniformNotAvailable());
  assert.equal(x.store.acceptCandidate(g2.submission).status, 'ACCEPTED');
  const current = { ...x.request, accepted_generation_ref: g2.currentRef, budget: { max_units: 100 } };
  const result = await x.reader.query(current);
  assert.equal(result.status, 'ok');
  assert.ok(result.hits.some(hit => hit.source_span_ref === 'timeline-span:corrected'));
  assert.ok(result.hits.every(hit => hit.source_span_ref !== 'timeline-span:1'));
  assert.deepEqual(await x.reader.query(x.request), makeUniformNotAvailable());
  assert.deepEqual(await x.reader.query({ ...current, cursor: first.cursor }), makeUniformNotAvailable());
});

test('fresh ACL on every request: revocation and grant revision invalidate cached pages', async () => {
  const x = fixture(); const page = await x.reader.query(x.request);
  x.state.acl.revoked_actors.add('actor:alpha');
  assert.deepEqual(await x.reader.query(x.request), makeUniformNotAvailable());
  x.state.acl.revoked_actors.clear();
  x.state.acl.actors.get('actor:alpha').grant_revision_ref = ref(702);
  assert.deepEqual(await x.reader.query({ ...x.request, cursor: page.cursor }), makeUniformNotAvailable());
  assert.equal((await x.reader.query(x.request)).status, 'ok');
});

test('every protected failure returns exactly the same empty envelope', async () => {
  const mutations = [
    x => { x.request.project_ref = ref(990); },
    x => { x.request.actor_ref = 'actor:unknown'; },
    x => { x.state.source = null; },
    x => { x.state.source.source_revision_refs.pop(); },
    x => { x.state.source.producer_refs.timeline_projection_sha256 = hash('wrong-producer'); },
    x => { x.state.source.producer_binding_ref = ref(991); },
    x => { x.state.source = { count: 8, max_known_at: x.request.as_of }; },
    x => { x.providers.readAcceptedGeneration = async () => { throw new Error('private-failure-sentinel'); }; },
    x => { const read = x.providers.readAcceptedGeneration; x.providers.readAcceptedGeneration = async (...args) => {
      const bundle = structuredClone(await read(...args)); bundle.receipt.accepted_generation_ref = ref(992); return bundle;
    }; },
    x => { x.providers.currentPointer = () => ({ ...x.store.getCurrentPointer(), cas_fingerprint: hash('wrong-cas') }); },
    x => { x.request.cursor = 'invalid'; },
  ];
  for (const mutate of mutations) {
    const x = fixture(); mutate(x);
    assert.deepEqual(await x.reader.query(x.request), makeUniformNotAvailable());
  }
});

test('provider IO cannot race source correction, ACL withdrawal or pointer replacement', async () => {
  for (const mutate of [
    x => { x.state.source.source_revision_refs[0].source_revision_ref = ref(999); },
    x => { x.state.acl.revoked_actors.add('actor:alpha'); },
    x => { x.providers.currentPointer = () => ({ ...x.store.getCurrentPointer(), generation_ref: ref(999) }); },
  ]) {
    const x = fixture(); const read = x.providers.readAcceptedGeneration;
    x.providers.readAcceptedGeneration = async (...args) => { const bundle = await read(...args); mutate(x); return bundle; };
    assert.deepEqual(await x.reader.query(x.request), makeUniformNotAvailable());
  }
});

test('default off performs no observation or IO', async () => {
  const x = fixture();
  for (const k of Object.keys(x.providers)) x.providers[k] = () => { assert.fail('provider called while disabled'); };
  assert.deepEqual(await createAcceptedContextReader({ binding: x.binding, providers: x.providers }).query(x.request), makeUniformNotAvailable());
});

test('final synchronous observation rejects changes after the query promise has started', async () => {
  const x = fixture(); let observations = 0;
  x.providers.currentSourceRevisions = () => {
    observations += 1;
    if (observations === 3) queueMicrotask(() => x.state.acl.revoked_actors.add('actor:alpha'));
    return x.state.source;
  };
  assert.deepEqual(await x.reader.query(x.request), makeUniformNotAvailable());
  assert.equal(observations, 4);
});
