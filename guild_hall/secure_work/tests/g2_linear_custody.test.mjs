import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createG2LinearCustodyReader } from '../g2_linear_custody_reader.mjs';
import { loadExecutionAuthority } from '../execution_authority.mjs';
import { verifyInstallation, executeVerified } from '../sfx.mjs';
import { readFileSync } from 'node:fs';
import { sha256Canonical } from '../../shared/project_history_envelope.mjs';
import { readEvidenceRecordForIssue, identityDigestForBinding } from '../../linear_history/linear_collect_runner.mjs';
import { LINEAR_READ_OPERATIONS } from '../../linear_history/linear_graphql_client.mjs';
import { LINEAR_COLLECT_OBJECT_KINDS } from '../../linear_history/linear_collect_receipt.mjs';
import { canonicalBytes } from '../../linear_history/linear_custody.mjs';

const ISSUE = 'f8091a2b-3c4d-4859-aa6b-465768798a9b', OTHER = 'b8091a2b-3c4d-4859-aa6b-465768798a9b';
const NOW = Date.now(), TIME = new Date(NOW).toISOString();
const SHA = `sha256:${'a'.repeat(64)}`;
async function save(file, body) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify(body)); }

async function fixture(t) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'g2-linear-custody-'));
  t.after(async () => {
    assert.equal(path.dirname(temp), path.resolve(os.tmpdir()));
    assert.match(path.basename(temp), /^g2-linear-custody-[A-Za-z0-9]+$/u);
    await fs.rm(temp, { force: true, recursive: true });
  });
  const root = path.join(temp, 'custody'), stateRoot = path.join(temp, 'state');
  const binding = { lane_id: 'synthetic-linear', writer: { authority_id: 'synthetic-writer', epoch: 1 },
    workspace: { url_key: 'synthetic-forge', project_scope_map: [{ linear_project_id: 'project-1', project_scope_ref: 'project:SYN' }] } };
  const expectedBinding = { custody_root: root, state_root: stateRoot, lane_id: binding.lane_id,
    identity_digest: identityDigestForBinding(binding), writer_authority_id: binding.writer.authority_id,
    writer_epoch: 1, binding_sha256: SHA, workspace_url_key: 'synthetic-forge',
    organization_id: 'a8091a2b-3c4d-4859-aa6b-465768798a9b', project_scope_ref: 'project:SYN', project_code: 'SYN' };
  const issue = { id: ISSUE, identifier: 'SYN-1', updated_at: TIME, state_name: 'Todo', project_id: 'project-1',
    description: 'Synthetic private input. Never a source permission or release decision.' };
  const envelope = readEvidenceRecordForIssue(binding, issue).envelope, digest = sha256Canonical(envelope);
  const cursor = { schema_version: 'soulforge.linear_collect.cursor.v1', watermark: TIME, backfill: null, generation_seq: 2 };
  const state = { schema_version: 'soulforge.linear_collect.state.v1', lane_id: binding.lane_id, identity_digest: expectedBinding.identity_digest,
    writer_authority_id: binding.writer.authority_id, writer_epoch: 1, cursor, object_index: {
      [`issues:${ISSUE}`]: { content_sha256: envelope.issue_content_sha256, updated_at: TIME },
      [`read_evidence:${ISSUE}`]: { content_sha256: digest, updated_at: TIME },
    }, last_run_id: 'run-synthetic', last_completed_at: TIME };
  const receipt = { schema_version: 'soulforge.linear_collect.run_receipt.v1', lane_id: binding.lane_id,
    run_id: state.last_run_id, generation_seq: 2, mode: 'apply', status: 'ok', writer_authority_id: binding.writer.authority_id,
    writer_epoch: 1, binding_sha256: SHA, workspace_url_key: expectedBinding.workspace_url_key,
    organization_id: expectedBinding.organization_id, started_at: TIME, completed_at: TIME, duration_ms: 0,
    window: { lower: TIME, upper: TIME, phase: 'delta', order_observed: 'ascending' },
    cursor_before: { ...cursor, generation_seq: 1 }, cursor_after: cursor,
    read_calls: { total: 0, by_operation: Object.fromEntries(LINEAR_READ_OPERATIONS.map(k => [k, 0])) },
    objects: Object.fromEntries(LINEAR_COLLECT_OBJECT_KINDS.map(k => [k, { observed: 0, created: 0, unchanged: 0 }])),
    custody_manifest_digest: SHA, coverage_gaps: ['polling_cannot_prove_hard_deletes'], error_codes: [],
    repository_writes: 0, private_writes: 3, network_used: false };
  const rawFile = path.join(root, 'issues', ISSUE, `${envelope.issue_content_sha256.slice(7)}.json`);
  const wrapper = { schema_version: 'soulforge.linear_collect.custody_object.v1', kind: 'issues', object_id: ISSUE,
    content_sha256: envelope.issue_content_sha256, object: issue };
  const stateFile = path.join(stateRoot, 'state/linear-collect.json'), receiptFile = path.join(stateRoot, 'receipts/run-synthetic.json');
  await save(stateFile, state); await save(receiptFile, receipt); await save(rawFile, wrapper);
  await fs.writeFile(rawFile, canonicalBytes(wrapper));
  await save(path.join(root, 'read_evidence', ISSUE, `${digest.slice(7)}.json`), {
    schema_version: wrapper.schema_version, kind: 'read_evidence', object_id: ISSUE, content_sha256: digest, object: envelope });
  const proof = { principal_ref: 'leader:G2', purpose: 'SOURCE', project_ref: 'project:SYN', assignment_ref: 'assignment:synthetic',
    assignment_epoch: 1, task_ref: 'linear.task:syn-1', policy_epoch: 1, route_sha256: 'a'.repeat(64), audience: 'local:G2',
    issuer_key_id: 'issuer:synthetic', expires_at: NOW + 60000 };
  let entryCount = 0;
  const authority = { entry() { entryCount++; return structuredClone(proof); }, authorize() { return structuredClone(proof); } };
  const options = { expectedBinding, authority, producerRef: 'leader:G2', now: () => NOW };
  const selection = { issue_id: ISSUE, issue_content_sha256: envelope.issue_content_sha256, scope_ref: 'project:SYN', generation_seq: 2 };
  return { temp, root, rawFile, wrapper, state, stateFile, receipt, receiptFile, proof, authority, options, selection,
    entryCount: () => entryCount, reader: createG2LinearCustodyReader(options) };
}

test('positive: exact committed custody reaches only the synthetic SOURCE controller; replay is stable', async t => {
  const f = await fixture(t), before = await fs.readFile(f.rawFile);
  for (let count = 0; count < 2; count++) {
    const value = await f.reader.read(f.selection);
    assert.deepEqual(value.bytes, before);
    assert.equal(value.producer_ref, 'leader:G2');
    assert.equal(value.execution_authority, false);
    value.bytes.fill(0);
  }
  assert.equal((await f.reader.current(f.selection)).status, 'CURRENT');
  assert.equal(f.entryCount(), 6);
});

for (const [name, change] of [
  ['wrong issue', s => { s.issue_id = OTHER; }], ['path issue', s => { s.issue_id = '../issues'; }],
  ['wrong source hash', s => { s.issue_content_sha256 = SHA; }], ['wrong scope', s => { s.scope_ref = 'project:OTHER'; }],
  ['old generation', s => { s.generation_seq = 1; }], ['future generation', s => { s.generation_seq = 3; }],
  ['model self-asserted release', s => { s.content_class = 'public_safe_code'; }],
  ['path widening', s => { s.allowed_write_paths = ['**']; }], ['check widening', s => { s.acceptance_checks = ['anything']; }],
]) test(`selection rejects ${name} before custody open`, async t => {
  const f = await fixture(t); change(f.selection);
  await fs.writeFile(f.rawFile, 'invalid raw bytes must not be parsed');
  await assert.rejects(f.reader.read(f.selection), error => !['G2_CUSTODY_OBJECT_HOLD', 'G2_CUSTODY_OBJECT_MISMATCH'].includes(error.g2Code));
});

for (const [name, change] of [
  ['G1 identity', p => { p.purpose = 'G3_PROVIDER'; }], ['foreign producer', p => { p.principal_ref = 'leader:G1'; }],
  ['wrong project', p => { p.project_ref = 'project:OTHER'; }], ['wrong task', p => { p.task_ref = 'linear.task:syn-2'; }],
  ['expired identity', p => { p.expires_at = NOW; }],
]) test(`authority rejects ${name}`, async t => {
  const f = await fixture(t); change(f.proof);
  await assert.rejects(f.reader.read(f.selection));
  assert.equal((await f.reader.current(f.selection)).status, 'HOLD');
});

test('revocation during read refuses already read bytes', async t => {
  const f = await fixture(t);
  f.authority.entry = () => { f.proof.expires_at--; return structuredClone(f.proof); };
  await assert.rejects(f.reader.read(f.selection), /G2_CUSTODY_READ_CHANGED/);
});
test('authority revoked before read is not a public-safe claim', async t => {
  const f = await fixture(t); f.authority.entry = () => { throw new Error('revoked'); };
  await assert.rejects(f.reader.read(f.selection), /revoked/);
});
test('source amendment, uncommitted generation and stale collection reject an old selection', async t => {
  const f = await fixture(t);
  f.state.object_index[`issues:${ISSUE}`].content_sha256 = SHA;
  await save(f.stateFile, f.state);
  await assert.rejects(f.reader.read(f.selection));
  f.state.cursor.generation_seq++;
  await save(f.stateFile, f.state);
  await assert.rejects(f.reader.read(f.selection));
});
test('fresh controller cannot read stale collection evidence', async t => {
  const f = await fixture(t); f.proof.expires_at = NOW + 1200000;
  const stale = createG2LinearCustodyReader({ ...f.options, now: () => NOW + 600000 });
  await assert.rejects(stale.read(f.selection), /LINEAR_EVIDENCE_STALE/);
});
test('partial failed collection never yields bytes', async t => {
  const f = await fixture(t); f.receipt.status = 'failed';
  await save(f.receiptFile, f.receipt);
  await assert.rejects(f.reader.read(f.selection));
});
test('digest, wrapper kind, source ID and hardlink violations reject custody', async t => {
  const f = await fixture(t);
  for (const change of [w => { w.object.description = 'tampered'; }, w => { w.kind = 'comments'; }, w => { w.object.id = OTHER; }]) {
    const copy = structuredClone(f.wrapper); change(copy); await save(f.rawFile, copy);
    await assert.rejects(f.reader.read(f.selection), /G2_CUSTODY_OBJECT_MISMATCH/);
  }
  await save(f.rawFile, f.wrapper);
  await fs.link(f.rawFile, path.join(f.temp, 'linked.json'));
  await assert.rejects(f.reader.read(f.selection), /FEEDBACK_RUNTIME_PATH_UNSAFE/);
});
test('duplicate JSON keys and noncanonical trailing bytes cannot smuggle uncommitted content', async t => {
  const f = await fixture(t), canonical = canonicalBytes(f.wrapper);
  const duplicate = canonical.toString().replace('"object":', '"object":"SYNTHETIC_UNCOMMITTED_SENTINEL","object":');
  for (const raw of [duplicate, `${canonical.toString()} \n`, JSON.stringify(f.wrapper)]) {
    await fs.writeFile(f.rawFile, raw);
    await assert.rejects(f.reader.read(f.selection), /G2_CUSTODY_OBJECT_MISMATCH/);
  }
});
test('uninstalled executable rejects configuration flags with no raw output or publication', () => {
  const cli = fileURLToPath(new URL('../g2_linear_custody_cli.mjs', import.meta.url));
  for (const argv of [['inspect'], ['inspect', '--config', 'untrusted.json'], ['publish']]) {
    const result = spawnSync(process.execPath, [cli, ...argv], { encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 2);
    assert.deepEqual(JSON.parse(result.stdout), { ok: false, code: 'G2_CUSTODY_HOLD', publication: 'G2_FEEDBACK_MAPPING_UNBOUND' });
  }
});

test('real authority consumer plus real metadata/custody reader; OS observations remain synthetic', async t => {
  const f = await fixture(t), owner = 'S-1-5-21-111-222-333-1001';
  const hash = value => createHash('sha256').update(value).digest('hex');
  const policyPath = path.join(f.temp, 'policy.json'), keyPath = path.join(f.temp, 'synthetic-public-material');
  await fs.writeFile(keyPath, 'synthetic public verification material');
  const roles = Object.fromEntries([
    ['controller', 1002, 'leader:G2', 'SOURCE', ['jobs.advance']],
    ['sender', 1003, 'sender:synthetic', 'G3_PROVIDER', ['model.dispatch']],
    ['worker', 1004, 'worker:synthetic', 'G3_PROVIDER', []],
    ['reviewer', 1005, 'reviewer:synthetic', 'KEY_SERVICE', ['release.issue', 'release.review']],
  ].map(([name, suffix, principal_ref, purpose, capabilities]) => [name,
    { sid: `S-1-5-21-111-222-333-${suffix}`, principal_ref, purpose, capabilities }]));
  const policy = { epoch: 1, expires_at: NOW + 60000, revoked: false, roles,
    issuer_key_id: 'trust.synthetic', public_key_sha256: hash('synthetic public verification material'),
    context: Object.fromEntries(['project_ref', 'assignment_ref', 'assignment_epoch', 'task_ref', 'route_sha256', 'audience'].map(k => [k, f.proof[k]])),
    worker_registration: { task_path: '\\SyntheticWorker', xml_sha256: 'b'.repeat(64) } };
  const raw = JSON.stringify(policy); await fs.writeFile(policyPath, raw);
  let sid = roles.controller.sid;
  const runtime = { config: { execution_authority: { policy_path: policyPath, policy_sha256: hash(raw) }, permit_trust_pubkey_path: keyPath },
    binding: { trust_owner_sid: owner }, recheck() {},
    observeSecurity(paths) { return { sid, groups: [], privileges: [], elevated: false,
      paths: paths.map(p => ({ path: p, owner_sid: owner, reparse: false,
        allow: [{ sid: owner, rights: 2032127 }, { sid, rights: 1179785 }] })) }; } };
  const reader = createG2LinearCustodyReader({ ...f.options, authority: loadExecutionAuthority(runtime, { now: () => NOW }) });
  const value = await reader.read(f.selection); assert.deepEqual(value.bytes, await fs.readFile(f.rawFile)); value.bytes.fill(0);
  sid = roles.worker.sid;
  await assert.rejects(reader.read(f.selection), /SECURE_WORK_ROLE_HOLD/);
  sid = roles.controller.sid;
  policy.revoked = true; const revoked = JSON.stringify(policy); await fs.writeFile(policyPath, revoked);
  runtime.config.execution_authority.policy_sha256 = hash(revoked);
  await assert.rejects(reader.read(f.selection), /SECURE_WORK_ROLE_HOLD/);
});

test('installed sfx branch runs the actual reader through verified copied closure; wrong argv never spawns', async t => {
  const f = await fixture(t), install = path.join(f.temp, 'install'), machine = path.join(f.temp, 'runtime'), kit = path.join(f.temp, 'kit');
  const sourceRoot = fileURLToPath(new URL('../../../', import.meta.url));
  const hash = value => createHash('sha256').update(value).digest('hex');
  const put = async (file, value) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, value); return file; };
  const copied = new Set();
  async function copyModule(relative) {
    if (copied.has(relative)) return; copied.add(relative);
    const text = await fs.readFile(path.join(sourceRoot, relative), 'utf8');
    await put(path.join(install, relative), text);
    for (const match of text.matchAll(/(?:from\s*|import\s*\()\s*['"](\.[^'"]+)['"]/gu)) {
      const target = path.normalize(path.join(path.dirname(relative), match[1]));
      if (target.endsWith('.mjs')) await copyModule(target);
    }
  }
  for (const file of ['sfx.mjs', 'execution_authority.mjs', 'g2_linear_custody_reader.mjs', 'g2_linear_custody_cli.mjs'])
    await copyModule(`guild_hall/secure_work/${file}`);
  const lane = path.join(install, 'guild_hall/secure_work'), launcher = path.join(lane, 'sfx.mjs');
  await put(path.join(lane, 'src/soulforge_secure_work/launch_runtime.py'), '# synthetic; never executed');
  await put(path.join(lane, 'src/soulforge_secure_work/cli.py'), '# synthetic; never executed');
  await put(path.join(install, 'ui-workspace/apps/dev-erp-mcp/src/ingress_client.mjs'), '// synthetic; never imported');
  const python = await put(path.join(machine, 'python.exe'), 'synthetic; never executed');
  const node = await put(path.join(machine, 'node.exe'), 'synthetic; never executed');
  const observer = await put(path.join(machine, 'Windows/System32/WindowsPowerShell/v1.0/powershell.exe'), 'synthetic; never executed');
  const stdlib = path.join(machine, 'Lib'); await put(path.join(stdlib, 'encodings/__init__.py'), '# synthetic');
  await put(path.join(kit, 'src/sf_sewe/models.py'), '# synthetic; never imported');
  const recipes = path.join(kit, 'recipes'); await put(path.join(recipes, 'synthetic.json'), '{}');
  const pythonPaths = [stdlib, path.join(lane, 'src'), path.join(kit, 'src')];
  const startup = await put(path.join(machine, 'python._pth'), pythonPaths.join('\n') + '\n');
  const pin = file => ({ path: file, sha256: hash(readFileSync(file)) });
  const owner = 'S-1-5-21-111-222-333-1001', controller = 'S-1-5-21-111-222-333-1002';
  const publicKey = await put(path.join(f.temp, 'synthetic-public-material'), 'synthetic public data');
  const roles = Object.fromEntries([
    ['controller', controller, 'leader:G2', 'SOURCE', ['jobs.advance']],
    ['sender', 'S-1-5-21-111-222-333-1003', 'sender:synthetic', 'G3_PROVIDER', ['model.dispatch']],
    ['worker', 'S-1-5-21-111-222-333-1004', 'worker:synthetic', 'G3_PROVIDER', []],
    ['reviewer', 'S-1-5-21-111-222-333-1005', 'reviewer:synthetic', 'KEY_SERVICE', ['release.issue', 'release.review']],
  ].map(([name, sid, principal_ref, purpose, capabilities]) => [name, { sid, principal_ref, purpose, capabilities }]));
  const policyPath = await put(path.join(f.temp, 'execution-policy.json'), JSON.stringify({ epoch: 1,
    expires_at: Date.now() + 300000, revoked: false, issuer_key_id: 'trust.synthetic', public_key_sha256: pin(publicKey).sha256, roles,
    context: Object.fromEntries(['project_ref', 'assignment_ref', 'assignment_epoch', 'task_ref', 'route_sha256', 'audience'].map(k => [k, f.proof[k]])),
    worker_registration: { task_path: '\\SyntheticWorker', xml_sha256: 'a'.repeat(64) } }));
  const selectionPath = await put(path.join(f.temp, 'selection.json'), JSON.stringify(f.selection));
  const configPath = await put(path.join(f.temp, 'config.json'), JSON.stringify({ schema: 'soulforge.secure_work.config.v0',
    kit_root: kit, recipe_root: recipes, pilot_root: path.join(f.temp, 'working'), status_path: path.join(f.temp, 'status.json'),
    runtime: { python_executable: python }, permit_trust_pubkey_path: publicKey,
    execution_authority: { policy_path: policyPath, policy_sha256: pin(policyPath).sha256 },
    g2_linear_custody: { expectedBinding: f.options.expectedBinding, producerRef: 'leader:G2', maxAgeMs: 300000,
      maximumBytes: 1048576, selection: pin(selectionPath) } }));
  const bindingPath = path.join(lane, 'custody_runtime_binding.json');
  async function members(root) {
    const values = [];
    for (const file of await fs.readdir(root, { recursive: true, withFileTypes: true })) {
      const absolute = path.join(file.parentPath, file.name);
      if (!file.isFile() || absolute === launcher || absolute === bindingPath) continue;
      values.push({ relative_path: path.relative(root, absolute).split(path.sep).join('/'), sha256: pin(absolute).sha256 });
    }
    return values;
  }
  const binding = { config_path: configPath, config_sha256: pin(configPath).sha256, trust_owner_sid: owner,
    node_executable: pin(node), os_observer: pin(observer), launch: {
      roots: await Promise.all([install, machine, kit].map(async p => ({ path: p, files: await members(p) }))),
      python_executable: python, python_startup: startup, python_paths: pythonPaths, kit_root: kit, recipe_root: recipes } };
  await put(bindingPath, JSON.stringify(binding));
  const anchor = { install_root: install, trust_owner_sid: owner, binding_sha256: pin(bindingPath).sha256,
    node_executable: pin(node), os_observer: pin(observer), role: { name: 'controller', sid: controller } };
  const observe = paths => ({ sid: controller, groups: [], privileges: [], elevated: false,
    paths: paths.map(p => ({ path: p, owner_sid: owner, reparse: false,
      allow: [{ sid: owner, rights: 2032127 }, { sid: controller, rights: 1179785 }] })) });
  const runtime = verifyInstallation(anchor, { observe, launcherPath: launcher, executablePath: node });
  let spawned = false;
  const run = argv => executeVerified(runtime, argv, { spawn() { spawned = true; throw new Error('unexpected spawn'); } });
  assert.deepEqual(await run(['--g2-custody-inspect']), { ok: true, code: 'G2_CUSTODY_EXACT_CURRENT',
    issue_content_sha256: f.selection.issue_content_sha256, generation_seq: 2, execution_authority: false,
    publication: 'G2_FEEDBACK_MAPPING_UNBOUND' });
  for (const argv of [['--g2-custody-inspect', 'extra'], ['--g2-custody-inspect=anything'], ['doctor', '--g2-custody-other']])
    await assert.rejects(run(argv));
  assert.equal(spawned, false);
  await fs.appendFile(path.join(lane, 'g2_linear_custody_reader.mjs'), '\n// tampered');
  await assert.rejects(run(['--g2-custody-inspect']));
});
