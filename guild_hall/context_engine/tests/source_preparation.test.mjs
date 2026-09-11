// Source preparation over real Linear collection custody. The custody is produced
// by the actual linear_history runner with its synthetic transport (no network),
// so the adapter reads the same create-only files a live lane writes.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LINEAR_COLLECT_BINDING_SCHEMA_VERSION, runLinearCollect } from '../../linear_history/linear_collect_runner.mjs';
import { createSyntheticLinearTransport, loadSyntheticLinearFixture } from '../../linear_history/linear_synthetic_transport.mjs';
import { writeCreateOnlyJson } from '../../linear_history/linear_custody.mjs';
import { sha256Canonical } from '../../shared/project_history_envelope.mjs';
import { ref } from '../harness/fixtures/accepted_context_fixture.mjs';
import { prepareSourceDocuments } from '../src/runtime/source_preparation.mjs';
import { SOURCE_GRANT_SCHEMA, buildSourceCoverage, detectSourceChanges, normalizeText,
  validateSourceDocument } from '../src/runtime/source_documents.mjs';

const REPO = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const FIXTURE = fileURLToPath(new URL('../../linear_history/fixtures/synthetic_linear_workspace.json', import.meta.url));
const ALPHA = '5e6f7081-92a3-4ebf-80d1-4c5d6e7f8091';
const NOW = '2026-09-12T00:00:00.000Z';
const ROOT_REF = 'linear.synthetic';

async function syntheticLinearCustody() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ctx-src-linear-'));
  const runtimeRoot = path.join(root, 'runtime'), privateRoot = path.join(root, 'private');
  await mkdir(runtimeRoot, { recursive: true });
  const binding = { schema_version: LINEAR_COLLECT_BINDING_SCHEMA_VERSION, feature_enabled: true,
    lane_id: 'hpp-linear-collect', private_root: privateRoot, data_root: path.join(privateRoot, 'ingress', 'linear'),
    state_root: path.join(privateRoot, 'linear_history', 'state'), forbidden_roots: [REPO, runtimeRoot],
    writer: { authority_id: 'hpp-linear-collect-writer', epoch: 1 },
    credentials: { api_key_env: null, api_key_file: path.join(privateRoot, 'config', 'linear_history', 'credentials', 'linear_api_key.txt') },
    workspace: { url_key: 'synthetic-forge', organization_id: null,
      project_scope_map: [{ linear_project_id: ALPHA, project_scope_ref: 'project:syn-alpha' }] },
    cursor: { overlap_seconds: 300, initial_updated_at: null, page_size: 50, max_pages_per_run: 10, timeout_ms: 15000 } };
  await mkdir(path.dirname(binding.credentials.api_key_file), { recursive: true });
  // Synthetic transport never sends it; the runner only requires a well-formed file.
  await writeFile(binding.credentials.api_key_file, `lin_api_${'a1b2c3d4'.repeat(5)}\n`);
  const bindingPath = path.join(privateRoot, 'config', 'linear_history', 'linear_collect.binding.json');
  const bytes = Buffer.from(`${JSON.stringify(binding, null, 2)}\n`);
  await writeFile(bindingPath, bytes);
  const fixture = await loadSyntheticLinearFixture(FIXTURE);
  const run = await runLinearCollect({ binding_path: bindingPath,
    expected_binding_sha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    repository_root: REPO, runtime_root: runtimeRoot, state_root: binding.state_root,
    transport_factory: async () => createSyntheticLinearTransport(fixture, { page_size: 50 }),
    clock: { now: () => new Date('2026-09-01T02:00:00.000Z') }, run_id: 'run-0001' });
  assert.equal(run.status, 'ok');
  const custodyRoot = path.join(privateRoot, 'ingress', 'linear', 'synthetic-forge');
  const issue = identifier => fixture.issues.find(row => row.identifier === identifier).id;
  return { custodyRoot, fixture, issue, roots: { [ROOT_REF]: custodyRoot } };
}

function grantFor(items, overrides = {}) {
  return { schema_version: SOURCE_GRANT_SCHEMA, grant_id: 'grant.synthetic.linear.1', project_ref: ref(1),
    purposes: ['context_preparation'], allowed_data_classes: ['public_synthetic'],
    valid_from: '2026-09-01T00:00:00.000Z', valid_to: '2026-10-01T00:00:00.000Z',
    sources: [{ kind: 'linear', root_ref: ROOT_REF, items }], ...overrides };
}
const latest = itemId => ({ item_id: itemId, revision_policy: 'latest_in_custody', revision_sha256: null, data_class: 'public_synthetic' });

async function snapshotHex(custodyRoot, kind, id) {
  const names = (await readdir(path.join(custodyRoot, kind, id))).filter(name => name.endsWith('.json'));
  assert.equal(names.length, 1);
  return names[0].slice(0, -'.json'.length);
}

test('granted Linear issues become bounded source documents with comments, change log and facts', async () => {
  const x = await syntheticLinearCustody();
  const syn1 = x.issue('SYN-1'), syn2 = x.issue('SYN-2');
  const exactSyn2 = { item_id: syn2, revision_policy: 'exact', data_class: 'public_synthetic',
    revision_sha256: `sha256:${await snapshotHex(x.custodyRoot, 'issues', syn2)}` };
  const out = await prepareSourceDocuments({ grant: grantFor([latest(syn1), exactSyn2]), roots: x.roots, now: NOW });
  assert.equal(out.documents.length, 2);
  assert.deepEqual(out.coverage.counts, { prepared: 2, missing: 0, stale_grant: 0, refused: 0, failed: 0 });
  const doc = out.documents.find(row => row.item_id === syn1);
  assert.ok(validateSourceDocument(doc));
  assert.equal(doc.source_kind, 'linear');
  assert.equal(doc.project_key, out.grant.project_key);
  assert.deepEqual(doc.units.map(unit => unit.unit_kind), ['title', 'description', 'comment', 'comment', 'change', 'change']);
  assert.equal(doc.units[0].text, 'Synthetic issue one (Café)');
  assert.ok(doc.units.some(unit => unit.unit_kind === 'comment' && unit.text === 'Synthetic comment one'));
  assert.ok(doc.units.some(unit => unit.unit_kind === 'change' && /^state: /u.test(unit.text)));
  assert.ok(doc.units.filter(unit => unit.unit_kind === 'comment').every(unit => /^linear\.user:/u.test(unit.speaker_ref)));
  // Another issue's discussion never leaks into this document.
  assert.ok(!doc.units.some(unit => unit.text === 'Synthetic comment on issue two'));
  assert.deepEqual(doc.facts.find(fact => fact.name === 'linear.state'), { name: 'linear.state', value: 'Todo', at: doc.valid_at });
  assert.equal(doc.components.filter(row => row.kind === 'comment').length, 2);
  assert.equal(doc.known_at, null);
  assert.equal(doc.time_basis, 'provider_updated_at_capture_unknown');
  const exact = out.documents.find(row => row.item_id === syn2);
  assert.equal(exact.primary_revision_sha256, exactSyn2.revision_sha256);
  assert.equal(out.changes.added.length, 2);
  // Nothing about the documents names the private custody location.
  assert.equal(JSON.stringify(out).includes(x.custodyRoot), false);
});

test('same grant and custody replay to identical documents and an all-unchanged change set', async () => {
  const x = await syntheticLinearCustody();
  const grant = grantFor([latest(x.issue('SYN-1')), latest(x.issue('SYN-3'))]);
  const first = await prepareSourceDocuments({ grant, roots: x.roots, now: NOW });
  const second = await prepareSourceDocuments({ grant, roots: x.roots, now: NOW, previousCoverage: first.coverage });
  assert.deepEqual(second.documents, first.documents);
  assert.equal(second.coverage.coverage_sha256, first.coverage.coverage_sha256);
  assert.deepEqual(second.changes.unchanged.map(row => row.doc_key).sort(), first.documents.map(row => row.doc_key).sort());
  assert.equal(second.changes.added.length + second.changes.changed.length + second.changes.removed.length, 0);
});

test('a new comment revision changes only its issue and supersedes the previous document key', async () => {
  const x = await syntheticLinearCustody();
  const syn1 = x.issue('SYN-1'), syn3 = x.issue('SYN-3');
  const grant = grantFor([latest(syn1), latest(syn3)]);
  const before = await prepareSourceDocuments({ grant, roots: x.roots, now: NOW });
  // Written with the lane's own create-only custody writer, as a later run would.
  const [commentId] = (await readdir(path.join(x.custodyRoot, 'comments'))).sort();
  const existingHex = await snapshotHex(x.custodyRoot, 'comments', commentId);
  const existing = JSON.parse(await readFile(path.join(x.custodyRoot, 'comments', commentId, `${existingHex}.json`), 'utf8'));
  const newId = 'c0ffee00-0000-4000-8000-000000000001';
  const object = { ...existing.object, id: newId, issue_id: syn1, body: 'Synthetic follow-up after the review',
    created_at: '2026-09-02T00:00:00.000Z', updated_at: '2026-09-02T00:00:00.000Z', parent_id: null };
  const sha = sha256Canonical(object);
  await writeCreateOnlyJson(x.custodyRoot, ['comments', newId, `${sha.slice(7)}.json`],
    { schema_version: 'soulforge.linear_collect.custody_object.v1', kind: 'comments', object_id: newId, content_sha256: sha, object });
  const after = await prepareSourceDocuments({ grant, roots: x.roots, now: NOW, previousCoverage: before.coverage });
  assert.deepEqual(after.changes.changed.map(row => row.item_id), [syn1]);
  assert.deepEqual(after.changes.unchanged.map(row => row.item_id), [syn3]);
  const oldKey = before.documents.find(row => row.item_id === syn1).doc_key;
  const updated = after.documents.find(row => row.item_id === syn1);
  assert.notEqual(updated.doc_key, oldKey);
  assert.equal(after.changes.changed[0].previous_doc_key, oldKey);
  assert.ok(updated.units.some(unit => unit.text === 'Synthetic follow-up after the review'));
  // The issue snapshot itself did not change; only the composite revision did.
  assert.equal(updated.primary_revision_sha256, before.documents.find(row => row.item_id === syn1).primary_revision_sha256);
});

test('tampered custody bytes fail that item with a digest code and never reach a document', async () => {
  const x = await syntheticLinearCustody();
  const syn1 = x.issue('SYN-1'), syn3 = x.issue('SYN-3');
  const hex = await snapshotHex(x.custodyRoot, 'issues', syn3);
  const file = path.join(x.custodyRoot, 'issues', syn3, `${hex}.json`);
  const record = JSON.parse(await readFile(file, 'utf8'));
  record.object.title = 'Rewritten after capture';
  await writeFile(file, `${JSON.stringify(record)}\n`);
  const out = await prepareSourceDocuments({ grant: grantFor([latest(syn1), latest(syn3)]), roots: x.roots, now: NOW });
  assert.deepEqual(out.documents.map(row => row.item_id), [syn1]);
  const failed = out.coverage.items.find(row => row.item_id === syn3);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.code, 'custody_digest_mismatch');
  assert.equal(JSON.stringify(out).includes('Rewritten after capture'), false);
});

test('exact revisions custody no longer holds are stale grants; absent items are missing', async () => {
  const x = await syntheticLinearCustody();
  const stale = { item_id: x.issue('SYN-2'), revision_policy: 'exact', data_class: 'public_synthetic',
    revision_sha256: `sha256:${'0'.repeat(64)}` };
  const absent = latest('00000000-0000-4000-8000-00000000abcd');
  const out = await prepareSourceDocuments({ grant: grantFor([stale, absent]), roots: x.roots, now: NOW });
  assert.equal(out.documents.length, 0);
  assert.deepEqual(out.coverage.items.map(row => [row.status, row.code]).sort(),
    [['missing', 'source_missing'], ['stale_grant', 'granted_revision_absent']]);
  assert.equal(out.changes.unavailable.length, 2);
});

test('grant boundaries: not current, malformed and real-class grants are refused; unconnected kinds are reported', async () => {
  const x = await syntheticLinearCustody();
  const items = [latest(x.issue('SYN-1'))];
  await assert.rejects(prepareSourceDocuments({ grant: grantFor(items), roots: x.roots, now: '2026-10-02T00:00:00.000Z' }),
    { code: 'source_grant_not_current' });
  await assert.rejects(prepareSourceDocuments({ grant: grantFor(items, { purposes: ['task_execution'] }), roots: x.roots, now: NOW }),
    { code: 'source_grant_invalid' });
  await assert.rejects(prepareSourceDocuments({ grant: grantFor([{ ...items[0], data_class: 'project_internal' }]), roots: x.roots, now: NOW }),
    { code: 'source_grant_invalid' });
  await assert.rejects(prepareSourceDocuments({ grant: grantFor([{ ...items[0], data_class: 'project_internal' }],
    { allowed_data_classes: ['project_internal'] }), roots: x.roots, now: NOW }), { code: 'real_source_preparation_not_admitted' });
  await assert.rejects(prepareSourceDocuments({ grant: grantFor([...items, ...items]), roots: x.roots, now: NOW }),
    { code: 'source_grant_invalid' });
  const mixed = grantFor(items);
  mixed.sources.push({ kind: 'mail', root_ref: 'mail.synthetic', items: [latest('mail-item-1')] });
  mixed.sources.push({ kind: 'linear', root_ref: 'linear.unbound', items: [latest(x.issue('SYN-2'))] });
  const out = await prepareSourceDocuments({ grant: mixed, roots: x.roots, now: NOW });
  assert.equal(out.documents.length, 1);
  assert.deepEqual(out.coverage.items.filter(row => row.status === 'failed').map(row => row.code).sort(),
    ['adapter_not_connected', 'source_root_unbound']);
  const relative = await prepareSourceDocuments({ grant: grantFor(items), roots: { [ROOT_REF]: 'relative/custody' }, now: NOW });
  assert.equal(relative.coverage.items[0].code, 'source_root_invalid');
});

test('coverage comparison reports removed items, rejects duplicates and cross-project comparison', () => {
  const grantSha256 = `sha256:${'a'.repeat(64)}`;
  const row = (item_id, revision) => ({ source_kind: 'linear', root_ref: ROOT_REF, item_id, status: 'prepared',
    composite_revision_sha256: `sha256:${revision.repeat(64)}`, doc_key: `sha256:${revision.repeat(63)}f` });
  const before = buildSourceCoverage({ projectKey: 'p1', grantSha256, results: [row('a1', '1'), row('b2', '2')] });
  const after = buildSourceCoverage({ projectKey: 'p1', grantSha256, results: [row('a1', '1')] });
  assert.deepEqual(detectSourceChanges(before, after).removed.map(r => r.item_id), ['b2']);
  assert.throws(() => buildSourceCoverage({ projectKey: 'p1', grantSha256, results: [row('a1', '1'), row('a1', '3')] }),
    { code: 'source_coverage_invalid' });
  const foreign = buildSourceCoverage({ projectKey: 'p2', grantSha256, results: [row('a1', '1')] });
  assert.throws(() => detectSourceChanges(before, foreign), { code: 'source_coverage_invalid' });
  assert.equal(normalizeText('a\r\nb ć', 100), 'a\nbć');
});
