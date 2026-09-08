import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import test from 'node:test';
import { createWorkIntakeContextConsumer } from '../src/work_intake_context.mjs';
import { workIntakeRuleProfileFixture, repinWorkIntakeContextFixture, writeJson } from './helpers/work_intake_context_fixture.mjs';
import { ref } from './helpers/accepted_context_fixture.mjs';
import { correctedFixture, sourceMetadata } from './helpers/accepted_context_read_fixture.mjs';
import { sameExactRef } from '../../../../guild_hall/engineering_engine/kernel/identity.mjs';

async function setup(t, options) {
  const f = await workIntakeRuleProfileFixture(options);
  t.after(() => rmSync(f.root, { recursive: true, force: true }));
  return f;
}
const read = f => createWorkIntakeContextConsumer(f.options).read(f.request);
const expectedIds = result => result.rule_profile.expected_element_ids;
test('current-time evaluation refuses an expired exception while explicit historical query remains available', async t => {
  const f = await setup(t, { qualityGrade: 'grade_strict' });
  const approved = exception(f); f.typed.rule_profile.exceptions = [approved];
  f.config.rule_profile_binding.approved_exceptions = [structuredClone(approved)]; repinWorkIntakeContextFixture(f);
  const consumer = createWorkIntakeContextConsumer(f.options);
  assert.equal((await consumer.read(f.request)).status, 'READ_ONLY_ASSESSED');
  assert.equal((await consumer.read(f.request, { currentTime: '2026-09-02T00:00:00.000Z' })).status, 'HOLD');
});
function exception(f) {
  return { exception_ref: f.profileRefs.project[5], approval_ref: f.profileRefs.project[6],
    rule_revision_ref: f.profileRefs.project[3], scope: structuredClone(f.typed.rule_profile.selection),
    expected_element_id: 'grade_strict_rule', decision: 'exclude', approved: true, approver_kind: 'registered_human',
    valid_at: f.request.as_of, expires_at: '2026-09-01T00:00:00.000Z' };
}

test('synthetic common/customer/quality/project selections compose different actual Rune expected sets', async t => {
  for (const [options, wanted] of [
    [{}, ['common_rule', 'customer_alpha_rule', 'grade_basic_rule', 'project_rule']],
    [{ customerId: 'customer_beta', qualityGrade: 'grade_strict' }, ['common_rule', 'customer_beta_rule', 'grade_strict_rule', 'project_rule']],
    [{ projectRule: false }, ['common_rule', 'customer_alpha_rule', 'grade_basic_rule']],
  ]) {
    const f = await setup(t, options); const result = await read(f);
    assert.equal(result.status, 'READ_ONLY_ASSESSED');
    assert.deepEqual(expectedIds(result), wanted);
    assert.equal(result.assessment.requirements_judged, wanted.length);
    assert.equal(result.assessment.gap_counts.satisfied, wanted.length);
    assert.deepEqual(result.rule_profile.profile_bindings.map(binding => binding.profile_kind), ['organization', 'project']);
    assert.match(result.evidence_digests.common_query_sha256, /^sha256:[0-9a-f]{64}$/u);
  }
});

test('typed selection cannot change the pinned project customer or quality grade', async t => {
  for (const change of [selection => { selection.customer_id = 'customer_beta'; },
    selection => { selection.quality_grade = 'grade_strict'; }, selection => { selection.project_ref = ref(992); }]) {
    const f = await setup(t); change(f.typed.rule_profile.selection); repinWorkIntakeContextFixture(f);
    assert.equal((await read(f)).status, 'HOLD');
  }
});

test('selected unknown applicability stays HOLD rather than dropping the requirement', async t => {
  const f = await setup(t); f.typed.rule_profile.layers[1].applicability.approval_scope = 'unknown';
  repinWorkIntakeContextFixture(f); assert.equal((await read(f)).status, 'HOLD');
});

test('only explicitly configured accepted human exception for exact scope and rule revision can exclude', async t => {
  const f = await setup(t, { qualityGrade: 'grade_strict' });
  const approved = exception(f);
  f.typed.rule_profile.exceptions = [approved];
  f.config.rule_profile_binding.approved_exceptions = [structuredClone(approved)];
  repinWorkIntakeContextFixture(f);
  const result = await read(f);
  assert.equal(result.status, 'READ_ONLY_ASSESSED');
  assert.deepEqual(result.rule_profile.excluded_element_ids, ['grade_strict_rule']);
  assert.equal(result.assessment.requirements_judged, 3);
  for (const change of [entry => { entry.approved = false; }, entry => { entry.approver_kind = 'llm'; },
    entry => { entry.scope.customer_id = 'customer_beta'; }, entry => { entry.rule_revision_ref = f.profileRefs.project[2]; },
    entry => { entry.expires_at = '2026-08-01T00:00:00.000Z'; }, entry => { entry.approval_ref = ref(991); }]) {
    f.typed.rule_profile.exceptions = [structuredClone(approved)]; change(f.typed.rule_profile.exceptions[0]);
    f.config.rule_profile_binding.approved_exceptions = structuredClone(f.typed.rule_profile.exceptions);
    repinWorkIntakeContextFixture(f); assert.equal((await read(f)).status, 'HOLD');
  }
});

test('accepted exception ref alone is not configured approval', async t => {
  const f = await setup(t, { qualityGrade: 'grade_strict' });
  f.typed.rule_profile.exceptions = [exception(f)]; repinWorkIntakeContextFixture(f);
  assert.equal((await read(f)).status, 'HOLD');
});

test('actual Rune preserves both conflicting source sides and unresolved disagreement returns HOLD', async t => {
  const f = await setup(t);
  const claims = [
    ['baseline_claim', 'project_contract_baseline', f.profileRefs.project[0], 'required'],
    ['common_claim', 'company_approved_procedure', f.profileRefs.common, 'optional'],
  ].map(([claim_id, authority_family, source_revision_ref, asserted_value]) => ({ claim_id, authority_family, source_revision_ref,
    asserted_value, lineage_ref: `lineage:${claim_id}`, applicability: true, valid_at: f.request.as_of, known_at: f.request.as_of }));
  f.typed.engine.states.conflicting_element_ids = ['customer_alpha_rule'];
  f.typed.engine.states.source_claims = { customer_alpha_rule: claims };
  repinWorkIntakeContextFixture(f);
  const result = await read(f);
  assert.equal(result.status, 'HOLD'); assert.deepEqual(result.blocker_codes, ['RULE_CONFLICT_UNRESOLVED']);
  assert.deepEqual(result.accepted_context_ref, f.request.accepted_generation_ref);
  assert.equal(result.findings[0].gap_type, 'gap_conflict');
  assert.equal(result.findings[0].source_conflict.governing_authority_family, 'project_contract_baseline');
  assert.deepEqual(result.findings[0].source_conflict.retained_claim_ids, ['baseline_claim', 'common_claim']);
  assert.equal(result.findings[0].source_conflict.sides_dropped, 0);
  assert.equal(result.rule_conflicts[0].retained_claims.length, 2);
  assert.equal(result.official_done, false); assert.equal(result.side_effects, 0);
  f.typed.engine.states.observed.find(element => element.element_id === 'obs_customer_alpha_rule').presence_state = 'unknown';
  repinWorkIntakeContextFixture(f);
  const unknown = await read(f);
  assert.equal(unknown.status, 'HOLD'); assert.equal(unknown.findings[0].gap_type, 'gap_unknown');
  assert.equal(unknown.rule_conflicts[0].retained_claims.length, 2);
  const suppressed = { ...exception(f), expected_element_id: 'customer_alpha_rule', rule_revision_ref: f.profileRefs.project[0] };
  f.typed.rule_profile.exceptions = [suppressed]; f.config.rule_profile_binding.approved_exceptions = [structuredClone(suppressed)];
  repinWorkIntakeContextFixture(f); assert.equal((await read(f)).accepted_context_ref, null);
  f.typed.rule_profile.exceptions = []; f.config.rule_profile_binding.approved_exceptions = [];
  f.typed.engine.states.source_claims.customer_alpha_rule.pop(); repinWorkIntakeContextFixture(f);
  assert.equal((await read(f)).accepted_context_ref, null);
});

test('genuine next accepted generation invalidates old evidence and reevaluates only after new exact pins', async t => {
  const f = await setup(t); const oldRequest = structuredClone(f.request);
  const oldConsumer = createWorkIntakeContextConsumer(f.options); const prior = await oldConsumer.read(oldRequest);
  const nextFixture = correctedFixture(f.accepted.f);
  // This acceptance is performed by the existing synthetic test owner, never the consumer.
  assert.equal(f.accepted.store.acceptCandidate(nextFixture.submission).status, 'ACCEPTED');
  const pointer = f.accepted.store.getCurrentPointer();
  f.accepted.state.source = sourceMetadata(nextFixture);
  writeJson(f.files.pointer.path, pointer); writeJson(f.files.source_revisions.path, f.accepted.state.source);
  assert.equal((await oldConsumer.read(oldRequest)).status, 'HOLD');
  f.files.accepted_generation = writeJson(f.files.accepted_generation.path, {
    manifest: f.accepted.store.getGeneration(nextFixture.currentRef), receipt: f.accepted.store.getReceipt(nextFixture.currentRef) });
  f.config.files.accepted_generation = f.files.accepted_generation;
  const nextQuery = await f.accepted.reader.query({ ...f.accepted.request, accepted_generation_ref: nextFixture.currentRef, budget: { max_units: 100 } });
  assert.equal(nextQuery.status, 'ok');
  const oldRef = f.profileRefs.project[1];
  const correctedRef = nextQuery.hits.find(hit => hit.source_span_ref === 'timeline-span:corrected').source_revision_ref;
  const replace = value => {
    if (sameExactRef(value, oldRef)) return structuredClone(correctedRef);
    if (Array.isArray(value)) return value.map(replace);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replace(item)]));
    return value;
  };
  f.typed = replace(f.typed); f.typed.accepted_generation_ref = nextFixture.currentRef;
  f.request.accepted_generation_ref = nextFixture.currentRef; repinWorkIntakeContextFixture(f);
  assert.equal((await oldConsumer.read(f.request)).status, 'HOLD');
  const next = await read(f);
  assert.equal(next.status, 'READ_ONLY_ASSESSED'); assert.deepEqual(next.accepted_context_ref, nextFixture.currentRef);
  assert.deepEqual(expectedIds(next), expectedIds(prior));
  assert.notEqual(next.evidence_digests.engine_fingerprint_sha256, prior.evidence_digests.engine_fingerprint_sha256);
  assert.equal(next.official_done, false); assert.equal(next.side_effects, 0);
});

test('policy revision change invalidates old pin and changes replay key even with identical expected set', async t => {
  const f = await setup(t); const oldConsumer = createWorkIntakeContextConsumer(f.options);
  const prior = await oldConsumer.read(f.request);
  f.typed.rule_profile.revision_ref = f.profileRefs.project[5];
  f.config.rule_profile_binding.profile_revision_ref = f.profileRefs.project[5];
  repinWorkIntakeContextFixture(f);
  assert.equal((await oldConsumer.read(f.request)).status, 'HOLD');
  const next = await read(f);
  assert.equal(next.status, 'READ_ONLY_ASSESSED'); assert.deepEqual(expectedIds(next), expectedIds(prior));
  assert.notEqual(next.evidence_digests.rule_profile_sha256, prior.evidence_digests.rule_profile_sha256);
  assert.notEqual(next.evidence_digests.engine_fingerprint_sha256, prior.evidence_digests.engine_fingerprint_sha256);
});

test('current grant revision forces reevaluation and common ACL denial cannot fall back to project-only', async t => {
  const f = await setup(t); const prior = await read(f);
  f.acl.actors[0].grant.grant_revision_ref = ref(989); writeJson(f.files.acl.path, f.acl);
  const next = await read(f); assert.equal(next.status, 'READ_ONLY_ASSESSED');
  assert.notEqual(next.evidence_digests.current_state_sha256, prior.evidence_digests.current_state_sha256);
  assert.notEqual(next.evidence_digests.engine_fingerprint_sha256, prior.evidence_digests.engine_fingerprint_sha256);
  f.acl.actors[0].grant.allowed_scopes = ['project']; writeJson(f.files.acl.path, f.acl);
  assert.equal((await read(f)).status, 'HOLD');
});
