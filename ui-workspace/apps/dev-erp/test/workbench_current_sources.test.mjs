import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkbenchCurrentSources, requesterForAccount } from '../src/workbench_current_sources.mjs';
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { makeWorkbenchFixture, addSyntheticLinearEvidence } from './helpers/workbench_fixture.mjs';
import { createLinearReadEvidenceReader } from '../../../../guild_hall/linear_history/linear_read_evidence_reader.mjs';

async function context(t, options) {
  const fixture = await makeWorkbenchFixture(options);
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const sources = createWorkbenchCurrentSources({ root: fixture.sourceRoot, expectedBinding: fixture.expectedBinding });
  return { ...fixture, sources, access: { requester: fixture.requester, canAccessProject: async () => true } };
}

test('account IDs are realm-separated member identities, including administrators', () => {
  const first = requesterForAccount('realm.synthetic', 'account.a');
  assert.match(first, /^member\.[a-f0-9]{16}$/u);
  assert.notEqual(first, requesterForAccount('realm.other', 'account.a'));
  assert.notEqual(first, requesterForAccount('realm.synthetic', 'account.b'));
  assert.throws(() => requesterForAccount('', 'account.a'));
});

test('configuration is explicit and missing authority never becomes a current epoch', () => {
  assert.throws(() => createWorkbenchCurrentSources());
});

test('actual compiler, Rune membership, Blueprint bytes and separate grant yield a usable catalogue', async t => {
  const fixture = await context(t);
  const result = await fixture.sources.catalogue(fixture.access);
  assert.deepEqual(result.holds, []);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].mapping_status, 'MAPPED');
  assert.equal(result.entries[0].execution_started, false);
  const evidence = await fixture.sources.evidence({ ...fixture.access, request: fixture.request });
  assert.equal(evidence.acl.epoch, 7);
  assert.equal(evidence.acl.receipt_ref, 'acl.synthetic.7');
  assert.deepEqual(evidence.allowed_blueprints, [fixture.request.blueprint_ref]);
});

test('project access and exact approved grant both filter all foreign metadata', async t => {
  const fixture = await context(t);
  for (const access of [{ ...fixture.access, canAccessProject: async () => false },
    { ...fixture.access, requester: requesterForAccount(fixture.expectedBinding.realm_id, 'account.b') }]) {
    assert.deepEqual((await fixture.sources.catalogue(access)).entries, []);
    await assert.rejects(fixture.sources.evidence({ ...access, request: fixture.request }), { workbenchCode: 'SCOPE_VIOLATION' });
  }
});

test('missing epoch cannot be fabricated from a true project-access callback', async t => {
  const fixture = await context(t);
  delete fixture.authority.grants[0].epoch;
  await fixture.repin();
  const sources = createWorkbenchCurrentSources({ root: fixture.sourceRoot, expectedBinding: fixture.expectedBinding });
  await assert.rejects(sources.catalogue(fixture.access), { workbenchCode: 'AUTHORITY_BINDING_INVALID' });
});

test('stale binding and corrupt or changed pinned files fail closed without private text', async t => {
  const stale = await context(t, { observedAt: '2026-01-01T00:00:00.000Z', validUntil: '2026-01-02T00:00:00.000Z' });
  await assert.rejects(stale.sources.catalogue(stale.access), { workbenchCode: 'SOURCE_BINDING_NOT_CURRENT' });
  for (const name of ['recipe.json', 'blueprint.json', 'recipe-code.mjs', 'input.json', 'hierarchy.json', 'policy.json']) {
    const fixture = await context(t);
    await writeFile(join(fixture.sourceRoot, name), 'private synthetic corrupt text');
    const result = await fixture.sources.catalogue(fixture.access);
    assert.equal(result.entries.length, 0, name);
    assert.equal(result.holds[0].hold_code, 'SOURCE_DIGEST_MISMATCH', name);
    assert.equal(JSON.stringify(result).includes('private synthetic'), false);
    await assert.rejects(fixture.sources.evidence({ ...fixture.access, request: fixture.request }), { workbenchCode: 'SOURCE_DIGEST_MISMATCH' });
  }
});

test('rehashed recipe kind, scope, generation and task substitutions still fail semantic matching', async t => {
  for (const mutation of [recipe => { recipe.kind = 'deck'; }, recipe => { recipe.scope.project_code = 'SYN-002'; },
    recipe => { recipe.generation = 'generation.synthetic.2'; }, recipe => { recipe.rune_task_id = 'task:foreign'; }]) {
    const fixture = await context(t);
    mutation(fixture.recipe);
    fixture.catalogue.entries[0].sources.recipe = await fixture.write('recipe.json', fixture.recipe);
    await fixture.repin();
    const sources = createWorkbenchCurrentSources({ root: fixture.sourceRoot, expectedBinding: fixture.expectedBinding });
    assert.equal((await sources.catalogue(fixture.access)).holds[0].hold_code, 'RECIPE_BINDING_MISMATCH');
  }
});

test('a fresh approved root remains pinned to its original identity and binding', async t => {
  const fixture = await context(t);
  await fixture.sources.catalogue(fixture.access);
  fixture.binding.generation = 'generation.synthetic.2';
  await fixture.repin();
  await assert.rejects(fixture.sources.catalogue(fixture.access), { workbenchCode: 'SOURCE_DIGEST_MISMATCH' });
});

test('expiry during IO is rechecked before returning catalogue or evidence', async t => {
  const fixture = await context(t, { observedAt: '2026-09-07T00:00:00.000Z', validUntil: '2026-09-07T00:01:00.000Z' });
  for (const operation of ['catalogue', 'evidence']) {
    let clock = '2026-09-07T00:00:30.000Z';
    const sources = createWorkbenchCurrentSources({ root: fixture.sourceRoot, expectedBinding: fixture.expectedBinding, now: () => clock });
    const access = { requester: fixture.requester, request: fixture.request, canAccessProject: async () => { clock = '2026-09-07T00:02:00.000Z'; return true; } };
    await assert.rejects(sources[operation](access), error => ['SOURCE_BINDING_NOT_CURRENT', 'AUTHORITY_BINDING_UNAVAILABLE'].includes(error.workbenchCode));
  }
});

test('nonexistent calendar dates are not valid authority timestamps', async t => {
  const fixture = await context(t);
  fixture.binding.valid_until = '2027-02-30T00:00:00.000Z';
  await fixture.repin();
  const sources = createWorkbenchCurrentSources({ root: fixture.sourceRoot, expectedBinding: fixture.expectedBinding });
  await assert.rejects(sources.catalogue(fixture.access), { workbenchCode: 'SOURCE_BINDING_NOT_CURRENT' });
});

test('actual Linear producer metadata joins the approved recipe; changed latest run becomes explicit unmapped intake', async t => {
  const fixture = await context(t);
  const linear = await addSyntheticLinearEvidence(fixture);
  const sources = createWorkbenchCurrentSources({ root: fixture.sourceRoot, expectedBinding: fixture.expectedBinding,
    linearReaderFactory: createLinearReadEvidenceReader });
  const current = await sources.catalogue(fixture.access);
  assert.deepEqual(current.holds, []);
  assert.equal(current.entries[0].mapping_status, 'MAPPED');
  assert.equal(current.entries[0].request.policy_refs.task_ref.task_id, 'SYN-1');
  const evidence = await sources.evidence({ ...fixture.access, request: fixture.request });
  assert.equal(evidence.linear_task.task_status, 'In Progress');
  linear.receipt.coverage_gaps.push('run_deadline_reached');
  await writeFile(linear.receiptFile, JSON.stringify(linear.receipt));
  const changed = await sources.catalogue(fixture.access);
  assert.equal(changed.entries[0].mapping_status, 'UNMAPPED_WORK_CANDIDATE');
  assert.match(changed.entries[0].hold_code, /^LINEAR_/u);
  assert.equal(changed.entries[0].execution_started, false);
});

test('a newly approved same-ID recipe/code bundle cannot reinterpret a previous request after restart', async t => {
  const fixture = await context(t);
  const prior = structuredClone((await fixture.sources.catalogue(fixture.access)).entries[0].request);
  fixture.catalogue.entries[0].sources.code = await fixture.write('recipe-code.mjs', '// Different synthetic code under same recipe ID.\n');
  fixture.recipe.code_sha256 = fixture.catalogue.entries[0].sources.code.content_sha256;
  fixture.catalogue.entries[0].sources.recipe = await fixture.write('recipe.json', fixture.recipe);
  await fixture.repin();
  const restarted = createWorkbenchCurrentSources({ root: fixture.sourceRoot, expectedBinding: fixture.expectedBinding });
  const next = (await restarted.catalogue(fixture.access)).entries[0].request;
  assert.equal(next.policy_refs.recipe_id, prior.policy_refs.recipe_id);
  assert.notEqual(next.idempotency_key.split('.')[1], prior.idempotency_key.split('.')[1]);
  await assert.rejects(restarted.evidence({ ...fixture.access, request: prior }), { workbenchCode: 'CATALOGUE_SELECTION_CHANGED' });
  assert.equal((await restarted.evidence({ ...fixture.access, request: next })).acl.epoch, 7);
});

test('separately approved scope revocation denies access even when project access is still true', async t => {
  const fixture = await context(t);
  fixture.authority.grants[0].state = 'revoked';
  await fixture.repin();
  const sources = createWorkbenchCurrentSources({ root: fixture.sourceRoot, expectedBinding: fixture.expectedBinding });
  assert.deepEqual((await sources.catalogue(fixture.access)).entries, []);
  await assert.rejects(sources.evidence({ ...fixture.access, request: fixture.request }), { workbenchCode: 'SCOPE_VIOLATION' });
});
