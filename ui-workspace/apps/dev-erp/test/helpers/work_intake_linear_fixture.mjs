import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { sha256Canonical } from '../../../../../guild_hall/shared/project_history_envelope.mjs';
import { runReceiptObjectKinds } from '../../../../../guild_hall/linear_history/linear_collect_receipt.mjs';
import { identityDigestForBinding, readEvidenceDigest, readEvidenceRecordForIssue } from '../../../../../guild_hall/linear_history/linear_collect_runner.mjs';
import { readOperationsForReceiptVersion } from '../../../../../guild_hall/linear_history/linear_graphql_client.mjs';

export const LINEAR_FIXTURE_IDS = ['f8091a2b-3c4d-4859-aa6b-465768798a9b', 'b8091a2b-3c4d-4859-aa6b-465768798a9b', 'c8091a2b-3c4d-4859-aa6b-465768798a9b'];
export async function createWorkIntakeLinearFixture({ issues, now = '2026-09-08T00:05:00.000Z', completedAt = '2026-09-08T00:00:00.000Z' } = {}) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'work-intake-linear-'));
  const root = path.join(temporary, 'custody', 'synthetic-forge'), stateRoot = path.join(temporary, 'state');
  const save = async (file, value) => { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(value)); };
  const binding = { lane_id: 'synthetic-linear', writer: { authority_id: 'synthetic-writer', epoch: 1 },
    workspace: { url_key: 'synthetic-forge', project_scope_map: [{ linear_project_id: 'project-1', project_scope_ref: 'project:SYN' },
      { linear_project_id: 'project-2', project_scope_ref: 'project:OTHER' }] } };
  const sha = `sha256:${'a'.repeat(64)}`;
  const expectedBinding = { custody_root: root, state_root: stateRoot, lane_id: binding.lane_id, identity_digest: identityDigestForBinding(binding),
    writer_authority_id: binding.writer.authority_id, writer_epoch: 1, binding_sha256: sha, workspace_url_key: 'synthetic-forge',
    organization_id: 'a8091a2b-3c4d-4859-aa6b-465768798a9b', project_scope_ref: 'project:SYN', project_code: 'SYN' };
  const selected = issues ?? LINEAR_FIXTURE_IDS.map((id, index) => ({ id, identifier: `${index === 2 ? 'OTHER' : 'SYN'}-${index + 1}`,
    updated_at: '2026-09-01T00:00:00.000Z', state_name: ['Todo', 'In Progress', 'Done'][index], project_id: index === 2 ? 'project-2' : 'project-1' }));
  const cursor = { schema_version: 'soulforge.linear_collect.cursor.v1', watermark: completedAt, backfill: null, generation_seq: 2 };
  const state = { schema_version: 'soulforge.linear_collect.state.v1', lane_id: expectedBinding.lane_id, identity_digest: expectedBinding.identity_digest,
    writer_authority_id: expectedBinding.writer_authority_id, writer_epoch: 1, cursor, object_index: {}, last_run_id: 'run-synthetic', last_completed_at: completedAt };
  const receipt = { schema_version: 'soulforge.linear_collect.run_receipt.v1', lane_id: expectedBinding.lane_id, run_id: state.last_run_id,
    generation_seq: 2, mode: 'apply', status: 'ok', writer_authority_id: expectedBinding.writer_authority_id, writer_epoch: 1,
    binding_sha256: sha, workspace_url_key: expectedBinding.workspace_url_key, organization_id: expectedBinding.organization_id,
    started_at: completedAt, completed_at: completedAt, duration_ms: 0,
    window: { lower: new Date(Date.parse(completedAt) - 900000).toISOString(), upper: completedAt, phase: 'delta', order_observed: 'ascending' },
    cursor_before: { ...cursor, generation_seq: 1 }, cursor_after: cursor,
    read_calls: { total: 0, by_operation: Object.fromEntries(readOperationsForReceiptVersion('soulforge.linear_collect.run_receipt.v1').map(key => [key, 0])) },
    objects: Object.fromEntries(runReceiptObjectKinds('soulforge.linear_collect.run_receipt.v1').map(key => [key, { observed: 0, created: 0, unchanged: 0 }])),
    custody_manifest_digest: sha, coverage_gaps: ['polling_cannot_prove_hard_deletes'], error_codes: [], repository_writes: 0, private_writes: 3, network_used: false };
  const stateFile = path.join(stateRoot, 'state', 'linear-collect.json'), receiptFile = path.join(stateRoot, 'receipts', `${state.last_run_id}.json`);
  const records = new Map();
  async function publishEnvelope(id) {
    const record = records.get(id), envelope = record.wrapper.object;
    const { read_receipt_digest: ignored, ...body } = envelope.evidence;
    envelope.evidence.read_receipt_digest = readEvidenceDigest(body);
    const digest = sha256Canonical(envelope); record.wrapper.content_sha256 = digest;
    state.object_index[`issues:${id}`] = { content_sha256: envelope.issue_content_sha256, updated_at: envelope.issue_updated_at };
    state.object_index[`read_evidence:${id}`] = { content_sha256: digest, updated_at: envelope.issue_updated_at };
    record.evidenceFile = path.join(root, 'read_evidence', id, `${digest.slice(7)}.json`);
    record.issueFile = path.join(root, 'issues', id, `${envelope.issue_content_sha256.slice(7)}.json`);
    await save(record.evidenceFile, record.wrapper);
    await mkdir(path.dirname(record.issueFile), { recursive: true });
    await writeFile(record.issueFile, 'not JSON; RAW_ISSUE_BODY_MUST_NOT_BE_READ');
    await save(stateFile, state);
  }
  for (const issue of selected) {
    const envelope = readEvidenceRecordForIssue(binding, issue).envelope;
    records.set(issue.id, { issue, wrapper: { schema_version: 'soulforge.linear_collect.custody_object.v1', kind: 'read_evidence',
      object_id: issue.id, content_sha256: sha256Canonical(envelope), object: envelope }, evidenceFile: null, issueFile: null });
    await publishEnvelope(issue.id);
  }
  await mkdir(root, { recursive: true });
  await save(stateFile, state); await save(receiptFile, receipt);
  return { root, temporary, stateRoot, binding, expectedBinding, state, receipt, stateFile, receiptFile, records, save, publishEnvelope,
    options: { root, expectedBinding, now: () => new Date(now) },
    async publish() { await save(stateFile, state); await save(receiptFile, receipt); },
    async close() { const resolved = await realpath(temporary), parent = await realpath(os.tmpdir());
      if (path.dirname(resolved) !== parent || !path.basename(resolved).startsWith('work-intake-linear-')) throw new Error('fixture_cleanup_scope');
      await rm(resolved, { recursive: true, force: true }); },
  };
}
