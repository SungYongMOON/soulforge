// Test-only whole-runtime inputs: real source-bound gates, synthetic bytes and ACP.
import { promises as fs, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWorkIntakeLinearFixture } from './work_intake_linear_fixture.mjs';
import { workIntakeContextFixture, workIntakeRuleProfileFixture, repinWorkIntakeContextFixture } from './work_intake_context_fixture.mjs';
import { createWorkIntakeLinearReader } from '../../src/work_intake_linear.mjs';
import { workIntakeScopeDigest } from '../../src/work_intake_source.mjs';
import { fixture as acpFixture } from '../../../../../guild_hall/tool_workshop/tests/claude_acp_fixture.mjs';
import { computeUnverifiedAgentApprovalClaimDigest, AGENT_AUTHORITY_TRUSTED_PIN_SCHEMA, AGENT_AUTHORITY_CURRENT_STATE_SCHEMA } from '../../../../../guild_hall/agent_observation/agent_authority_verification.mjs';

const REPO = fileURLToPath(new URL('../../../../../', import.meta.url));
const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const oid = number => `o_${number.toString(16).padStart(32, '0')}`;
const fact = (number, text) => ({ fact_id: oid(number), status: 'FACT', segments: [{ kind: 'literal', text }], depends_on: [], source_refs: [oid(number + 100)] });

export async function createCompanyIntakeFixture({ engineering = 'none', classification = 'NEW',
  pythonExecutable = process.env.WORK_INTAKE_TEST_PYTHON, kitRoot = process.env.WORK_INTAKE_TEST_KIT_ROOT } = {}) {
  if (!['none', 'missing', 'unknown', 'layers'].includes(engineering) || !['NEW', 'FOLLOW_UP', 'EVIDENCE', 'NO_ACTION', 'HOLD'].includes(classification)) throw new Error('synthetic_scenario_invalid');
  if (![pythonExecutable, kitRoot].every(value => typeof value === 'string' && path.isAbsolute(value))) throw new Error('explicit_synthetic_python_and_kit_required');
  // Test installation pins the explicitly selected physical interpreter, not
  // setup-python's alias. The runtime's ordinary-file gate remains unchanged.
  pythonExecutable = realpathSync(pythonExecutable);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'company-intake-'));
  const paths = Object.fromEntries(['trusted', 'control', 'evidence', 'compiled'].map(name => [name, path.join(root, name)]));
  await Promise.all(Object.values(paths).map(value => fs.mkdir(value)));
  const save = async (file, value) => { const bytes = JSON.stringify(value); await fs.writeFile(file, bytes); return { path: file, sha256: hash(bytes) }; };
  const at = Date.now(), observed = new Date(at - 1000).toISOString(), from = new Date(at - 60000).toISOString(), until = new Date(at + 600000).toISOString();
  const linear = await createWorkIntakeLinearFixture({ now: observed, completedAt: observed });
  const linearSnapshot = await createWorkIntakeLinearReader(linear.options).snapshot();
  if (linearSnapshot.status !== 'CURRENT') throw new Error('synthetic_linear_fixture_not_current');
  const context = engineering === 'none' ? null : engineering === 'layers' ? await workIntakeRuleProfileFixture()
    : await workIntakeContextFixture({ presence: engineering === 'missing' ? 'absence_confirmed' : 'unknown' });
  if (context) {
    context.request.as_of = observed;
    context.typed.engine.taken_at = observed; context.typed.engine.valid_at = observed;
    repinWorkIntakeContextFixture(context);
  }
  const jobs = acpFixture({ tools: ['workspace_read_text'] });
  const fake = path.join(paths.compiled, process.platform === 'win32' ? 'work-intake-fake.exe' : 'work-intake-fake');
  if (process.platform === 'win32') {
    const original = readFileSync(path.join(path.dirname(jobs.raw.cliPath), 'FakeClaude.cs'), 'utf8');
    if (!original.includes('text="synthetic reply"')) throw new Error('synthetic_cli_source_changed');
    const source = original.replace('text="synthetic reply"', 'text=File.ReadAllText("work-intake-reply.json")')
      .replace('users++;File.WriteAllText', 'users++;File.WriteAllText("work-intake-prompt.json",line);File.WriteAllText');
    const file = path.join(paths.compiled, 'WorkIntakeFake.cs'); writeFileSync(file, source);
    const built = spawnSync(path.join(process.env.WINDIR, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),
      ['/nologo', '/target:exe', `/out:${fake}`, '/reference:System.Web.Extensions.dll', file], { windowsHide: true, encoding: 'utf8' });
    if (built.status !== 0) throw new Error('synthetic_cli_compilation_failed');
  } else {
    const original = readFileSync(jobs.raw.cliPath, 'utf8');
    await fs.writeFile(fake, original.replace("text:'synthetic reply'", "text:fs.readFileSync('work-intake-reply.json','utf8')"));
    await fs.chmod(fake, 0o700);
  }
  jobs.raw.cliPath = fake; jobs.raw.cliSha256 = hash(readFileSync(fake)); jobs.raw.projectRef = 'SYN'; jobs.raw.roleRef = 'g1.work-intake-judge';
  const sha = `sha256:${'a'.repeat(64)}`, scope = 'project:SYN';
  const fields = { lineage_digest: sha, family_ref: 'family:G1', family_digest: sha, mark_ref: 'mark:G1', mark_digest: sha,
    deployment_ref: 'deployment:G1', deployment_digest: sha, memory_generation_ref: 'memory:G1', memory_digest: sha };
  const claim = { project_scope_ref: scope, project_scope_refs: [scope], ...fields, authority_receipt_ref: 'approval:synthetic', authority_receipt_verified: false };
  const pin = { schema_version: AGENT_AUTHORITY_TRUSTED_PIN_SCHEMA, pin_ref: 'pin:synthetic', verification_receipt_ref: 'verification:synthetic',
    owner_ref: 'owner:synthetic', authority_ref: 'authority:synthetic', verifier_ref: 'verifier:synthetic', project_scope_ref: scope, ...fields,
    approval_claim_digest: computeUnverifiedAgentApprovalClaimDigest(claim, scope).claim_digest, authority_receipt_ref: claim.authority_receipt_ref,
    authority_receipt_digest: sha, claim_ceiling: 'validated_private', issued_at: from, verified_at: from, expires_at: until,
    receipt_epoch: 1, trusted_authority_epoch: 1, revoked: false };
  const authorityCurrent = { schema_version: AGENT_AUTHORITY_CURRENT_STATE_SCHEMA, evaluation_ref: 'evaluation:current', evaluated_at: observed,
    authority_ref: pin.authority_ref, current_authority_epoch: 1, revoked_pin_refs: [], claim_ceiling: 'validated_private' };
  const grant = { grant_ref: 'grant.synthetic', authority_ref: pin.authority_ref, project_ref: 'SYN', scope_ref: scope,
    producer_ref: 'producer.G2.synthetic', receiver_ref: 'g1.work-intake-judge', agent_group: 'G1', input_class: 'g2_released_workpacket',
    actions: ['read', 'judge', 'record', 'view'], valid_from: from, valid_until: until, maximum_events: 8 };
  const docsManifest = ['authority_policy', 'intake_policy'].map(role => ({ document_ref: `doc:${role}`, document_role: role,
    required_for: ['hourly_intake'], applicable_actions: ['hourly_intake'], revision_policy: { mode: 'exact', revisions: ['v1'] },
    required_sections: ['scope'], authority_ref: `auth:${role}` }));
  const documents = { action: 'hourly_intake', manifest: docsManifest, documents: docsManifest.map(value => ({ document_ref: value.document_ref,
    revision: 'v1', sections: ['scope'], authority_ref: value.authority_ref, read_status: 'read' })) };
  const window = { start: new Date(at - 3600000).toISOString(), end: observed };
  const event = { source: 'gmail', scope_ref: 'scope:gmail', event_ref: 'event.synthetic', revision_ref: oid(102), revision_sha256: 'a'.repeat(64),
    occurred_at: new Date(at - 10000).toISOString(), observed_at: observed, project_ref: 'SYN', project_binding_ref: 'binding.synthetic',
    revision_state: 'current', parse_state: 'parsed', evidence_refs: [oid(102), 'binding.synthetic'], correction: null,
    release_binding: null, fact_ids: [oid(2)], ...(context ? { engineering: { config: { path: context.options.configPath, sha256: context.options.configSha256 }, request: context.request } } : {}) };
  const facts = [fact(2, 'Synthetic supplier requests a revised estimate.'),
    ...linearSnapshot.observations.map((observation, index) => fact(index + 20, `Synthetic existing task ${observation.linear_task.task_ref.task_id}: inspect a separate quality sample.`))];
  const index = { version: 1, project_ref: 'SYN', scope_ref: scope, producer_ref: grant.producer_ref, generation: 1, window, observed_at: observed,
    source_reads: [{ source: 'gmail', scope_ref: 'scope:gmail', status: 'read', window, cursor_before: null, cursor_after: 'gmail.generation.1', observed_at: observed,
      permission_ref: grant.grant_ref, evidence_refs: ['capture.gmail.synthetic'] }],
    captures: [{ record_kind: 'capture_generation', source_ref: 'source.gmail', generation_seq: 1, capture_ref: 'capture.gmail.synthetic',
      manifest_ref: 'manifest.gmail.synthetic', item_count: 1, content_digest: sha, captured_at: observed, immutable: true }],
    events: [event], linear_projections: linearSnapshot.observations.map((observation, index) => ({ issue_id: observation.issue_id,
      issue_content_sha256: observation.issue_content_sha256, task_semantic_sha256: (index === 0 ? 'b' : 'e').repeat(64), release_binding: null, fact_ids: [oid(index + 20)] })) };
  const match = ['FOLLOW_UP', 'EVIDENCE'].includes(classification), firstTask = linearSnapshot.observations[0];
  const answer = { classification, reason_code: { NEW: 'NEW_REQUEST', FOLLOW_UP: 'EXISTING_TASK', EVIDENCE: 'SUPPORTING_EVIDENCE', NO_ACTION: 'NO_NEW_REQUEST', HOLD: 'INSUFFICIENT_EVIDENCE' }[classification],
    matched_task_ref: match ? `linear.task:${firstTask.linear_task.task_ref.task_id.toLowerCase()}` : null,
    task_semantic_sha256: classification === 'HOLD' ? null : (match ? 'b' : 'a').repeat(64),
    action_semantic_sha256: ['HOLD', 'NO_ACTION'].includes(classification) ? null : 'c'.repeat(64),
    evidence_refs: [oid(102), 'binding.synthetic', oid(2), ...(match ? [oid(20)] : [])] };
  await save(path.join(jobs.jobRoot, 'work-intake-reply.json'), answer);
  const authorityPaths = { grant: path.join(paths.trusted, 'grant.json'), claim: path.join(paths.trusted, 'claim.json'), pin: path.join(paths.trusted, 'pin.json'),
    current: path.join(paths.trusted, 'authority-current.json') };
  const deploymentPath = path.join(paths.trusted, 'deployment.json'), indexPath = path.join(paths.trusted, 'source-index.json');
  const deployment = { version: 1, mode: 'source_bound', data_provenance: 'synthetic', project_ref: 'SYN', scope_ref: scope,
    ...(context ? { accepted_project_ref: context.request.project_ref } : {}),
    repository_root: REPO, control_root: paths.control, evidence_root: paths.evidence, release_binding_roots: [],
    authority: { grant: await save(authorityPaths.grant, grant), claim: await save(authorityPaths.claim, claim), pin: await save(authorityPaths.pin, pin),
      current: { ...await save(authorityPaths.current, authorityCurrent), sha256: null } },
    source_index: { path: indexPath, sha256: null }, documents: await save(path.join(paths.trusted, 'documents.json'), documents),
    linear: { root: linear.root, expectedBinding: linear.expectedBinding, maxAgeMs: 1800000 },
    packet_reader: { executable: { path: pythonExecutable, sha256: hash(readFileSync(pythonExecutable)) },
      script: { path: path.join(REPO, 'ui-workspace/apps/dev-erp/tools/work_intake_packet_reader.py'), sha256: hash(readFileSync(path.join(REPO, 'ui-workspace/apps/dev-erp/tools/work_intake_packet_reader.py'))) }, timeoutMs: 15000 },
    judge: { binding: { path: jobs.bindingPath, sha256: jobs.pin() }, model: jobs.raw.model, roleRef: jobs.raw.roleRef, timeoutMs: 15000 } };
  const profilePath = path.join(paths.trusted, 'release-profile.json');
  const releaseRoots = []; let release, profile, deploymentSha256;
  async function reseal() {
    deployment.authority.grant = await save(authorityPaths.grant, grant);
    await save(authorityPaths.current, authorityCurrent);
    deployment.judge.binding.sha256 = jobs.pin();
    deploymentSha256 = (await save(deploymentPath, deployment)).sha256;
    return { deploymentPath, deploymentSha256 };
  }
  async function republish() {
    const requestPath = path.join(paths.trusted, 'synthetic-packet-request.json');
    await save(requestPath, { project_ref: grant.project_ref, scope_ref: grant.scope_ref, grant_ref: grant.grant_ref,
      scope_digest: workIntakeScopeDigest(index), audience: grant.receiver_ref, model_id: deployment.judge.model, facts,
      writable_roots: [paths.control, paths.evidence, jobs.jobRoot] });
    const helper = fileURLToPath(new URL('./work_intake_packet_fixture.py', import.meta.url));
    const output = execFileSync(pythonExecutable, ['-I', '-B', helper, '--kit-root', kitRoot, '--request', requestPath],
      { windowsHide: true, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
    release = JSON.parse(output); releaseRoots.push(release.root);
    deployment.release_binding_roots = [...releaseRoots];
    for (const declared of [...index.events, ...index.linear_projections]) declared.release_binding = { path: release.bindingPath, sha256: release.bindingSha256 };
    // This explicit positive-fixture installer step owns the independent trust
    // anchor. reseal() never rewrites it when a test changes a producer binding.
    profile = { version: 1, project_ref: grant.project_ref, scope_ref: grant.scope_ref,
      ...Object.fromEntries(['kit_root', 'kit_code_pins', 'public_key'].map(field => [field, structuredClone(release.config[field])])),
      ...Object.fromEntries(['reviewer_ref', 'route_profile_id', 'route_sha256', 'model_id', 'work_type', 'work_revision',
        'work_digest', 'header_profile_sha256', 'policy_epoch', 'grant_ref', 'wire_profile'].map(field => [field, release.config.expected[field]])),
      approved_bindings: [{ path: release.bindingPath, sha256: release.bindingSha256 }] };
    deployment.release_profile = await save(profilePath, profile);
    await save(indexPath, index); return reseal();
  }
  await republish();
  async function cleanup(target, prefix) {
    const resolved = await fs.realpath(target), temp = await fs.realpath(os.tmpdir());
    if (path.dirname(resolved) !== temp || !path.basename(resolved).startsWith(prefix)) throw new Error('synthetic_cleanup_scope');
    await fs.rm(resolved, { recursive: true, force: true });
  }
  return { root, paths, deployment, index, grant, authorityCurrent, authorityPaths, linear, linearSnapshot, context, jobs, facts, answer, documents,
    deploymentPath, indexPath, profilePath, get profile() { return profile; }, get releaseProfile() { return profile; },
    get release() { return release; }, get options() { return { deploymentPath, deploymentSha256 }; }, save, reseal, republish,
    async close() { await linear.close(); if (context) await cleanup(context.root, 'work-intake-context-');
      for (const value of releaseRoots) await cleanup(value, 'work-intake-e14-synthetic-');
      await cleanup(jobs.root, 'soulforge-claude-scope-'); await cleanup(root, 'company-intake-'); },
  };
}
