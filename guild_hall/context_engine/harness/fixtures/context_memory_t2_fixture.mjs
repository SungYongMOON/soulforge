// Synthetic only: real candidate builder -> human-review gate -> in-memory store.
import assert from 'node:assert/strict';
import { createAcceptedContextReader } from '../../src/runtime/accepted_context_reader.mjs';
import { exactRefIdentityKey } from '../../../engineering_engine/kernel/identity.mjs';
import { authenticFixture, createBoundStore, hash, ref } from './accepted_context_fixture.mjs';
import { correctedFixture, sourceMetadata } from './accepted_context_read_fixture.mjs';

export function createT2Fixture() {
  const g1 = authenticFixture({ priorRef: ref(10), currentRef: ref(11),
    priorGenerationNum: 0, currentGenerationNum: 1, writerEpoch: 2 });
  const g2 = correctedFixture(g1);
  // A distinct synthetic human decision is required for the corrected candidate.
  g2.submission.registered_human_review.decision_ref = ref(81);
  const store = createBoundStore(g1);
  const grant = { grant_revision_ref: ref(701), allowed_projects: new Set([exactRefIdentityKey(g1.projectBindingRef)]),
    allowed_scopes: new Set(['project', 'common']), allowed_purposes: new Set(['pilot_context_query']),
    field_allowed: true, chunk_allowed: true, locator_allowed: true };
  const state = { source: sourceMetadata(g1), acl: { actors: new Map([['actor:alpha', grant]]),
    revoked_actors: new Set(), revoked_generations: new Set() } };
  const binding = { project_ref: g1.projectBindingRef, producer_binding_ref: ref(800) };
  const request = { actor_ref: 'actor:alpha', project_ref: g1.projectBindingRef,
    accepted_generation_ref: g1.currentRef, scope: 'project', as_of: '2026-08-06T00:00:00.000Z',
    purpose: 'pilot_context_query', budget: { max_units: 2 }, cursor: null };
  // Exact bytes already committed by the existing synthetic fixture's source refs.
  // These are source-adapter inputs, independent of query hits or evaluator gold.
  const bodies = new Map(['public-synthetic-p4-document', 'ref:4', 'ref:100', 'ref:101',
    'ref:102', 'ref:103', 'ref:104', 'ref:105', 'ref:901'].map(body => [hash(body), body]));
  const readLog = [];
  const providers = { currentPointer: () => store.getCurrentPointer(),
    currentSourceRevisions: () => state.source, currentAclPolicy: () => state.acl,
    readAcceptedGeneration: async (_project, generation) => ({ manifest: store.getGeneration(generation), receipt: store.getReceipt(generation) }),
    readSourceRevision: row => {
      readLog.push(structuredClone(row));
      const body = bodies.get(row.source_revision_ref.content_id);
      if (body === undefined) throw new Error('synthetic source unavailable');
      return { binding: row, body };
    } };
  const rows = [g1, g2].flatMap(f => f.builtCandidate.project_context.memberships.map(member => ({
    actor_ref: request.actor_ref, purpose: request.purpose, scope: member.scope, source_lane: member.source_lane,
    project_ref: f.projectBindingRef, accepted_generation_ref: f.currentRef, grant_revision_ref: grant.grant_revision_ref,
    ...Object.fromEntries(['source_revision_ref', 'source_span_ref', 'context_unit_ref', 'context_event_ref',
      'context_branch_ref', 'valid_at', 'known_at'].map(key => [key, member[key]])), locator: 'paragraph:1',
  })));
  for (const row of rows) assert.ok(bodies.has(row.source_revision_ref.content_id));
  const readerFor = f => createAcceptedContextReader({ enabled: true, binding, providers,
    sourceReadback: { enabled: true, max_reads: 2,
      bindings: rows.filter(row => exactRefIdentityKey(row.accepted_generation_ref) === exactRefIdentityKey(f.currentRef)) } });
  return { g1, g2, store, state, binding, request, bodies, readLog, providers, readerFor };
}

export async function readT2Pages(x, f) {
  const pages = [];
  let cursor = null;
  do {
    const page = await x.readerFor(f).query({ ...x.request, accepted_generation_ref: f.currentRef, cursor });
    assert.equal(page.status, 'ok');
    assert.equal(page.source_readback.complete, true);
    assert.ok(page.source_readback.source_reads <= 2);
    pages.push(page);
    cursor = page.cursor;
    assert.ok(pages.length < 10, 'bounded synthetic pagination');
  } while (cursor);
  return pages;
}
