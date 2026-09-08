import assert from 'node:assert/strict';
import test from 'node:test';
import { copyFile, mkdir, readFile, readdir, rm, chmod, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { makeNativeWorkbenchFixture } from './hermes_native_workbench_fixture.mjs';
import { createWorkbenchExecutionSources } from '../src/workbench_execution_sources.mjs';
import { createWorkbenchExecutionStore } from '../src/workbench_execution_store.mjs';
import { createWorkbenchExecutionService } from '../src/workbench_execution_service.mjs';
import { createHermesNativeAuditStore } from '../src/hermes_native_audit_store.mjs';
import { createHermesNativeAttemptStore } from '../src/hermes_native_attempt_store.mjs';
import { digestOf } from '../../../../guild_hall/agent_observation/guard_primitives.mjs';
import { backupRuntimeDb } from '../tools/runtime_ops.mjs';
import { bindSourceBackupGeneration } from '../../../../guild_hall/backup_controller/source_backup_generation_contract.mjs';

const hash = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
test('protected native audit + consumed attempts + WAL-safe ledger export restore exact links and bytes', async (t) => {
  const f = await makeNativeWorkbenchFixture({ mode: 'tools' });
  t.after(() => rm(f.root, { recursive: true, force: true }));
  const executionStore = createWorkbenchExecutionStore({ root: f.executionRoot, mode: 'native_chat' });
  const executionSources = createWorkbenchExecutionSources({ mode: 'native_chat', intakeSources: f.intakeSources,
    bindingDigest: f.executionDigest, nativeDeployment: { enabled: true, source_root: f.sourceRoot,
      expected_binding: f.expectedBinding, native_binding_sha256: f.executionDigest } });
  const service = createWorkbenchExecutionService({ enabled: true, intakeStore: f.intakeStore,
    intakeSources: f.intakeSources, executionSources, executionStore, nativeDispatchMode: 'synthetic_verification' });
  t.after(() => service.close());
  await service.start(f.record.request_id, f.access);
  let state;
  const deadline = Date.now() + 8000;
  do {
    state = await service.status(f.record.request_id, f.access);
    if (state.execution_state !== 'running') break;
    await new Promise(resolve => setTimeout(resolve, 20));
  } while (Date.now() < deadline);
  assert.equal(state.execution_state, 'response_observed', JSON.stringify(state));
  const trace = await service.executionLog(f.record.request_id, f.access);
  const instruction = await service.executionLog(f.record.request_id, f.access, 'instruction');
  const output = await service.executionLog(f.record.request_id, f.access, 'output');
  await service.close();

  // Reuse the existing logical SQLite export; only a fresh synthetic target is
  // passed. The live .sqlite/-journal files are never copied as a backup set.
  const logical = backupRuntimeDb({ dbPath: path.join(f.executionRoot, 'execution.sqlite'),
    outDir: path.join(f.root, 'logical-export'), tag: 'synthetic_native_audit' });
  assert.equal(logical.ok, true);
  assert.equal(logical.quick_check, 'ok');
  const paths = [{ relative: 'ledger/execution.sqlite', source: logical.backupPath }];
  const work = trace.work_id;
  const names = await readdir(path.join(f.nativeAuditRoot, work));
  assert.deepEqual(names.sort(), ['execution-receipt.json', 'instruction-receipt.json', 'instruction.utf8', 'visible-output.utf8']);
  for (const name of names) paths.push({ relative: `artifacts/${work}/${name}`, source: path.join(f.nativeAuditRoot, work, name) });
  for (const name of await readdir(f.nativeAttempts)) {
    assert.match(name, /^(claim|receipt|session)-[a-f0-9]{64}\.json$/u);
    paths.push({ relative: `attempts/${name}`, source: path.join(f.nativeAttempts, name) });
  }
  const manifest = [];
  const backup = path.join(f.root, 'create-only-backup');
  const restored = path.join(f.root, 'isolated-restore');
  await mkdir(backup); await mkdir(restored);
  for (const item of paths) {
    const bytes = await readFile(item.source);
    manifest.push({ relative_path: item.relative, content_sha256: hash(bytes), size: bytes.length });
    for (const destination of [backup, restored]) {
      const target = path.join(destination, item.relative);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(destination === backup ? item.source : path.join(backup, item.relative), target, constants.COPYFILE_EXCL);
      assert.deepEqual(await readFile(target), bytes);
    }
  }
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  await writeFile(path.join(backup, 'manifest.json'), manifestBytes, { flag: 'wx' });
  await copyFile(path.join(backup, 'manifest.json'), path.join(restored, 'manifest.json'), constants.COPYFILE_EXCL);
  assert.deepEqual(await readFile(path.join(restored, 'manifest.json')), manifestBytes);
  for (const item of JSON.parse(await readFile(path.join(restored, 'manifest.json'), 'utf8'))) {
    const bytes = await readFile(path.join(restored, item.relative_path));
    assert.equal(hash(bytes), item.content_sha256); assert.equal(bytes.length, item.size);
  }
  const restoredLedger = createWorkbenchExecutionStore({ root: path.join(restored, 'ledger'), mode: 'native_chat' });
  const row = restoredLedger.read(f.record.request_id, 'restored-instance');
  assert.equal(row.observed_state, 'response_observed');
  const refs = row.receipt.trace;
  restoredLedger.close();
  const reader = createHermesNativeAuditStore({ ...f.nativeEntry.audit_storage, root: path.join(restored, 'artifacts') });
  const query = { work_id: refs.audit_ref, expected_header_digest: refs.header_digest, expected_audit_digest: refs.audit_digest };
  assert.deepEqual((await reader.read({ ...query, role: 'instruction' })).bytes, instruction.bytes);
  assert.deepEqual((await reader.read({ ...query, role: 'output' })).bytes, output.bytes);
  assert.equal((await reader.read(query)).final.evidence.tool_records.length, 2);
  const brief = trace.trace.header.context.brief_binding;
  const claim = { task_ref: brief.task_ref, work_brief_revision_ref: brief.work_brief_revision_ref, action_ref: brief.action_ref };
  assert.equal((await createHermesNativeAttemptStore({ directory: path.join(restored, 'attempts') }).checkConsumed(claim)).hold_code,
    'HERMES_NATIVE_ATTEMPT_ALREADY_CONSUMED');

  const digest = digestOf(manifest);
  const common = { source_ref: 'source.native_audit', project_scope_ref: 'project.synthetic-native-audit', generation_seq: 1 };
  const evidence = bindSourceBackupGeneration({
    capture_record: { record_kind: 'capture_generation', source_ref: common.source_ref, generation_seq: 1,
      capture_ref: 'capture.native-audit.synthetic', manifest_ref: 'manifest.native-audit.capture',
      item_count: manifest.length, content_digest: digest, captured_at: '2026-09-08T01:00:00Z', immutable: true },
    byte_owner_manifest: { schema_version: 'soulforge.source_backup.byte_owner_manifest.v0', ...common,
      capture_ref: 'capture.native-audit.synthetic', capture_manifest_ref: 'manifest.native-audit.capture', content_digest: digest,
      item_count: manifest.length, byte_length: manifest.reduce((total, item) => total + item.size, 0),
      byte_owner_ref: 'owner.native-audit', backup_manifest_ref: 'manifest.native-audit.backup', immutable: true },
    backup_evidence: { schema_version: 'soulforge.source_backup.generation_evidence.v0', ...common,
      capture_ref: 'capture.native-audit.synthetic', capture_content_digest: digest,
      backup_generation_ref: 'backup.native-audit.synthetic', backup_manifest_ref: 'manifest.native-audit.backup',
      backup_content_digest: digest, backed_up_at: '2026-09-08T01:01:00Z', create_only: true, overwrite_allowed: false,
      exact_byte_readback: true, readback_digest: digest, byte_owner_ref: 'owner.native-audit' },
    restore_evidence: { schema_version: 'soulforge.source_backup.restore_evidence.v0', source_ref: common.source_ref,
      project_scope_ref: common.project_scope_ref, backup_generation_ref: 'backup.native-audit.synthetic',
      backup_manifest_ref: 'manifest.native-audit.backup', restore_test_ref: 'restore.native-audit.synthetic',
      isolated_root_ref: 'restore-root.native-audit.synthetic', restored_at: '2026-09-08T01:02:00Z', exact_byte_readback: true, readback_digest: digest },
    owners: { logical_owner_ref: 'owner.native-execution', byte_owner_ref: 'owner.native-audit', revision_owner_ref: 'owner.native-execution',
      acceptance_owner_ref: 'owner.human', backup_restore_owner_ref: 'owner.backup-controller' },
    retention_policy_ref: 'policy.native-execution-working-audit', rpo_policy_ref: 'policy.native-audit.rpo-unmeasured',
  });
  assert.equal(evidence.status, 'BOUND', JSON.stringify(evidence));
  assert.equal(evidence.receipt.technical_restore_state, 'technical_restore_candidate');
  assert.equal(evidence.receipt.human_acceptance_state, 'pending');
  // A restored but changed instruction never becomes the requested snapshot.
  const damaged = path.join(restored, 'artifacts', work, 'instruction.utf8');
  await chmod(damaged, 0o600); await writeFile(damaged, 'corrupted synthetic snapshot');
  await assert.rejects(reader.read({ ...query, role: 'instruction' }));
});
