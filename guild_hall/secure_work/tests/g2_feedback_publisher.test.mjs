import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { validateAuthenticatedCurrentnessMetadata } from '../g2_feedback_publisher.mjs';
import { verifyInstallation, executeVerified, guardNodeImports } from '../sfx.mjs';
import { createFeedbackRuntimeIssuer } from '../../dev_worker/feedback_runtime_source.mjs';
import { sha256Canonical } from '../../shared/project_history_envelope.mjs';
import { identityDigestForBinding, readEvidenceRecordForIssue } from '../../linear_history/linear_collect_runner.mjs';
import { canonicalBytes } from '../../linear_history/linear_custody.mjs';
import { runReceiptObjectKinds } from '../../linear_history/linear_collect_receipt.mjs';
import { computeUnverifiedAgentApprovalClaimDigest, AGENT_AUTHORITY_TRUSTED_PIN_SCHEMA, AGENT_AUTHORITY_CURRENT_STATE_SCHEMA } from '../../agent_observation/agent_authority_verification.mjs';
import { readOperationsForReceiptVersion } from '../../linear_history/linear_graphql_client.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const KIT = process.env.SOULFORGE_SECURE_WORK_KIT_ROOT;
const PYTHON = process.env.SOULFORGE_FEEDBACK_TEST_PYTHON;
const PYTHON_BASE = process.env.SOULFORGE_FEEDBACK_TEST_PYTHON_BASE;
const SITE = process.env.SOULFORGE_FEEDBACK_TEST_SITE_PACKAGES;
const bound = [KIT, PYTHON, PYTHON_BASE, SITE].every(p => p && path.isAbsolute(p));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const pin = p => ({ path: p, sha256: hash(readFileSync(p)) });
const OWNER = 'S-1-5-21-111-222-333-1001', CONTROLLER = 'S-1-5-21-111-222-333-1002', SENDER = 'S-1-5-21-111-222-333-1003';
const ISSUE = 'f8091a2b-3c4d-4859-aa6b-465768798a9b', SHA = `sha256:${'a'.repeat(64)}`;
const put = async (p, bytes) => { await fs.mkdir(path.dirname(p), { recursive: true }); await fs.writeFile(p, bytes); return p; };
const save = async (p, value) => pin(await put(p, JSON.stringify(value)));

test('authenticated currentness metadata binds challenge, actors, source, index, release and freshness', () => {
  const now=Date.now(), expected={challenge:'a'.repeat(32),publisher_ref:'publisher:G2',producer_ref:'source:G2',scope_ref:'project:SYN',
    issue_id:ISSUE,issue_content_sha256:SHA,body_sha256:'b'.repeat(64),generation:1,review_ref:'review:synthetic',index_sha256:'c'.repeat(64)};
  const response={...expected,observed_at:new Date(now).toISOString(),valid_until:new Date(now+5000).toISOString(),execution_authority:false};
  assert.equal(validateAuthenticatedCurrentnessMetadata(response,expected,{now:()=>now}),true);
  for(const key of Object.keys(expected)) assert.throws(()=>validateAuthenticatedCurrentnessMetadata({...response,[key]:key==='generation'?2:'foreign'},expected,{now:()=>now}));
  assert.throws(()=>validateAuthenticatedCurrentnessMetadata({...response,observed_at:new Date(now-1001).toISOString()},expected,{now:()=>now}));
  assert.throws(()=>validateAuthenticatedCurrentnessMetadata({...response,observed_at:new Date(now+1).toISOString()},expected,{now:()=>now}));
  assert.throws(()=>validateAuthenticatedCurrentnessMetadata({...response,raw:'forbidden'},expected,{now:()=>now}));
});

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'g2-feedback-'));
  if (process.env.SOULFORGE_FEEDBACK_TEST_TRACE === '1') {
    const originalSpawn = childProcess.spawnSync;
    childProcess.spawnSync = (...args) => {
      const result = originalSpawn(...args);
      if (result.status !== 0) t.diagnostic(JSON.stringify({ synthetic_child_status: result.status, stdout: String(result.stdout), stderr: String(result.stderr), error: result.error?.code }));
      return result;
    };
    syncBuiltinESMExports();
    t.after(() => { childProcess.spawnSync = originalSpawn; syncBuiltinESMExports(); });
  }
  t.after(async () => { assert.equal(path.dirname(root), path.resolve(os.tmpdir())); assert.match(path.basename(root), /^g2-feedback-/u); await fs.rm(root, { recursive: true, force: true }); });
  const machine = path.join(root, 'runtime'), kit = path.join(root, 'kit');
  const copyFilter = p => !p.split(path.sep).some(v => ['__pycache__', 'test', 'tests'].includes(v));
  for (const name of ['python.exe', 'python314.dll', 'python3.dll', 'vcruntime140.dll', 'vcruntime140_1.dll'])
    await put(path.join(machine, name), await fs.readFile(path.join(PYTHON_BASE, name)));
  // Build a small DECLARED synthetic stdlib root from real imported modules.
  // Every file in that root is still fully pinned on every production recheck;
  // missing dynamic imports HOLD instead of falling back to the host Python.
  const trace = `import sys,json,pathlib,subprocess,traceback,sqlite3\nsys.path.extend(sys.argv[1:4])\nfrom soulforge_secure_work import launch_runtime,authority,g2_feedback_adapter\nfrom sf_sewe import codec,models,journal\ng2_feedback_adapter.api()\ncodec.utc_seconds('2026-09-08T00:00:00Z')\ntry: codec.decode(models.WorkPacket,b'{}')\nexcept ValueError: pass\nprint(json.dumps(sorted({str(pathlib.Path(m.__file__).resolve()) for m in tuple(sys.modules.values()) if getattr(m,'__file__',None) and not m.__file__.startswith('<')})))`;
  const imported = JSON.parse(execFileSync(PYTHON, ['-I','-S','-B','-c',trace,SITE,path.join(ROOT,'guild_hall/secure_work/src'),path.join(KIT,'src')], {encoding:'utf8',windowsHide:true}));
  for (const file of imported) {
    const relative = path.relative(path.join(PYTHON_BASE,'Lib'),file);
    if (!relative.startsWith('..') && !path.isAbsolute(relative)) await put(path.join(machine,'Lib',relative),await fs.readFile(file));
  }
  await fs.cp(path.join(PYTHON_BASE,'Lib/encodings'),path.join(machine,'Lib/encodings'),{recursive:true,filter:copyFilter});
  await fs.cp(path.join(PYTHON_BASE, 'DLLs'), path.join(machine, 'DLLs'), { recursive: true, filter: copyFilter });
  const packages = path.join(machine, 'packages'); await fs.mkdir(packages, { recursive: true });
  for (const name of ['pydantic', 'pydantic_core', 'annotated_types', 'typing_inspection', 'typing_extensions.py', 'cryptography', 'cffi', '_cffi_backend.cp314-win_amd64.pyd', 'pycparser'])
    await fs.cp(path.join(SITE, name), path.join(packages, name), { recursive: true, filter: p => !p.includes('__pycache__') });
  await fs.cp(path.join(KIT, 'src'), path.join(kit, 'src'), { recursive: true, filter: p => !p.includes('__pycache__') });
  const recipes = path.join(kit, 'recipes'); await save(path.join(recipes, 'synthetic.json'), {});
  const node = await put(path.join(machine, 'node.exe'), await fs.readFile(process.execPath));
  // Pin the real OS component path so the clean inherited SYSTEMROOT remains
  // valid for Windows CSPRNG. Observation itself is still synthetic below.
  const observer = path.join(process.env.SYSTEMROOT, 'System32/WindowsPowerShell/v1.0/powershell.exe');
  // Long-lived synthetic pins accommodate whole portable-runtime IO. They are
  // test inputs, not the live lane's default permit TTL or an operating grant.
  const now = Date.now(), from = new Date(now - 60000).toISOString(), until = new Date(now + 3600000).toISOString();
  const stamp = seconds => new Date(Math.floor(now / 1000) * 1000 + seconds * 1000).toISOString().replace('.000Z', 'Z');
  const profile = { codec_id: 'feedback.exact.v1', version: '0.1.0', job_id: 'o_'+'1'.repeat(32), mission_id: 'o_'+'2'.repeat(32), round: 0,
    review_ref: 'review:synthetic', producer_ref: 'leader:G2', publisher_ref: 'sender:synthetic', projection_ref: 'projection:synthetic',
    scope_ref: 'project:SYN', kind: 'improvement', allowed_write_paths: ['src/value.mjs'], acceptance_checks: ['check.answer'],
    valid_from: stamp(-10), valid_until: stamp(1800), generation: 1, field_review_ref: 'review:field', audience: 'feedback:synthetic', qualification_ref: 'qualification:synthetic',
    receiver_sha256:'0'.repeat(64), control_root_sha256:hash(Buffer.from(path.join(root,'control'))) };
  const route = { profile_id: 'feedback.synthetic', revision: '0.1.0', model_id: 'receiver.synthetic', codec_id: profile.codec_id,
    transport_id: profile.audience, max_request_bytes: 1048576, max_response_bytes: 1048576, deadline_ms: 30000,
    streaming: false, redirects: false, auto_retry: false, data_class: 'RELEASED', live_enabled: false };
  const grant = { grant_ref: 'grant:standing-feedback', authority_ref: 'authority:synthetic', authority_revision: 'authority:1', scope_ref: 'project:SYN',
    project_code: 'SYN', issuer_ref: 'issuer:synthetic', selection_authority: 'internal_feedback_source', actions: ['issue_request', 'observe', 'prepare'],
    allowed_kinds: ['improvement'], allowed_states: ['Todo'], allowed_write_paths: profile.allowed_write_paths, acceptance_checks: profile.acceptance_checks,
    valid_from: from, valid_until: until, agent_group: 'G1', input_class: 'g2_public_code_projection', g2_leader_ref: profile.producer_ref, maximum_issues: 16 };
  const bindingFields = { lineage_digest: SHA, family_ref: 'family:G1', family_digest: SHA, mark_ref: 'mark:G1', mark_digest: SHA,
    deployment_ref: 'deployment:G1', deployment_digest: SHA, memory_generation_ref: 'memory:G1', memory_digest: SHA };
  const claim = { project_scope_ref: 'project:SYN', project_scope_refs: ['project:SYN'], ...bindingFields,
    authority_receipt_ref: 'approval:synthetic', authority_receipt_verified: false };
  const trust = { schema_version: AGENT_AUTHORITY_TRUSTED_PIN_SCHEMA, pin_ref: 'pin:synthetic', verification_receipt_ref: 'verification:synthetic',
    owner_ref: 'owner:synthetic', authority_ref: grant.authority_ref, verifier_ref: 'verifier:synthetic', project_scope_ref: 'project:SYN', ...bindingFields,
    approval_claim_digest: computeUnverifiedAgentApprovalClaimDigest(claim, 'project:SYN').claim_digest, authority_receipt_ref: claim.authority_receipt_ref,
    authority_receipt_digest: SHA, claim_ceiling: 'validated_private', issued_at: from, verified_at: from, expires_at: until,
    receipt_epoch: 1, trusted_authority_epoch: 1, revoked: false };
  const current = { schema_version: AGENT_AUTHORITY_CURRENT_STATE_SCHEMA, evaluation_ref: 'evaluation:current', evaluated_at: new Date(now).toISOString(),
    authority_ref: trust.authority_ref, current_authority_epoch: 1, revoked_pin_refs: [], claim_ceiling: 'validated_private' };
  const workforce = { claim: await save(path.join(root, 'claim.json'), claim), pin: await save(path.join(root, 'trust.json'), trust),
    current: await save(path.join(root, 'workforce.json'), current) };
  const custody = path.join(root, 'custody'), stateRoot = path.join(root, 'linear-state'), projections = path.join(root, 'projections'), control = path.join(root, 'control'), prepared = path.join(root, 'prepared');
  for (const p of [projections, control, prepared]) await fs.mkdir(p);
  const binding = { lane_id: 'synthetic-linear', writer: { authority_id: 'synthetic-writer', epoch: 1 },
    workspace: { url_key: 'synthetic-forge', project_scope_map: [{ linear_project_id: 'project-1', project_scope_ref: 'project:SYN' }] } };
  const pins = { custody_root: custody, state_root: stateRoot, lane_id: binding.lane_id, identity_digest: identityDigestForBinding(binding),
    writer_authority_id: binding.writer.authority_id, writer_epoch: 1, binding_sha256: SHA, workspace_url_key: 'synthetic-forge',
    organization_id: 'a8091a2b-3c4d-4859-aa6b-465768798a9b', project_scope_ref: 'project:SYN', project_code: 'SYN' };
  const issue = { id: ISSUE, identifier: 'SYN-1', description: 'Set the public fixture answer to 2.', updated_at: new Date(now - 2000).toISOString(), state_name: 'Todo', project_id: 'project-1' };
  const envelope = readEvidenceRecordForIssue(binding, issue).envelope, content = sha256Canonical(envelope);
  const wrapper = await put(path.join(custody, 'issues', ISSUE, `${envelope.issue_content_sha256.slice(7)}.json`), canonicalBytes({ schema_version: 'soulforge.linear_collect.custody_object.v1', kind: 'issues', object_id: ISSUE, content_sha256: envelope.issue_content_sha256, object: issue }));
  await save(path.join(custody, 'read_evidence', ISSUE, `${content.slice(7)}.json`), { schema_version: 'soulforge.linear_collect.custody_object.v1', kind: 'read_evidence', object_id: ISSUE, content_sha256: content, object: envelope });
  const selection = { issue_id: ISSUE, issue_content_sha256: envelope.issue_content_sha256, scope_ref: 'project:SYN', generation_seq: 1 };
  const completed = new Date(now).toISOString(), cursor = { schema_version: 'soulforge.linear_collect.cursor.v1', watermark: completed, backfill: null, generation_seq: 1 };
  const state = { schema_version: 'soulforge.linear_collect.state.v1', lane_id: binding.lane_id, identity_digest: pins.identity_digest, writer_authority_id: pins.writer_authority_id, writer_epoch: 1, cursor,
    object_index: { [`issues:${ISSUE}`]: { content_sha256: envelope.issue_content_sha256, updated_at: issue.updated_at }, [`read_evidence:${ISSUE}`]: { content_sha256: content, updated_at: issue.updated_at } }, last_run_id: 'run-1', last_completed_at: completed };
  await save(path.join(stateRoot, 'state/linear-collect.json'), state);
  await save(path.join(stateRoot, 'receipts/run-1.json'), { schema_version: 'soulforge.linear_collect.run_receipt.v1', lane_id: binding.lane_id, run_id: 'run-1', generation_seq: 1,
    mode: 'apply', status: 'ok', writer_authority_id: pins.writer_authority_id, writer_epoch: 1, binding_sha256: SHA, workspace_url_key: pins.workspace_url_key,
    organization_id: pins.organization_id, started_at: completed, completed_at: completed, duration_ms: 0, window: { lower: from, upper: completed, phase: 'delta', order_observed: 'ascending' },
    cursor_before: { ...cursor, generation_seq: 0 }, cursor_after: cursor, read_calls: { total: 0, by_operation: Object.fromEntries(readOperationsForReceiptVersion('soulforge.linear_collect.run_receipt.v1').map(k => [k, 0])) },
    objects: Object.fromEntries(runReceiptObjectKinds('soulforge.linear_collect.run_receipt.v1').map(k => [k, { observed: 0, created: 0, unchanged: 0 }])), custody_manifest_digest: SHA,
    coverage_gaps: ['polling_cannot_prove_hard_deletes'], error_codes: [], repository_writes: 0, private_writes: 3, network_used: false });
  let profilePin = await save(path.join(root, 'profile.json'), profile);
  const grantPin = await save(path.join(root, 'grant.json'), grant), routePin = await save(path.join(root, 'route.json'), route);
  const linear = { expectedBinding: pins, maxAgeMs: 3600000 };
  const receiver = { g2LeaderRef: profile.producer_ref, projectionRoot: projections, grant: grantPin, workforce, authorityMaxAgeMs: 3600000, linear,
    runner: { allowedFiles: profile.allowed_write_paths, validationCatalog: [{ check_id: 'check.answer' }] } };
  const receiverPin = await save(path.join(root, 'receiver.json'), receiver);
  profile.receiver_sha256=receiverPin.sha256; profilePin=await save(profilePin.path,profile);
  const identity = { project_ref: 'project:SYN', assignment_ref: 'assignment:synthetic', assignment_epoch: 1, task_ref: 'linear.task:syn-1', policy_epoch: 1, audience: profile.audience };
  const fixtureInput = path.join(root, 'fixture-input.json');
  const fixtureRequest = { synthetic: true, root, wrapper, selection, identity, profile, route, permit_from: stamp(-10), permit_until: stamp(2400) };
  const fixtureScript = path.join(ROOT, 'guild_hall/secure_work/tests/g2_feedback_fixture.py');
  async function runFixture(stage) {
    await save(fixtureInput, fixtureRequest);
    return JSON.parse(execFileSync(PYTHON, ['-B', fixtureScript, stage, KIT, fixtureInput], { encoding: 'utf8', windowsHide: true, timeout: 30000 }));
  }
  const issued = await runFixture('field'); Object.assign(identity, issued); fixtureRequest.issuer_key_id = issued.issuer_key_id;
  const roles = { controller: { sid: CONTROLLER, principal_ref: 'leader:G2', purpose: 'SOURCE', capabilities: ['jobs.advance'] },
    sender: { sid: SENDER, principal_ref: 'sender:synthetic', purpose: 'G3_PROVIDER', capabilities: ['model.dispatch'] },
    worker: { sid: 'S-1-5-21-111-222-333-1004', principal_ref: 'worker:synthetic', purpose: 'G3_PROVIDER', capabilities: [] },
    reviewer: { sid: 'S-1-5-21-111-222-333-1005', principal_ref: 'reviewer:synthetic', purpose: 'KEY_SERVICE', capabilities: ['release.issue', 'release.review'] } };
  const policy = { epoch: 1, expires_at: now + 3600000, revoked: false, roles, issuer_key_id: issued.issuer_key_id, public_key_sha256: pin(path.join(root, 'verification.pub')).sha256,
    context: { ...Object.fromEntries(['project_ref','assignment_ref','assignment_epoch','task_ref','audience'].map(k=>[k,identity[k]])), route_sha256: issued.route_sha256 },
    worker_registration: { task_path: '\\SyntheticWorker', xml_sha256: 'a'.repeat(64) } };
  const policyPin = await save(path.join(root, 'policy.json'), policy);
  const common = { profile: profilePin, grant: grantPin, route: routePin, field_ledger: pin(path.join(root, 'field-ledger.json')), linear, workforce,
    authorityMaxAgeMs: 3600000, receiver: { deployment: receiverPin, qualification_ref: profile.qualification_ref } };
  async function install(role, extra) {
    const install = path.join(root, role), lane = path.join(install, 'guild_hall/secure_work'), launcher = path.join(lane, 'sfx.mjs');
    const copied = new Set();
    async function copyModule(relative) {
      relative = path.normalize(relative); if (copied.has(relative)) return; copied.add(relative);
      const text = await fs.readFile(path.join(ROOT, relative), 'utf8'); await put(path.join(install, relative), text);
      for (const match of text.matchAll(/(?:from\s*|import\s*\()\s*['"](\.[^'"]+)['"]/gu)) {
        const target = path.normalize(path.join(path.dirname(relative), match[1])); if (target.endsWith('.mjs')) await copyModule(target);
      }
    }
    for (const name of ['sfx.mjs', 'execution_authority.mjs', 'g2_feedback_publisher.mjs']) await copyModule(`guild_hall/secure_work/${name}`);
    await fs.cp(path.join(ROOT, 'node_modules/yaml'), path.join(install, 'node_modules/yaml'), { recursive: true, dereference: true });
    await fs.cp(path.join(ROOT, 'guild_hall/secure_work/src'), path.join(lane, 'src'), { recursive: true, filter: p => !p.includes('__pycache__') });
    if (process.env.SOULFORGE_FEEDBACK_TEST_TRACE === '1') {
      const debugPath=path.join(lane,'src/soulforge_secure_work/launch_runtime.py');
      await put(debugPath,(await fs.readFile(debugPath,'utf8')).replace('except (RuntimeError, OSError, ValueError, ImportError):',
        'except (RuntimeError, OSError, ValueError, ImportError):\n        import traceback; traceback.print_exc()')
        .replace("if result.returncode or result.stdout.strip() != b'{\"ok\":true,\"code\":\"SECURE_WORK_LAUNCH_VERIFIED\"}':",
        "if result.returncode or result.stdout.strip() != b'{\"ok\":true,\"code\":\"SECURE_WORK_LAUNCH_VERIFIED\"}':\n        print(repr(result.stdout),repr(result.stderr),file=sys.stderr)"));
    }
    await put(path.join(install, 'ui-workspace/apps/dev-erp-mcp/src/ingress_client.mjs'), '// unused synthetic ingress');
    const pythonRoot = path.join(root, `${role}-python`); await fs.mkdir(pythonRoot);
    // Separate startup directories avoid changing a previously sealed role's _pth.
    for (const name of ['python.exe','python314.dll','python3.dll','vcruntime140.dll','vcruntime140_1.dll']) await put(path.join(pythonRoot,name),await fs.readFile(path.join(machine,name)));
    await fs.cp(path.join(machine,'Lib'),path.join(pythonRoot,'Lib'),{recursive:true});
    await fs.cp(path.join(machine,'DLLs'),path.join(pythonRoot,'DLLs'),{recursive:true});
    const pythonPaths = [path.join(pythonRoot, 'Lib'), path.join(pythonRoot, 'DLLs'), packages, path.join(lane, 'src'), path.join(kit, 'src')];
    const python = path.join(pythonRoot, 'python.exe'), startup = await put(path.join(pythonRoot, 'python._pth'), pythonPaths.join('\n')+'\n');
    const config = { schema: 'soulforge.secure_work.config.v0', runtime: { python_executable: python }, kit_root: kit, recipe_root: recipes,
      execution_authority: { policy_path: policyPin.path, policy_sha256: policyPin.sha256 }, g2_feedback: { ...common, role, ...extra },
      ...(role === 'controller' ? { permit_trust_pubkey_path: path.join(root, 'verification.pub') } : {}) };
    const configPin = await save(path.join(root, `${role}-config.json`), config), bindingPath = path.join(lane, 'custody_runtime_binding.json');
    async function members(p) {
      const values = [];
      for (const entry of await fs.readdir(p, { recursive: true, withFileTypes: true })) {
        const full = path.join(entry.parentPath, entry.name); if (!entry.isFile() || full === launcher || full === bindingPath) continue;
        values.push({ relative_path: path.relative(p, full).split(path.sep).join('/'), sha256: pin(full).sha256 });
      }
      return values;
    }
    const roots = [install, machine, pythonRoot, kit];
    const binding = { config_path: configPin.path, config_sha256: configPin.sha256, trust_owner_sid: OWNER, node_executable: pin(node), os_observer: pin(observer),
      launch: { roots: await Promise.all(roots.map(async p=>({path:p,files:await members(p)}))), python_executable: python, python_startup: startup, python_paths: pythonPaths, kit_root:kit, recipe_root:recipes } };
    await save(bindingPath, binding);
    const anchor = { install_root: install, trust_owner_sid: OWNER, binding_sha256: pin(bindingPath).sha256, node_executable: pin(node), os_observer: pin(observer), role: { name:role, sid:roles[role].sid } };
    // Synthetic OS observer only; all imported production code and the actual
    // Python/kit bytes remain checked. This is NOT real cross-SID qualification.
    const observerSource = `paths => ({sid:${JSON.stringify(roles[role].sid)},groups:[],privileges:[],elevated:false,paths:paths.map(p=>({path:p,owner_sid:${JSON.stringify(OWNER)},reparse:false,allow:[{sid:${JSON.stringify(OWNER)},rights:2032127},{sid:${JSON.stringify(roles[role].sid)},rights:1179785}]}))})`;
    const original = await fs.readFile(launcher, 'utf8');
    let rewritten = original.replace('const runtime = verifyInstallation(INSTALLATION_ANCHOR);',
      `const runtime = verifyInstallation(${JSON.stringify(anchor)}, {launcherPath:fileURLToPath(import.meta.url),executablePath:${JSON.stringify(node)},observe:${observerSource}});`);
    if(process.env.SOULFORGE_FEEDBACK_TEST_TRACE==='1') rewritten=rewritten.replace('} catch {\n    process.stdout.write(', '} catch (syntheticError) {\n    process.stderr.write(String(syntheticError.stack));\n    process.stdout.write(');
    assert.notEqual(rewritten, original); await put(launcher, rewritten);
    let broadRoot=null;
    const observe = paths => ({ sid:roles[role].sid,groups:[],privileges:[],elevated:false,paths:paths.map(p=>({path:p,owner_sid:OWNER,reparse:false,
      allow:[{sid:OWNER,rights:2032127},{sid:roles[role].sid,rights:1179785},...(p===broadRoot?[{sid:'S-1-1-0',rights:2032127}]:[])]})) });
    return { runtime: verifyInstallation(anchor, { observe, launcherPath:launcher, executablePath:node }), launcher, node, config, configPin, anchor,
      setBroadRoot: value=>{broadRoot=value;} };
  }
  const controller = await install('controller', { selection: await save(path.join(root, 'selection.json'), selection), prepared_root: prepared });
  const start = await executeVerified(controller.runtime, ['--g2-feedback-prepare']);
  assert.equal(start.code, 'G2_FEEDBACK_PREPARED_NOT_RELEASED');
  const manifest = path.join(prepared, start.manifest_file); fixtureRequest.manifest = manifest; await runFixture('review');
  const sender = await install('sender', { prepared_manifest: pin(manifest), review: pin(path.join(root, 'review.json')), permit: pin(path.join(root, 'permit.json')),
    public_key: pin(path.join(root, 'verification.pub')), control_root: control, projection_root: projections });
  return { root, controller, sender, profile, receiver, projections, control, prepared, manifest, stateRoot, selection, policyPin };
}

test('installed SOURCE → actual E14 review/verifier → SENDER exact index → unchanged issuer, with currentness fencing', { skip: !bound }, async t => {
  const f = await fixture(t);
  const hooks=guardNodeImports(f.sender.runtime);
  let createFeedbackAdapter;
  try { ({createFeedbackAdapter}=await import(pathToFileURL(path.join(path.dirname(f.sender.launcher),'g2_feedback_publisher.mjs')))); }
  finally { hooks.deregister(); }
  const publisher = createFeedbackAdapter(f.sender.runtime, 'publish');
  const published = await publisher.publish(); assert.equal(published.code, 'G2_FEEDBACK_PUBLISHED');
  const index = JSON.parse(await fs.readFile(path.join(f.projections, 'current.json')));
  const bytes = await fs.readFile(path.join(f.projections, index.projections[0].file));
  assert.equal(hash(bytes), published.body_sha256);
  const db = new DatabaseSync(':memory:'); t.after(()=>db.close());
  let guarded = 0;
  const issuer = createFeedbackRuntimeIssuer({ db, deployment:f.receiver, evidenceRoot:await fs.mkdir(path.join(f.root,'issued'),{recursive:true}).then(()=>path.join(f.root,'issued')),
    assertDeployment: async () => {
      const challenge=randomBytes(16).toString('hex'), response=await publisher.assertCurrentPublication(challenge); guarded++;
      assert.equal(response.challenge,challenge); assert.equal(response.publisher_ref,'sender:synthetic');
      assert.equal(response.issue_content_sha256,f.selection.issue_content_sha256); assert.equal(response.body_sha256,published.body_sha256);
      assert.equal(response.scope_ref,'project:SYN'); assert.ok(Date.now()-Date.parse(response.observed_at)<1000);
    } });
  const snapshot = await issuer.source.snapshot(); assert.equal(snapshot.status,'CURRENT'); assert.equal(snapshot.items.length,1);
  assert.ok(guarded>0);
  for(const root of [f.control,f.projections]) {
    f.sender.setBroadRoot(root);
    await assert.rejects(publisher.assertCurrentPublication(randomBytes(16).toString('hex')));
  }
  f.sender.setBroadRoot(null);
  const indexPath=path.join(f.projections,'current.json'), receiptPath=path.join(f.control,'current-publication.json');
  const originalIndex=await fs.readFile(indexPath), originalReceipt=await fs.readFile(receiptPath);
  const forgedIndex=JSON.parse(originalIndex); forgedIndex.producer_ref='model:forged'; forgedIndex.projections[0].sha256='d'.repeat(64);
  const forgedBytes=canonicalBytes(forgedIndex), forgedReceipt=JSON.parse(originalReceipt); forgedReceipt.index_sha256=hash(forgedBytes);
  await fs.writeFile(indexPath,forgedBytes); await fs.writeFile(receiptPath,canonicalBytes(forgedReceipt));
  await assert.rejects(publisher.assertCurrentPublication(randomBytes(16).toString('hex')));
  await fs.writeFile(indexPath,originalIndex); await fs.writeFile(receiptPath,originalReceipt);
  const journalPath=path.join(f.control,'attempts.db'), originalJournal=await fs.readFile(journalPath);
  const corrupt=new DatabaseSync(journalPath); corrupt.exec("UPDATE attempts SET state='IN_FLIGHT'"); corrupt.close();
  await assert.rejects(publisher.assertCurrentPublication(randomBytes(16).toString('hex')));
  await fs.writeFile(journalPath,originalJournal); await fs.truncate(journalPath,0);
  await assert.rejects(publisher.assertCurrentPublication(randomBytes(16).toString('hex')));
  await assert.rejects(publisher.publish());
  assert.equal((await fs.stat(journalPath)).size,0);
  await fs.writeFile(journalPath,originalJournal);
  const replay=await publisher.publish(); assert.equal(replay.body_sha256,published.body_sha256);
  const rename=fs.rename;
  fs.rename=async(from,to)=>{if(to===indexPath) throw Object.assign(new Error('synthetic index interruption'),{code:'EIO'});return rename(from,to);};
  syncBuiltinESMExports();
  try { await assert.rejects(publisher.publish()); } finally {fs.rename=rename;syncBuiltinESMExports();}
  await assert.rejects(fs.stat(indexPath),{code:'ENOENT'});
  // The prior completed same-byte publication may be restored idempotently;
  // first-attempt IN_FLIGHT/UNKNOWN recovery is separately refused in Python.
  const restarted=createFeedbackAdapter(f.sender.runtime,'publish');
  assert.equal((await restarted.publish()).body_sha256,published.body_sha256);
  for (const args of [['--g2-feedback-publish','extra'],['--g2-feedback-publish=anything'],['--g2-feedback-other']])
    await assert.rejects(executeVerified(f.sender.runtime,args));
  await assert.rejects(executeVerified(f.sender.runtime,['--g2-feedback-prepare']));
  await assert.rejects(executeVerified(f.controller.runtime,['--g2-feedback-publish']));
  await fs.writeFile(path.join(f.root,'review.json'),'{}');
  await assert.rejects(publisher.assertCurrentPublication(randomBytes(16).toString('hex')));
  await assert.rejects(publisher.publish());
  await assert.rejects(fs.stat(path.join(f.projections,'current.json')), {code:'ENOENT'});
  assert.equal((await issuer.source.snapshot()).status,'HOLD');
});
